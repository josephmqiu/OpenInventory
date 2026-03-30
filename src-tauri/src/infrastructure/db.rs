use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::domain::models::{
    AddPersonnelInput, AlertStatus, AppSnapshot, BackupPlan, BackupStatus, BackupTargetType,
    CreateInventoryItemInput, InventoryAlert, InventoryItem, Language, PersonnelMember,
    StockMutationInput, StockStatus, UpdateBackupPlanInput, UpdateInventoryItemInput,
};
use crate::infrastructure::{qr, schema};

static ID_COUNTER: AtomicU64 = AtomicU64::new(1);

#[derive(Clone)]
pub struct InventoryDb {
    path: PathBuf,
}

pub struct LowStockNotification {
    pub item_name: String,
    pub sku: String,
    pub current_quantity: i64,
    pub threshold_quantity: i64,
}

pub struct MutationResult {
    pub snapshot: AppSnapshot,
    pub low_stock_notification: Option<LowStockNotification>,
}
pub struct LanAccessSettings {
    pub enabled: bool,
    pub port: u16,
    pub access_key: String,
    pub primary_url: String,
}

struct ItemRecord {
    id: String,
    sku: String,
    name: String,
    barcode: Option<String>,
    current_quantity: i64,
    reorder_quantity: i64,
}

