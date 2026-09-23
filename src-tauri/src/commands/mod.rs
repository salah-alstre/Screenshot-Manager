//! IPC commands exposed to the frontend. Arguments are validated here or in
//! the services they call; no command accepts an arbitrary file path.

pub mod capture;
pub mod files;
pub mod library;
pub mod ocr;
pub mod organize;
pub mod settings;
pub mod stats;
