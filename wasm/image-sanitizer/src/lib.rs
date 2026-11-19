#![warn(clippy::indexing_slicing, clippy::arithmetic_side_effects)]

use std::fmt;
use std::io::Cursor;

use gif::{DecodeOptions, Encoder as GifEncoder, Repeat};
use img_parts::Bytes;
use img_parts::jpeg::{Jpeg, JpegSegment, markers as jpeg_markers};
use img_parts::png::{Png, PngChunk};
use img_parts::riff::{RiffChunk, RiffContent};
use img_parts::webp::WebP;
use libjpeg_turbo_rs::common::exif::parse_orientation;
use libjpeg_turbo_rs::decode::marker::MarkerReader;
use libjpeg_turbo_rs::{MarkerCopyMode, TransformOp, TransformOptions};
use wasm_bindgen::prelude::{JsError, wasm_bindgen};

const MAX_IMAGE_PIXELS: u64 = 80_000_000;
const MAX_GIF_ANIMATION_PIXELS: u64 = 50_000_000;

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum SanitizeError {
    InvalidImage,
    InvalidImageWithCause(String),
    UnsupportedFormat,
}

impl SanitizeError {
    fn invalid_image_with_cause(error: impl fmt::Display) -> Self {
        Self::InvalidImageWithCause(error.to_string())
    }
}

impl fmt::Display for SanitizeError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::InvalidImage => formatter.write_str("The image container is invalid."),
            Self::InvalidImageWithCause(cause) => {
                write!(formatter, "The image container is invalid. {cause}")
            }
            Self::UnsupportedFormat => formatter.write_str("The image format must be transcoded."),
        }
    }
}

impl std::error::Error for SanitizeError {}

/// Removes private metadata from a supported image.
///
/// # Errors
///
/// Returns a JavaScript error if the image is invalid or requires transcoding.
#[wasm_bindgen]
pub fn sanitize_image(input: &[u8], mime_type: &str) -> Result<Vec<u8>, JsError> {
    sanitize_image_bytes(input, mime_type).map_err(|error| JsError::new(&error.to_string()))
}

/// Removes private metadata from a supported image.
///
/// # Errors
///
/// Returns a sanitization error if the image is invalid or requires transcoding.
pub fn sanitize_image_bytes(input: &[u8], mime_type: &str) -> Result<Vec<u8>, SanitizeError> {
    match mime_type {
        "image/jpeg" => sanitize_jpeg(input),
        "image/png" => sanitize_png(input),
        "image/gif" => sanitize_gif(input),
        "image/webp" => sanitize_webp(input),
        _ => Err(SanitizeError::UnsupportedFormat),
    }
}

const fn orientation_transform(orientation: u8) -> TransformOp {
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
        .map_err(SanitizeError::invalid_image_with_cause)?;
    let pixels = u64::from(metadata.frame.width)
        .checked_mul(u64::from(metadata.frame.height))
        .ok_or(SanitizeError::InvalidImage)?;
    if pixels == 0 || pixels > MAX_IMAGE_PIXELS {
        return Err(SanitizeError::InvalidImage);
    }
    let transform = metadata
        .exif_data
        .as_deref()
        .and_then(parse_orientation)
        .map_or(TransformOp::None, orientation_transform);

    let transformed = libjpeg_turbo_rs::transform_jpeg_with_options(
        input,
        &TransformOptions {
            op: transform,
            optimize: true,
            copy_markers: MarkerCopyMode::IccOnly,
            ..TransformOptions::default()
        },
    )
    .map_err(SanitizeError::invalid_image_with_cause)?;

    // `MarkerCopyMode::IccOnly` copies every APP2 segment, including MPF and FlashPix data.
    let mut jpeg = Jpeg::from_bytes(Bytes::from(transformed))
        .map_err(SanitizeError::invalid_image_with_cause)?;
    jpeg.segments_mut().retain(is_preserved_jpeg_segment);
    Ok(jpeg.encoder().bytes().to_vec())
}

