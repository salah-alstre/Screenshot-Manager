//! Local OCR using the Windows.Media.Ocr engine built into Windows 10/11.
//! Nothing leaves the machine. Available languages depend on the installed
//! Windows OCR language packs.

use image::RgbaImage;

use crate::db::models::OcrWord;
use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Default)]
pub struct OcrLine {
    pub text: String,
    pub words: Vec<OcrWord>,
    /// Bounding box of the line: x, y, w, h (image pixels).
    pub bbox: (f32, f32, f32, f32),
}

#[derive(Debug, Clone, Default)]
pub struct OcrOutput {
    pub lines: Vec<OcrLine>,
}

impl OcrOutput {
    pub fn text(&self) -> String {
        self.lines.iter().map(|l| l.text.as_str()).collect::<Vec<_>>().join("\n")
    }
    pub fn words(&self) -> Vec<OcrWord> {
        self.lines.iter().flat_map(|l| l.words.iter().cloned()).collect()
    }
}

#[cfg(windows)]
mod imp {
    use super::*;
    use windows::core::HSTRING;
    use windows::Globalization::Language;
    use windows::Graphics::Imaging::{BitmapPixelFormat, SoftwareBitmap};
    use windows::Media::Ocr::OcrEngine;
    use windows::Storage::Streams::DataWriter;
    use windows::Win32::System::WinRT::{RoInitialize, RO_INIT_MULTITHREADED};

    fn ensure_winrt() {
        // Safe to call repeatedly; returns S_FALSE / RPC_E_CHANGED_MODE when already initialized.
        unsafe {
            let _ = RoInitialize(RO_INIT_MULTITHREADED);
        }
    }

    /// BCP-47 tags of the installed OCR languages, e.g. ["ar-SA", "en-US"].
    pub fn available_languages() -> Vec<String> {
        ensure_winrt();
        let Ok(langs) = OcrEngine::AvailableRecognizerLanguages() else { return vec![] };
        let mut out = Vec::new();
        if let Ok(size) = langs.Size() {
            for i in 0..size {
                if let Ok(lang) = langs.GetAt(i) {
                    if let Ok(tag) = lang.LanguageTag() {
                        out.push(tag.to_string());
                    }
                }
            }
        }
        out
    }

    pub fn max_dimension() -> u32 {
        ensure_winrt();
        OcrEngine::MaxImageDimension().unwrap_or(10_000)
    }

    pub fn recognize(img: &RgbaImage, language_tag: &str) -> AppResult<OcrOutput> {
        ensure_winrt();
        let lang = Language::CreateLanguage(&HSTRING::from(language_tag)).map_err(|e| AppError::Ocr(e.to_string()))?;
        if !OcrEngine::IsLanguageSupported(&lang).unwrap_or(false) {
            return Err(AppError::OcrLanguage(language_tag.to_string()));
        }
        let engine = OcrEngine::TryCreateFromLanguage(&lang).map_err(|e| AppError::Ocr(e.to_string()))?;

        let (w, h) = img.dimensions();
        let mut bgra = img.as_raw().clone();
        for px in bgra.chunks_exact_mut(4) {
            px.swap(0, 2);
        }
        let writer = DataWriter::new().map_err(|e| AppError::Ocr(e.to_string()))?;
        writer.WriteBytes(&bgra).map_err(|e| AppError::Ocr(e.to_string()))?;
        let buffer = writer.DetachBuffer().map_err(|e| AppError::Ocr(e.to_string()))?;
        let bitmap = SoftwareBitmap::CreateCopyFromBuffer(&buffer, BitmapPixelFormat::Bgra8, w as i32, h as i32)
            .map_err(|e| AppError::Ocr(e.to_string()))?;
        let result = engine
            .RecognizeAsync(&bitmap)
            .and_then(|op| op.join())
            .map_err(|e| AppError::Ocr(e.to_string()))?;

        let mut output = OcrOutput::default();
        let lines = result.Lines().map_err(|e| AppError::Ocr(e.to_string()))?;
        for line in lines {
            let text = line.Text().map(|t| t.to_string()).unwrap_or_default();
            let mut words = Vec::new();
            let (mut x1, mut y1, mut x2, mut y2) = (f32::MAX, f32::MAX, f32::MIN, f32::MIN);
            if let Ok(ws) = line.Words() {
                for word in ws {
                    let r = word.BoundingRect().unwrap_or_default();
                    x1 = x1.min(r.X);
                    y1 = y1.min(r.Y);
                    x2 = x2.max(r.X + r.Width);
                    y2 = y2.max(r.Y + r.Height);
                    words.push(OcrWord {
                        text: word.Text().map(|t| t.to_string()).unwrap_or_default(),
                        x: r.X,
                        y: r.Y,
                        w: r.Width,
                        h: r.Height,
                    });
                }
            }
            let bbox = if words.is_empty() { (0.0, 0.0, 0.0, 0.0) } else { (x1, y1, x2 - x1, y2 - y1) };
            output.lines.push(OcrLine { text, words, bbox });
        }
        Ok(output)
    }
}

#[cfg(windows)]
pub use imp::*;

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn available_languages() -> Vec<String> {
        vec![]
    }
    pub fn max_dimension() -> u32 {
        10_000
    }
    pub fn recognize(_img: &RgbaImage, _language_tag: &str) -> AppResult<OcrOutput> {
        Err(AppError::Ocr("OCR is only implemented on Windows".into()))
    }
}

#[cfg(not(windows))]
pub use imp::*;
