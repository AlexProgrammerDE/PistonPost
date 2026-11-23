#![warn(clippy::indexing_slicing, clippy::arithmetic_side_effects)]

mod chunks;
mod jpeg;

use std::borrow::Cow;
use std::fmt;
use std::io::{self, Cursor, Write};

use gif::{DecodeOptions, Encoder as GifEncoder, Repeat};
use wasm_bindgen::prelude::{JsError, wasm_bindgen};

// The upload route runs this sanitizer inside a Worker with a 128 MB memory limit. These limits keep
// the measured peak (WASM linear memory plus the JavaScript input and output) near 96 MB. JPEG holds
// every DCT coefficient in memory, so its limit is the lowest. PNG and WebP memory depends only on
// the file size, so their limit matches the Cloudflare Images check in the upload route.
const MAX_JPEG_PIXELS: u64 = 2_000_000;
const MAX_GIF_PIXELS: u64 = 8_000_000;
const MAX_IMAGE_PIXELS: u64 = 80_000_000;
const MAX_GIF_ANIMATION_PIXELS: u64 = 50_000_000;

fn is_within_pixel_limit(width: u32, height: u32, limit: u64) -> bool {
    let pixels = u64::from(width).saturating_mul(u64::from(height));
    pixels > 0 && pixels <= limit
}

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
pub fn sanitize_image(input: Vec<u8>, mime_type: &str) -> Result<Vec<u8>, JsError> {
    sanitize_image_input(Cow::Owned(input), mime_type)
        .map_err(|error| JsError::new(&error.to_string()))
}

/// Removes private metadata from a supported image.
///
/// # Errors
///
/// Returns a sanitization error if the image is invalid or requires transcoding.
pub fn sanitize_image_bytes(input: &[u8], mime_type: &str) -> Result<Vec<u8>, SanitizeError> {
    sanitize_image_input(Cow::Borrowed(input), mime_type)
}

fn sanitize_image_input(input: Cow<'_, [u8]>, mime_type: &str) -> Result<Vec<u8>, SanitizeError> {
    match mime_type {
        "image/jpeg" => jpeg::sanitize(input.into_owned()),
        "image/png" => chunks::sanitize_png(input.into_owned()),
        "image/gif" => sanitize_gif(input.into_owned()),
        "image/webp" => chunks::sanitize_webp(input.into_owned()),
        _ => Err(SanitizeError::UnsupportedFormat),
    }
}

const fn remap_palette_index(index: &mut u8, first: u8, second: u8) {
    if *index == first {
        *index = second;
    } else if *index == second {
        *index = first;
    }
}

// Match MAX_IMAGE_UPLOAD_BYTES in src/lib/uploads/image-upload-policy.ts.
const MAX_IMAGE_UPLOAD_BYTES: usize = 15 * 1024 * 1024;

struct GifOutput(Vec<u8>);

impl GifOutput {
    fn new(input_len: usize) -> Self {
        let capacity = if input_len > MAX_IMAGE_UPLOAD_BYTES / 2 {
            MAX_IMAGE_UPLOAD_BYTES
        } else {
            input_len
        };
        Self(Vec::with_capacity(capacity))
    }
}

impl Write for GifOutput {
    fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
        let len = self.0.len().saturating_add(bytes.len());
        if len > MAX_IMAGE_UPLOAD_BYTES {
            return Err(io::Error::other(
                "The sanitized GIF must be no larger than 15 MB.",
            ));
        }
        if len > self.0.capacity() {
            let capacity = self
                .0
                .capacity()
                .saturating_mul(2)
                .clamp(len, MAX_IMAGE_UPLOAD_BYTES);
            self.0
                .try_reserve_exact(capacity.saturating_sub(self.0.len()))
                .map_err(io::Error::other)?;
        }
        self.0.extend_from_slice(bytes);
        Ok(bytes.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        Ok(())
    }
}

// The decoder only collects ICC and XMP before the first image. Treat those applications as
// comments so the decoder skips their sub-blocks without allocating space for the profiles.
fn ignore_gif_profiles(input: &mut [u8]) {
    let Some(&packed) = input.get(10) else {
        return;
    };
    let palette_size = if packed & 0x80 == 0 {
        0
    } else {
        6_usize << (packed & 7)
    };
    let mut offset = 13_usize.saturating_add(palette_size);
    while let Some([0x21, label, first_size, rest @ ..]) = input.get_mut(offset..) {
        if *label == 0xff
            && *first_size == 11
            && matches!(
                rest.first_chunk::<11>(),
                Some(b"ICCRGBG1012" | b"XMP DataXMP")
            )
        {
            *label = 0xfe;
        }
        offset = offset.saturating_add(2);
        loop {
            let Some(&size) = input.get(offset) else {
                return;
            };
            offset = offset.saturating_add(1).saturating_add(usize::from(size));
            if size == 0 {
                break;
            }
        }
    }
}

