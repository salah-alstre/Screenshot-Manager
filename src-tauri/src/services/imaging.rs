//! Image validation, decoding, hashing, thumbnails and encoding.

use std::io::Cursor;
use std::path::Path;

use image::codecs::jpeg::JpegEncoder;
use image::codecs::png::{CompressionType, FilterType as PngFilter, PngEncoder};
use image::imageops::FilterType;
use image::{DynamicImage, ImageFormat, ImageReader, Limits, RgbaImage};
use sha2::{Digest, Sha256};

use super::paths::extension_of;
use crate::error::{AppError, AppResult};

/// Largest file we will import (bytes).
pub const MAX_FILE_BYTES: u64 = 256 * 1024 * 1024;
/// Largest image edge we will decode (pixels).
pub const MAX_DIMENSION: u32 = 32_768;
pub const THUMB_MAX_EDGE: u32 = 560;

pub fn format_name(f: ImageFormat) -> &'static str {
    match f {
        ImageFormat::Png => "png",
        ImageFormat::Jpeg => "jpg",
        ImageFormat::WebP => "webp",
        ImageFormat::Bmp => "bmp",
        _ => "unknown",
    }
}

fn format_for_extension(ext: &str) -> Option<ImageFormat> {
    match ext {
        "png" => Some(ImageFormat::Png),
        "jpg" | "jpeg" => Some(ImageFormat::Jpeg),
        "webp" => Some(ImageFormat::WebP),
        "bmp" => Some(ImageFormat::Bmp),
        _ => None,
    }
}

/// Checks the extension is supported *and* matches the file's actual content.
pub fn sniff_format(path: &Path, bytes: &[u8]) -> AppResult<ImageFormat> {
    let ext = extension_of(path).unwrap_or_default();
    let expected = format_for_extension(&ext).ok_or_else(|| AppError::UnsupportedImage(format!("extension .{ext}")))?;
    let actual = image::guess_format(bytes).map_err(|_| AppError::UnsupportedImage("unrecognized content".into()))?;
    if actual != expected {
        return Err(AppError::UnsupportedImage(format!(
            "content is {} but extension is .{ext}",
            format_name(actual)
        )));
    }
    Ok(actual)
}

fn limits() -> Limits {
    let mut l = Limits::default();
    l.max_image_width = Some(MAX_DIMENSION);
    l.max_image_height = Some(MAX_DIMENSION);
    l.max_alloc = Some(2 * 1024 * 1024 * 1024);
    l
}

pub fn decode(bytes: &[u8], format: ImageFormat) -> AppResult<DynamicImage> {
    let mut reader = ImageReader::with_format(Cursor::new(bytes), format);
    reader.limits(limits());
    Ok(reader.decode()?)
}

/// Reads and validates an image file, returning its bytes, format and decoded pixels.
pub fn load_validated(path: &Path) -> AppResult<(Vec<u8>, ImageFormat, DynamicImage)> {
    let meta = std::fs::metadata(path)?;
    if !meta.is_file() {
        return Err(AppError::UnsupportedImage("not a regular file".into()));
    }
    if meta.len() == 0 || meta.len() > MAX_FILE_BYTES {
        return Err(AppError::UnsupportedImage("file size out of range".into()));
    }
    let bytes = std::fs::read(path)?;
    let format = sniff_format(path, &bytes)?;
    let img = decode(&bytes, format)?;
    Ok((bytes, format, img))
}

/// Decodes any supported image file without extension checks (for files already in the library).
pub fn open_image(path: &Path) -> AppResult<DynamicImage> {
    let bytes = std::fs::read(path)?;
    let format = image::guess_format(&bytes).map_err(|_| AppError::UnsupportedImage("unrecognized content".into()))?;
    decode(&bytes, format)
}

pub fn sha256_hex(bytes: &[u8]) -> String {
    let digest = Sha256::digest(bytes);
    digest.iter().map(|b| format!("{b:02x}")).collect()
}

