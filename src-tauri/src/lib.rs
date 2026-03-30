mod application;
mod commands;
mod domain;
mod infrastructure;

use std::env;

use tauri::Manager;

use infrastructure::db::InventoryDb;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let base_dir = env::current_dir().map_err(|error| error.to_string())?;
            let db = InventoryDb::new(base_dir.join("data").join("inventory-monitor.db"));
            application::inventory_service::initialize(&db)?;
            app.manage(db);
            Ok(())
        })
        .plugin(tauri_plugin_notification::init())
        .invoke_handler(tauri::generate_handler![
            commands::app_health,
            commands::load_app_snapshot,
            commands::create_inventory_item,
            commands::receive_stock,
            commands::issue_material,
            commands::create_refill_order,
            commands::remove_inventory_item,
            commands::add_personnel,
            commands::remove_personnel,
        ])
        .run(tauri::generate_context!())
        .expect("error while running inventory monitor");
}
