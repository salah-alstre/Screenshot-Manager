// Developer probe: runs Windows OCR on an image with each language and upscale factor.
// Usage: cargo run --example ocr_probe -- <image>
fn main() {
    let path = std::env::args().nth(1).expect("image path");
    let img = image::open(&path).unwrap().to_rgba8();
    println!("langs: {:?}", snapvault_lib::native::ocr::available_languages());
    for lang in ["en-US", "ar-SA"] {
        for scale in [1u32, 2] {
            let im = if scale == 1 { img.clone() } else {
                image::imageops::resize(&img, img.width() * scale, img.height() * scale, image::imageops::FilterType::CatmullRom)
            };
            let t = std::time::Instant::now();
            let out = snapvault_lib::native::ocr::recognize(&im, lang).unwrap();
            println!("=== {lang} x{scale} ({:?})\n{}", t.elapsed(), out.text());
        }
    }
}
