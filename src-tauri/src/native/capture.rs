//! Native screen capture for Windows using GDI.
//!
//! The whole virtual desktop is captured in one BitBlt (all monitors, physical
//! pixels — the process is per-monitor DPI aware). Regions, windows and
//! monitors are cropped from that frame, so captures spanning monitors work.

use image::RgbaImage;
use serde::{Deserialize, Serialize};

use crate::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
pub struct Rect {
    pub x: i32,
    pub y: i32,
    pub w: i32,
    pub h: i32,
}

impl Rect {
    pub fn intersect(&self, o: &Rect) -> Option<Rect> {
        let x1 = self.x.max(o.x);
        let y1 = self.y.max(o.y);
        let x2 = (self.x + self.w).min(o.x + o.w);
        let y2 = (self.y + self.h).min(o.y + o.h);
        if x2 > x1 && y2 > y1 {
            Some(Rect { x: x1, y: y1, w: x2 - x1, h: y2 - y1 })
        } else {
            None
        }
    }
    pub fn area(&self) -> i64 {
        self.w as i64 * self.h as i64
    }
    pub fn contains(&self, px: i32, py: i32) -> bool {
        px >= self.x && py >= self.y && px < self.x + self.w && py < self.y + self.h
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MonitorInfo {
    pub index: usize,
    pub device: String,
    pub name: String,
    pub rect: Rect,
    pub work: Rect,
    pub scale: f64,
    pub primary: bool,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WindowInfo {
    pub title: String,
    pub rect: Rect,
}

/// A captured frame in BGRA byte order, positioned in virtual-desktop coordinates.
pub struct Frame {
    pub origin_x: i32,
    pub origin_y: i32,
    pub width: u32,
    pub height: u32,
    pub bgra: Vec<u8>,
}

impl Frame {
    pub fn bounds(&self) -> Rect {
        Rect { x: self.origin_x, y: self.origin_y, w: self.width as i32, h: self.height as i32 }
    }

    /// Crops a rectangle given in virtual-desktop coordinates to an RGBA image.
    pub fn crop_rgba(&self, r: Rect) -> AppResult<RgbaImage> {
        let r = r.intersect(&self.bounds()).ok_or_else(|| AppError::Capture("selection is outside the screen".into()))?;
        let (lx, ly) = ((r.x - self.origin_x) as usize, (r.y - self.origin_y) as usize);
        let (w, h) = (r.w as usize, r.h as usize);
        let mut out = Vec::with_capacity(w * h * 4);
        let stride = self.width as usize * 4;
        for row in ly..ly + h {
            let start = row * stride + lx * 4;
            for px in self.bgra[start..start + w * 4].chunks_exact(4) {
                out.extend_from_slice(&[px[2], px[1], px[0], 255]);
            }
        }
        RgbaImage::from_raw(w as u32, h as u32, out).ok_or_else(|| AppError::Capture("invalid crop".into()))
    }

    /// Encodes the frame as an uncompressed top-down 32-bit BMP (fast to produce,
    /// decoded natively by the webview) for the region-selection overlay.
    pub fn to_bmp(&self) -> Vec<u8> {
        let pixel_bytes = self.bgra.len() as u32;
        let header_size = 14 + 40;
        let mut out = Vec::with_capacity(header_size as usize + pixel_bytes as usize);
        out.extend_from_slice(b"BM");
        out.extend_from_slice(&(header_size + pixel_bytes).to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&header_size.to_le_bytes());
        out.extend_from_slice(&40u32.to_le_bytes());
        out.extend_from_slice(&(self.width as i32).to_le_bytes());
        out.extend_from_slice(&(-(self.height as i32)).to_le_bytes());
        out.extend_from_slice(&1u16.to_le_bytes());
        out.extend_from_slice(&32u16.to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes()); // BI_RGB
        out.extend_from_slice(&pixel_bytes.to_le_bytes());
        out.extend_from_slice(&2835i32.to_le_bytes());
        out.extend_from_slice(&2835i32.to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&0u32.to_le_bytes());
        out.extend_from_slice(&self.bgra);
        out
    }
}

/// Picks the monitor that overlaps a rectangle the most.
pub fn monitor_for_rect<'a>(monitors: &'a [MonitorInfo], r: &Rect) -> Option<&'a MonitorInfo> {
    monitors
        .iter()
        .filter_map(|m| m.rect.intersect(r).map(|i| (m, i.area())))
        .max_by_key(|(_, a)| *a)
        .map(|(m, _)| m)
}

#[cfg(windows)]
mod imp {
    use super::*;
    use std::ffi::c_void;
    use windows::core::BOOL;
    use windows::Win32::Foundation::{HWND, LPARAM, POINT, RECT};
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED, DWMWA_EXTENDED_FRAME_BOUNDS};
    use windows::Win32::Graphics::Gdi::{
        BitBlt, CreateCompatibleDC, CreateDIBSection, DeleteDC, DeleteObject, EnumDisplayMonitors, GetDC,
        GetMonitorInfoW, ReleaseDC, SelectObject, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, CAPTUREBLT, DIB_RGB_COLORS,
        HDC, HMONITOR, MONITORINFO, MONITORINFOEXW, SRCCOPY,
    };
    use windows::Win32::UI::HiDpi::{GetDpiForMonitor, MDT_EFFECTIVE_DPI};
    use windows::Win32::UI::WindowsAndMessaging::{
        DrawIconEx, EnumWindows, GetCursorInfo, GetCursorPos, GetForegroundWindow, GetIconInfo, GetSystemMetrics,
        GetWindowLongW, GetWindowTextW, GetWindowThreadProcessId, IsIconic, IsWindowVisible, CURSORINFO,
        CURSOR_SHOWING, DI_NORMAL, GWL_EXSTYLE, HICON, ICONINFO, SM_CXVIRTUALSCREEN, SM_CYVIRTUALSCREEN,
        SM_XVIRTUALSCREEN, SM_YVIRTUALSCREEN, WS_EX_TOOLWINDOW,
    };