/// 256-bit difference hash: grayscale 17×16, compare horizontal neighbours.
pub fn dhash256(img: &DynamicImage) -> Vec<u8> {
    let small = img.resize_exact(17, 16, FilterType::Triangle).to_luma8();
    let mut out = vec![0u8; 32];
    let mut bit = 0usize;
    for y in 0..16 {
        for x in 0..16 {
            let left = small.get_pixel(x, y)[0];
            let right = small.get_pixel(x + 1, y)[0];
            if left > right {
                out[bit / 8] |= 1 << (bit % 8);
            }
            bit += 1;
        }
    }
    out
}

pub fn thumbnail_jpeg(img: &DynamicImage) -> AppResult<Vec<u8>> {
    let (w, h) = (img.width(), img.height());
    let thumb = if w.max(h) > THUMB_MAX_EDGE {
        img.resize(THUMB_MAX_EDGE, THUMB_MAX_EDGE, FilterType::Triangle)
    } else {
        img.clone()
    };
    let rgb = thumb.to_rgb8();
    let mut out = Vec::new();
    JpegEncoder::new_with_quality(&mut out, 84).encode_image(&rgb)?;
    Ok(out)
}

pub fn write_thumbnail(img: &DynamicImage, dest: &Path) -> AppResult<()> {
    let bytes = thumbnail_jpeg(img)?;
    super::paths::write_atomic(dest, &bytes)
}

/// Encodes an image for saving/exporting. `format`: png | jpg | webp.
pub fn encode(img: &DynamicImage, format: &str, quality: u8) -> AppResult<Vec<u8>> {
    let quality = quality.clamp(10, 100);
    let mut out = Vec::new();
    match format {
        "png" => {
            let rgba = img.to_rgba8();
            let enc = PngEncoder::new_with_quality(&mut out, CompressionType::Fast, PngFilter::Adaptive);
            image::ImageEncoder::write_image(
                enc,
                rgba.as_raw(),
                rgba.width(),
                rgba.height(),
                image::ExtendedColorType::Rgba8,
            )?;
        }
        "jpg" | "jpeg" => {
            let rgb = img.to_rgb8();
            JpegEncoder::new_with_quality(&mut out, quality).encode_image(&rgb)?;
        }
        "webp" => {
            let rgba = img.to_rgba8();
            let encoder = webp::Encoder::from_rgba(rgba.as_raw(), rgba.width(), rgba.height());
            let mem = if quality >= 100 { encoder.encode_lossless() } else { encoder.encode(quality as f32) };
            out.extend_from_slice(&mem);
        }
        other => return Err(AppError::Invalid(format!("unsupported output format {other}"))),
    }
    Ok(out)
}

