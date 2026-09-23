//! Collections and tags commands.

use tauri::{AppHandle, State};

use crate::db::models::{Collection, Tag};
use crate::db::{collections, tags};
use crate::error::AppResult;
use crate::events;
use crate::state::AppState;

#[tauri::command]
pub fn list_collections(state: State<'_, AppState>) -> AppResult<Vec<Collection>> {
    collections::list(&*state.pool.get()?)
}

#[tauri::command]
pub fn create_collection(
    app: AppHandle,
    state: State<'_, AppState>,
    name: String,
    icon: String,
    color: String,
) -> AppResult<Collection> {
    let c = collections::create(&*state.pool.get()?, &name, &icon, &color)?;
    events::library_changed(&app);
    Ok(c)
}

#[tauri::command]
pub fn update_collection(
    app: AppHandle,
    state: State<'_, AppState>,
    id: i64,
    name: String,
    icon: String,
    color: String,
) -> AppResult<Collection> {
    let mut conn = state.pool.get()?;
    let tx = conn.transaction()?;
    let c = collections::update(&tx, id, &name, &icon, &color)?;
    tx.commit()?;
    events::library_changed(&app);
    Ok(c)
}

#[tauri::command]
pub fn delete_collection(app: AppHandle, state: State<'_, AppState>, id: i64) -> AppResult<()> {
    let mut conn = state.pool.get()?;
    let tx = conn.transaction()?;
    collections::delete(&tx, id)?;
    tx.commit()?;
    events::library_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn list_tags(state: State<'_, AppState>) -> AppResult<Vec<Tag>> {
    tags::list(&*state.pool.get()?)
}

#[tauri::command]
pub fn create_tag(app: AppHandle, state: State<'_, AppState>, name: String, color: String) -> AppResult<Tag> {
    let t = tags::create(&*state.pool.get()?, &name, &color)?;
    events::library_changed(&app);
    Ok(t)
}

#[tauri::command]
pub fn update_tag(app: AppHandle, state: State<'_, AppState>, id: i64, name: String, color: String) -> AppResult<Tag> {
    let mut conn = state.pool.get()?;
    let tx = conn.transaction()?;
    let t = tags::update(&tx, id, &name, &color)?;
    tx.commit()?;
    events::library_changed(&app);
    Ok(t)
}

#[tauri::command]
pub fn delete_tag(app: AppHandle, state: State<'_, AppState>, id: i64) -> AppResult<()> {
    let mut conn = state.pool.get()?;
    let tx = conn.transaction()?;
    tags::delete(&tx, id)?;
    tx.commit()?;
    events::library_changed(&app);
    Ok(())
}

#[tauri::command]
pub fn add_tag(app: AppHandle, state: State<'_, AppState>, ids: Vec<i64>, tag_id: i64) -> AppResult<usize> {
    let mut conn = state.pool.get()?;
    let tx = conn.transaction()?;
    let n = tags::add_to(&tx, &ids, tag_id)?;
    tx.commit()?;
    events::screenshots_updated(&app, &ids);
    events::library_changed(&app);
    Ok(n)
}

/// Finds or creates a tag by name and adds it to the screenshots.
#[tauri::command]
pub fn add_tag_by_name(
    app: AppHandle,
    state: State<'_, AppState>,
    ids: Vec<i64>,
    name: String,
    color: String,
) -> AppResult<Tag> {
    let mut conn = state.pool.get()?;
    let tx = conn.transaction()?;
    let tag = tags::ensure(&tx, &name, &color)?;
    tags::add_to(&tx, &ids, tag.id)?;
    tx.commit()?;
    events::screenshots_updated(&app, &ids);
    events::library_changed(&app);
    Ok(tag)
}

#[tauri::command]
pub fn remove_tag(app: AppHandle, state: State<'_, AppState>, ids: Vec<i64>, tag_id: i64) -> AppResult<usize> {
    let mut conn = state.pool.get()?;
    let tx = conn.transaction()?;
    let n = tags::remove_from(&tx, &ids, tag_id)?;
    tx.commit()?;
    events::screenshots_updated(&app, &ids);
    events::library_changed(&app);
    Ok(n)
}
