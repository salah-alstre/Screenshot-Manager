//! OCR pipeline and background queue.
//!
//! Recognition runs locally through the Windows OCR engine. Post-processing:
//! * small images are upscaled 2× (markedly better on UI-sized text);
//! * Windows returns words in visual left-to-right order, so Arabic (RTL)
//!   lines are reordered into logical order with a small bidi pass;
//! * in "Arabic + English" mode the Arabic engine (which also reads Latin
//!   script) is combined with the English engine, preferring English results
//!   for lines that contain no Arabic.

use std::collections::VecDeque;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use image::imageops::FilterType;
use image::RgbaImage;
use parking_lot::{Condvar, Mutex};
use tauri::{AppHandle, Manager};

use crate::db::{models::OcrWord, screenshots};
use crate::error::{AppError, AppResult};
use crate::native::ocr::{self as native, OcrLine, OcrOutput};
use crate::state::AppState;

pub const ENGINE: &str = "windows-ocr";

fn is_arabic_char(c: char) -> bool {
    matches!(c, '\u{0600}'..='\u{06FF}' | '\u{0750}'..='\u{077F}' | '\u{08A0}'..='\u{08FF}' | '\u{FB50}'..='\u{FDFF}' | '\u{FE70}'..='\u{FEFF}')
}

fn has_arabic(s: &str) -> bool {
    s.chars().any(is_arabic_char)
}

/// Undo RTL mirroring of punctuation on Latin words (":Email" -> "Email:").
fn fix_latin_word(word: &str) -> String {
    if has_arabic(word) {
        return word.to_string();
    }
    let lead: String = word.chars().take_while(|c| matches!(c, ':' | '.' | ',' | ';' | '!' | '?')).collect();
    let rest = &word[lead.len()..];
    if !lead.is_empty() && rest.chars().next().is_some_and(|c| c.is_alphanumeric()) {
        format!("{rest}{lead}")
    } else {
        word.to_string()
    }
}

/// Reorders words of a line from visual order into logical reading order.
pub fn reorder_line(words: Vec<OcrWord>) -> Vec<OcrWord> {
    if !words.iter().any(|w| has_arabic(&w.text)) {
        return words;
    }
    let arabic = words.iter().filter(|w| has_arabic(&w.text)).count();
    let latin = words.len() - arabic;
    let rtl_line = words.last().is_some_and(|w| has_arabic(&w.text)) || arabic > latin;

    // Split into maximal runs of same direction.
    let mut runs: Vec<(bool, Vec<OcrWord>)> = Vec::new();
    for w in words {
        let rtl = has_arabic(&w.text);
        match runs.last_mut() {
            Some((dir, run)) if *dir == rtl => run.push(w),
            _ => runs.push((rtl, vec![w])),
        }
    }
    if rtl_line {
        runs.reverse();
    }
    let mut out = Vec::new();
    for (rtl, mut run) in runs {
        if rtl {
            run.reverse();
        }
        out.extend(run);
    }
    out
}

fn postprocess_line(mut line: OcrLine, reorder: bool) -> OcrLine {
    if !reorder || line.words.is_empty() {
        return line;
    }
    let words: Vec<OcrWord> = line
        .words
        .into_iter()
        .map(|mut w| {
            w.text = fix_latin_word(&w.text);
            w
        })
        .collect();
    let words = reorder_line(words);
    line.text = words.iter().map(|w| w.text.as_str()).collect::<Vec<_>>().join(" ");
    line.words = words;
    line
}

fn iou(a: (f32, f32, f32, f32), b: (f32, f32, f32, f32)) -> f32 {
    let x1 = a.0.max(b.0);
    let y1 = a.1.max(b.1);
    let x2 = (a.0 + a.2).min(b.0 + b.2);
    let y2 = (a.1 + a.3).min(b.1 + b.3);
    if x2 <= x1 || y2 <= y1 {
        return 0.0;
    }
    let inter = (x2 - x1) * (y2 - y1);
    inter / (a.2 * a.3 + b.2 * b.3 - inter)
}