pub fn crop(frame: &RgbaImage, x: u32, y: u32, w: u32, h: u32) -> RgbaImage {
    image::imageops::crop_imm(frame, x, y, w, h).to_image()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn png_bytes(w: u32, h: u32) -> Vec<u8> {
        let img = DynamicImage::ImageRgba8(RgbaImage::from_fn(w, h, |x, y| image::Rgba([(x % 255) as u8, (y % 255) as u8, 90, 255])));
        encode(&img, "png", 100).unwrap()
    }

    #[test]
    fn sniff_accepts_matching_content() {
        let bytes = png_bytes(8, 8);
        assert_eq!(sniff_format(Path::new("a.png"), &bytes).unwrap(), ImageFormat::Png);
        assert_eq!(sniff_format(Path::new("a.PNG"), &bytes).unwrap(), ImageFormat::Png);
    }

    #[test]
    fn sniff_rejects_mismatched_or_fake_files() {
        let bytes = png_bytes(8, 8);
        assert!(sniff_format(Path::new("a.jpg"), &bytes).is_err(), "extension mismatch");
        assert!(sniff_format(Path::new("a.png"), b"MZ\x90\x00 not an image").is_err(), "executable renamed to png");
        assert!(sniff_format(Path::new("a.exe"), &bytes).is_err(), "unsupported extension");
        assert!(sniff_format(Path::new("a.gif"), b"GIF89a....").is_err());
    }

    #[test]
    fn load_validated_rejects_empty_and_invalid() {
        let dir = tempfile::tempdir().unwrap();
        let empty = dir.path().join("e.png");
        std::fs::write(&empty, b"").unwrap();
        assert!(load_validated(&empty).is_err());
        let truncated = dir.path().join("t.png");
        std::fs::write(&truncated, &png_bytes(64, 64)[..40]).unwrap();
        assert!(load_validated(&truncated).is_err());
        let good = dir.path().join("g.png");
        std::fs::write(&good, png_bytes(10, 6)).unwrap();
        let (_, fmt, img) = load_validated(&good).unwrap();
        assert_eq!((fmt, img.width(), img.height()), (ImageFormat::Png, 10, 6));
    }

    #[test]
    fn identical_images_share_hashes_and_different_do_not() {
        let a = DynamicImage::ImageRgba8(RgbaImage::from_fn(200, 100, |x, _| image::Rgba([(x % 256) as u8, 0, 0, 255])));
        let b = a.clone();
        let c = DynamicImage::ImageRgba8(RgbaImage::from_fn(200, 100, |x, _| image::Rgba([(255 - x % 256) as u8, 0, 0, 255])));
        assert_eq!(dhash256(&a), dhash256(&b));
        let dist: u32 = dhash256(&a).iter().zip(dhash256(&c)).map(|(x, y)| (x ^ y).count_ones()).sum();
        assert!(dist > 100, "reversed gradient should differ strongly, got {dist}");
        let e1 = encode(&a, "png", 100).unwrap();
        let e2 = encode(&b, "png", 100).unwrap();
        assert_eq!(sha256_hex(&e1), sha256_hex(&e2));
    }

    #[test]
    fn slightly_changed_image_is_similar() {
        let a = DynamicImage::ImageRgba8(RgbaImage::from_fn(400, 300, |x, y| {
            image::Rgba([((x * 7 + y * 3) % 256) as u8, (y % 256) as u8, 128, 255])
        }));
        let mut b = a.to_rgba8();
        for x in 0..20 {
            for y in 0..10 {
                b.put_pixel(x, y, image::Rgba([255, 255, 255, 255]));
            }
        }
        let b = DynamicImage::ImageRgba8(b);
        let dist: u32 = dhash256(&a).iter().zip(dhash256(&b)).map(|(x, y)| (x ^ y).count_ones()).sum();
        assert!(dist <= 20, "small edit should stay similar, got {dist}");
    }

    #[test]
    fn encodes_all_export_formats() {
        let img = DynamicImage::ImageRgba8(RgbaImage::from_pixel(32, 16, image::Rgba([10, 20, 30, 255])));
        for (fmt, expected) in [("png", ImageFormat::Png), ("jpg", ImageFormat::Jpeg), ("webp", ImageFormat::WebP)] {
            let bytes = encode(&img, fmt, 80).unwrap();
            assert_eq!(image::guess_format(&bytes).unwrap(), expected);
            let back = decode(&bytes, expected).unwrap();
            assert_eq!((back.width(), back.height()), (32, 16));
        }
        assert!(encode(&img, "gif", 80).is_err());
    }

    #[test]
    fn thumbnails_are_bounded() {
        let img = DynamicImage::ImageRgba8(RgbaImage::from_pixel(3840, 2160, image::Rgba([1, 2, 3, 255])));
        let t = thumbnail_jpeg(&img).unwrap();
        let back = decode(&t, ImageFormat::Jpeg).unwrap();
        assert_eq!(back.width(), THUMB_MAX_EDGE);
        assert!(back.height() < THUMB_MAX_EDGE);
    }
}