    pub fn virtual_bounds() -> Rect {
        unsafe {
            Rect {
                x: GetSystemMetrics(SM_XVIRTUALSCREEN),
                y: GetSystemMetrics(SM_YVIRTUALSCREEN),
                w: GetSystemMetrics(SM_CXVIRTUALSCREEN),
                h: GetSystemMetrics(SM_CYVIRTUALSCREEN),
            }
        }
    }

    pub fn capture_virtual_screen(with_cursor: bool) -> AppResult<Frame> {
        let b = virtual_bounds();
        if b.w <= 0 || b.h <= 0 {
            return Err(AppError::Capture("no display detected".into()));
        }
        unsafe {
            let screen = GetDC(None);
            if screen.is_invalid() {
                return Err(AppError::Capture("GetDC failed".into()));
            }
            let mem = CreateCompatibleDC(Some(screen));
            let mut bmi = BITMAPINFO::default();
            bmi.bmiHeader = BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: b.w,
                biHeight: -b.h, // top-down
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            };
            let mut bits: *mut c_void = std::ptr::null_mut();
            let dib = match CreateDIBSection(Some(mem), &bmi, DIB_RGB_COLORS, &mut bits, None, 0) {
                Ok(d) => d,
                Err(e) => {
                    let _ = DeleteDC(mem);
                    ReleaseDC(None, screen);
                    return Err(AppError::Capture(format!("CreateDIBSection: {e}")));
                }
            };
            let old = SelectObject(mem, dib.into());
            let blt = BitBlt(mem, 0, 0, b.w, b.h, Some(screen), b.x, b.y, SRCCOPY | CAPTUREBLT);
            if with_cursor && blt.is_ok() {
                draw_cursor(mem, b.x, b.y);
            }
            let len = (b.w as usize) * (b.h as usize) * 4;
            let mut bgra = Vec::new();
            if blt.is_ok() && !bits.is_null() {
                bgra = std::slice::from_raw_parts(bits as *const u8, len).to_vec();
                for px in bgra.chunks_exact_mut(4) {
                    px[3] = 255;
                }
            }
            SelectObject(mem, old);
            let _ = DeleteObject(dib.into());
            let _ = DeleteDC(mem);
            ReleaseDC(None, screen);
            blt.map_err(|e| AppError::Capture(format!("BitBlt: {e}")))?;
            Ok(Frame { origin_x: b.x, origin_y: b.y, width: b.w as u32, height: b.h as u32, bgra })
        }
    }

    unsafe fn draw_cursor(hdc: HDC, origin_x: i32, origin_y: i32) {
        let mut ci = CURSORINFO { cbSize: std::mem::size_of::<CURSORINFO>() as u32, ..Default::default() };
        if GetCursorInfo(&mut ci).is_err() || ci.flags.0 & CURSOR_SHOWING.0 == 0 {
            return;
        }
        let icon = HICON(ci.hCursor.0);
        let mut info = ICONINFO::default();
        let (hx, hy) = if GetIconInfo(icon, &mut info).is_ok() {
            if !info.hbmMask.is_invalid() {
                let _ = DeleteObject(info.hbmMask.into());
            }
            if !info.hbmColor.is_invalid() {
                let _ = DeleteObject(info.hbmColor.into());
            }
            (info.xHotspot as i32, info.yHotspot as i32)
        } else {
            (0, 0)
        };
        let _ = DrawIconEx(
            hdc,
            ci.ptScreenPos.x - origin_x - hx,
            ci.ptScreenPos.y - origin_y - hy,
            icon,
            0,
            0,
            0,
            None,
            DI_NORMAL,
        );
    }

    unsafe extern "system" fn monitor_cb(hmon: HMONITOR, _hdc: HDC, _rect: *mut RECT, data: LPARAM) -> BOOL {
        let list = &mut *(data.0 as *mut Vec<MonitorInfo>);
        let mut info = MONITORINFOEXW::default();
        info.monitorInfo.cbSize = std::mem::size_of::<MONITORINFOEXW>() as u32;
        if GetMonitorInfoW(hmon, &mut info as *mut MONITORINFOEXW as *mut MONITORINFO).as_bool() {
            let r = info.monitorInfo.rcMonitor;
            let w = info.monitorInfo.rcWork;
            let len = info.szDevice.iter().position(|&c| c == 0).unwrap_or(info.szDevice.len());
            let device = String::from_utf16_lossy(&info.szDevice[..len]);
            let (mut dx, mut dy) = (96u32, 96u32);
            let _ = GetDpiForMonitor(hmon, MDT_EFFECTIVE_DPI, &mut dx, &mut dy);
            let index = list.len();
            let number = device.trim_start_matches(r"\\.\DISPLAY").parse::<u32>().ok();
            list.push(MonitorInfo {
                index,
                name: match number {
                    Some(n) => format!("Display {n}"),
                    None => format!("Display {}", index + 1),
                },
                device,
                rect: Rect { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top },
                work: Rect { x: w.left, y: w.top, w: w.right - w.left, h: w.bottom - w.top },
                scale: dx as f64 / 96.0,
                primary: info.monitorInfo.dwFlags & 1 != 0,
            });
        }
        BOOL(1)
    }

    pub fn monitors() -> Vec<MonitorInfo> {
        let mut list: Vec<MonitorInfo> = Vec::new();
        unsafe {
            let _ = EnumDisplayMonitors(None, None, Some(monitor_cb), LPARAM(&mut list as *mut _ as isize));
        }
        list.sort_by_key(|m| (!m.primary, m.rect.x, m.rect.y));
        for (i, m) in list.iter_mut().enumerate() {
            m.index = i;
        }
        list
    }

    pub fn cursor_pos() -> (i32, i32) {
        let mut p = POINT::default();
        unsafe {
            let _ = GetCursorPos(&mut p);
        }
        (p.x, p.y)
    }

    unsafe fn window_rect(hwnd: HWND) -> Option<Rect> {
        let mut r = RECT::default();
        DwmGetWindowAttribute(
            hwnd,
            DWMWA_EXTENDED_FRAME_BOUNDS,
            &mut r as *mut RECT as *mut c_void,
            std::mem::size_of::<RECT>() as u32,
        )
        .ok()?;
        let rect = Rect { x: r.left, y: r.top, w: r.right - r.left, h: r.bottom - r.top };
        (rect.w > 0 && rect.h > 0).then_some(rect)
    }

    unsafe fn window_title(hwnd: HWND) -> String {
        let mut buf = [0u16; 512];
        let n = GetWindowTextW(hwnd, &mut buf);
        String::from_utf16_lossy(&buf[..n.max(0) as usize])
    }

    unsafe fn is_capturable(hwnd: HWND, own_pid: u32) -> bool {
        if !IsWindowVisible(hwnd).as_bool() || IsIconic(hwnd).as_bool() {
            return false;
        }
        let mut pid = 0u32;
        GetWindowThreadProcessId(hwnd, Some(&mut pid));
        if pid == own_pid {
            return false;
        }
        let mut cloaked = 0u32;
        let _ = DwmGetWindowAttribute(
            hwnd,
            DWMWA_CLOAKED,
            &mut cloaked as *mut u32 as *mut c_void,
            std::mem::size_of::<u32>() as u32,
        );
        if cloaked != 0 {
            return false;
        }
        let ex = GetWindowLongW(hwnd, GWL_EXSTYLE) as u32;
        if ex & WS_EX_TOOLWINDOW.0 != 0 {
            return false;
        }
        true
    }

    unsafe extern "system" fn window_cb(hwnd: HWND, data: LPARAM) -> BOOL {
        let list = &mut *(data.0 as *mut Vec<WindowInfo>);
        if is_capturable(hwnd, std::process::id()) {
            let title = window_title(hwnd);
            if let Some(rect) = window_rect(hwnd) {
                if !title.is_empty() && rect.w >= 40 && rect.h >= 30 {
                    list.push(WindowInfo { title, rect });
                }
            }
        }
        BOOL(1)
    }

    /// Visible top-level windows in z-order (topmost first), excluding SnapVault's own.
    pub fn list_windows() -> Vec<WindowInfo> {
        let mut list: Vec<WindowInfo> = Vec::new();
        unsafe {
            let _ = EnumWindows(Some(window_cb), LPARAM(&mut list as *mut _ as isize));
        }
        list
    }

    /// Bounds and title of the current foreground window, unless it belongs to SnapVault.
    pub fn foreground_window() -> Option<WindowInfo> {
        unsafe {
            let hwnd = GetForegroundWindow();
            if hwnd.is_invalid() {
                return None;
            }
            let mut pid = 0u32;
            GetWindowThreadProcessId(hwnd, Some(&mut pid));
            if pid == std::process::id() {
                return None;
            }
            let rect = window_rect(hwnd)?;
            Some(WindowInfo { title: window_title(hwnd), rect })
        }
    }
}