/// Combines Arabic-engine and English-engine results line by line.
pub fn merge_outputs(arabic: OcrOutput, english: OcrOutput) -> OcrOutput {
    let mut used = vec![false; english.lines.len()];
    let mut lines = Vec::new();
    for line in arabic.lines {
        if has_arabic(&line.text) {
            lines.push(line);
            continue;
        }
        let best = english
            .lines
            .iter()
            .enumerate()
            .filter(|(i, _)| !used[*i])
            .map(|(i, l)| (i, iou(line.bbox, l.bbox)))
            .max_by(|a, b| a.1.total_cmp(&b.1));
        match best {
            Some((i, score)) if score > 0.4 && !has_arabic(&english.lines[i].text) => {
                used[i] = true;
                lines.push(english.lines[i].clone());
            }
            _ => lines.push(line),
        }
    }
    // English lines the Arabic engine missed entirely.
    for (i, l) in english.lines.into_iter().enumerate() {
        if !used[i] && !has_arabic(&l.text) && !lines.iter().any(|x| iou(x.bbox, l.bbox) > 0.2) {
            lines.push(l);
        }
    }
    lines.sort_by(|a, b| a.bbox.1.total_cmp(&b.bbox.1).then(a.bbox.0.total_cmp(&b.bbox.0)));
    OcrOutput { lines }
}

fn pick_tag(available: &[String], prefix: &str) -> Option<String> {
    available
        .iter()
        .find(|t| t.to_ascii_lowercase().starts_with(prefix))
        .cloned()
}

/// Resolves the configured OCR language into concrete engine language tags.
pub fn resolve_languages(setting: &str, available: &[String]) -> AppResult<(Option<String>, Option<String>)> {
    let ar = pick_tag(available, "ar");
    let en = pick_tag(available, "en");
    let result = match setting {
        "ar" => (ar.clone(), None),
        "en" => (None, en.clone()),
        "ar+en" => (ar.clone(), en.clone()),
        _ => (ar.clone(), en.clone().or_else(|| available.first().cloned())),
    };
    match (&result, setting) {
        ((None, _), "ar") => Err(AppError::OcrLanguage("ar".into())),
        ((_, None), "en") => Err(AppError::OcrLanguage("en".into())),
        ((None, None), _) => Err(AppError::OcrLanguage(setting.into())),
        _ => Ok(result),
    }
}

fn prepare_image(img: &RgbaImage) -> (RgbaImage, f32) {
    let max_dim = native::max_dimension();
    let (w, h) = img.dimensions();
    if w.max(h) > max_dim {
        let scale = max_dim as f32 / w.max(h) as f32;
        let resized = image::imageops::resize(
            img,
            ((w as f32 * scale) as u32).max(1),
            ((h as f32 * scale) as u32).max(1),
            FilterType::Triangle,
        );
        return (resized, scale);
    }
    if (w as u64 * h as u64) <= 4_200_000 && w.max(h) * 2 <= max_dim {
        return (image::imageops::resize(img, w * 2, h * 2, FilterType::CatmullRom), 2.0);
    }
    (img.clone(), 1.0)
}

fn scale_output(mut out: OcrOutput, scale: f32) -> OcrOutput {
    if (scale - 1.0).abs() < f32::EPSILON {
        return out;
    }
    for line in &mut out.lines {
        line.bbox = (line.bbox.0 / scale, line.bbox.1 / scale, line.bbox.2 / scale, line.bbox.3 / scale);
        for w in &mut line.words {
            w.x /= scale;
            w.y /= scale;
            w.w /= scale;
            w.h /= scale;
        }
    }
    out
}

/// Runs OCR on an image. Returns the output and a language label (e.g. "ar+en").
pub fn recognize(img: &RgbaImage, setting: &str) -> AppResult<(OcrOutput, String)> {
    let available = native::available_languages();
    let (ar, en) = resolve_languages(setting, &available)?;
    let (prepared, scale) = prepare_image(img);
    let arabic = match &ar {
        Some(tag) => {
            let out = native::recognize(&prepared, tag)?;
            Some(OcrOutput { lines: out.lines.into_iter().map(|l| postprocess_line(l, true)).collect() })
        }
        None => None,
    };
    let english = match &en {
        Some(tag) => Some(native::recognize(&prepared, tag)?),
        None => None,
    };
    let (out, label) = match (arabic, english) {
        (Some(a), Some(e)) => (merge_outputs(a, e), "ar+en"),
        (Some(a), None) => (a, "ar"),
        (None, Some(e)) => (e, "en"),
        (None, None) => return Err(AppError::OcrLanguage(setting.into())),
    };
    Ok((scale_output(out, scale), label.to_string()))
}