fn is_preserved_jpeg_segment(segment: &JpegSegment) -> bool {
    segment.marker() != jpeg_markers::APP2 || segment.contents().starts_with(b"ICC_PROFILE\0")
}

const PRESERVED_PNG_CHUNKS: &[[u8; 4]] = &[
    *b"IHDR", *b"PLTE", *b"IDAT", *b"IEND", *b"cHRM", *b"gAMA", *b"iCCP", *b"sBIT", *b"sRGB",
    *b"cICP", *b"mDCv", *b"cLLi", *b"bKGD", *b"hIST", *b"sPLT", *b"tRNS", *b"acTL", *b"fcTL",
    *b"fdAT",
];

fn sanitize_png(input: &[u8]) -> Result<Vec<u8>, SanitizeError> {
    let mut png = Png::from_bytes(Bytes::copy_from_slice(input))
        .map_err(SanitizeError::invalid_image_with_cause)?;
    if png.chunks().first().map(PngChunk::kind) != Some(*b"IHDR")
        || png.chunks().last().map(PngChunk::kind) != Some(*b"IEND")
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
    let mut webp = WebP::from_bytes(Bytes::copy_from_slice(input))
        .map_err(SanitizeError::invalid_image_with_cause)?;
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
        *contents.first_mut().ok_or(SanitizeError::InvalidImage)? &= 0x32;
        contents
            .get_mut(1..4)
            .ok_or(SanitizeError::InvalidImage)?
            .fill(0);
        *chunk = RiffChunk::new(*b"VP8X", RiffContent::Data(Bytes::from(contents)));
    }
    Ok(webp.encoder().bytes().to_vec())
}

