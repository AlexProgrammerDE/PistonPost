use crc32fast::Hasher;
use img_parts::Error;

use crate::{MAX_IMAGE_PIXELS, SanitizeError, is_within_pixel_limit};

const PRESERVED_PNG_CHUNKS: &[[u8; 4]] = &[
    *b"IHDR", *b"PLTE", *b"IDAT", *b"IEND", *b"cHRM", *b"gAMA", *b"iCCP", *b"sBIT", *b"sRGB",
    *b"cICP", *b"mDCv", *b"cLLi", *b"bKGD", *b"hIST", *b"sPLT", *b"tRNS", *b"acTL", *b"fcTL",
    *b"fdAT",
];

pub(super) fn sanitize_png(mut input: Vec<u8>) -> Result<Vec<u8>, SanitizeError> {
    let signature = b"\x89PNG\r\n\x1a\n";
    if input.len() < signature.len() {
        return Err(SanitizeError::invalid_image_with_cause(Error::Truncated));
    }
    if !input.starts_with(signature) {
        return Err(SanitizeError::invalid_image_with_cause(
            Error::WrongSignature,
        ));
    }
    let mut read = signature.len();
    let mut write = read;
    while read < input.len() {
        let (kind, contents, length) =
            png_chunk(input.get(read..).ok_or(SanitizeError::InvalidImage)?)
                .map_err(SanitizeError::invalid_image_with_cause)?;
        if read == signature.len() {
            let (width, height) = contents
                .split_first_chunk::<4>()
                .ok_or(SanitizeError::InvalidImage)?;
            let height = height
                .first_chunk::<4>()
                .ok_or(SanitizeError::InvalidImage)?;
            if kind != *b"IHDR"
                || !is_within_pixel_limit(
                    u32::from_be_bytes(*width),
                    u32::from_be_bytes(*height),
                    MAX_IMAGE_PIXELS,
                )
            {
                return Err(SanitizeError::InvalidImage);
            }
        }
        let end = read.saturating_add(length);
        if PRESERVED_PNG_CHUNKS.contains(&kind) {
            input.copy_within(read..end, write);
            write = write.saturating_add(length);
        }
        if kind == *b"IEND" {
            input.truncate(write);
            return Ok(input);
        }
        read = end;
    }
    Err(SanitizeError::InvalidImage)
}

fn png_chunk(bytes: &[u8]) -> Result<([u8; 4], &[u8], usize), Error> {
    let (size, rest) = bytes.split_first_chunk::<4>().ok_or(Error::Truncated)?;
    let (kind, rest) = rest.split_first_chunk::<4>().ok_or(Error::Truncated)?;
    let (contents, rest) = rest
        .split_at_checked(u32::from_be_bytes(*size) as usize)
        .ok_or(Error::Truncated)?;
    let expected = rest.first_chunk::<4>().ok_or(Error::Truncated)?;
    let mut hash = Hasher::new();
    hash.update(kind);
    hash.update(contents);
    if hash.finalize().to_be_bytes() != *expected {
        return Err(Error::BadCRC);
    }
    Ok((*kind, contents, contents.len().saturating_add(12)))
}

const PRESERVED_WEBP_CHUNKS: &[[u8; 4]] = &[
    *b"VP8 ", *b"VP8L", *b"VP8X", *b"ALPH", *b"ANIM", *b"ANMF", *b"ICCP",
];

fn riff_chunk(bytes: &[u8]) -> Result<([u8; 4], &[u8], usize), Error> {
    let (id, rest) = bytes.split_first_chunk::<4>().ok_or(Error::Truncated)?;
    let (size, rest) = rest.split_first_chunk::<4>().ok_or(Error::Truncated)?;
    let len = u32::from_le_bytes(*size) as usize;
    let contents = rest.get(..len).ok_or(Error::Truncated)?;
    let padding = usize::from(!len.is_multiple_of(2) && !matches!(id, b"RIFF" | b"LIST" | b"seqt"));
    let total = len.saturating_add(padding).saturating_add(8);
    if total > bytes.len() {
        return Err(Error::Truncated);
    }
    Ok((*id, contents, total))
}

// Validate nested RIFF containers before discarding them. Real WebP chunks are flat.
fn validate_riff_children(mut data: &[u8], depth: u8) -> Result<(), Error> {
    if depth == 0 {
        return Err(Error::Truncated);
    }
    while !data.is_empty() {
        let (id, contents, size) = riff_chunk(data)?;
        match &id {
            b"RIFF" | b"LIST" => {
                validate_riff_children(
                    contents.get(4..).ok_or(Error::Truncated)?,
                    depth.saturating_sub(1),
                )?;
            }
            b"seqt" => validate_riff_children(contents, depth.saturating_sub(1))?,
            _ => {}
        }
        data = data.get(size..).ok_or(Error::Truncated)?;
    }
    Ok(())
}

