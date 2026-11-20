use std::ops::Range;

use libjpeg_turbo_rs::common::exif::parse_orientation;
use libjpeg_turbo_rs::common::types::FrameHeader;
use libjpeg_turbo_rs::decode::marker::MarkerReader;
use libjpeg_turbo_rs::{MarkerCopyMode, TransformOp, TransformOptions};

use crate::{MAX_IMAGE_UPLOAD_BYTES, MAX_JPEG_PIXELS, SanitizeError, is_within_pixel_limit};

// Leave room for libjpeg's coefficient arrays, entropy buffer, and encoded output
// when the input also carries a large profile. Metadata does not count as coded data.
const MAX_JPEG_CODED_BYTES: usize = 11_500_000;
const MAX_JPEG_INPUT_AND_COEFFICIENT_BYTES: u64 = 50_750_000;
const MAX_ARITHMETIC_JPEG_WORKING_BYTES: u64 = 94_000_000;

fn too_large() -> SanitizeError {
    SanitizeError::invalid_image_with_cause("The JPEG image data is too large to sanitize.")
}

fn coefficient_bytes(frame: &FrameHeader) -> u64 {
    let factors = frame.components.iter().map(|component| {
        (
            u64::from(component.horizontal_sampling),
            u64::from(component.vertical_sampling),
        )
    });
    let max_h = factors.clone().map(|(h, _)| h).max().unwrap_or(1);
    let max_v = factors.clone().map(|(_, v)| v).max().unwrap_or(1);
    let columns = u64::from(frame.width).div_ceil(max_h.saturating_mul(8));
    let rows = u64::from(frame.height).div_ceil(max_v.saturating_mul(8));
    let blocks_per_unit = factors.map(|(h, v)| h.saturating_mul(v)).sum::<u64>();
    columns
        .saturating_mul(rows)
        .saturating_mul(blocks_per_unit)
        .saturating_mul(128)
}

