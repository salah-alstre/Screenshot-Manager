//! `sv://` URI scheme serving images to the webviews.
//!
//! Only screenshots registered in the database can be served, addressed by
//! numeric id — the frontend can never request an arbitrary file path.
//!
//! Routes: `/thumb/{id}`, `/image/{id}` (current version), `/original/{id}`,
//! `/overlay/{session}` (frozen frame for region selection).

use std::path::Path;

use tauri::http::{header, Request, Response, StatusCode};
use tauri::{AppHandle, Manager, UriSchemeResponder};

use crate::db::screenshots;
use crate::services::library;
use crate::state::AppState;

pub fn handle(app: &AppHandle, request: Request<Vec<u8>>, responder: UriSchemeResponder) {
    let app = app.clone();
    let path = request.uri().path().to_string();
    tauri::async_runtime::spawn_blocking(move || {
        let response = route(&app, &path).unwrap_or_else(|status| {
            Response::builder().status(status).header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*").body(Vec::new()).unwrap()
        });
        responder.respond(response);
    });
}

fn mime_for(bytes: &[u8]) -> &'static str {
    match image::guess_format(bytes) {
        Ok(image::ImageFormat::Png) => "image/png",
        Ok(image::ImageFormat::Jpeg) => "image/jpeg",
        Ok(image::ImageFormat::WebP) => "image/webp",
        Ok(image::ImageFormat::Bmp) => "image/bmp",
        _ => "application/octet-stream",
    }
}

fn ok(bytes: Vec<u8>, cache: &str) -> Result<Response<Vec<u8>>, StatusCode> {
    Response::builder()
        .status(StatusCode::OK)
        .header(header::CONTENT_TYPE, mime_for(&bytes))
        .header(header::CACHE_CONTROL, cache)
        .header(header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(bytes)
        .map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)
}

fn route(app: &AppHandle, path: &str) -> Result<Response<Vec<u8>>, StatusCode> {
    let state = app.state::<AppState>();
    let mut parts = path.trim_start_matches('/').splitn(2, '/');
    let kind = parts.next().unwrap_or_default();
    let id: i64 = parts.next().and_then(|s| s.parse().ok()).ok_or(StatusCode::BAD_REQUEST)?;
    match kind {
        "thumb" => {
            let thumb = library::ensure_thumbnail(&state, id).map_err(|_| StatusCode::NOT_FOUND)?;
            let bytes = std::fs::read(thumb).map_err(|_| StatusCode::NOT_FOUND)?;
            ok(bytes, "max-age=31536000, immutable")
        }
        "image" | "original" => {
            let file = {
                let conn = state.pool.get().map_err(|_| StatusCode::INTERNAL_SERVER_ERROR)?;
                screenshots::file_ref(&conn, id).map_err(|_| StatusCode::NOT_FOUND)?
            };
            let p = if kind == "image" { file.current_path().to_string() } else { file.file_path.clone() };
            let bytes = std::fs::read(Path::new(&p)).map_err(|_| {
                if let Ok(conn) = state.pool.get() {
                    let _ = screenshots::set_missing(&conn, id, true);
                }
                StatusCode::NOT_FOUND
            })?;
            ok(bytes, "no-cache")
        }
        "overlay" => {
            let session = state.capture.session.lock();
            match session.as_ref() {
                Some(s) if s.id as i64 == id => ok(s.bmp.as_ref().clone(), "no-store"),
                _ => Err(StatusCode::NOT_FOUND),
            }
        }
        _ => Err(StatusCode::NOT_FOUND),
    }
}