fn sanitize_gif(mut input: Vec<u8>) -> Result<Vec<u8>, SanitizeError> {
    ignore_gif_profiles(&mut input);
    let mut options = DecodeOptions::new();
    options.check_frame_consistency(true);
    let mut decoder = options
        .read_info(Cursor::new(&input))
        .map_err(SanitizeError::invalid_image_with_cause)?;
    let width = decoder.width();
    let height = decoder.height();
    let canvas_pixels = u64::from(width)
        .checked_mul(u64::from(height))
        .ok_or(SanitizeError::InvalidImage)?;
    if canvas_pixels == 0 || canvas_pixels > MAX_GIF_PIXELS {
        return Err(SanitizeError::InvalidImage);
    }
    let repeat = decoder.repeat();
    // The background index only refers to the global palette. GIFs without one must ignore it.
    let background = decoder
        .global_palette()
        .and_then(|_| decoder.bg_color())
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

    let mut encoder = GifEncoder::new(GifOutput::new(input.len()), width, height, &global_palette)
        .map_err(SanitizeError::invalid_image_with_cause)?;
    if repeat != Repeat::Finite(0) {
        encoder
            .set_repeat(repeat)
            .map_err(SanitizeError::invalid_image_with_cause)?;
    }

    // The frame uses one byte per index. The encoder writes at most 12 bits per index,
    // plus occasional dictionary clear codes and the terminator. Two bytes per index
    // and 16 extra bytes cover that output, even when it grows across frames.
    let canvas_size =
        usize::try_from(canvas_pixels).map_err(SanitizeError::invalid_image_with_cause)?;
    let mut frame_buffer = vec![0; canvas_size.saturating_mul(3).saturating_add(16)];
    let mut frame_count = 0_u64;
    while let Some(frame) = decoder
        .next_frame_info()
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
        // The gif encoder writes zero-area frames that its own decoder rejects as truncated.
        if frame.width == 0 || frame.height == 0 {
            return Err(SanitizeError::InvalidImage);
        }
        let mut frame = frame.clone();
        let (pixels, compressed) = frame_buffer
            .split_at_mut_checked(decoder.buffer_size())
            .ok_or(SanitizeError::InvalidImage)?;
        decoder
            .read_into_buffer(pixels)
            .map_err(SanitizeError::invalid_image_with_cause)?;
        // read_into_buffer deinterlaces the pixels.
        frame.interlaced = false;
        if frame.palette.is_none()
            && let Some(background) = background.filter(|index| *index != 0)
        {
            for index in &mut *pixels {
                remap_palette_index(index, 0, background);
            }
            if let Some(transparent) = &mut frame.transparent {
                remap_palette_index(transparent, 0, background);
            }
        }
        encoder
            .write_lzw_pre_encoded_frame(&gif::Frame {
                buffer: Cow::Borrowed(encode_gif_frame(pixels, compressed)?),
                ..frame
            })
            .map_err(SanitizeError::invalid_image_with_cause)?;
    }
    if frame_count == 0 {
        return Err(SanitizeError::InvalidImage);
    }

    encoder
        .into_inner()
        .map(|writer| writer.0)
        .map_err(SanitizeError::invalid_image_with_cause)
}