#[cfg(windows)]
pub use imp::*;

#[cfg(not(windows))]
mod imp {
    use super::*;
    pub fn virtual_bounds() -> Rect {
        Rect { x: 0, y: 0, w: 0, h: 0 }
    }
    pub fn capture_virtual_screen(_with_cursor: bool) -> AppResult<Frame> {
        Err(AppError::Capture("screen capture is only implemented on Windows".into()))
    }
    pub fn monitors() -> Vec<MonitorInfo> {
        vec![]
    }
    pub fn cursor_pos() -> (i32, i32) {
        (0, 0)
    }
    pub fn list_windows() -> Vec<WindowInfo> {
        vec![]
    }
    pub fn foreground_window() -> Option<WindowInfo> {
        None
    }
}

#[cfg(not(windows))]
pub use imp::*;

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn rect_intersection() {
        let a = Rect { x: 0, y: 0, w: 100, h: 100 };
        let b = Rect { x: 50, y: 50, w: 100, h: 100 };
        assert_eq!(a.intersect(&b), Some(Rect { x: 50, y: 50, w: 50, h: 50 }));
        assert_eq!(a.intersect(&Rect { x: 200, y: 0, w: 10, h: 10 }), None);
    }

    #[test]
    fn crop_handles_negative_virtual_origin() {
        // Secondary monitor to the left of the primary: origin is negative.
        let mut bgra = vec![0u8; 4 * 4 * 2];
        // pixel (x=-2, y=0) -> local (2, 0): blue=10 green=20 red=30
        let i = 2 * 4;
        bgra[i..i + 4].copy_from_slice(&[10, 20, 30, 0]);
        let f = Frame { origin_x: -4, origin_y: 0, width: 4, height: 2, bgra };
        let img = f.crop_rgba(Rect { x: -2, y: 0, w: 2, h: 1 }).unwrap();
        assert_eq!(img.dimensions(), (2, 1));
        assert_eq!(img.get_pixel(0, 0).0, [30, 20, 10, 255]);
        assert!(f.crop_rgba(Rect { x: 100, y: 100, w: 5, h: 5 }).is_err());
    }

    #[test]
    fn bmp_header_is_valid() {
        let f = Frame { origin_x: 0, origin_y: 0, width: 3, height: 2, bgra: vec![255; 24] };
        let bmp = f.to_bmp();
        assert_eq!(&bmp[..2], b"BM");
        assert_eq!(bmp.len(), 54 + 24);
        assert_eq!(image::guess_format(&bmp).unwrap(), image::ImageFormat::Bmp);
    }

    #[test]
    fn picks_monitor_with_largest_overlap() {
        let m = |i: usize, x: i32| MonitorInfo {
            index: i,
            device: String::new(),
            name: format!("Display {}", i + 1),
            rect: Rect { x, y: 0, w: 1000, h: 1000 },
            work: Rect { x, y: 0, w: 1000, h: 960 },
            scale: 1.0,
            primary: i == 0,
        };
        let mons = vec![m(0, 0), m(1, 1000)];
        let r = Rect { x: 900, y: 0, w: 300, h: 100 };
        assert_eq!(monitor_for_rect(&mons, &r).unwrap().index, 1);
    }
}