impl InventoryDb {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn initialize(&self) -> Result<(), String> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(|error| error.to_string())?;
        }

        fs::create_dir_all(self.qr_code_dir()).map_err(|error| error.to_string())?;

        let connection = self.open_connection()?;
        connection
            .execute_batch(schema::schema_sql())
            .map_err(|error| error.to_string())?;

        self.ensure_qr_assets()
    }

    pub fn refresh_qr_assets(&self) -> Result<(), String> {
        self.ensure_qr_assets()
    }

    pub fn load_snapshot(&self) -> Result<AppSnapshot, String> {
        self.ensure_qr_assets()?;
        let connection = self.open_connection()?;

        let mut items_statement = connection
            .prepare(
                r#"
                SELECT
                    i.id,
                    i.sku,
                    i.name,
                    i.category,
                    COALESCE(l.name, '') AS location,
                    i.unit_of_measure,
                    COALESCE(s.name, '') AS supplier,
                    i.current_quantity,
                    i.min_quantity,
                    i.reorder_quantity,
                    i.status,
                    i.updated_at,
                    COALESCE(i.barcode, '')
                FROM inventory_items i
                LEFT JOIN locations l ON l.id = i.location_id
                LEFT JOIN suppliers s ON s.id = i.supplier_id
                ORDER BY i.name
                "#,
            )
            .map_err(|error| error.to_string())?;

        let items = items_statement
            .query_map([], |row| {
                let current_quantity: i64 = row.get(7)?;
                let reorder_quantity: i64 = row.get(9)?;
                let barcode_path: String = row.get(12)?;
                Ok(InventoryItem {
                    id: row.get(0)?,
                    sku: row.get(1)?,
                    qr_code_data_url: barcode_path_to_data_url(&barcode_path).unwrap_or_default(),
                    name: row.get(2)?,
                    category: row.get(3)?,
                    location: row.get(4)?,
                    unit: row.get(5)?,
                    supplier: row.get(6)?,
                    current_quantity,
                    min_quantity: row.get(8)?,
                    reorder_quantity,
                    status: parse_stock_status(stock_status_key(current_quantity, reorder_quantity)),
                    last_updated: row.get(11)?,
                })
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;

        let mut alerts_statement = connection
            .prepare(
                r#"
                SELECT
                    a.id,
                    i.name,
                    i.sku,
                    i.current_quantity,
                    a.threshold_quantity,
                    a.status,
                    a.triggered_at
                FROM low_stock_alerts a
                INNER JOIN inventory_items i ON i.id = a.item_id
                ORDER BY a.triggered_at DESC
                "#,
            )
            .map_err(|error| error.to_string())?;

        let alerts = alerts_statement
            .query_map([], |row| {
                Ok(InventoryAlert {
                    id: row.get(0)?,
                    item_name: row.get(1)?,
                    sku: row.get(2)?,
                    current_quantity: row.get(3)?,
                    threshold_quantity: row.get(4)?,
                    status: parse_alert_status(&row.get::<_, String>(5)?),
                    triggered_at: row.get(6)?,
                })
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;

        let mut personnel_statement = connection
            .prepare(
                r#"
                SELECT id, name
                FROM personnel
                ORDER BY name
                "#,
            )
            .map_err(|error| error.to_string())?;

        let personnel = personnel_statement
            .query_map([], |row| {
                Ok(PersonnelMember {
                    id: row.get(0)?,
                    name: row.get(1)?,
                })
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;

        let target_path = read_setting(&connection, "backup.target_path").map_err(|error| error.to_string())?;
        let target_type = read_setting(&connection, "backup.target_type").map_err(|error| error.to_string())?;
        let schedule = read_setting(&connection, "backup.schedule").map_err(|error| error.to_string())?;
        let retention = read_setting(&connection, "backup.retention").map_err(|error| error.to_string())?;
        let last_successful_backup = read_setting(&connection, "backup.last_successful").map_err(|error| error.to_string())?;
        let next_scheduled_backup = read_setting(&connection, "backup.next_scheduled").map_err(|error| error.to_string())?;
        let backup_status = read_setting(&connection, "backup.status").map_err(|error| error.to_string())?;
        let language = read_setting(&connection, "app.language").map_err(|error| error.to_string())?;

        Ok(AppSnapshot {
            items,
            alerts,
            personnel,
            backup_plan: BackupPlan {
                target_path: target_path.unwrap_or_default(),
                target_type: target_type
                    .as_deref()
                    .map(parse_backup_target_type)
                    .unwrap_or(BackupTargetType::LocalFolder),
                schedule: schedule.unwrap_or_default(),
                retention: retention.unwrap_or_default(),
                last_successful_backup: last_successful_backup.unwrap_or_default(),
                next_scheduled_backup: next_scheduled_backup.unwrap_or_default(),
                status: backup_status
                    .as_deref()
                    .map(parse_backup_status)
                    .unwrap_or(BackupStatus::Warning),
            },
            language: language
                .as_deref()
                .map(parse_language)
                .unwrap_or(Language::En),
        })
    }

    pub fn create_inventory_item(&self, input: CreateInventoryItemInput) -> Result<MutationResult, String> {
        let requested_sku = input.sku.trim();
        let name = require_text(&input.name, "Item name")?;
        let category = require_text(&input.category, "Category")?;
        let unit = require_text(&input.unit, "Unit")?;
        let location = require_text(&input.location, "Location")?;
        let supplier = input.supplier.trim();

        if input.reorder_quantity < 0 || input.initial_quantity < 0 {
            return Err("Quantity values must be zero or greater.".into());
        }

        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;

        let sku = resolve_sku(&transaction, requested_sku).map_err(|error| error.to_string())?;
        let supplier_id = ensure_supplier(&transaction, supplier).map_err(|error| error.to_string())?;
        let location_id = ensure_location(&transaction, location).map_err(|error| error.to_string())?;
        let item_id = generate_id("item");
        let qr_path = self.qr_code_path(&item_id);
        let qr_path_value = path_to_db_value(&qr_path);
        let status = stock_status_key(input.initial_quantity, input.reorder_quantity);

        transaction
            .execute(
                r#"
                INSERT INTO inventory_items (
                    id, sku, barcode, name, category, location_id, supplier_id,
                    unit_of_measure, min_quantity, reorder_quantity,
                    current_quantity, status, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, datetime('now', 'localtime'), datetime('now', 'localtime'))
                "#,
                params![
                    item_id,
                    sku,
                    qr_path_value,
                    name,
                    category,
                    location_id,
                    supplier_id,
                    unit,
                    0,
                    input.reorder_quantity,
                    input.initial_quantity,
                    status,
                ],
            )
            .map_err(|error| error.to_string())?;

        let qr_payload = self.qr_payload_for_item(&item_id, &sku)?;
        write_item_qr_png(&qr_path, &qr_payload)?;

        if input.initial_quantity > 0 {
            insert_movement(
                &transaction,
                &item_id,
                "receive",
                input.initial_quantity,
                0,
                input.initial_quantity,
                Some("Initial quantity"),
                None,
                None,
                None,
            )
            .map_err(|error| error.to_string())?;
        }

        let alert_created = sync_low_stock_alert(&transaction, &item_id, input.reorder_quantity, input.initial_quantity)
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;

        Ok(MutationResult {
            snapshot: self.load_snapshot()?,
            low_stock_notification: alert_created.then(|| LowStockNotification {
                item_name: name.to_string(),
                sku,
                current_quantity: input.initial_quantity,
                threshold_quantity: input.reorder_quantity,
            }),
        })
    }

    pub fn update_inventory_item(&self, input: UpdateInventoryItemInput) -> Result<MutationResult, String> {
        let name = require_text(&input.name, "Item name")?;
        let category = require_text(&input.category, "Category")?;
        let unit = require_text(&input.unit, "Unit")?;
        let location = require_text(&input.location, "Location")?;
        let supplier = input.supplier.trim();

        if input.reorder_quantity < 0 {
            return Err("Reorder level must be zero or greater.".into());
        }

        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;
        let item = get_item_record(&transaction, &input.item_id).map_err(|error| error.to_string())?;
        let sku = resolve_updated_sku(&transaction, &input.item_id, input.sku.trim(), &item.sku)
            .map_err(|error| error.to_string())?;
        let supplier_id = ensure_supplier(&transaction, supplier).map_err(|error| error.to_string())?;
        let location_id = ensure_location(&transaction, location).map_err(|error| error.to_string())?;
        let status = stock_status_key(item.current_quantity, input.reorder_quantity);
        let expected_qr_path = self.qr_code_path(&input.item_id);
        let expected_qr_value = path_to_db_value(&expected_qr_path);
        let qr_needs_refresh = sku != item.sku || item.barcode.as_deref() != Some(expected_qr_value.as_str()) || !expected_qr_path.exists();

        transaction
            .execute(
                r#"
                UPDATE inventory_items
                SET sku = ?1,
                    barcode = ?2,
                    name = ?3,
                    category = ?4,
                    location_id = ?5,
                    supplier_id = ?6,
                    unit_of_measure = ?7,
                    reorder_quantity = ?8,
                    status = ?9,
                    updated_at = datetime('now', 'localtime')
                WHERE id = ?10
                "#,
                params![
                    sku,
                    expected_qr_value,
                    name,
                    category,
                    location_id,
                    supplier_id,
                    unit,
                    input.reorder_quantity,
                    status,
                    input.item_id,
                ],
            )
            .map_err(|error| error.to_string())?;

        if qr_needs_refresh {
            let qr_payload = self.qr_payload_for_item(&input.item_id, &sku)?;
            write_item_qr_png(&expected_qr_path, &qr_payload)?;
        }

        let alert_created = sync_low_stock_alert(&transaction, &input.item_id, input.reorder_quantity, item.current_quantity)
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;

        if let Some(previous_path) = item.barcode.clone() {
            if previous_path != expected_qr_value {
                delete_file_if_exists(Path::new(&previous_path))?;
            }
        }

        Ok(MutationResult {
            snapshot: self.load_snapshot()?,
            low_stock_notification: alert_created.then(|| LowStockNotification {
                item_name: name.to_string(),
                sku,
                current_quantity: item.current_quantity,
                threshold_quantity: input.reorder_quantity,
            }),
        })
    }

    pub fn receive_stock(&self, input: StockMutationInput) -> Result<MutationResult, String> {
        if input.quantity <= 0 {
            return Err("Receive quantity must be greater than zero.".into());
        }
        let performed_by = require_text(&input.performed_by, "Performed by")?;

        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;
        let item = get_item_record(&transaction, &input.item_id).map_err(|error| error.to_string())?;
        let new_quantity = item.current_quantity + input.quantity;
        let status = stock_status_key(new_quantity, item.reorder_quantity);

        transaction
            .execute(
                "UPDATE inventory_items SET current_quantity = ?1, status = ?2, updated_at = datetime('now', 'localtime') WHERE id = ?3",
                params![new_quantity, status, item.id],
            )
            .map_err(|error| error.to_string())?;

        insert_movement(
            &transaction,
            &item.id,
            "receive",
            input.quantity,
            item.current_quantity,
            new_quantity,
            optional_text(&input.reason),
            None,
            None,
            Some(performed_by),
        )
        .map_err(|error| error.to_string())?;

        let alert_created = sync_low_stock_alert(&transaction, &item.id, item.reorder_quantity, new_quantity)
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;

        Ok(MutationResult {
            snapshot: self.load_snapshot()?,
            low_stock_notification: alert_created.then(|| LowStockNotification {
                item_name: item.name,
                sku: item.sku,
                current_quantity: new_quantity,
                threshold_quantity: item.reorder_quantity,
            }),
        })
    }

    pub fn issue_material(&self, input: StockMutationInput) -> Result<MutationResult, String> {
        if input.quantity <= 0 {
            return Err("Issue quantity must be greater than zero.".into());
        }
        let performed_by = require_text(&input.performed_by, "Performed by")?;

        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;
        let item = get_item_record(&transaction, &input.item_id).map_err(|error| error.to_string())?;

        if input.quantity > item.current_quantity {
            return Err(format!(
                "Cannot issue {} units. Current available stock for {} is {}.",
                input.quantity, item.sku, item.current_quantity
            ));
        }

        let new_quantity = item.current_quantity - input.quantity;
        let status = stock_status_key(new_quantity, item.reorder_quantity);

        transaction
            .execute(
                "UPDATE inventory_items SET current_quantity = ?1, status = ?2, updated_at = datetime('now', 'localtime') WHERE id = ?3",
                params![new_quantity, status, item.id],
            )
            .map_err(|error| error.to_string())?;

        insert_movement(
            &transaction,
            &item.id,
            "issue",
            input.quantity,
            item.current_quantity,
            new_quantity,
            optional_text(&input.reason),
            None,
            None,
            Some(performed_by),
        )
        .map_err(|error| error.to_string())?;

        let alert_created = sync_low_stock_alert(&transaction, &item.id, item.reorder_quantity, new_quantity)
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;

        Ok(MutationResult {
            snapshot: self.load_snapshot()?,
            low_stock_notification: alert_created.then(|| LowStockNotification {
                item_name: item.name,
                sku: item.sku,
                current_quantity: new_quantity,
                threshold_quantity: item.reorder_quantity,
            }),
        })
    }

    pub fn update_backup_plan(&self, input: UpdateBackupPlanInput) -> Result<AppSnapshot, String> {
        let target_path = input.target_path.trim();
        let schedule = input.schedule.trim();
        let retention = input.retention.trim();
        let status = backup_status_key(target_path);

        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;

        write_setting(&transaction, "backup.target_path", target_path).map_err(|error| error.to_string())?;
        write_setting(&transaction, "backup.target_type", backup_target_type_key(&input.target_type))
            .map_err(|error| error.to_string())?;
        write_setting(&transaction, "backup.schedule", schedule).map_err(|error| error.to_string())?;
        write_setting(&transaction, "backup.retention", retention).map_err(|error| error.to_string())?;
        write_setting(&transaction, "backup.status", status).map_err(|error| error.to_string())?;

        transaction.commit().map_err(|error| error.to_string())?;
        self.load_snapshot()
    }

    pub fn update_language(&self, language: Language) -> Result<(), String> {
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;

        write_setting(&transaction, "app.language", language_key(&language)).map_err(|error| error.to_string())?;

        transaction.commit().map_err(|error| error.to_string())?;
        Ok(())
    }

    pub fn remove_inventory_item(&self, item_id: String) -> Result<AppSnapshot, String> {
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;
        let item = get_item_record(&transaction, &item_id).map_err(|error| error.to_string())?;

        if let Some(barcode_path) = item.barcode.as_deref() {
            delete_file_if_exists(Path::new(barcode_path))?;
        }

        transaction
            .execute("DELETE FROM low_stock_alerts WHERE item_id = ?1", params![item.id.clone()])
            .map_err(|error| error.to_string())?;
        transaction
            .execute("DELETE FROM inventory_movements WHERE item_id = ?1", params![item.id.clone()])
            .map_err(|error| error.to_string())?;
        transaction
            .execute("DELETE FROM inventory_items WHERE id = ?1", params![item.id])
            .map_err(|error| error.to_string())?;

        transaction.commit().map_err(|error| error.to_string())?;
        self.load_snapshot()
    }

    pub fn add_personnel(&self, input: AddPersonnelInput) -> Result<AppSnapshot, String> {
        let name = require_text(&input.name, "Personnel name")?;
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;

        let existing: Option<String> = transaction
            .query_row(
                "SELECT id FROM personnel WHERE lower(name) = lower(?1)",
                params![name],
                |row| row.get(0),
            )
            .optional()
            .map_err(|error| error.to_string())?;
        if existing.is_some() {
            return Err("Personnel name already exists.".into());
        }

        let personnel_id = generate_id("person");
        transaction
            .execute(
                "INSERT INTO personnel (id, name, created_at, updated_at) VALUES (?1, ?2, datetime('now', 'localtime'), datetime('now', 'localtime'))",
                params![personnel_id, name],
            )
            .map_err(|error| error.to_string())?;

        transaction.commit().map_err(|error| error.to_string())?;
        self.load_snapshot()
    }

    pub fn remove_personnel(&self, personnel_id: String) -> Result<AppSnapshot, String> {
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;

        let deleted = transaction
            .execute("DELETE FROM personnel WHERE id = ?1", params![personnel_id])
            .map_err(|error| error.to_string())?;
        if deleted == 0 {
            return Err("Personnel record not found.".into());
        }

        transaction.commit().map_err(|error| error.to_string())?;
        self.load_snapshot()
    }

    pub fn load_lan_access_settings(&self) -> Result<LanAccessSettings, String> {
        let connection = self.open_connection()?;
        let enabled = read_setting(&connection, "lan.enabled").map_err(|error| error.to_string())?;
        let port = read_setting(&connection, "lan.port").map_err(|error| error.to_string())?;
        let access_key = read_setting(&connection, "lan.access_key").map_err(|error| error.to_string())?;
        let primary_url = read_setting(&connection, "lan.primary_url").map_err(|error| error.to_string())?;

        Ok(LanAccessSettings {
            enabled: matches!(enabled.as_deref(), Some("true")),
            port: port
                .as_deref()
                .and_then(|value| value.parse::<u16>().ok())
                .filter(|value| *value > 0)
                .unwrap_or(4123),
            access_key: access_key.unwrap_or_default(),
            primary_url: primary_url.unwrap_or_default(),
        })
    }

    pub fn save_lan_access_settings(&self, settings: &LanAccessSettings) -> Result<(), String> {
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;

        write_setting(
            &transaction,
            "lan.enabled",
            if settings.enabled { "true" } else { "false" },
        )
        .map_err(|error| error.to_string())?;
        write_setting(&transaction, "lan.port", &settings.port.to_string())
            .map_err(|error| error.to_string())?;
        write_setting(&transaction, "lan.access_key", &settings.access_key)
            .map_err(|error| error.to_string())?;
        write_setting(&transaction, "lan.primary_url", &settings.primary_url)
            .map_err(|error| error.to_string())?;

        transaction.commit().map_err(|error| error.to_string())?;
        Ok(())
    }
    fn open_connection(&self) -> Result<Connection, String> {
        let connection = Connection::open(&self.path).map_err(|error| error.to_string())?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(|error| error.to_string())?;
        Ok(connection)
    }

    fn qr_code_dir(&self) -> PathBuf {
        self.path
            .parent()
            .unwrap_or_else(|| Path::new("."))
            .join("qr-codes")
    }

    fn qr_code_path(&self, item_id: &str) -> PathBuf {
        self.qr_code_dir().join(format!("{}.png", item_id))
    }

    fn ensure_qr_assets(&self) -> Result<(), String> {
        fs::create_dir_all(self.qr_code_dir()).map_err(|error| error.to_string())?;
        let desired_signature = self.qr_payload_signature()?;
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(|error| error.to_string())?;
        let current_signature = read_setting(&transaction, "qr.payload_signature")
            .map_err(|error| error.to_string())?
            .unwrap_or_default();
        let signature_changed = current_signature != desired_signature;
        let mut statement = transaction
            .prepare("SELECT id, sku, COALESCE(barcode, '') FROM inventory_items ORDER BY id")
            .map_err(|error| error.to_string())?;
        let items = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(|error| error.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| error.to_string())?;
        drop(statement);

        for (item_id, sku, barcode) in items {
            let expected_path = self.qr_code_path(&item_id);
            let expected_value = path_to_db_value(&expected_path);
            let needs_regeneration = signature_changed || barcode != expected_value || !expected_path.exists();

            if needs_regeneration {
                let qr_payload = self.qr_payload_for_item(&item_id, &sku)?;
                write_item_qr_png(&expected_path, &qr_payload)?;
                transaction
                    .execute(
                        "UPDATE inventory_items SET barcode = ?1 WHERE id = ?2",
                        params![expected_value, item_id],
                    )
                    .map_err(|error| error.to_string())?;
                if !barcode.is_empty() && barcode != expected_value {
                    delete_file_if_exists(Path::new(&barcode))?;
                }
            }
        }

        write_setting(&transaction, "qr.payload_signature", &desired_signature)
            .map_err(|error| error.to_string())?;
        transaction.commit().map_err(|error| error.to_string())?;
        Ok(())
    }
}

fn read_setting(connection: &Connection, key: &str) -> rusqlite::Result<Option<String>> {
    connection
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get::<_, String>(0),
        )
        .optional()
}

fn write_setting(transaction: &Transaction<'_>, key: &str, value: &str) -> rusqlite::Result<()> {
    transaction.execute(
        r#"
        INSERT INTO app_settings (key, value)
        VALUES (?1, ?2)
        ON CONFLICT(key) DO UPDATE SET value = excluded.value
        "#,
        params![key, value],
    )?;
    Ok(())
}

fn resolve_sku(transaction: &Transaction<'_>, requested_sku: &str) -> rusqlite::Result<String> {
    if !requested_sku.is_empty() {
        let existing: Option<String> = transaction
            .query_row(
                "SELECT id FROM inventory_items WHERE lower(sku) = lower(?1)",
                params![requested_sku],
                |row| row.get(0),
            )
            .optional()?;
        if existing.is_some() {
            return Err(rusqlite::Error::InvalidParameterName("SKU already exists.".into()));
        }
        return Ok(requested_sku.to_string());
    }

    loop {
        let candidate = generate_sku();
        let existing: Option<String> = transaction
            .query_row(
                "SELECT id FROM inventory_items WHERE sku = ?1",
                params![candidate],
                |row| row.get(0),
            )
            .optional()?;
        if existing.is_none() {
            return Ok(candidate);
        }
    }
}

fn resolve_updated_sku(
    transaction: &Transaction<'_>,
    item_id: &str,
    requested_sku: &str,
    current_sku: &str,
) -> rusqlite::Result<String> {
    let candidate = if requested_sku.is_empty() {
        current_sku.to_string()
    } else {
        requested_sku.to_string()
    };

    let existing: Option<String> = transaction
        .query_row(
            "SELECT id FROM inventory_items WHERE lower(sku) = lower(?1) AND id <> ?2",
            params![candidate, item_id],
            |row| row.get(0),
        )
        .optional()?;
    if existing.is_some() {
        return Err(rusqlite::Error::InvalidParameterName("SKU already exists.".into()));
    }

    Ok(candidate)
}

fn generate_sku() -> String {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let sequence = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("SKU-{}-{}", stamp, sequence)
}

fn ensure_supplier(transaction: &Transaction<'_>, supplier_name: &str) -> rusqlite::Result<Option<String>> {
    if supplier_name.is_empty() {
        return Ok(None);
    }

    let existing: Option<String> = transaction
        .query_row(
            "SELECT id FROM suppliers WHERE lower(name) = lower(?1)",
            params![supplier_name],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(id) = existing {
        return Ok(Some(id));
    }

    let supplier_id = generate_id("supplier");
    transaction.execute(
        "INSERT INTO suppliers (id, name, created_at, updated_at) VALUES (?1, ?2, datetime('now', 'localtime'), datetime('now', 'localtime'))",
        params![supplier_id, supplier_name],
    )?;
    Ok(Some(supplier_id))
}

fn ensure_location(transaction: &Transaction<'_>, location_name: &str) -> rusqlite::Result<Option<String>> {
    if location_name.is_empty() {
        return Ok(None);
    }

    let existing: Option<String> = transaction
        .query_row(
            "SELECT id FROM locations WHERE lower(name) = lower(?1)",
            params![location_name],
            |row| row.get(0),
        )
        .optional()?;

    if let Some(id) = existing {
        return Ok(Some(id));
    }

    let location_id = generate_id("location");
    let location_code = generate_id("LOC").to_uppercase();
    transaction.execute(
        "INSERT INTO locations (id, name, code, created_at, updated_at) VALUES (?1, ?2, ?3, datetime('now', 'localtime'), datetime('now', 'localtime'))",
        params![location_id, location_name, location_code],
    )?;
    Ok(Some(location_id))
}

fn get_item_record(transaction: &Transaction<'_>, item_id: &str) -> rusqlite::Result<ItemRecord> {
    transaction.query_row(
        "SELECT id, sku, name, barcode, current_quantity, reorder_quantity FROM inventory_items WHERE id = ?1",
        params![item_id],
        |row| {
            Ok(ItemRecord {
                id: row.get(0)?,
                sku: row.get(1)?,
                name: row.get(2)?,
                barcode: row.get(3)?,
                current_quantity: row.get(4)?,
                reorder_quantity: row.get(5)?,
            })
        },
    )
}

fn insert_movement(
    transaction: &Transaction<'_>,
    item_id: &str,
    movement_type: &str,
    quantity: i64,
    previous_quantity: i64,
    new_quantity: i64,
    reason: Option<&str>,
    reference_no: Option<&str>,
    notes: Option<&str>,
    performed_by: Option<&str>,
) -> rusqlite::Result<()> {
    transaction.execute(
        r#"
        INSERT INTO inventory_movements (
            id, item_id, movement_type, quantity, previous_quantity,
            new_quantity, reason, reference_no, notes, performed_by, performed_at
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, datetime('now', 'localtime'))
        "#,
        params![
            generate_id("move"),
            item_id,
            movement_type,
            quantity,
            previous_quantity,
            new_quantity,
            reason,
            reference_no,
            notes,
            performed_by,
        ],
    )?;
    Ok(())
}

fn sync_low_stock_alert(
    transaction: &Transaction<'_>,
    item_id: &str,
    reorder_quantity: i64,
    current_quantity: i64,
) -> rusqlite::Result<bool> {
    let existing: Option<String> = transaction
        .query_row(
            "SELECT id FROM low_stock_alerts WHERE item_id = ?1 AND status IN ('open', 'acknowledged') ORDER BY triggered_at DESC LIMIT 1",
            params![item_id],
            |row| row.get(0),
        )
        .optional()?;

    if current_quantity <= reorder_quantity {
        if existing.is_none() {
            transaction.execute(
                r#"
                INSERT INTO low_stock_alerts (
                    id, item_id, threshold_quantity, quantity_at_trigger,
                    status, triggered_at, channel_summary
                ) VALUES (?1, ?2, ?3, ?4, 'open', datetime('now', 'localtime'), 'desktop,in_app')
                "#,
                params![generate_id("alert"), item_id, reorder_quantity, current_quantity],
            )?;
            return Ok(true);
        }
    } else if let Some(alert_id) = existing {
        transaction.execute(
            "UPDATE low_stock_alerts SET status = 'resolved', resolved_at = datetime('now', 'localtime') WHERE id = ?1",
            params![alert_id],
        )?;
    }

    Ok(false)
}

fn require_text<'a>(value: &'a str, label: &str) -> Result<&'a str, String> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(format!("{} is required.", label));
    }
    Ok(trimmed)
}

fn optional_text(value: &str) -> Option<&str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

fn stock_status_key(current_quantity: i64, reorder_quantity: i64) -> &'static str {
    if current_quantity <= 0 {
        "out_of_stock"
    } else if current_quantity <= reorder_quantity {
        "low_stock"
    } else {
        "in_stock"
    }
}

fn parse_stock_status(value: &str) -> StockStatus {
    match value {
        "low_stock" => StockStatus::LowStock,
        "out_of_stock" => StockStatus::OutOfStock,
        _ => StockStatus::InStock,
    }
}

fn parse_alert_status(value: &str) -> AlertStatus {
    match value {
        "acknowledged" => AlertStatus::Acknowledged,
        "resolved" => AlertStatus::Resolved,
        _ => AlertStatus::Open,
    }
}

fn backup_target_type_key(value: &BackupTargetType) -> &'static str {
    match value {
        BackupTargetType::LocalFolder => "local_folder",
        BackupTargetType::LanShare => "lan_share",
        BackupTargetType::CloudFolder => "cloud_folder",
    }
}