fn encode_gif_frame<'a>(
    pixels: &[u8],
    compressed: &'a mut [u8],
) -> Result<&'a [u8], SanitizeError> {
    // Use the same minimum code size as gif::Encoder::write_frame.
    let max_index = pixels
        .iter()
        .copied()
        .max()
        .ok_or(SanitizeError::InvalidImage)?;
    let colors = u16::from(max_index).saturating_add(1).max(4);
    let code_size = u8::try_from(colors.next_power_of_two().trailing_zeros())
        .map_err(SanitizeError::invalid_image_with_cause)?;
    *compressed.first_mut().ok_or(SanitizeError::InvalidImage)? = code_size;
    let mut lzw = weezl::encode::Encoder::new(weezl::BitOrder::Lsb, code_size);
    lzw.finish();

    let mut remaining = pixels;
    let mut written = 1_usize;
    loop {
        let output = compressed
            .get_mut(written..)
            .ok_or(SanitizeError::InvalidImage)?;
        let result = lzw.encode_bytes(remaining, output);
        written = written.saturating_add(result.consumed_out);
        match result
            .status
            .map_err(SanitizeError::invalid_image_with_cause)?
        {
            weezl::LzwStatus::Done => {
                return compressed.get(..written).ok_or(SanitizeError::InvalidImage);
            }
            weezl::LzwStatus::Ok if result.consumed_in != 0 || result.consumed_out != 0 => {
                remaining = remaining
                    .get(result.consumed_in..)
                    .ok_or(SanitizeError::InvalidImage)?;
            }
            weezl::LzwStatus::Ok | weezl::LzwStatus::NoProgress => {
                return Err(SanitizeError::InvalidImage);
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crc32fast::Hasher;
    use gif::{AnyExtension, Extension};
    use img_parts::Bytes;
    use img_parts::png::Png;
    use img_parts::riff::{RiffChunk, RiffContent};
    use img_parts::webp::WebP;
    use libjpeg_turbo_rs::decode::marker::MarkerReader;
    use libjpeg_turbo_rs::{
        Encoder as JpegEncoder, MarkerSaveConfig, PixelFormat, SavedMarker, decompress,
    };

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
    fn jpeg_keeps_the_adobe_color_transform_of_cmyk_and_ycck_images() {
        let pixels = (0..=u8::MAX)
            .flat_map(|index| [index, 30, 200, 10])
            .collect::<Vec<_>>();
        let cmyk = JpegEncoder::new(&pixels, 16, 16, PixelFormat::Cmyk)
            .quality(90)
            .encode()
            .expect("encode jpeg");
        // Photoshop saves CMYK JPEGs as YCCK. Only the Adobe transform tells decoders that.
        let mut ycck = cmyk.clone();
        let adobe = ycck
            .windows(5)
            .position(|window| window == b"Adobe")
            .expect("CMYK JPEG has an Adobe segment");
        *ycck
            .get_mut(adobe.saturating_add(11))
            .expect("Adobe transform byte") = 2;

        for (input, transform) in [(cmyk, 0), (ycck, 2)] {
            let output = sanitize_image_bytes(&input, "image/jpeg").expect("sanitize jpeg");
            let metadata = MarkerReader::new(&output)
                .read_markers()
                .expect("read sanitized markers");

            assert!(metadata.saw_adobe_marker);
            assert!(!metadata.saw_jfif_marker);
            assert_eq!(metadata.adobe_transform, transform);
            assert_eq!(
                decompress(&output).expect("decode output").data,
                decompress(&input).expect("decode input").data
            );
            assert_eq!(sanitize_image_bytes(&output, "image/jpeg"), Ok(output));
        }
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
    fn jpeg_preserves_large_icc_segments_in_order() {
        let input = jpeg_declaring(16, 16);
        let canonical = sanitize_image_bytes(&input, "image/jpeg").expect("sanitize seed");
        let markers: Vec<_> = (1..=8)
            .flat_map(|sequence| {
                let mut icc = b"ICC_PROFILE\0".to_vec();
                icc.extend_from_slice(&[sequence, 8]);
                icc.resize(65_533, sequence);
                [
                    SavedMarker {
                        code: 0xe2,
                        data: icc,
                    },
                    SavedMarker {
                        code: 0xe2,
                        data: b"MPF\0private".to_vec(),
                    },
                ]
            })
            .collect();
        let output_with = |markers: &[SavedMarker]| {
            libjpeg_turbo_rs::encode::pipeline::inject_saved_markers(&canonical, markers)
        };
        let input = output_with(&markers);
        let kept: Vec<_> = markers.into_iter().step_by(2).collect();
        let expected = output_with(&kept);

        assert_eq!(
            sanitize_image_bytes(&input, "image/jpeg"),
            Ok(expected.clone())
        );
        assert_eq!(sanitize_image_bytes(&expected, "image/jpeg"), Ok(expected));
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

    /// Encodes a small JPEG and patches its frame header to declare `width` by `height`.
    /// The decoder fills the missing scan data with zeros, like a truncated upload.
    fn jpeg_declaring(width: u16, height: u16) -> Vec<u8> {
        let pixels = vec![128; 16 * 16 * 3];
        let mut jpeg = JpegEncoder::new(&pixels, 16, 16, PixelFormat::Rgb)
            .encode()
            .expect("encode jpeg");
        let sof = jpeg
            .windows(2)
            .position(|window| window == [0xff, 0xc0])
            .expect("baseline frame header");
        let size = [height.to_be_bytes(), width.to_be_bytes()].concat();
        jpeg.splice(sof.saturating_add(5)..sof.saturating_add(9), size);
        jpeg
    }

    #[test]
    fn jpeg_pixel_limit_boundary() {
        // 2000 x 1000 is exactly MAX_JPEG_PIXELS.
        sanitize_image_bytes(&jpeg_declaring(2000, 1000), "image/jpeg")
            .expect("accept a JPEG at the pixel limit");
        assert_eq!(
            sanitize_image_bytes(&jpeg_declaring(2001, 1000), "image/jpeg"),
            Err(SanitizeError::InvalidImage)
        );
    }

    fn png_declaring(width: u32, height: u32) -> Vec<u8> {
        let mut header = [width.to_be_bytes(), height.to_be_bytes()].concat();
        header.extend_from_slice(&[8, 6, 0, 0, 0]);
        let mut png = b"\x89PNG\r\n\x1a\n".to_vec();
        png.extend(png_chunk(*b"IHDR", &header));
        png.extend(png_chunk(*b"IDAT", &[1, 2, 3, 4]));
        png.extend(png_chunk(*b"IEND", &[]));
        png
    }

    #[test]
    fn png_pixel_limit_boundary() {
        // 10000 x 8000 is exactly MAX_IMAGE_PIXELS.
        sanitize_image_bytes(&png_declaring(10_000, 8_000), "image/png")
            .expect("accept a PNG at the pixel limit");
        for (width, height) in [(10_000, 8_001), (0, 1), (u32::MAX, u32::MAX)] {
            assert_eq!(
                sanitize_image_bytes(&png_declaring(width, height), "image/png"),
                Err(SanitizeError::InvalidImage),
                "{width}x{height} PNG"
            );
        }
    }

    fn webp_with(chunks: Vec<RiffChunk>) -> Vec<u8> {
        let riff = RiffChunk::new(
            *b"RIFF",
            RiffContent::List {
                kind: Some(*b"WEBP"),
                subchunks: chunks,
            },
        );
        WebP::new(riff)
            .expect("valid webp")
            .encoder()
            .bytes()
            .to_vec()
    }

    fn data_chunk(id: [u8; 4], contents: Vec<u8>) -> RiffChunk {
        RiffChunk::new(id, RiffContent::Data(Bytes::from(contents)))
    }

    fn extended_webp_declaring(width: u32, height: u32) -> Vec<u8> {
        let mut vp8x = vec![0; 4];
        for size in [width, height] {
            let [low, middle, high, _] = size.saturating_sub(1).to_le_bytes();
            vp8x.extend_from_slice(&[low, middle, high]);
        }
        webp_with(vec![
            data_chunk(*b"VP8X", vp8x),
            data_chunk(*b"VP8L", vec![0x2f, 0, 0, 0, 0]),
        ])
    }

    fn lossless_webp_declaring(width: u32, height: u32) -> Vec<u8> {
        let bits = width.saturating_sub(1) | (height.saturating_sub(1) << 14);
        let mut vp8l = vec![0x2f];
        vp8l.extend_from_slice(&bits.to_le_bytes());
        webp_with(vec![data_chunk(*b"VP8L", vp8l)])
    }

    fn lossy_webp_declaring(width: u16, height: u16) -> Vec<u8> {
        let mut vp8 = vec![0x10, 0x02, 0x00, 0x9d, 0x01, 0x2a];
        vp8.extend_from_slice(&width.to_le_bytes());
        vp8.extend_from_slice(&height.to_le_bytes());
        webp_with(vec![data_chunk(*b"VP8 ", vp8)])
    }

    #[test]
    fn webp_pixel_limit_boundary() {
        // 10000 x 8000 and 16384 x 4882 are at or just under MAX_IMAGE_PIXELS.
        let accepted = [
            extended_webp_declaring(10_000, 8_000),
            lossless_webp_declaring(16_384, 4_882),
            lossy_webp_declaring(16_383, 4_883),
        ];
        let rejected = [
            extended_webp_declaring(10_000, 8_001),
            lossless_webp_declaring(16_384, 4_883),
            lossy_webp_declaring(16_383, 4_884),
            lossy_webp_declaring(0, 1),
            // Fuzzer finding: a second VP8X chunk declared a canvas far above the limit.
            {
                let mut chunks = vec![
                    data_chunk(*b"VP8X", vec![0; 10]),
                    data_chunk(
                        *b"VP8X",
                        vec![0, 0, 0, 0, 0xff, 0xff, 0x0f, 0xff, 0xff, 0x0f],
                    ),
                ];
                chunks.push(data_chunk(*b"VP8L", vec![0x2f, 0, 0, 0, 0]));
                webp_with(chunks)
            },
            webp_with(vec![data_chunk(*b"VP8 ", vec![1, 2, 3, 4])]),
        ];
        for input in &accepted {
            sanitize_image_bytes(input, "image/webp").expect("accept a WebP at the pixel limit");
        }
        for input in &rejected {
            assert_eq!(
                sanitize_image_bytes(input, "image/webp"),
                Err(SanitizeError::InvalidImage)
            );
        }
    }

    fn gif_declaring(width: u16, height: u16) -> Vec<u8> {
        let mut gif = b"GIF89a".to_vec();
        gif.extend_from_slice(&width.to_le_bytes());
        gif.extend_from_slice(&height.to_le_bytes());
        gif.extend_from_slice(&[0x80, 0, 0, 0, 0, 0, 0xff, 0xff, 0xff]);
        // One 1x1 frame with LZW data for a single index-0 pixel.
        gif.extend_from_slice(&[0x2c, 0, 0, 0, 0, 1, 0, 1, 0, 0, 2, 2, 0x44, 0x01, 0, 0x3b]);
        gif
    }

    #[test]
    fn gif_pixel_limit_boundary() {
        // 4000 x 2000 is exactly MAX_GIF_PIXELS.
        sanitize_image_bytes(&gif_declaring(4_000, 2_000), "image/gif")
            .expect("accept a GIF at the pixel limit");
        assert_eq!(
            sanitize_image_bytes(&gif_declaring(4_000, 2_001), "image/gif"),
            Err(SanitizeError::InvalidImage)
        );
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
    fn png_validates_crc_even_for_removed_metadata() {
        let mut input = png_declaring(1, 1);
        let mut text = png_chunk(*b"tEXt", b"Author\0Private");
        *text.last_mut().expect("PNG checksum") ^= 1;
        let before_end = input.len().saturating_sub(12);
        input.splice(before_end..before_end, text);

        let error = sanitize_image_bytes(&input, "image/png").expect_err("reject bad checksum");
        assert_eq!(
            error,
            SanitizeError::invalid_image_with_cause(img_parts::Error::BadCRC)
        );
    }

    #[test]
    fn webp_zeroes_odd_chunk_padding_and_ignores_trailing_bytes() {
        let expected = lossless_webp_declaring(1, 1);
        let mut input = expected.clone();
        *input.last_mut().expect("RIFF padding") = 0xff;
        input.extend_from_slice(b"ignored");

        assert_eq!(sanitize_image_bytes(&input, "image/webp"), Ok(expected));
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
    fn webp_removes_metadata_inside_animation_frames() {
        let mut frame = vec![0; 16];
        frame.extend(
            [
                data_chunk(*b"ALPH", vec![0]),
                data_chunk(*b"VP8L", vec![0x2f, 0, 0, 0, 0]),
                data_chunk(*b"EXIF", b"private".to_vec()),
                data_chunk(*b"XMP ", b"secret".to_vec()),
            ]
            .into_iter()
            .flat_map(|chunk| chunk.encoder().bytes())
            .collect::<Vec<_>>(),
        );
        let input = webp_with(vec![
            data_chunk(*b"VP8X", vec![0x12, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
            data_chunk(*b"ANIM", vec![0; 6]),
            data_chunk(*b"ANMF", frame),
        ]);

        let output = sanitize_image_bytes(&input, "image/webp").expect("sanitize webp");
        let parsed = WebP::from_bytes(Bytes::from(output.clone())).expect("parse output");
        let anmf = parsed
            .chunk_by_id(*b"ANMF")
            .and_then(|chunk| chunk.content().data())
            .expect("keep the animation frame");
        let mut expected = vec![0; 16];
        expected.extend(
            [
                data_chunk(*b"ALPH", vec![0]),
                data_chunk(*b"VP8L", vec![0x2f, 0, 0, 0, 0]),
            ]
            .into_iter()
            .flat_map(|chunk| chunk.encoder().bytes())
            .collect::<Vec<_>>(),
        );

        assert_eq!(anmf.as_ref(), expected.as_slice());
        assert!(!output.windows(7).any(|window| window == b"private"));
        assert!(!output.windows(6).any(|window| window == b"secret"));
        assert_eq!(sanitize_image_bytes(&output, "image/webp"), Ok(output));

        let truncated_frame = webp_with(vec![
            data_chunk(*b"VP8X", vec![0x02, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
            data_chunk(*b"ANMF", vec![0; 15]),
        ]);
        assert_eq!(
            sanitize_image_bytes(&truncated_frame, "image/webp"),
            Err(SanitizeError::InvalidImage)
        );
    }

    #[test]
    fn gif_ignores_background_index_without_global_palette() {
        // A 1x1 GIF with no global color table and background index 3. The GIF spec
        // says to ignore that index. The only frame has a local palette and pixel 1.
        let input: &[u8] = &[
            b'G', b'I', b'F', b'8', b'9', b'a', 1, 0, 1, 0, 0, 3, 0, 0x2c, 0, 0, 0, 0, 1, 0, 1, 0,
            0x80, 0, 0, 0, 255, 255, 255, 2, 2, 0x4c, 0x01, 0, 0x3b,
        ];

        let output = sanitize_image_bytes(input, "image/gif").expect("sanitize gif");
        let mut decoder = gif::Decoder::new(Cursor::new(&output)).expect("decode output");
        let frame = decoder
            .read_next_frame()
            .expect("read sanitized frame")
            .expect("sanitized frame exists");

        assert_eq!(
            frame.palette.as_deref(),
            Some([0, 0, 0, 255, 255, 255].as_slice())
        );
        assert_eq!(frame.buffer.as_ref(), &[1]);
        assert_eq!(sanitize_image_bytes(&output, "image/gif"), Ok(output));
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
    fn gif_with_zero_area_frame_is_rejected() {
        // Fuzzer-minimized GIF with a 1027x4 canvas and one interlaced 3x0 frame.
        // Its sanitized form used to be a GIF that the sanitizer itself could not read.
        let input: &[u8] = &[
            0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0x03, 0x04, 0x04, 0x00, 0x00, 0x00, 0x00, 0x2c,
            0x00, 0x00, 0x00, 0x00, 0x03, 0x00, 0x00, 0x00, 0xc0, 0x01, 0x02, 0x03, 0x7e, 0x7f,
            0x06, 0x02, 0x02, 0x44, 0x50, 0x00, 0x3b,
        ];

        assert_eq!(
            sanitize_image_bytes(input, "image/gif"),
            Err(SanitizeError::InvalidImage)
        );
    }

    #[test]
    fn gif_ignores_profiles_but_keeps_the_loop_extension() {
        let mut encoder =
            GifEncoder::new(Vec::new(), 1, 1, &[0, 0, 0, 255, 255, 255]).expect("create gif");
        for identifier in [b"ICCRGBG1012", b"XMP DataXMP"] {
            encoder
                .write_raw_extension(
                    AnyExtension(Extension::Application as u8),
                    &[identifier, b"profile"],
                )
                .expect("write profile");
        }
        encoder
            .set_repeat(Repeat::Infinite)
            .expect("write loop count");
        encoder
            .write_frame(&gif::Frame {
                width: 1,
                height: 1,
                buffer: Cow::Borrowed(&[0]),
                ..gif::Frame::default()
            })
            .expect("write frame");
        let input = encoder.into_inner().expect("finish gif");

        let output = sanitize_image_bytes(&input, "image/gif").expect("sanitize gif");
        let decoder = gif::Decoder::new(Cursor::new(&output)).expect("decode output");
        assert_eq!(decoder.repeat(), Repeat::Infinite);
        assert!(decoder.icc_profile().is_none());
        assert!(decoder.xmp_metadata().is_none());
        assert_eq!(sanitize_image_bytes(&output, "image/gif"), Ok(output));
    }

    #[test]
    fn gif_output_stops_at_the_upload_limit() {
        let mut writer = GifOutput::new(MAX_IMAGE_UPLOAD_BYTES.saturating_sub(1));
        writer.0.resize(MAX_IMAGE_UPLOAD_BYTES.saturating_sub(1), 0);
        writer.write_all(&[0x3b]).expect("trailer fits");
        assert_eq!(writer.0.len(), MAX_IMAGE_UPLOAD_BYTES);
        assert!(writer.write_all(&[0xff]).is_err());
        assert_eq!(writer.0.len(), MAX_IMAGE_UPLOAD_BYTES);
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
