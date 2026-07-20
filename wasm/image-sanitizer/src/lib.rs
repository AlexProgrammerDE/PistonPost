use std::fmt;
use std::io::Cursor;

use gif::{DecodeOptions, Encoder as GifEncoder, Repeat};
use img_parts::Bytes;
use img_parts::png::Png;
use img_parts::riff::{RiffChunk, RiffContent};
use img_parts::webp::WebP;
use libjpeg_turbo_rs::common::exif::parse_orientation;
use libjpeg_turbo_rs::decode::marker::MarkerReader;
use libjpeg_turbo_rs::{MarkerCopyMode, TransformOp, TransformOptions};
use wasm_bindgen::prelude::*;

const MAX_IMAGE_PIXELS: u64 = 80_000_000;
const MAX_GIF_ANIMATION_PIXELS: u64 = 50_000_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SanitizeError {
    InvalidImage,
    UnsupportedFormat,
}

impl fmt::Display for SanitizeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidImage => formatter.write_str("The image container is invalid."),
            Self::UnsupportedFormat => formatter.write_str("The image format must be transcoded."),
        }
    }
}

impl std::error::Error for SanitizeError {}

#[wasm_bindgen]
pub fn sanitize_image(input: &[u8], mime_type: &str) -> Result<Vec<u8>, JsError> {
    sanitize_image_bytes(input, mime_type).map_err(|error| JsError::new(&error.to_string()))
}

pub fn sanitize_image_bytes(input: &[u8], mime_type: &str) -> Result<Vec<u8>, SanitizeError> {
    match mime_type {
        "image/jpeg" => sanitize_jpeg(input),
        "image/png" => sanitize_png(input),
        "image/gif" => sanitize_gif(input),
        "image/webp" => sanitize_webp(input),
        "image/avif" => Err(SanitizeError::UnsupportedFormat),
        _ => Err(SanitizeError::UnsupportedFormat),
    }
}

fn orientation_transform(orientation: u8) -> TransformOp {
    match orientation {
        2 => TransformOp::HFlip,
        3 => TransformOp::Rot180,
        4 => TransformOp::VFlip,
        5 => TransformOp::Transpose,
        6 => TransformOp::Rot90,
        7 => TransformOp::Transverse,
        8 => TransformOp::Rot270,
        _ => TransformOp::None,
    }
}

fn sanitize_jpeg(input: &[u8]) -> Result<Vec<u8>, SanitizeError> {
    let metadata = MarkerReader::new(input)
        .read_markers()
        .map_err(|_| SanitizeError::InvalidImage)?;
    let pixels = u64::from(metadata.frame.width) * u64::from(metadata.frame.height);
    if pixels == 0 || pixels > MAX_IMAGE_PIXELS {
        return Err(SanitizeError::InvalidImage);
    }
    let transform = metadata
        .exif_data
        .as_deref()
        .and_then(parse_orientation)
        .map(orientation_transform)
        .unwrap_or(TransformOp::None);

    libjpeg_turbo_rs::transform_jpeg_with_options(
        input,
        &TransformOptions {
            op: transform,
            optimize: true,
            copy_markers: MarkerCopyMode::IccOnly,
            ..TransformOptions::default()
        },
    )
    .map_err(|_| SanitizeError::InvalidImage)
}

const PRESERVED_PNG_CHUNKS: &[[u8; 4]] = &[
    *b"IHDR", *b"PLTE", *b"IDAT", *b"IEND", *b"cHRM", *b"gAMA", *b"iCCP", *b"sBIT", *b"sRGB",
    *b"cICP", *b"mDCv", *b"cLLi", *b"bKGD", *b"hIST", *b"sPLT", *b"tRNS", *b"acTL", *b"fcTL",
    *b"fdAT",
];