// ---------------------------------------------------------------------------
// Background queue
// ---------------------------------------------------------------------------

#[derive(Default)]
struct QueueInner {
    items: VecDeque<i64>,
    batch_total: u64,
    batch_done: u64,
    batch_failed: u64,
}

pub struct OcrQueue {
    inner: Mutex<QueueInner>,
    cv: Condvar,
    cancel: AtomicBool,
    started: AtomicBool,
}

impl OcrQueue {
    pub fn new() -> Arc<Self> {
        Arc::new(Self {
            inner: Mutex::new(QueueInner::default()),
            cv: Condvar::new(),
            cancel: AtomicBool::new(false),
            started: AtomicBool::new(false),
        })
    }

    pub fn enqueue(&self, app: &AppHandle, ids: &[i64]) {
        if ids.is_empty() {
            return;
        }
        if let Some(state) = app.try_state::<AppState>() {
            if let Ok(conn) = state.pool.get() {
                for &id in ids {
                    let _ = screenshots::set_ocr_status(&conn, id, "pending");
                }
            }
        }
        {
            let mut inner = self.inner.lock();
            for &id in ids {
                if !inner.items.contains(&id) {
                    inner.items.push_back(id);
                    inner.batch_total += 1;
                }
            }
        }
        self.cancel.store(false, Ordering::SeqCst);
        self.cv.notify_one();
        crate::events::screenshots_updated(app, ids);
    }

    pub fn cancel_all(&self) {
        self.cancel.store(true, Ordering::SeqCst);
        self.cv.notify_one();
    }

    pub fn start_worker(self: &Arc<Self>, app: AppHandle) {
        if self.started.swap(true, Ordering::SeqCst) {
            return;
        }
        let queue = self.clone();
        std::thread::Builder::new()
            .name("snapvault-ocr".into())
            .spawn(move || queue.run(app))
            .expect("spawn OCR worker");
    }

    fn run(self: Arc<Self>, app: AppHandle) {
        let mut task: Option<crate::services::tasks::TaskHandle> = None;
        loop {
            let next = {
                let mut inner = self.inner.lock();
                while inner.items.is_empty() {
                    if let Some(t) = task.take() {
                        let (done, failed) = (inner.batch_done, inner.batch_failed);
                        t.finish(if failed > 0 && done == failed { "failed" } else { "done" });
                        if done > 1 || failed > 0 {
                            crate::services::notify::ocr_finished(&app, done - failed, failed);
                        }
                    }
                    inner.batch_total = 0;
                    inner.batch_done = 0;
                    inner.batch_failed = 0;
                    self.cv.wait(&mut inner);
                }
                if self.cancel.swap(false, Ordering::SeqCst) {
                    let dropped: Vec<i64> = inner.items.drain(..).collect();
                    drop(inner);
                    if let Some(state) = app.try_state::<AppState>() {
                        if let Ok(conn) = state.pool.get() {
                            for id in &dropped {
                                let _ = screenshots::set_ocr_status(&conn, *id, "none");
                            }
                        }
                    }
                    crate::events::screenshots_updated(&app, &dropped);
                    if let Some(t) = task.take() {
                        t.finish("cancelled");
                    }
                    let mut inner = self.inner.lock();
                    inner.batch_total = 0;
                    inner.batch_done = 0;
                    inner.batch_failed = 0;
                    continue;
                }
                let total = inner.batch_total;
                let done = inner.batch_done;
                (inner.items.pop_front(), total, done)
            };
            let (Some(id), total, done) = next else { continue };
            let state = app.state::<AppState>();
            let t = task.get_or_insert_with(|| {
                let q = self.clone();
                state.tasks.start(&app, "ocr", total, Some(Box::new(move || q.cancel_all())))
            });
            t.set_progress(done, total);

            let ok = process_one(&app, &state, id).is_ok();
            let mut inner = self.inner.lock();
            inner.batch_done += 1;
            if !ok {
                inner.batch_failed += 1;
            }
            t.set_progress(inner.batch_done, inner.batch_total);
        }
    }
}

