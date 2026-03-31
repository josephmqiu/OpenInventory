use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_notification::NotificationExt;

use crate::application::inventory_service;
use crate::domain::error::AppError;
use crate::domain::models::{
    AddPersonnelInput, AppSnapshot, BatchIssueMaterialInput, CreateInventoryItemInput,
    InventoryMovement, LanAccessState, Language, StockMutationInput, UpdateBackupPlanInput,
    UpdateInventoryItemInput, UpdateLanAccessInput,
};
use crate::infrastructure::db::{InventoryDb, LowStockNotification};
use crate::infrastructure::lan::LanServerController;

#[derive(Serialize)]
pub struct AppHealth {
    pub status: &'static str,
    pub storage: &'static str,
}

#[tauri::command]
pub fn app_health() -> AppHealth {
    AppHealth {
        status: "ready",
        storage: "sqlite-local",
    }
}

#[tauri::command]
pub fn load_app_snapshot(db: State<'_, InventoryDb>) -> Result<AppSnapshot, AppError> {
    inventory_service::load_snapshot(db.inner())
}

#[tauri::command]
pub fn load_lan_access_state(
    lan: State<'_, LanServerController>,
) -> Result<LanAccessState, AppError> {
    lan.load_state()
}

#[tauri::command]
pub fn update_lan_access(
    input: UpdateLanAccessInput,
    lan: State<'_, LanServerController>,
) -> Result<LanAccessState, AppError> {
    lan.update_settings(input)
}

#[tauri::command]
pub fn regenerate_lan_access_key(
    lan: State<'_, LanServerController>,
) -> Result<LanAccessState, AppError> {
    lan.regenerate_access_key()
}

#[tauri::command]
pub fn create_inventory_item(
    app: AppHandle,
    input: CreateInventoryItemInput,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, AppError> {
    let result = inventory_service::create_inventory_item(db.inner(), input)?;
    notify_low_stock_if_needed(&app, result.low_stock_notification.as_ref());
    Ok(result.snapshot)
}

#[tauri::command]
pub fn update_inventory_item(
    app: AppHandle,
    input: UpdateInventoryItemInput,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, AppError> {
    let result = inventory_service::update_inventory_item(db.inner(), input)?;
    notify_low_stock_if_needed(&app, result.low_stock_notification.as_ref());
    Ok(result.snapshot)
}

#[tauri::command]
pub fn receive_stock(
    app: AppHandle,
    input: StockMutationInput,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, AppError> {
    let result = inventory_service::receive_stock(db.inner(), input)?;
    notify_low_stock_if_needed(&app, result.low_stock_notification.as_ref());
    Ok(result.snapshot)
}

#[tauri::command]
pub fn issue_material(
    app: AppHandle,
    input: StockMutationInput,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, AppError> {
    let result = inventory_service::issue_material(db.inner(), input)?;
    notify_low_stock_if_needed(&app, result.low_stock_notification.as_ref());
    Ok(result.snapshot)
}

#[tauri::command]
pub fn batch_issue_material(
    input: BatchIssueMaterialInput,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, AppError> {
    inventory_service::batch_issue_material(db.inner(), input)
}

#[tauri::command]
pub fn update_backup_plan(
    input: UpdateBackupPlanInput,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, AppError> {
    inventory_service::update_backup_plan(db.inner(), input)
}

#[tauri::command]
pub fn backup_now(db: State<'_, InventoryDb>) -> Result<AppSnapshot, AppError> {
    inventory_service::backup_now(db.inner())
}

#[tauri::command]
pub fn get_item_movements(
    item_id: String,
    db: State<'_, InventoryDb>,
) -> Result<Vec<InventoryMovement>, AppError> {
    inventory_service::get_item_movements(db.inner(), &item_id)
}

#[tauri::command]
pub fn update_app_language(language: Language, db: State<'_, InventoryDb>) -> Result<(), AppError> {
    inventory_service::update_language(db.inner(), language)
}

#[tauri::command]
pub fn remove_inventory_item(
    item_id: String,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, AppError> {
    inventory_service::remove_inventory_item(db.inner(), item_id)
}

#[tauri::command]
pub fn add_personnel(
    input: AddPersonnelInput,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, AppError> {
    inventory_service::add_personnel(db.inner(), input)
}

#[tauri::command]
pub fn remove_personnel(
    personnel_id: String,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, AppError> {
    inventory_service::remove_personnel(db.inner(), personnel_id)
}

fn notify_low_stock_if_needed(app: &AppHandle, notification: Option<&LowStockNotification>) {
    let Some(notification) = notification else {
        return;
    };

    let _ = app
        .notification()
        .builder()
        .title("Low inventory alert")
        .body(format!(
            "{} ({}) is at {} and has reached the reorder level of {}.",
            notification.item_name,
            notification.sku,
            notification.current_quantity,
            notification.threshold_quantity
        ))
        .show();
}