pub(super) fn sanitize_webp(mut input: Vec<u8>) -> Result<Vec<u8>, SanitizeError> {
    let (id, contents, length) =
        riff_chunk(&input).map_err(SanitizeError::invalid_image_with_cause)?;
    if id != *b"RIFF" || !contents.starts_with(b"WEBP") {
        return Err(SanitizeError::invalid_image_with_cause(
            Error::WrongSignature,
        ));
    }
    let mut read = 12_usize;
    let mut write = read;
    let mut has_canvas = false;
    let mut has_image = false;
    let mut has_frame_header = false;
    let mut valid_frames = true;
    while read < length {
        let (id, contents, size) =
            riff_chunk(input.get(read..length).ok_or(SanitizeError::InvalidImage)?)
                .map_err(SanitizeError::invalid_image_with_cause)?;
        match &id {
            b"VP8X" => {
                has_canvas = true;
                if contents.len() != 10 || !valid_dimensions(vp8x_canvas(contents)) {
                    return Err(SanitizeError::InvalidImage);
                }
            }
            b"VP8 " | b"VP8L" => {
                has_image = true;
                has_frame_header = true;
                valid_frames &= valid_dimensions(if id == *b"VP8 " {
                    vp8_frame(contents)
                } else {
                    vp8l_frame(contents)
                });
            }
            b"ANMF" => has_image = true,
            b"RIFF" | b"LIST" | b"seqt" => {
                let skip = if id == *b"seqt" { 0 } else { 4 };
                validate_riff_children(
                    contents.get(skip..).ok_or(SanitizeError::InvalidImage)?,
                    32,
                )
                .map_err(SanitizeError::invalid_image_with_cause)?;
            }
            _ => {}
        }

        let end = read.saturating_add(size);
        if PRESERVED_WEBP_CHUNKS.contains(&id) {
            let padded = !contents.len().is_multiple_of(2);
            input.copy_within(read..end, write);
            if id == *b"VP8X" {
                let start = write.saturating_add(8);
                let [flags, a, b, c] = input
                    .get_mut(start..)
                    .and_then(<[u8]>::first_chunk_mut)
                    .ok_or(SanitizeError::InvalidImage)?;
                *flags &= 0x32;
                [*a, *b, *c] = [0; 3];
            }
            write = write.saturating_add(size);
            if padded {
                *input
                    .get_mut(write.saturating_sub(1))
                    .ok_or(SanitizeError::InvalidImage)? = 0;
            }
        }
        read = end;
    }
    if !has_image || !(has_canvas || has_frame_header && valid_frames) {
        return Err(SanitizeError::InvalidImage);
    }
    let riff_length =
        u32::try_from(write.saturating_sub(8)).map_err(SanitizeError::invalid_image_with_cause)?;
    input
        .get_mut(4..8)
        .ok_or(SanitizeError::InvalidImage)?
        .copy_from_slice(&riff_length.to_le_bytes());
    input.truncate(write);
    Ok(input)
}

fn valid_dimensions(size: Option<(u32, u32)>) -> bool {
    size.is_some_and(|(width, height)| is_within_pixel_limit(width, height, MAX_IMAGE_PIXELS))
}

fn read_u24_le(bytes: &[u8]) -> Option<u32> {
    let [first, second, third] = *bytes.first_chunk::<3>()?;
    Some(u32::from_le_bytes([first, second, third, 0]))
}

fn vp8x_canvas(contents: &[u8]) -> Option<(u32, u32)> {
    let width = read_u24_le(contents.get(4..7)?)?.checked_add(1)?;
    let height = read_u24_le(contents.get(7..10)?)?.checked_add(1)?;
    Some((width, height))
}

fn vp8_frame(contents: &[u8]) -> Option<(u32, u32)> {
    // A key frame starts with a 3-byte frame tag and the 9d 01 2a start code.
    if contents.get(3..6)? != [0x9d, 0x01, 0x2a] {
        return None;
    }
    let [width_low, width_high, height_low, height_high] = *contents.get(6..)?.first_chunk()?;
    let width = u16::from_le_bytes([width_low, width_high]) & 0x3fff;
    let height = u16::from_le_bytes([height_low, height_high]) & 0x3fff;
    Some((u32::from(width), u32::from(height)))
}

fn vp8l_frame(contents: &[u8]) -> Option<(u32, u32)> {
    let (signature, rest) = contents.split_first()?;
    if *signature != 0x2f {
        return None;
    }
    let bits = u32::from_le_bytes(*rest.first_chunk::<4>()?);
    let width = (bits & 0x3fff).checked_add(1)?;
    let height = ((bits >> 14) & 0x3fff).checked_add(1)?;
    Some((width, height))
}