fn process_one(app: &AppHandle, state: &AppState, id: i64) -> AppResult<()> {
    let result = (|| {
        let (path, language) = {
            let conn = state.pool.get()?;
            let file = screenshots::file_ref(&conn, id)?;
            (file.current_path().to_string(), state.settings.read().ocr_language.clone())
        };
        let img = crate::services::imaging::open_image(std::path::Path::new(&path))?.to_rgba8();
        let (out, label) = recognize(&img, &language)?;
        let text = out.text();
        let words = out.words();
        let conn = state.pool.get()?;
        screenshots::save_ocr(&conn, id, &text, Some(&words), &label, ENGINE, false)?;
        Ok::<_, AppError>(())
    })();
    if let Err(e) = &result {
        // Log the failure without any recognized content.
        log::warn!("OCR failed for screenshot {id}: [{}] {e}", e.code());
        if let Ok(conn) = state.pool.get() {
            let _ = screenshots::set_ocr_status(&conn, id, "failed");
        }
    }
    crate::events::screenshots_updated(app, &[id]);
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn w(t: &str, x: f32) -> OcrWord {
        OcrWord { text: t.into(), x, y: 0.0, w: 10.0, h: 10.0 }
    }

    fn texts(words: &[OcrWord]) -> Vec<&str> {
        words.iter().map(|w| w.text.as_str()).collect()
    }

    #[test]
    fn latin_lines_are_untouched() {
        let words = vec![w("Hello", 0.0), w("world", 20.0)];
        assert_eq!(texts(&reorder_line(words)), vec!["Hello", "world"]);
    }

    #[test]
    fn arabic_line_is_reversed_to_logical_order() {
        // Visual (left-to-right) order as returned by Windows OCR.
        let words = vec![w("الدفع", 0.0), w("مستحقة", 1.0), w("فاتورة", 2.0)];
        assert_eq!(texts(&reorder_line(words)), vec!["فاتورة", "مستحقة", "الدفع"]);
    }

    #[test]
    fn mixed_rtl_line_keeps_latin_runs_in_order() {
        let words = vec![w("API", 0.0), w("key", 1.0), w("الإعدادات", 2.0), w("Cloudflare", 3.0), w("مرحبا", 4.0)];
        assert_eq!(texts(&reorder_line(words)), vec!["مرحبا", "Cloudflare", "الإعدادات", "API", "key"]);
    }

    #[test]
    fn arabic_run_inside_latin_line_is_reversed() {
        let words = vec![w("Hello", 0.0), w("بك", 1.0), w("مرحبا", 2.0), w("world", 3.0), w("again", 4.0)];
        assert_eq!(texts(&reorder_line(words)), vec!["Hello", "مرحبا", "بك", "world", "again"]);
    }

    #[test]
    fn fixes_mirrored_punctuation() {
        assert_eq!(fix_latin_word(":Email"), "Email:");
        assert_eq!(fix_latin_word(":failed"), "failed:");
        assert_eq!(fix_latin_word("..."), "...");
        assert_eq!(fix_latin_word(":مرحبا"), ":مرحبا");
    }

    #[test]
    fn merge_prefers_english_for_latin_lines() {
        let line = |text: &str, y: f32| OcrLine { text: text.into(), words: vec![], bbox: (0.0, y, 100.0, 10.0) };
        let arabic = OcrOutput { lines: vec![line("Deploying tO Cloudflare", 0.0), line("فاتورة الإنترنت", 20.0)] };
        let english = OcrOutput {
            lines: vec![line("Deploying to Cloudflare", 0.5), line("JJI garbage", 20.0), line("Only English saw this", 40.0)],
        };
        let merged = merge_outputs(arabic, english);
        let t: Vec<&str> = merged.lines.iter().map(|l| l.text.as_str()).collect();
        assert_eq!(t, vec!["Deploying to Cloudflare", "فاتورة الإنترنت", "Only English saw this"]);
    }

    #[test]
    fn resolves_languages() {
        let both = vec!["ar-SA".to_string(), "en-US".to_string()];
        assert_eq!(resolve_languages("auto", &both).unwrap(), (Some("ar-SA".into()), Some("en-US".into())));
        assert_eq!(resolve_languages("en", &both).unwrap(), (None, Some("en-US".into())));
        let en_only = vec!["en-GB".to_string()];
        assert!(resolve_languages("ar", &en_only).is_err());
        assert_eq!(resolve_languages("auto", &en_only).unwrap(), (None, Some("en-GB".into())));
        assert!(resolve_languages("auto", &[]).is_err());
    }
}