fn sanitize_png(input: &[u8]) -> Result<Vec<u8>, SanitizeError> {
    let mut png =
        Png::from_bytes(Bytes::copy_from_slice(input)).map_err(|_| SanitizeError::InvalidImage)?;
    if png.chunks().first().map(|chunk| chunk.kind()) != Some(*b"IHDR")
        || png.chunks().last().map(|chunk| chunk.kind()) != Some(*b"IEND")
    {
        return Err(SanitizeError::InvalidImage);
    }

    png.chunks_mut()
        .retain(|chunk| PRESERVED_PNG_CHUNKS.contains(&chunk.kind()));
    Ok(png.encoder().bytes().to_vec())
}

const PRESERVED_WEBP_CHUNKS: &[[u8; 4]] = &[
    *b"VP8 ", *b"VP8L", *b"VP8X", *b"ALPH", *b"ANIM", *b"ANMF", *b"ICCP",
];

fn sanitize_webp(input: &[u8]) -> Result<Vec<u8>, SanitizeError> {
    let mut webp =
        WebP::from_bytes(Bytes::copy_from_slice(input)).map_err(|_| SanitizeError::InvalidImage)?;
    if !webp
        .chunks()
        .iter()
        .any(|chunk| matches!(&chunk.id(), b"VP8 " | b"VP8L" | b"ANMF"))
    {
        return Err(SanitizeError::InvalidImage);
    }

    webp.chunks_mut()
        .retain(|chunk| PRESERVED_WEBP_CHUNKS.contains(&chunk.id()));
    for chunk in webp.chunks_mut() {
        if chunk.id() != *b"VP8X" {
            continue;
        }
        let mut contents = chunk
            .content()
            .data()
            .filter(|contents| contents.len() == 10)
            .ok_or(SanitizeError::InvalidImage)?
            .to_vec();
        contents[0] &= 0x32;
        contents[1..4].fill(0);
        *chunk = RiffChunk::new(*b"VP8X", RiffContent::Data(Bytes::from(contents)));
    }
    Ok(webp.encoder().bytes().to_vec())
}

fn swap_palette_entries(palette: &mut [u8], first: usize, second: usize) {
    for channel in 0..3 {
        palette.swap(first * 3 + channel, second * 3 + channel);
    }
}

fn remap_palette_index(index: &mut u8, first: u8, second: u8) {
    if *index == first {
        *index = second;
    } else if *index == second {
        *index = first;
    }
}