fn check_working_size(
    file_bytes: usize,
    coefficient_bytes: u64,
    arithmetic: bool,
) -> Result<(), SanitizeError> {
    // Count the JavaScript and WASM copies of the file.
    let input_bytes = (file_bytes as u64).saturating_mul(2);
    // Arithmetic streams can expand substantially during the Huffman rewrite. The dense
    // arithmetic measurements put the codec's peak near five times the coefficient array.
    if input_bytes.saturating_add(coefficient_bytes) > MAX_JPEG_INPUT_AND_COEFFICIENT_BYTES
        || arithmetic
            && input_bytes.saturating_add(coefficient_bytes.saturating_mul(5))
                > MAX_ARITHMETIC_JPEG_WORKING_BYTES
    {
        return Err(too_large());
    }
    Ok(())
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

pub(super) fn sanitize(mut input: Vec<u8>) -> Result<Vec<u8>, SanitizeError> {
    let icc_segments = skip_jpeg_metadata(&mut input)?;
    let metadata = MarkerReader::new(&input)
        .read_markers()
        .map_err(SanitizeError::invalid_image_with_cause)?;
    if !is_within_pixel_limit(
        u32::from(metadata.frame.width),
        u32::from(metadata.frame.height),
        MAX_JPEG_PIXELS,
    ) {
        return Err(SanitizeError::InvalidImage);
    }
    let coefficient_bytes = coefficient_bytes(&metadata.frame);
    check_working_size(input.len(), coefficient_bytes, metadata.is_arithmetic)?;
    let transform = metadata
        .exif_data
        .as_deref()
        .and_then(parse_orientation)
        .map_or(TransformOp::None, orientation_transform);
    drop(metadata);

    let output = libjpeg_turbo_rs::transform_jpeg_with_options(
        &input,
        &TransformOptions {
            op: transform,
            optimize: true,
            copy_markers: MarkerCopyMode::None,
            ..TransformOptions::default()
        },
    )
    .map_err(SanitizeError::invalid_image_with_cause)?;

    // The codec writes a fresh JFIF segment. Its size is excluded from the coded data cap.
    let after_jfif = jpeg_segment_end(&output, 4)?;
    if output.len().saturating_sub(after_jfif.saturating_sub(2)) > MAX_JPEG_CODED_BYTES {
        return Err(too_large());
    }
    let capacity = output.len().saturating_add(
        icc_segments
            .iter()
            .map(|segment| segment.len().saturating_add(2))
            .sum::<usize>(),
    );
    // Apply the same bounds to the result so it also passes on the second call.
    if capacity > MAX_IMAGE_UPLOAD_BYTES {
        return Err(too_large());
    }
    check_working_size(capacity, coefficient_bytes, false)?;
    if icc_segments.is_empty() {
        return Ok(output);
    }

    // Insert the original ICC segments after JFIF, as the codec's marker injection does.
    let (header, scan) = output
        .split_at_checked(after_jfif)
        .ok_or(SanitizeError::InvalidImage)?;
    let mut with_icc = Vec::with_capacity(capacity);
    with_icc.extend_from_slice(header);
    for segment in icc_segments {
        with_icc.extend_from_slice(&[0xff, 0xe2]);
        with_icc.extend_from_slice(input.get(segment).ok_or(SanitizeError::InvalidImage)?);
    }
    with_icc.extend_from_slice(scan);
    Ok(with_icc)
}

fn jpeg_segment_end(input: &[u8], length_offset: usize) -> Result<usize, SanitizeError> {
    let [hi, lo] = *input
        .get(length_offset..)
        .and_then(<[u8]>::first_chunk)
        .ok_or(SanitizeError::InvalidImage)?;
    let length = usize::from(u16::from_be_bytes([hi, lo]));
    let end = length_offset.saturating_add(length);
    if length < 2 || end > input.len() {
        return Err(SanitizeError::InvalidImage);
    }
    Ok(end)
}

// Rename metadata markers to APP15 so the codec skips their payloads. Keep the original
// offsets so the codec can still read the scan data and we can restore ICC without copying it.
fn skip_jpeg_metadata(input: &mut [u8]) -> Result<Vec<Range<usize>>, SanitizeError> {
    if !input.starts_with(&[0xff, 0xd8]) {
        return Err(SanitizeError::InvalidImage);
    }
    let mut icc_segments = Vec::new();
    let mut cursor = 2_usize;
    let mut progressive = false;
    let mut components = 0;
    let mut metadata_bytes = 0_usize;
    while let Some(marker) = input.get(cursor).copied() {
        let marker_offset = cursor;
        cursor = cursor.saturating_add(1);
        // Match the codec's tolerance for fill bytes and an omitted 0xff prefix.
        if marker == 0xff {
            continue;
        }
        if marker == 0xd9 {
            break;
        }
        let end = jpeg_segment_end(input, cursor)?;
        let payload = input
            .get(cursor.saturating_add(2)..end)
            .ok_or(SanitizeError::InvalidImage)?;
        if matches!(marker, 0xe0..=0xef | 0xfe) {
            let has_prefix = input.get(marker_offset.saturating_sub(1)) == Some(&0xff);
            let size = end
                .saturating_sub(marker_offset)
                .saturating_add(usize::from(has_prefix));
            metadata_bytes = metadata_bytes.saturating_add(size);
        }
        match marker {
            0xc0..=0xc3 | 0xc9..=0xcb => {
                progressive = matches!(marker, 0xc2 | 0xca);
                components = *payload.get(5).ok_or(SanitizeError::InvalidImage)?;
            }
            0xda => {
                let scan_components = *payload.first().ok_or(SanitizeError::InvalidImage)?;
                if !progressive && scan_components >= components {
                    break;
                }
                // Skip a progressive or non-interleaved scan, including stuffed bytes
                // and restart markers. The next marker can carry ICC or EXIF.
                let offset = input
                    .get(end..)
                    .and_then(|scan| {
                        scan.windows(2).position(|pair| {
                            matches!(pair, [0xff, code] if !matches!(code, 0x00 | 0xd0..=0xd7))
                        })
                    })
                    .ok_or(SanitizeError::InvalidImage)?;
                cursor = end.saturating_add(offset);
                continue;
            }
            0xe1 if payload.starts_with(b"Exif\0\0") => {}
            0xe1 | 0xe2 | 0xed | 0xfe => {
                if marker == 0xe2 && payload.starts_with(b"ICC_PROFILE\0") {
                    icc_segments.push(cursor..end);
                }
                *input
                    .get_mut(marker_offset)
                    .ok_or(SanitizeError::InvalidImage)? = 0xef;
            }
            _ => {}
        }
        cursor = end;
    }
    if input.len().saturating_sub(metadata_bytes) > MAX_JPEG_CODED_BYTES {
        return Err(too_large());
    }
    Ok(icc_segments)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn jpeg_working_size_reserves_room_for_arithmetic_expansion() {
        assert_eq!(
            check_working_size(MAX_IMAGE_UPLOAD_BYTES, 6_000_000, true),
            Ok(())
        );
        assert_eq!(
            check_working_size(MAX_IMAGE_UPLOAD_BYTES, 16_000_000, false),
            Ok(())
        );
        assert_eq!(
            check_working_size(MAX_IMAGE_UPLOAD_BYTES, 16_000_000, true),
            Err(too_large())
        );
    }

    #[test]
    fn jpeg_coded_size_cap_excludes_app_segments() {
        // A tiny synthetic header and scan. The test exercises the byte count
        // without needing a large JPEG fixture or allocating codec buffers.
        let header = [
            0xff, 0xd8, 0xff, 0xe2, 0, 14, b'I', b'C', b'C', b'_', b'P', b'R', b'O', b'F', b'I',
            b'L', b'E', 0, 0xff, 0xda, 0, 3, 1,
        ];
        let mut input = header.to_vec();
        input.resize(MAX_JPEG_CODED_BYTES.saturating_add(16), 1);
        let segments = skip_jpeg_metadata(&mut input).expect("accept coded data at the limit");
        assert_eq!(segments.len(), 1);
        assert_eq!(segments.first(), Some(&(4..18)));
        let mut input = header.to_vec();
        input.resize(MAX_JPEG_CODED_BYTES.saturating_add(17), 1);
        assert_eq!(skip_jpeg_metadata(&mut input), Err(too_large()));
    }
}