const fn remap_palette_index(index: &mut u8, first: u8, second: u8) {
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
        .map_err(SanitizeError::invalid_image_with_cause)?;
    let width = decoder.width();
    let height = decoder.height();
    let canvas_pixels = u64::from(width)
        .checked_mul(u64::from(height))
        .ok_or(SanitizeError::InvalidImage)?;
    if canvas_pixels == 0 || canvas_pixels > MAX_IMAGE_PIXELS {
        return Err(SanitizeError::InvalidImage);
    }
    let repeat = decoder.repeat();
    let background = decoder
        .bg_color()
        .and_then(|index| u8::try_from(index).ok());
    let mut global_palette = decoder.global_palette().unwrap_or_default().to_vec();

    if let Some(background) = background.filter(|index| *index != 0) {
        let offset = usize::from(background)
            .checked_mul(3)
            .ok_or(SanitizeError::InvalidImage)?;
        let (before_background, from_background) = global_palette
            .split_at_mut_checked(offset)
            .ok_or(SanitizeError::InvalidImage)?;
        let first = before_background
            .first_chunk_mut::<3>()
            .ok_or(SanitizeError::InvalidImage)?;
        let background = from_background
            .first_chunk_mut::<3>()
            .ok_or(SanitizeError::InvalidImage)?;
        std::mem::swap(first, background);
    }

    let mut encoder = GifEncoder::new(
        Vec::with_capacity(input.len()),
        width,
        height,
        &global_palette,
    )
    .map_err(SanitizeError::invalid_image_with_cause)?;
    if repeat != Repeat::Finite(0) {
        encoder
            .set_repeat(repeat)
            .map_err(SanitizeError::invalid_image_with_cause)?;
    }

    let mut frame_count = 0_u64;
    while let Some(frame) = decoder
        .read_next_frame()
        .map_err(SanitizeError::invalid_image_with_cause)?
    {
        frame_count = frame_count
            .checked_add(1)
            .ok_or(SanitizeError::InvalidImage)?;
        if frame_count > 1
            && canvas_pixels
                .checked_mul(frame_count)
                .is_none_or(|pixels| pixels > MAX_GIF_ANIMATION_PIXELS)
        {
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
            .map_err(SanitizeError::invalid_image_with_cause)?;
    }
    if frame_count == 0 {
        return Err(SanitizeError::InvalidImage);
    }

    encoder
        .into_inner()
        .map_err(SanitizeError::invalid_image_with_cause)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crc32fast::Hasher;
    use gif::{AnyExtension, Extension};
    use libjpeg_turbo_rs::{Encoder as JpegEncoder, MarkerSaveConfig, PixelFormat, SavedMarker};

    #[test]
    fn malformed_image_reports_parser_cause() {
        let parser_error =
            Png::from_bytes(Bytes::from_static(b"bad PNG")).expect_err("invalid PNG");
        let error = sanitize_image_bytes(b"bad PNG", "image/png").expect_err("reject invalid PNG");

        assert_eq!(
            error.to_string(),
            format!("The image container is invalid. {parser_error}")
        );
    }

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
    fn jpeg_drops_app2_segments_that_are_not_icc_profiles() {
        // Fuzzer-minimized progressive grayscale JPEG whose APP2 segment holds "JFXX\0thumbnail"
        // instead of an ICC profile. The marker reader accepts it without the 0xFF prefix.
        let input: &[u8] = &[
            0xff, 0xd8, 0xe2, 0x00, 0x11, 0x4a, 0x46, 0x58, 0x58, 0x00, 0x74, 0x68, 0x75, 0x6d,
            0x62, 0x6e, 0x61, 0x69, 0x6c, 0xff, 0xc2, 0x00, 0x0b, 0x08, 0x00, 0x0b, 0x00, 0x09,
            0x01, 0x01, 0x11, 0x00, 0xff, 0xc4, 0x00, 0x16, 0x00, 0x01, 0x01, 0x01, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x04, 0x05, 0xff,
            0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x00, 0x10, 0xff, 0xd9,
        ];

        let output = sanitize_image_bytes(input, "image/jpeg").expect("sanitize jpeg");
        let mut reader = MarkerReader::new(&output);
        reader.set_marker_save_config(MarkerSaveConfig::All);
        let metadata = reader.read_markers().expect("read sanitized markers");

        assert!(
            metadata
                .saved_markers
                .iter()
                .all(|marker| marker.code != 0xe2),
            "non-ICC APP2 segment survived"
        );
        assert!(!output.windows(9).any(|window| window == b"thumbnail"));
        assert_eq!(sanitize_image_bytes(&output, "image/jpeg"), Ok(output));
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
                .map(RiffChunk::id)
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
    fn gif_without_frames_is_rejected() {
        // Fuzzer-minimized GIF with a 256x15105 canvas, no global palette, and no frames.
        // Its sanitized form used to be a GIF that the sanitizer itself could not read.
        let input: &[u8] = &[
            0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x00, 0x01, 0x01, 0x3b, 0x44, 0x00, 0x3b, 0x3b,
            0x3b,
        ];

        assert_eq!(
            sanitize_image_bytes(input, "image/gif"),
            Err(SanitizeError::InvalidImage)
        );
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
        let mut input = encoder.into_inner().expect("finish gif");
        // The logical screen descriptor stores the background color index at byte 11.
        *input.get_mut(11).expect("GIF background index") = 1;

        let output = sanitize_image_bytes(&input, "image/gif").expect("sanitize gif");
        let mut decoder = gif::Decoder::new(Cursor::new(&output)).expect("decode output");

        assert_eq!(decoder.repeat(), Repeat::Infinite);
        assert_eq!(decoder.bg_color(), Some(0));
        assert_eq!(
            decoder.global_palette(),
            Some([255, 255, 255, 0, 0, 0].as_slice())
        );
        let frame = decoder
            .read_next_frame()
            .expect("read sanitized frame")
            .expect("sanitized frame exists");
        assert_eq!(frame.buffer.as_ref(), &[0]);
        assert!(
            decoder
                .read_next_frame()
                .expect("read end of GIF")
                .is_none()
        );
        assert!(!output.windows(7).any(|window| window == b"private"));
        assert_eq!(sanitize_image_bytes(&output, "image/gif"), Ok(output));
    }
}
