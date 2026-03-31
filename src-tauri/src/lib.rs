mod application;
mod commands;
mod domain;
mod infrastructure;

use std::env;
use std::fs;
use std::path::{Path, PathBuf};

use tauri::Manager;

use domain::error::{AppError, AppResult};
use infrastructure::db::InventoryDb;
use infrastructure::lan::LanServerController;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let db = InventoryDb::new(resolve_database_path(app).map_err(String::from)?);
            application::inventory_service::initialize(&db).map_err(String::from)?;
            let lan = LanServerController::new(db.clone()).map_err(String::from)?;
            app.manage(db);
            app.manage(lan);
            Ok(())
        })
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            commands::app_health,
            commands::load_app_snapshot,
            commands::load_lan_access_state,
            commands::update_lan_access,
            commands::regenerate_lan_access_key,
            commands::create_inventory_item,
            commands::update_inventory_item,
            commands::receive_stock,
            commands::issue_material,
            commands::update_backup_plan,
            commands::backup_now,
            commands::update_app_language,
            commands::remove_inventory_item,
            commands::add_personnel,
            commands::remove_personnel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running inventory monitor");
}

fn resolve_database_path<R: tauri::Runtime>(app: &tauri::App<R>) -> AppResult<PathBuf> {
    let current_dir = env::current_dir().map_err(AppError::from)?;
    let app_data_dir = app
        .path()
        .app_local_data_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|error| AppError::IoError(error.to_string()))?;
    let runtime_data_dir = app_data_dir.join("data");

    migrate_legacy_runtime_data(&current_dir.join("data"), &runtime_data_dir)?;

    Ok(runtime_data_dir.join("inventory-monitor.db"))
}

fn migrate_legacy_runtime_data(legacy_data_dir: &Path, runtime_data_dir: &Path) -> AppResult<()> {
    if legacy_data_dir == runtime_data_dir || !legacy_data_dir.exists() {
        return Ok(());
    }

    fs::create_dir_all(runtime_data_dir).map_err(AppError::from)?;

    move_if_missing(
        &legacy_data_dir.join("inventory-monitor.db"),
        &runtime_data_dir.join("inventory-monitor.db"),
    )?;
    move_directory_contents_if_missing(
        &legacy_data_dir.join("qr-codes"),
        &runtime_data_dir.join("qr-codes"),
    )?;

    remove_dir_if_empty(&legacy_data_dir.join("qr-codes"))?;
    remove_dir_if_empty(legacy_data_dir)?;

    Ok(())
}

fn move_if_missing(source: &Path, destination: &Path) -> AppResult<()> {
    if !source.exists() || destination.exists() {
        return Ok(());
    }

    if let Some(parent) = destination.parent() {
        fs::create_dir_all(parent).map_err(AppError::from)?;
    }

    match fs::rename(source, destination) {
        Ok(()) => Ok(()),
        Err(_) => {
            fs::copy(source, destination).map_err(AppError::from)?;
            fs::remove_file(source).map_err(AppError::from)
        }
    }
}

fn move_directory_contents_if_missing(source_dir: &Path, destination_dir: &Path) -> AppResult<()> {
    if !source_dir.exists() {
        return Ok(());
    }

    fs::create_dir_all(destination_dir).map_err(AppError::from)?;

    for entry in fs::read_dir(source_dir).map_err(AppError::from)? {
        let entry = entry.map_err(AppError::from)?;
        let source_path = entry.path();
        let destination_path = destination_dir.join(entry.file_name());

        if source_path.is_dir() {
            move_directory_contents_if_missing(&source_path, &destination_path)?;
            remove_dir_if_empty(&source_path)?;
        } else {
            move_if_missing(&source_path, &destination_path)?;
        }
    }

    Ok(())
}

fn remove_dir_if_empty(path: &Path) -> AppResult<()> {
    match fs::remove_dir(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::DirectoryNotEmpty => Ok(()),
        Err(error) => Err(AppError::from(error)),
    }
}
