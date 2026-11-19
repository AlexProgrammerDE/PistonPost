#![no_main]

mod common;

use std::io::Cursor;

use gif::{ColorOutput, DecodeOptions, DisposalMethod, MemoryLimit, Repeat};
use libfuzzer_sys::fuzz_target;

/// The sanitizer rejects GIF canvases above this many pixels.
const MAX_IMAGE_PIXELS: u64 = 80_000_000;
/// The sanitizer rejects animated GIFs whose canvas area times frame count is above this.
const MAX_GIF_ANIMATION_PIXELS: u64 = 50_000_000;

#[derive(Debug, PartialEq, Eq)]
struct RenderedFrame {
    left: u16,
    top: u16,
    width: u16,
    height: u16,
    delay: u16,
    dispose: DisposalMethod,
    needs_user_input: bool,
    rgba: Vec<u8>,
}

#[derive(Debug, PartialEq, Eq)]
struct RenderedGif {
    width: u16,
    height: u16,
    repeat: Repeat,
    frames: Vec<RenderedFrame>,
    has_xmp: bool,
    has_icc: bool,
}

/// Decodes every frame to RGBA so palette and index remapping can be compared by color.
///
/// Only inputs the sanitizer accepted reach this function. Its decoder already caps each
/// indexed frame at 50 MB, so the RGBA copy needs no extra limit.
fn render(bytes: &[u8]) -> RenderedGif {
    let mut options = DecodeOptions::new();
    options.check_frame_consistency(true);
    options.set_color_output(ColorOutput::RGBA);
    options.set_memory_limit(MemoryLimit::Unlimited);
    let mut decoder = options
        .read_info(Cursor::new(bytes))
        .expect("GIF header must decode");
    let mut frames = Vec::new();
    while let Some(frame) = decoder.read_next_frame().expect("GIF frame must decode") {
        frames.push(RenderedFrame {
            left: frame.left,
            top: frame.top,
            width: frame.width,
            height: frame.height,
            delay: frame.delay,
            dispose: frame.dispose,
            needs_user_input: frame.needs_user_input,
            rgba: frame.buffer.to_vec(),
        });
    }
    RenderedGif {
        width: decoder.width(),
        height: decoder.height(),
        repeat: decoder.repeat(),
        frames,
        has_xmp: decoder.xmp_metadata().is_some(),
        has_icc: decoder.icc_profile().is_some(),
    }
}

fuzz_target!(|data: &[u8]| {
    let Some(output) = common::sanitize_checked(data, "image/gif") else {
        return;
    };

    let sanitized = render(&output);
    let canvas_pixels = u64::from(sanitized.width) * u64::from(sanitized.height);
    assert!(
        canvas_pixels > 0 && canvas_pixels <= MAX_IMAGE_PIXELS,
        "sanitized GIF canvas has {canvas_pixels} pixels"
    );
    let frame_count = u64::try_from(sanitized.frames.len()).expect("frame count fits in u64");
    assert!(
        frame_count <= 1 || canvas_pixels * frame_count <= MAX_GIF_ANIMATION_PIXELS,
        "sanitized GIF animation has {frame_count} frames of {canvas_pixels} pixels"
    );
    assert!(!sanitized.has_xmp, "sanitized GIF kept XMP metadata");
    assert!(!sanitized.has_icc, "sanitized GIF kept an ICC profile");

    // Re-encoding may reorder palette entries but must not change any visible color,
    // frame geometry, timing, or loop count.
    let original = render(data);
    assert_eq!(
        RenderedGif {
            has_xmp: false,
            has_icc: false,
            ..original
        },
        sanitized,
        "sanitized GIF must render like the input"
    );
});
