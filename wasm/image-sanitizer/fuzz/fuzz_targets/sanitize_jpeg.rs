#![no_main]

mod common;

use libfuzzer_sys::fuzz_target;
use libjpeg_turbo_rs::MarkerSaveConfig;
use libjpeg_turbo_rs::decode::marker::MarkerReader;

/// The sanitizer rejects JPEG frames above this many pixels.
const MAX_IMAGE_PIXELS: u64 = 2_000_000;

fuzz_target!(|data: &[u8]| {
    let Some(output) = common::sanitize_checked(data, "image/jpeg") else {
        return;
    };

    let mut reader = MarkerReader::new(&output);
    reader.set_marker_save_config(MarkerSaveConfig::All);
    let metadata = reader
        .read_markers()
        .expect("sanitized JPEG markers must parse");

    let pixels = u64::from(metadata.frame.width) * u64::from(metadata.frame.height);
    assert!(
        pixels > 0 && pixels <= MAX_IMAGE_PIXELS,
        "sanitized JPEG has {pixels} pixels"
    );
    assert!(metadata.exif_data.is_none(), "sanitized JPEG kept EXIF");
    assert!(metadata.comment.is_none(), "sanitized JPEG kept a comment");
    for marker in &metadata.saved_markers {
        match marker.code {
            // JFIF header written by the transform, without an embedded thumbnail.
            0xe0 => assert!(
                marker.data.starts_with(b"JFIF\0") && marker.data.get(12..14) == Some(&[0, 0][..]),
                "sanitized JPEG kept an APP0 segment other than a plain JFIF header"
            ),
            0xe2 => assert!(
                marker.data.starts_with(b"ICC_PROFILE\0"),
                "sanitized JPEG kept an APP2 segment that is not an ICC profile"
            ),
            code => panic!("sanitized JPEG kept marker 0x{code:02x}"),
        }
    }
});
