//! Runtime composition of tray icon variants. We ship a single base icon
//! (`icons/icon.png`); the "connected" variant is generated programmatically
//! at startup by drawing a green disc + check mark on top of the base.
//!
//! Avoids checking a duplicate PNG into the repo and means the overlay
//! always matches whatever icon you bundle.

use std::sync::OnceLock;

use image::{GenericImageView, ImageBuffer, Pixel, Rgba, RgbaImage};

const BASE_ICON_BYTES: &[u8] = include_bytes!("../../icons/icon.png");

static BASE: OnceLock<Vec<u8>> = OnceLock::new();
static CONNECTED: OnceLock<Vec<u8>> = OnceLock::new();

/// PNG bytes for the default tray icon (template / monochrome friendly).
pub fn default_icon_png() -> &'static [u8] {
    BASE.get_or_init(|| BASE_ICON_BYTES.to_vec())
}

/// PNG bytes for the "connected" tray icon: same base, with a green
/// disc and white check overlaid in the bottom-right quadrant.
/// Generated once on first call and cached for the rest of the process
/// lifetime.
pub fn connected_icon_png() -> &'static [u8] {
    CONNECTED.get_or_init(|| compose_connected_png(BASE_ICON_BYTES).unwrap_or_else(|e| {
        tracing::warn!("connected icon overlay failed: {e}; falling back to base icon");
        BASE_ICON_BYTES.to_vec()
    }))
}

fn compose_connected_png(base: &[u8]) -> image::ImageResult<Vec<u8>> {
    let img = image::load_from_memory(base)?;
    let (w, h) = img.dimensions();
    let mut canvas: RgbaImage = img.to_rgba8();

    // Badge geometry: ~46% of the smaller dimension, anchored to lower-right
    // with a small inset so it doesn't bleed off the edge.
    let dim = w.min(h);
    let radius = (dim as f32 * 0.30) as i32;
    let inset = (dim as f32 * 0.06) as i32;
    let cx = w as i32 - radius - inset;
    let cy = h as i32 - radius - inset;

    let green = Rgba([34u8, 197, 94, 255]); // tailwind green-500
    let ring = Rgba([255u8, 255, 255, 230]);
    let check = Rgba([255u8, 255, 255, 255]);

    // Filled disc with anti-aliased edge.
    let edge = 1.4f32;
    for y in (cy - radius - 1).max(0)..(cy + radius + 1).min(h as i32) {
        for x in (cx - radius - 1).max(0)..(cx + radius + 1).min(w as i32) {
            let dx = (x - cx) as f32;
            let dy = (y - cy) as f32;
            let d = (dx * dx + dy * dy).sqrt();
            let r = radius as f32;

            let inside_alpha = aa_alpha(d, r - edge, r);
            if inside_alpha > 0.0 {
                blend_pixel(&mut canvas, x as u32, y as u32, green, inside_alpha);
            }

            // White outline ring just outside the disc, two pixels thick,
            // helps the badge pop on busy menu bars.
            let ring_alpha = aa_alpha(d, r, r + 1.6) * (1.0 - aa_alpha(d, r - 0.5, r));
            if ring_alpha > 0.0 {
                blend_pixel(&mut canvas, x as u32, y as u32, ring, ring_alpha * 0.85);
            }
        }
    }

    // Check mark — two strokes (short low-left then long up-right), drawn
    // by sampling each pixel against an SDF for two line segments.
    let r = radius as f32;
    let stroke_w = (r * 0.18).max(1.5);
    // Segment endpoints relative to center, scaled to radius.
    let p1 = (-0.45 * r, 0.05 * r);
    let p2 = (-0.10 * r, 0.40 * r);
    let p3 = (0.50 * r, -0.30 * r);

    for y in (cy - radius - 1).max(0)..(cy + radius + 1).min(h as i32) {
        for x in (cx - radius - 1).max(0)..(cx + radius + 1).min(w as i32) {
            let px = (x - cx) as f32;
            let py = (y - cy) as f32;

            let d1 = sd_segment(px, py, p1.0, p1.1, p2.0, p2.1);
            let d2 = sd_segment(px, py, p2.0, p2.1, p3.0, p3.1);
            let d = d1.min(d2);

            let stroke = aa_alpha(d, stroke_w * 0.5, stroke_w * 0.5 + 1.0);
            if stroke > 0.0 {
                // Only paint where the disc itself exists.
                let inside_disc = aa_alpha(
                    (px * px + py * py).sqrt(),
                    r - edge,
                    r,
                );
                if inside_disc > 0.0 {
                    blend_pixel(
                        &mut canvas,
                        x as u32,
                        y as u32,
                        check,
                        stroke * inside_disc,
                    );
                }
            }
        }
    }

    let mut out = Vec::with_capacity(canvas.as_raw().len());
    image::DynamicImage::ImageRgba8(canvas).write_to(
        &mut std::io::Cursor::new(&mut out),
        image::ImageFormat::Png,
    )?;
    Ok(out)
}

/// 1.0 inside `inner`, 0.0 outside `outer`, smoothly interpolated in between.
fn aa_alpha(d: f32, inner: f32, outer: f32) -> f32 {
    if d <= inner {
        1.0
    } else if d >= outer {
        0.0
    } else {
        let t = (outer - d) / (outer - inner);
        t.clamp(0.0, 1.0)
    }
}

/// Signed distance from point (px,py) to segment (ax,ay)→(bx,by).
fn sd_segment(px: f32, py: f32, ax: f32, ay: f32, bx: f32, by: f32) -> f32 {
    let pax = px - ax;
    let pay = py - ay;
    let bax = bx - ax;
    let bay = by - ay;
    let h = ((pax * bax + pay * bay) / (bax * bax + bay * bay)).clamp(0.0, 1.0);
    let dx = pax - bax * h;
    let dy = pay - bay * h;
    (dx * dx + dy * dy).sqrt()
}

fn blend_pixel(
    canvas: &mut ImageBuffer<Rgba<u8>, Vec<u8>>,
    x: u32,
    y: u32,
    src: Rgba<u8>,
    alpha: f32,
) {
    if alpha <= 0.0 {
        return;
    }
    let mut srcp = src;
    srcp.0[3] = ((src.0[3] as f32) * alpha) as u8;
    let mut dst = *canvas.get_pixel(x, y);
    dst.blend(&srcp);
    canvas.put_pixel(x, y, dst);
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The connected variant must produce a valid PNG (the tray code
    /// will hand it to `Image::from_bytes` and panic if it's garbage).
    #[test]
    fn connected_icon_decodes_back_to_image() {
        let bytes = connected_icon_png();
        assert!(!bytes.is_empty(), "connected icon should not be empty");
        let decoded = image::load_from_memory(bytes).expect("re-decodable PNG");
        let (w, h) = decoded.dimensions();
        assert!(w > 0 && h > 0);

        // Sanity: at least one pixel should be reasonably green-ish
        // (the badge fill). Otherwise the overlay didn't run.
        let rgba = decoded.to_rgba8();
        let any_green = rgba.pixels().any(|p| {
            let [r, g, b, a] = p.0;
            a > 200 && g as i32 > r as i32 + 40 && g as i32 > b as i32 + 40
        });
        assert!(any_green, "expected a green pixel from the badge");
    }

    #[test]
    fn default_icon_is_the_bundled_bytes() {
        assert_eq!(default_icon_png(), BASE_ICON_BYTES);
    }
}