fn backup_status_key(target_path: &str) -> &'static str {
    if target_path.trim().is_empty() {
        "warning"
    } else {
        "healthy"
    }
}

fn parse_backup_target_type(value: &str) -> BackupTargetType {
    match value {
        "lan_share" => BackupTargetType::LanShare,
        "cloud_folder" => BackupTargetType::CloudFolder,
        _ => BackupTargetType::LocalFolder,
    }
}

fn parse_backup_status(value: &str) -> BackupStatus {
    match value {
        "healthy" => BackupStatus::Healthy,
        _ => BackupStatus::Warning,
    }
}

fn language_key(value: &Language) -> &'static str {
    match value {
        Language::En => "en",
        Language::ZhCn => "zh-CN",
    }
}

fn parse_language(value: &str) -> Language {
    match value {
        "zh-CN" => Language::ZhCn,
        _ => Language::En,
    }
}

fn generate_id(prefix: &str) -> String {
    let stamp = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_micros();
    let sequence = ID_COUNTER.fetch_add(1, Ordering::Relaxed);
    format!("{}-{}-{}", prefix, stamp, sequence)
}

impl InventoryDb {
    fn qr_payload_for_item(&self, item_id: &str, sku: &str) -> Result<String, String> {
        let settings = self.load_lan_access_settings()?;
        if settings.enabled && !settings.primary_url.trim().is_empty() {
            return Ok(format!(
                "{}/issue/{}?key={}",
                settings.primary_url.trim_end_matches('/'),
                item_id,
                settings.access_key
            ));
        }

        Ok(sku.to_string())
    }

    fn qr_payload_signature(&self) -> Result<String, String> {
        let settings = self.load_lan_access_settings()?;
        if settings.enabled && !settings.primary_url.trim().is_empty() {
            return Ok(format!(
                "issue:{}:{}",
                settings.primary_url.trim_end_matches('/'),
                settings.access_key
            ));
        }

        Ok("sku".to_string())
    }
}

fn barcode_path_to_data_url(value: &str) -> Result<String, String> {
    if value.trim().is_empty() {
        return Ok(String::new());
    }
    qr::png_file_to_data_url(Path::new(value))
}

fn path_to_db_value(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn write_item_qr_png(path: &Path, sku: &str) -> Result<(), String> {
    qr::write_qr_png(path, sku)
}

fn delete_file_if_exists(path: &Path) -> Result<(), String> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}


















