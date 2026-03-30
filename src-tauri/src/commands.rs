use serde::Serialize;
use tauri::{AppHandle, State};
use tauri_plugin_notification::NotificationExt;

use crate::application::inventory_service;
use crate::domain::models::{
    AddPersonnelInput, AppSnapshot, CreateInventoryItemInput, CreateRefillOrderInput,
    StockMutationInput, UpdateInventoryItemInput,
};
use crate::infrastructure::db::{InventoryDb, LowStockNotification};

#[derive(Serialize)]
pub struct AppHealth {
    status: &'static str,
    storage: &'static str,
}

#[tauri::command]
pub fn app_health() -> AppHealth {
    AppHealth {
        status: "ready",
        storage: "sqlite-local",
    }
}

#[tauri::command]
pub fn load_app_snapshot(db: State<'_, InventoryDb>) -> Result<AppSnapshot, String> {
    inventory_service::load_snapshot(db.inner())
}

#[tauri::command]
pub fn create_inventory_item(
    app: AppHandle,
    input: CreateInventoryItemInput,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, String> {
    let result = inventory_service::create_inventory_item(db.inner(), input)?;
    notify_low_stock_if_needed(&app, result.low_stock_notification.as_ref());
    Ok(result.snapshot)
}

#[tauri::command]
pub fn update_inventory_item(
    app: AppHandle,
    input: UpdateInventoryItemInput,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, String> {
    let result = inventory_service::update_inventory_item(db.inner(), input)?;
    notify_low_stock_if_needed(&app, result.low_stock_notification.as_ref());
    Ok(result.snapshot)
}

#[tauri::command]
pub fn receive_stock(
    app: AppHandle,
    input: StockMutationInput,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, String> {
    let result = inventory_service::receive_stock(db.inner(), input)?;
    notify_low_stock_if_needed(&app, result.low_stock_notification.as_ref());
    Ok(result.snapshot)
}

#[tauri::command]
pub fn issue_material(
    app: AppHandle,
    input: StockMutationInput,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, String> {
    let result = inventory_service::issue_material(db.inner(), input)?;
    notify_low_stock_if_needed(&app, result.low_stock_notification.as_ref());
    Ok(result.snapshot)
}

#[tauri::command]
pub fn create_refill_order(
    input: CreateRefillOrderInput,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, String> {
    inventory_service::create_refill_order(db.inner(), input)
}

#[tauri::command]
pub fn remove_inventory_item(
    item_id: String,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, String> {
    inventory_service::remove_inventory_item(db.inner(), item_id)
}

#[tauri::command]
pub fn add_personnel(
    input: AddPersonnelInput,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, String> {
    inventory_service::add_personnel(db.inner(), input)
}

#[tauri::command]
pub fn remove_personnel(
    personnel_id: String,
    db: State<'_, InventoryDb>,
) -> Result<AppSnapshot, String> {
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
