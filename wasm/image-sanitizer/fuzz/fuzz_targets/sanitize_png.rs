#![no_main]

mod common;

use img_parts::Bytes;
use img_parts::png::{Png, PngChunk};
use libfuzzer_sys::fuzz_target;

/// Chunks that carry text, EXIF, edit times, or other non-pixel metadata.
const METADATA_CHUNKS: &[[u8; 4]] = &[
    *b"tEXt", *b"zTXt", *b"iTXt", *b"eXIf", *b"tIME", *b"pHYs", *b"oFFs", *b"pCAL", *b"sCAL",
    *b"sTER", *b"dSIG", *b"caBX",
];

/// Animation chunks registered in PNG Third Edition despite their private-looking names.
const APNG_CHUNKS: &[[u8; 4]] = &[*b"acTL", *b"fcTL", *b"fdAT"];

fuzz_target!(|data: &[u8]| {
    let Some(output) = common::sanitize_checked(data, "image/png") else {
        return;
    };

    let input = Png::from_bytes(Bytes::copy_from_slice(data)).expect("accepted PNG must parse");
    let png = Png::from_bytes(Bytes::from(output)).expect("sanitized PNG must parse");
    let kinds: Vec<[u8; 4]> = png.chunks().iter().map(PngChunk::kind).collect();
    assert_eq!(
        kinds.first(),
        Some(b"IHDR"),
        "sanitized PNG must start with IHDR"
    );
    assert_eq!(
        kinds.last(),
        Some(b"IEND"),
        "sanitized PNG must end with IEND"
    );
    for kind in &kinds {
        assert!(
            !METADATA_CHUNKS.contains(kind),
            "sanitized PNG kept metadata chunk {:?}",
            String::from_utf8_lossy(kind)
        );
        // Bit 5 of the second byte marks a private chunk type in the PNG specification.
        // PNG Third Edition registers the APNG chunks, which predate that rule.
        assert!(
            kind[1] & 0x20 == 0 || APNG_CHUNKS.contains(kind),
            "sanitized PNG kept private chunk {:?}",
            String::from_utf8_lossy(kind)
        );
    }

    // Kept chunks are copied unchanged and in their original order.
    let mut kept = png.chunks().iter();
    let mut next = kept.next();
    for chunk in input.chunks() {
        if let Some(candidate) = next
            && candidate.kind() == chunk.kind()
            && candidate.contents() == chunk.contents()
        {
            next = kept.next();
        }
    }
    assert!(
        next.is_none(),
        "sanitized PNG chunks must be an ordered subset of the input"
    );
});