fn sanitize_gif(input: &[u8]) -> Result<Vec<u8>, SanitizeError> {
    let mut options = DecodeOptions::new();
    options.check_frame_consistency(true);
    let mut decoder = options
        .read_info(Cursor::new(input))
        .map_err(|_| SanitizeError::InvalidImage)?;
    let width = decoder.width();
    let height = decoder.height();
    let canvas_pixels = u64::from(width) * u64::from(height);
    if canvas_pixels == 0 || canvas_pixels > MAX_IMAGE_PIXELS {
        return Err(SanitizeError::InvalidImage);
    }
    let repeat = decoder.repeat();
    let background = decoder
        .bg_color()
        .and_then(|index| u8::try_from(index).ok());
    let mut global_palette = decoder.global_palette().unwrap_or_default().to_vec();

    if let Some(background) = background.filter(|index| *index != 0) {
        let background = usize::from(background);
        if background >= global_palette.len() / 3 {
            return Err(SanitizeError::InvalidImage);
        }
        swap_palette_entries(&mut global_palette, 0, background);
    }

    let mut encoder = GifEncoder::new(
        Vec::with_capacity(input.len()),
        width,
        height,
        &global_palette,
    )
    .map_err(|_| SanitizeError::InvalidImage)?;
    if repeat != Repeat::Finite(0) {
        encoder
            .set_repeat(repeat)
            .map_err(|_| SanitizeError::InvalidImage)?;
    }

    let mut frame_count = 0_u64;
    while let Some(frame) = decoder
        .read_next_frame()
        .map_err(|_| SanitizeError::InvalidImage)?
    {
        frame_count += 1;
        if frame_count > 1 && canvas_pixels.saturating_mul(frame_count) > MAX_GIF_ANIMATION_PIXELS {
            return Err(SanitizeError::InvalidImage);
        }
        let mut frame = frame.clone();
        if frame.palette.is_none()
            && let Some(background) = background.filter(|index| *index != 0)
        {
            for index in frame.buffer.to_mut() {
                remap_palette_index(index, 0, background);
            }
            if let Some(transparent) = &mut frame.transparent {
                remap_palette_index(transparent, 0, background);
            }
        }
        encoder
            .write_frame(&frame)
            .map_err(|_| SanitizeError::InvalidImage)?;
    }

    encoder
        .into_inner()
        .map_err(|_| SanitizeError::InvalidImage)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crc32fast::Hasher;
    use gif::{AnyExtension, Extension};
    use libjpeg_turbo_rs::{Encoder as JpegEncoder, MarkerSaveConfig, PixelFormat, SavedMarker};

    fn minimal_exif(orientation: u8) -> Vec<u8> {
        vec![
            b'E',
            b'x',
            b'i',
            b'f',
            0,
            0,
            b'M',
            b'M',
            0,
            42,
            0,
            0,
            0,
            8,
            0,
            1,
            1,
            18,
            0,
            3,
            0,
            0,
            0,
            1,
            0,
            orientation,
            0,
            0,
            0,
            0,
            0,
            0,
        ]
    }

    fn png_chunk(kind: [u8; 4], contents: &[u8]) -> Vec<u8> {
        let mut chunk = Vec::new();
        chunk.extend_from_slice(
            &u32::try_from(contents.len())
                .expect("test chunk fits")
                .to_be_bytes(),
        );
        chunk.extend_from_slice(&kind);
        chunk.extend_from_slice(contents);
        let mut hasher = Hasher::new();
        hasher.update(&kind);
        hasher.update(contents);
        chunk.extend_from_slice(&hasher.finalize().to_be_bytes());
        chunk
    }

    #[test]
    fn jpeg_uses_lossless_codec_transcode_and_keeps_only_icc() {
        let pixels = vec![128; 16 * 16 * 3];
        let input = JpegEncoder::new(&pixels, 16, 16, PixelFormat::Rgb)
            .quality(88)
            .saved_marker(SavedMarker {
                code: 0xe1,
                data: minimal_exif(1),
            })
            .saved_marker(SavedMarker {
                code: 0xe2,
                data: [b"ICC_PROFILE\0\x01\x01".as_slice(), b"color"].concat(),
            })
            .saved_marker(SavedMarker {
                code: 0xfe,
                data: b"private comment".to_vec(),
            })
            .encode()
            .expect("encode jpeg");

        let output = sanitize_image_bytes(&input, "image/jpeg").expect("sanitize jpeg");
        let second_pass = sanitize_image_bytes(&output, "image/jpeg").expect("sanitize twice");
        let mut reader = MarkerReader::new(&output);
        reader.set_marker_save_config(MarkerSaveConfig::All);
        let metadata = reader.read_markers().expect("read sanitized markers");

        assert_eq!(output, second_pass);
        assert!(metadata.exif_data.is_none());
        assert!(metadata.comment.is_none());
        assert!(
            metadata
                .saved_markers
                .iter()
                .all(|marker| matches!(marker.code, 0xe0 | 0xe2))
        );
    }

    #[test]
    fn jpeg_bakes_orientation_into_coefficients() {
        let pixels = vec![128; 16 * 8 * 3];
        let input = JpegEncoder::new(&pixels, 16, 8, PixelFormat::Rgb)
            .saved_marker(SavedMarker {
                code: 0xe1,
                data: minimal_exif(6),
            })
            .encode()
            .expect("encode jpeg");

        let output = sanitize_image_bytes(&input, "image/jpeg").expect("sanitize jpeg");
        let metadata = MarkerReader::new(&output)
            .read_markers()
            .expect("read sanitized jpeg");

        assert_eq!((metadata.frame.width, metadata.frame.height), (8, 16));
        assert!(metadata.exif_data.is_none());
    }

    #[test]
    fn png_removes_text_and_exif_chunks_without_touching_pixels() {
        let mut input = b"\x89PNG\r\n\x1a\n".to_vec();
        input.extend(png_chunk(
            *b"IHDR",
            &[0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0],
        ));
        input.extend(png_chunk(*b"tEXt", b"Author\0Private"));
        input.extend(png_chunk(*b"eXIf", b"private"));
        input.extend(png_chunk(*b"PRIV", b"opaque metadata"));
        let pixels = png_chunk(*b"IDAT", &[1, 2, 3, 4]);
        input.extend_from_slice(&pixels);
        input.extend(png_chunk(*b"IEND", &[]));

        let output = sanitize_image_bytes(&input, "image/png").expect("sanitize png");
        let second_pass = sanitize_image_bytes(&output, "image/png").expect("sanitize twice");

        assert_eq!(output, second_pass);
        assert!(output.windows(pixels.len()).any(|window| window == pixels));
        assert!(!output.windows(7).any(|window| window == b"Private"));
        assert!(
            !output
                .windows(15)
                .any(|window| window == b"opaque metadata")
        );
    }

    #[test]
    fn webp_removes_metadata_and_clears_extended_flags() {
        let chunks = vec![
            RiffChunk::new(
                *b"VP8X",
                RiffContent::Data(Bytes::from_static(&[0x3e, 1, 1, 1, 0, 0, 0, 0, 0, 0])),
            ),
            RiffChunk::new(*b"EXIF", RiffContent::Data(Bytes::from_static(b"private"))),
            RiffChunk::new(*b"XMP ", RiffContent::Data(Bytes::from_static(b"private"))),
            RiffChunk::new(
                *b"VP8 ",
                RiffContent::Data(Bytes::from_static(&[1, 2, 3, 4])),
            ),
        ];
        let riff = RiffChunk::new(
            *b"RIFF",
            RiffContent::List {
                kind: Some(*b"WEBP"),
                subchunks: chunks,
            },
        );
        let input = WebP::new(riff).expect("valid webp").encoder().bytes();

        let output = sanitize_image_bytes(&input, "image/webp").expect("sanitize webp");
        let parsed = WebP::from_bytes(Bytes::from(output.clone())).expect("parse output");

        assert_eq!(sanitize_image_bytes(&output, "image/webp"), Ok(output));
        assert_eq!(
            parsed
                .chunks()
                .iter()
                .map(|chunk| chunk.id())
                .collect::<Vec<_>>(),
            vec![*b"VP8X", *b"VP8 "]
        );
        let flags = parsed
            .chunk_by_id(*b"VP8X")
            .and_then(|chunk| chunk.content().data())
            .and_then(|data| data.first());
        assert_eq!(flags, Some(&0x32));
    }

    #[test]
    fn gif_preserves_frames_and_looping_but_drops_comments() {
        let mut encoder =
            GifEncoder::new(Vec::new(), 1, 1, &[0, 0, 0, 255, 255, 255]).expect("create gif");
        encoder.set_repeat(Repeat::Infinite).expect("set repeat");
        encoder
            .write_raw_extension(AnyExtension(Extension::Comment as u8), &[b"private"])
            .expect("write comment");
        encoder
            .write_frame(&gif::Frame {
                width: 1,
                height: 1,
                buffer: vec![1].into(),
                ..gif::Frame::default()
            })
            .expect("write frame");
        let input = encoder.into_inner().expect("finish gif");

        let output = sanitize_image_bytes(&input, "image/gif").expect("sanitize gif");
        let decoder = gif::Decoder::new(Cursor::new(&output)).expect("decode output");

        assert_eq!(decoder.repeat(), Repeat::Infinite);
        assert_eq!(decoder.into_iter().count(), 1);
        assert!(!output.windows(7).any(|window| window == b"private"));
        assert_eq!(
            sanitize_image_bytes(&output, "image/gif"),
            Ok(output.clone())
        );
    }
}
