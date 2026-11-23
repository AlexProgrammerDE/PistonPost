#![no_main]

mod common;

use img_parts::Bytes;
use img_parts::riff::RiffChunk;
use img_parts::webp::WebP;
use libfuzzer_sys::fuzz_target;

/// Chunk IDs that the WebP container specification defines for image data.
const IMAGE_CHUNKS: &[[u8; 4]] = &[
    *b"VP8 ", *b"VP8L", *b"VP8X", *b"ALPH", *b"ANIM", *b"ANMF", *b"ICCP",
];
/// The sanitizer rejects WebP canvases above this many pixels.
const MAX_IMAGE_PIXELS: u64 = 80_000_000;
/// VP8X flags that may stay set: ICC profile, alpha, and animation.
const ALLOWED_VP8X_FLAGS: u8 = 0x20 | 0x10 | 0x02;

fuzz_target!(|data: &[u8]| {
    let Some(output) = common::sanitize_checked(data, "image/webp") else {
        return;
    };

    let input = WebP::from_bytes(Bytes::copy_from_slice(data)).expect("accepted WebP must parse");
    let webp = WebP::from_bytes(Bytes::from(output)).expect("sanitized WebP must parse");
    let ids: Vec<[u8; 4]> = webp.chunks().iter().map(RiffChunk::id).collect();
    assert!(
        ids.iter()
            .any(|id| matches!(id, b"VP8 " | b"VP8L" | b"ANMF")),
        "sanitized WebP has no image data chunk"
    );
    for id in &ids {
        assert!(
            IMAGE_CHUNKS.contains(id),
            "sanitized WebP kept chunk {:?}",
            String::from_utf8_lossy(id)
        );
    }

    for chunk in webp.chunks_by_id(*b"VP8X") {
        let contents = chunk.content().data().expect("VP8X must hold data");
        assert_eq!(contents.len(), 10, "VP8X must hold 10 bytes");
        assert_eq!(
            contents[0] & !ALLOWED_VP8X_FLAGS,
            0,
            "sanitized VP8X keeps EXIF, XMP, or reserved flags"
        );
        assert_eq!(
            &contents[1..4],
            &[0, 0, 0],
            "sanitized VP8X keeps reserved bytes"
        );
        let width = u64::from(u32::from_le_bytes([
            contents[4],
            contents[5],
            contents[6],
            0,
        ])) + 1;
        let height = u64::from(u32::from_le_bytes([
            contents[7],
            contents[8],
            contents[9],
            0,
        ])) + 1;
        assert!(
            width * height <= MAX_IMAGE_PIXELS,
            "sanitized WebP canvas has {} pixels",
            width * height
        );
    }

    for chunk in webp.chunks_by_id(*b"ANMF") {
        let contents = chunk.content().data().expect("ANMF must hold data");
        let mut frame = contents.get(16..).expect("ANMF must hold a frame header");
        while let Some((id, rest)) = frame.split_first_chunk::<4>() {
            assert!(
                matches!(id, b"ALPH" | b"VP8 " | b"VP8L"),
                "sanitized ANMF kept chunk {:?}",
                String::from_utf8_lossy(id)
            );
            let (size, rest) = rest.split_first_chunk::<4>().expect("ANMF chunk size");
            let size = u32::from_le_bytes(*size) as usize;
            frame = rest
                .get(size + size % 2..)
                .expect("ANMF chunk must fit in the frame");
        }
        assert!(frame.is_empty(), "sanitized ANMF has trailing bytes");
    }

    // Every chunk except VP8X is kept in its original order. Only VP8X and ANMF change.
    let mut kept = webp.chunks().iter().filter(|chunk| chunk.id() != *b"VP8X");
    let mut next = kept.next();
    for chunk in input.chunks() {
        if let Some(candidate) = next
            && candidate.id() == chunk.id()
            && (candidate.id() == *b"ANMF" || candidate.content().data() == chunk.content().data())
            && candidate
                .content()
                .list()
                .map(|(kind, chunks)| (kind, chunks.len()))
                == chunk
                    .content()
                    .list()
                    .map(|(kind, chunks)| (kind, chunks.len()))
        {
            next = kept.next();
        }
    }
    assert!(
        next.is_none(),
        "sanitized WebP chunks must be an ordered subset of the input"
    );
});
