use pistonpost_image_sanitizer::sanitize_image_bytes;

/// The browser and the upload route both reject files above 15 MiB
/// (`MAX_IMAGE_UPLOAD_BYTES`) before they call the sanitizer.
const MAX_UPLOAD_BYTES: usize = 15 * 1024 * 1024;

/// Sanitizes `data` as `mime_type` and checks the contract every caller relies on.
///
/// The upload route accepts a file only when sanitizing it again returns the same bytes,
/// so a successful output must be a fixed point. Returns the output on success.
pub fn sanitize_checked(data: &[u8], mime_type: &str) -> Option<Vec<u8>> {
    if data.len() > MAX_UPLOAD_BYTES {
        return None;
    }
    let output = sanitize_image_bytes(data, mime_type).ok()?;
    assert!(!output.is_empty(), "sanitized {mime_type} output is empty");
    let second_pass = sanitize_image_bytes(&output, mime_type);
    assert_eq!(
        second_pass.as_ref(),
        Ok(&output),
        "sanitizing a sanitized {mime_type} must return the same bytes"
    );
    Some(output)
}
