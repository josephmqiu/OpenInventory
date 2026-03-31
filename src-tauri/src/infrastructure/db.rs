use std::fs;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection, OptionalExtension, Transaction};

use crate::domain::error::{AppError, AppResult};
use crate::domain::models::{
    AddPersonnelInput, AlertStatus, AppSnapshot, BackupPlan, BackupStatus, BackupTargetType,
    BatchIssueMaterialInput, CreateInventoryItemInput, InventoryAlert, InventoryItem,
    InventoryMovement, Language, PersonnelMember, StockMutationInput, StockStatus,
    UpdateBackupPlanInput, UpdateInventoryItemInput,
};
use crate::infrastructure::{backup, migrations, qr, schema};

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

fn database_error<E: std::fmt::Display>(error: E) -> AppError {
    AppError::DatabaseError(error.to_string())
}

impl InventoryDb {
    pub fn new(path: PathBuf) -> Self {
        Self { path }
    }

    pub fn initialize(&self) -> AppResult<()> {
        if let Some(parent) = self.path.parent() {
            fs::create_dir_all(parent).map_err(AppError::from)?;
        }

        fs::create_dir_all(self.qr_code_dir()).map_err(AppError::from)?;

        let connection = self.open_connection()?;
        connection
            .execute_batch(schema::schema_sql())
            .map_err(database_error)?;
        let mut connection = connection;
        migrations::run_pending_migrations(&mut connection)?;

        self.ensure_qr_assets()
    }

    pub fn refresh_qr_assets(&self) -> AppResult<()> {
        self.ensure_qr_assets()
    }

    pub fn load_snapshot(&self) -> AppResult<AppSnapshot> {
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
            .map_err(database_error)?;

        let items = items_statement
            .query_map([], |row| {
                let current_quantity: i64 = row.get(7)?;
                let reorder_quantity: i64 = row.get(8)?;
                let barcode_path: String = row.get(11)?;
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
                    reorder_quantity,
                    status: parse_stock_status(stock_status_key(
                        current_quantity,
                        reorder_quantity,
                    )),
                    last_updated: row.get(10)?,
                })
            })
            .map_err(database_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(database_error)?;

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
            .map_err(database_error)?;

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
            .map_err(database_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(database_error)?;

        let mut personnel_statement = connection
            .prepare(
                r#"
                SELECT id, name
                FROM personnel
                ORDER BY name
                "#,
            )
            .map_err(database_error)?;

        let personnel = personnel_statement
            .query_map([], |row| {
                Ok(PersonnelMember {
                    id: row.get(0)?,
                    name: row.get(1)?,
                })
            })
            .map_err(database_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(database_error)?;

        let target_path =
            read_setting(&connection, "backup.target_path").map_err(database_error)?;
        let target_type =
            read_setting(&connection, "backup.target_type").map_err(database_error)?;
        let schedule = read_setting(&connection, "backup.schedule").map_err(database_error)?;
        let retention = read_setting(&connection, "backup.retention").map_err(database_error)?;
        let last_successful_backup =
            read_setting(&connection, "backup.last_successful").map_err(database_error)?;
        let next_scheduled_backup =
            read_setting(&connection, "backup.next_scheduled").map_err(database_error)?;
        let backup_status = read_setting(&connection, "backup.status").map_err(database_error)?;
        let language = read_setting(&connection, "app.language").map_err(database_error)?;

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

    pub fn create_inventory_item(
        &self,
        input: CreateInventoryItemInput,
    ) -> AppResult<MutationResult> {
        let requested_sku = input.sku.trim();
        let name = require_text(&input.name, "Item name")?;
        let category = require_text(&input.category, "Category")?;
        let unit = require_text(&input.unit, "Unit")?;
        let location = require_text(&input.location, "Location")?;
        let supplier = input.supplier.trim();

        if input.reorder_quantity < 0 || input.initial_quantity < 0 {
            return Err(AppError::ValidationError(
                "Quantity values must be zero or greater.".into(),
            ));
        }

        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(database_error)?;

        let sku = resolve_sku(&transaction, requested_sku)?;
        let supplier_id = ensure_supplier(&transaction, supplier).map_err(database_error)?;
        let location_id = ensure_location(&transaction, location).map_err(database_error)?;
        let item_id = generate_id("item");
        let qr_path = self.qr_code_path(&item_id);
        let qr_path_value = path_to_db_value(&qr_path);
        let status = stock_status_key(input.initial_quantity, input.reorder_quantity);

        transaction
            .execute(
                r#"
                INSERT INTO inventory_items (
                    id, sku, barcode, name, category, location_id, supplier_id,
                    unit_of_measure, reorder_quantity,
                    current_quantity, status, created_at, updated_at
                ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, datetime('now', 'localtime'), datetime('now', 'localtime'))
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
                    input.reorder_quantity,
                    input.initial_quantity,
                    status,
                ],
            )
            .map_err(database_error)?;

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
            .map_err(database_error)?;
        }

        let alert_created = sync_low_stock_alert(
            &transaction,
            &item_id,
            input.reorder_quantity,
            input.initial_quantity,
        )
        .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;

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

    pub fn update_inventory_item(
        &self,
        input: UpdateInventoryItemInput,
    ) -> AppResult<MutationResult> {
        let name = require_text(&input.name, "Item name")?;
        let category = require_text(&input.category, "Category")?;
        let unit = require_text(&input.unit, "Unit")?;
        let location = require_text(&input.location, "Location")?;
        let supplier = input.supplier.trim();

        if input.reorder_quantity < 0 {
            return Err(AppError::ValidationError(
                "Reorder level must be zero or greater.".into(),
            ));
        }

        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        let item = get_item_record(&transaction, &input.item_id)?;
        let sku = resolve_updated_sku(&transaction, &input.item_id, input.sku.trim(), &item.sku)?;
        let supplier_id = ensure_supplier(&transaction, supplier).map_err(database_error)?;
        let location_id = ensure_location(&transaction, location).map_err(database_error)?;
        let status = stock_status_key(item.current_quantity, input.reorder_quantity);
        let expected_qr_path = self.qr_code_path(&input.item_id);
        let expected_qr_value = path_to_db_value(&expected_qr_path);
        let qr_needs_refresh = sku != item.sku
            || item.barcode.as_deref() != Some(expected_qr_value.as_str())
            || !expected_qr_path.exists();

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
            .map_err(database_error)?;

        if qr_needs_refresh {
            let qr_payload = self.qr_payload_for_item(&input.item_id, &sku)?;
            write_item_qr_png(&expected_qr_path, &qr_payload)?;
        }

        let alert_created = sync_low_stock_alert(
            &transaction,
            &input.item_id,
            input.reorder_quantity,
            item.current_quantity,
        )
        .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;

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

    pub fn receive_stock(&self, input: StockMutationInput) -> AppResult<MutationResult> {
        if input.quantity <= 0 {
            return Err(AppError::ValidationError(
                "Receive quantity must be greater than zero.".into(),
            ));
        }
        let performed_by = require_text(&input.performed_by, "Performed by")?;

        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        let item = get_item_record(&transaction, &input.item_id)?;
        let new_quantity = item.current_quantity + input.quantity;
        let status = stock_status_key(new_quantity, item.reorder_quantity);

        transaction
            .execute(
                "UPDATE inventory_items SET current_quantity = ?1, status = ?2, updated_at = datetime('now', 'localtime') WHERE id = ?3",
                params![new_quantity, status, item.id],
            )
            .map_err(database_error)?;

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
        .map_err(database_error)?;

        let alert_created =
            sync_low_stock_alert(&transaction, &item.id, item.reorder_quantity, new_quantity)
                .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;

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

    pub fn issue_material(&self, input: StockMutationInput) -> AppResult<MutationResult> {
        if input.quantity <= 0 {
            return Err(AppError::ValidationError(
                "Issue quantity must be greater than zero.".into(),
            ));
        }
        let performed_by = require_text(&input.performed_by, "Performed by")?;

        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        let item = get_item_record(&transaction, &input.item_id)?;

        if input.quantity > item.current_quantity {
            return Err(AppError::InsufficientStock {
                available: item.current_quantity,
                requested: input.quantity,
            });
        }

        let new_quantity = item.current_quantity - input.quantity;
        let status = stock_status_key(new_quantity, item.reorder_quantity);

        transaction
            .execute(
                "UPDATE inventory_items SET current_quantity = ?1, status = ?2, updated_at = datetime('now', 'localtime') WHERE id = ?3",
                params![new_quantity, status, item.id],
            )
            .map_err(database_error)?;

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
        .map_err(database_error)?;

        let alert_created =
            sync_low_stock_alert(&transaction, &item.id, item.reorder_quantity, new_quantity)
                .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;

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

    pub fn batch_issue_material(&self, input: BatchIssueMaterialInput) -> AppResult<MutationResult> {
        if input.items.is_empty() {
            return Err(AppError::ValidationError(
                "Batch issue must include at least one item.".into(),
            ));
        }

        let performed_by = require_text(&input.performed_by, "Performed by")?.to_string();
        let reason = input.reason;
        let items = input.items;

        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(database_error)?;

        let mut low_stock_notification: Option<LowStockNotification> = None;

        for batch_item in items {
            if batch_item.quantity <= 0 {
                return Err(AppError::ValidationError(format!(
                    "Batch issue failed for item {}: quantity must be greater than zero.",
                    batch_item.item_id
                )));
            }

            let item = match get_item_record(&transaction, &batch_item.item_id) {
                Ok(item) => item,
                Err(AppError::NotFound(_)) => {
                    return Err(AppError::ValidationError(format!(
                        "Batch issue failed for item {}: item not found.",
                        batch_item.item_id
                    )));
                }
                Err(error) => return Err(error),
            };

            if batch_item.quantity > item.current_quantity {
                return Err(AppError::ValidationError(format!(
                    "Batch issue failed for {}: cannot issue {} units because only {} are available.",
                    item_label(&item),
                    batch_item.quantity,
                    item.current_quantity
                )));
            }

            let new_quantity = item.current_quantity - batch_item.quantity;
            let status = stock_status_key(new_quantity, item.reorder_quantity);

            transaction
                .execute(
                    "UPDATE inventory_items SET current_quantity = ?1, status = ?2, updated_at = datetime('now', 'localtime') WHERE id = ?3",
                    params![new_quantity, status, item.id],
                )
                .map_err(database_error)?;

            insert_movement(
                &transaction,
                &item.id,
                "issue",
                batch_item.quantity,
                item.current_quantity,
                new_quantity,
                optional_text(&reason),
                None,
                None,
                Some(performed_by.as_str()),
            )
            .map_err(database_error)?;

            let alert_created =
                sync_low_stock_alert(&transaction, &item.id, item.reorder_quantity, new_quantity)
                    .map_err(database_error)?;

            if alert_created {
                low_stock_notification = Some(LowStockNotification {
                    item_name: item.name,
                    sku: item.sku,
                    current_quantity: new_quantity,
                    threshold_quantity: item.reorder_quantity,
                });
            }
        }

        transaction.commit().map_err(database_error)?;
        Ok(MutationResult {
            snapshot: self.load_snapshot()?,
            low_stock_notification,
        })
    }

    pub fn get_item_movements(&self, item_id: &str) -> AppResult<Vec<InventoryMovement>> {
        let connection = self.open_connection()?;
        let exists: Option<String> = connection
            .query_row(
                "SELECT id FROM inventory_items WHERE id = ?1",
                params![item_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error)?;

        if exists.is_none() {
            return Err(AppError::NotFound("Item not found.".into()));
        }

        let mut statement = connection
            .prepare(
                r#"
                SELECT id, item_id, movement_type, quantity, performed_by, reason, performed_at
                FROM inventory_movements
                WHERE item_id = ?1
                ORDER BY performed_at DESC
                LIMIT 50
                "#,
            )
            .map_err(database_error)?;

        let movements = statement
            .query_map(params![item_id], |row| {
                Ok(InventoryMovement {
                    id: row.get(0)?,
                    item_id: row.get(1)?,
                    movement_type: row.get(2)?,
                    quantity: row.get(3)?,
                    performed_by: row.get(4)?,
                    reason: row.get(5)?,
                    created_at: row.get(6)?,
                })
            })
            .map_err(database_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(database_error)?;

        Ok(movements)
    }

    pub fn update_backup_plan(&self, input: UpdateBackupPlanInput) -> AppResult<AppSnapshot> {
        let target_path = input.target_path.trim();
        let schedule = input.schedule.trim();
        let retention = input.retention.trim();
        let status = backup_status_key(target_path);

        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(database_error)?;

        write_setting(&transaction, "backup.target_path", target_path).map_err(database_error)?;
        write_setting(
            &transaction,
            "backup.target_type",
            backup_target_type_key(&input.target_type),
        )
        .map_err(database_error)?;
        write_setting(&transaction, "backup.schedule", schedule).map_err(database_error)?;
        write_setting(&transaction, "backup.retention", retention).map_err(database_error)?;
        write_setting(&transaction, "backup.status", status).map_err(database_error)?;

        transaction.commit().map_err(database_error)?;
        self.load_snapshot()
    }

    pub fn backup_now(&self) -> AppResult<AppSnapshot> {
        let target_path = {
            let connection = self.open_connection()?;
            read_setting(&connection, "backup.target_path")
                .map_err(database_error)?
                .unwrap_or_default()
        };
        let target_path = target_path.trim();
        if target_path.is_empty() {
            return Err(AppError::ValidationError(
                "Backup target path is required before running a backup.".into(),
            ));
        }

        backup::backup_database(&self.path, Path::new(target_path))?;

        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        transaction
            .execute(
                r#"
                INSERT INTO app_settings (key, value)
                VALUES ('backup.last_successful', datetime('now', 'localtime'))
                ON CONFLICT(key) DO UPDATE SET value = excluded.value
                "#,
                [],
            )
            .map_err(database_error)?;
        write_setting(
            &transaction,
            "backup.status",
            backup_status_key(target_path),
        )
        .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;

        self.load_snapshot()
    }

    pub fn update_language(&self, language: Language) -> AppResult<()> {
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(database_error)?;

        write_setting(&transaction, "app.language", language_key(&language))
            .map_err(database_error)?;

        transaction.commit().map_err(database_error)?;
        Ok(())
    }

    pub fn remove_inventory_item(&self, item_id: String) -> AppResult<AppSnapshot> {
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        let item = get_item_record(&transaction, &item_id)?;

        if let Some(barcode_path) = item.barcode.as_deref() {
            delete_file_if_exists(Path::new(barcode_path))?;
        }

        transaction
            .execute(
                "DELETE FROM low_stock_alerts WHERE item_id = ?1",
                params![item.id.clone()],
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "DELETE FROM inventory_movements WHERE item_id = ?1",
                params![item.id.clone()],
            )
            .map_err(database_error)?;
        transaction
            .execute(
                "DELETE FROM inventory_items WHERE id = ?1",
                params![item.id],
            )
            .map_err(database_error)?;

        transaction.commit().map_err(database_error)?;
        self.load_snapshot()
    }

    pub fn add_personnel(&self, input: AddPersonnelInput) -> AppResult<AppSnapshot> {
        let name = require_text(&input.name, "Personnel name")?;
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(database_error)?;

        let existing: Option<String> = transaction
            .query_row(
                "SELECT id FROM personnel WHERE lower(name) = lower(?1)",
                params![name],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error)?;
        if existing.is_some() {
            return Err(AppError::ValidationError(
                "Personnel name already exists.".into(),
            ));
        }

        let personnel_id = generate_id("person");
        transaction
            .execute(
                "INSERT INTO personnel (id, name, created_at, updated_at) VALUES (?1, ?2, datetime('now', 'localtime'), datetime('now', 'localtime'))",
                params![personnel_id, name],
            )
            .map_err(database_error)?;

        transaction.commit().map_err(database_error)?;
        self.load_snapshot()
    }

    pub fn remove_personnel(&self, personnel_id: String) -> AppResult<AppSnapshot> {
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(database_error)?;

        let deleted = transaction
            .execute("DELETE FROM personnel WHERE id = ?1", params![personnel_id])
            .map_err(database_error)?;
        if deleted == 0 {
            return Err(AppError::NotFound("Personnel record not found.".into()));
        }

        transaction.commit().map_err(database_error)?;
        self.load_snapshot()
    }

    pub fn load_lan_access_settings(&self) -> AppResult<LanAccessSettings> {
        let connection = self.open_connection()?;
        let enabled = read_setting(&connection, "lan.enabled").map_err(database_error)?;
        let port = read_setting(&connection, "lan.port").map_err(database_error)?;
        let access_key = read_setting(&connection, "lan.access_key").map_err(database_error)?;
        let primary_url = read_setting(&connection, "lan.primary_url").map_err(database_error)?;

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

    pub fn save_lan_access_settings(&self, settings: &LanAccessSettings) -> AppResult<()> {
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(database_error)?;

        write_setting(
            &transaction,
            "lan.enabled",
            if settings.enabled { "true" } else { "false" },
        )
        .map_err(database_error)?;
        write_setting(&transaction, "lan.port", &settings.port.to_string())
            .map_err(database_error)?;
        write_setting(&transaction, "lan.access_key", &settings.access_key)
            .map_err(database_error)?;
        write_setting(&transaction, "lan.primary_url", &settings.primary_url)
            .map_err(database_error)?;

        transaction.commit().map_err(database_error)?;
        Ok(())
    }
    fn open_connection(&self) -> AppResult<Connection> {
        let connection = Connection::open(&self.path).map_err(database_error)?;
        connection
            .execute_batch("PRAGMA foreign_keys = ON;")
            .map_err(database_error)?;
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

    fn ensure_qr_assets(&self) -> AppResult<()> {
        fs::create_dir_all(self.qr_code_dir()).map_err(AppError::from)?;
        let desired_signature = self.qr_payload_signature()?;
        let mut connection = self.open_connection()?;
        let transaction = connection.transaction().map_err(database_error)?;
        let current_signature = read_setting(&transaction, "qr.payload_signature")
            .map_err(database_error)?
            .unwrap_or_default();
        let signature_changed = current_signature != desired_signature;
        let mut statement = transaction
            .prepare("SELECT id, sku, COALESCE(barcode, '') FROM inventory_items ORDER BY id")
            .map_err(database_error)?;
        let items = statement
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, String>(2)?,
                ))
            })
            .map_err(database_error)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(database_error)?;
        drop(statement);

        for (item_id, sku, barcode) in items {
            let expected_path = self.qr_code_path(&item_id);
            let expected_value = path_to_db_value(&expected_path);
            let needs_regeneration =
                signature_changed || barcode != expected_value || !expected_path.exists();

            if needs_regeneration {
                let qr_payload = self.qr_payload_for_item(&item_id, &sku)?;
                write_item_qr_png(&expected_path, &qr_payload)?;
                transaction
                    .execute(
                        "UPDATE inventory_items SET barcode = ?1 WHERE id = ?2",
                        params![expected_value, item_id],
                    )
                    .map_err(database_error)?;
                if !barcode.is_empty() && barcode != expected_value {
                    delete_file_if_exists(Path::new(&barcode))?;
                }
            }
        }

        write_setting(&transaction, "qr.payload_signature", &desired_signature)
            .map_err(database_error)?;
        transaction.commit().map_err(database_error)?;
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

fn resolve_sku(transaction: &Transaction<'_>, requested_sku: &str) -> AppResult<String> {
    if !requested_sku.is_empty() {
        let existing: Option<String> = transaction
            .query_row(
                "SELECT id FROM inventory_items WHERE lower(sku) = lower(?1)",
                params![requested_sku],
                |row| row.get(0),
            )
            .optional()
            .map_err(database_error)?;
        if existing.is_some() {
            return Err(AppError::DuplicateSku("SKU already exists.".into()));
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
            .optional()
            .map_err(database_error)?;
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
) -> AppResult<String> {
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
        .optional()
        .map_err(database_error)?;
    if existing.is_some() {
        return Err(AppError::DuplicateSku("SKU already exists.".into()));
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

fn ensure_supplier(
    transaction: &Transaction<'_>,
    supplier_name: &str,
) -> rusqlite::Result<Option<String>> {
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

fn ensure_location(
    transaction: &Transaction<'_>,
    location_name: &str,
) -> rusqlite::Result<Option<String>> {
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

fn get_item_record(transaction: &Transaction<'_>, item_id: &str) -> AppResult<ItemRecord> {
    transaction
        .query_row(
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
        .map_err(|error| match error {
            rusqlite::Error::QueryReturnedNoRows => AppError::NotFound("Item not found.".into()),
            _ => database_error(error),
        })
}

fn item_label(item: &ItemRecord) -> String {
    format!("{} ({})", item.name, item.sku)
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
            "SELECT id FROM low_stock_alerts WHERE item_id = ?1 AND status = 'open' ORDER BY triggered_at DESC LIMIT 1",
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
                params![
                    generate_id("alert"),
                    item_id,
                    reorder_quantity,
                    current_quantity
                ],
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

fn require_text<'a>(value: &'a str, label: &str) -> AppResult<&'a str> {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return Err(AppError::ValidationError(format!("{} is required.", label)));
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
    fn qr_payload_for_item(&self, item_id: &str, sku: &str) -> AppResult<String> {
        let settings = self.load_lan_access_settings()?;
        if settings.enabled && !settings.primary_url.trim().is_empty() {
            return Ok(format!(
                "{}/issue/{}",
                settings.primary_url.trim_end_matches('/'),
                item_id
            ));
        }

        Ok(sku.to_string())
    }

    fn qr_payload_signature(&self) -> AppResult<String> {
        let settings = self.load_lan_access_settings()?;
        if settings.enabled && !settings.primary_url.trim().is_empty() {
            return Ok(format!(
                "issue:{}",
                settings.primary_url.trim_end_matches('/')
            ));
        }

        Ok("sku".to_string())
    }
}

fn barcode_path_to_data_url(value: &str) -> AppResult<String> {
    if value.trim().is_empty() {
        return Ok(String::new());
    }
    qr::png_file_to_data_url(Path::new(value)).map_err(AppError::DatabaseError)
}

fn path_to_db_value(path: &Path) -> String {
    path.to_string_lossy().into_owned()
}

fn write_item_qr_png(path: &Path, sku: &str) -> AppResult<()> {
    qr::write_qr_png(path, sku).map_err(AppError::DatabaseError)
}

fn delete_file_if_exists(path: &Path) -> AppResult<()> {
    match fs::remove_file(path) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => Ok(()),
        Err(error) => Err(AppError::from(error)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::models::BatchIssueItem;
    use std::path::PathBuf;
    use std::process;
    use std::time::Duration;

    use rusqlite::{params, Connection, OptionalExtension};

    struct TestDb {
        root_dir: PathBuf,
        db_path: PathBuf,
        db: InventoryDb,
    }

    struct MovementRecord {
        movement_type: String,
        quantity: i64,
        previous_quantity: i64,
        new_quantity: i64,
        performed_by: Option<String>,
    }

    struct AlertRecord {
        id: String,
        threshold_quantity: i64,
        quantity_at_trigger: i64,
        status: String,
        resolved_at: Option<String>,
    }

    impl TestDb {
        fn connection(&self) -> Connection {
            let connection = Connection::open(&self.db_path).expect("open test connection");
            connection
                .execute_batch("PRAGMA foreign_keys = ON;")
                .expect("enable foreign keys");
            connection
        }
    }

    impl Drop for TestDb {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.root_dir);
        }
    }

    fn setup_test_db() -> TestDb {
        let root_dir = std::env::temp_dir().join(format!(
            "open-inventory-tests-{}-{}",
            process::id(),
            generate_id("db")
        ));
        fs::create_dir_all(&root_dir).expect("create test directory");

        let db_path = root_dir.join("inventory-monitor.db");
        let db = InventoryDb::new(db_path.clone());
        db.initialize().expect("initialize test database");

        TestDb {
            root_dir,
            db_path,
            db,
        }
    }

    fn create_item(
        test_db: &TestDb,
        sku: &str,
        name: &str,
        reorder_quantity: i64,
        initial_quantity: i64,
    ) -> String {
        let result = test_db
            .db
            .create_inventory_item(CreateInventoryItemInput {
                sku: sku.to_string(),
                name: name.to_string(),
                category: "Hardware".to_string(),
                location: "Main Shelf".to_string(),
                unit: "pcs".to_string(),
                supplier: "ACME".to_string(),
                reorder_quantity,
                initial_quantity,
            })
            .expect("create inventory item");

        result
            .snapshot
            .items
            .into_iter()
            .find(|item| item.sku == sku)
            .expect("find created item in snapshot")
            .id
    }

    fn query_item_quantity_and_status(connection: &Connection, item_id: &str) -> (i64, String) {
        connection
            .query_row(
                "SELECT current_quantity, status FROM inventory_items WHERE id = ?1",
                params![item_id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("query item quantity and status")
    }

    fn query_latest_movement(connection: &Connection, item_id: &str) -> MovementRecord {
        connection
            .query_row(
                r#"
                SELECT movement_type, quantity, previous_quantity, new_quantity, performed_by
                FROM inventory_movements
                WHERE item_id = ?1
                ORDER BY rowid DESC
                LIMIT 1
                "#,
                params![item_id],
                |row| {
                    Ok(MovementRecord {
                        movement_type: row.get(0)?,
                        quantity: row.get(1)?,
                        previous_quantity: row.get(2)?,
                        new_quantity: row.get(3)?,
                        performed_by: row.get(4)?,
                    })
                },
            )
            .expect("query latest movement")
    }

    fn count_rows(connection: &Connection, table: &str, item_id: &str) -> i64 {
        let query = format!("SELECT COUNT(*) FROM {table} WHERE item_id = ?1");
        connection
            .query_row(&query, params![item_id], |row| row.get(0))
            .expect("count rows")
    }

    fn query_latest_alert(connection: &Connection, item_id: &str) -> AlertRecord {
        connection
            .query_row(
                r#"
                SELECT id, threshold_quantity, quantity_at_trigger, status, resolved_at
                FROM low_stock_alerts
                WHERE item_id = ?1
                ORDER BY rowid DESC
                LIMIT 1
                "#,
                params![item_id],
                |row| {
                    Ok(AlertRecord {
                        id: row.get(0)?,
                        threshold_quantity: row.get(1)?,
                        quantity_at_trigger: row.get(2)?,
                        status: row.get(3)?,
                        resolved_at: row.get(4)?,
                    })
                },
            )
            .expect("query latest alert")
    }

    fn query_optional_alert(connection: &Connection, alert_id: &str) -> Option<AlertRecord> {
        connection
            .query_row(
                r#"
                SELECT id, threshold_quantity, quantity_at_trigger, status, resolved_at
                FROM low_stock_alerts
                WHERE id = ?1
                "#,
                params![alert_id],
                |row| {
                    Ok(AlertRecord {
                        id: row.get(0)?,
                        threshold_quantity: row.get(1)?,
                        quantity_at_trigger: row.get(2)?,
                        status: row.get(3)?,
                        resolved_at: row.get(4)?,
                    })
                },
            )
            .optional()
            .expect("query alert by id")
    }

    fn err_string<T>(result: AppResult<T>) -> String {
        match result {
            Ok(_) => panic!("expected operation to fail"),
            Err(error) => error.to_string(),
        }
    }

    #[test]
    fn receive_stock_updates_quantity_movement_and_status() {
        let test_db = setup_test_db();
        let item_id = create_item(&test_db, "SKU-RECEIVE", "Receive Widget", 0, 0);

        test_db
            .db
            .receive_stock(StockMutationInput {
                item_id: item_id.clone(),
                quantity: 5,
                reason: "Restock".to_string(),
                performed_by: "Casey".to_string(),
            })
            .expect("receive stock");

        let connection = test_db.connection();
        let (quantity, status) = query_item_quantity_and_status(&connection, &item_id);
        assert_eq!(quantity, 5);
        assert_eq!(status, "in_stock");

        let movement = query_latest_movement(&connection, &item_id);
        assert_eq!(movement.movement_type, "receive");
        assert_eq!(movement.quantity, 5);
        assert_eq!(movement.previous_quantity, 0);
        assert_eq!(movement.new_quantity, 5);
        assert_eq!(movement.performed_by.as_deref(), Some("Casey"));
    }

    #[test]
    fn issue_material_updates_quantity_and_creates_movement() {
        let test_db = setup_test_db();
        let item_id = create_item(&test_db, "SKU-ISSUE", "Issue Widget", 3, 8);

        test_db
            .db
            .issue_material(StockMutationInput {
                item_id: item_id.clone(),
                quantity: 3,
                reason: "Work order".to_string(),
                performed_by: "Alex".to_string(),
            })
            .expect("issue material");

        let connection = test_db.connection();
        let (quantity, status) = query_item_quantity_and_status(&connection, &item_id);
        assert_eq!(quantity, 5);
        assert_eq!(status, "in_stock");

        let movement = query_latest_movement(&connection, &item_id);
        assert_eq!(movement.movement_type, "issue");
        assert_eq!(movement.quantity, 3);
        assert_eq!(movement.previous_quantity, 8);
        assert_eq!(movement.new_quantity, 5);
        assert_eq!(movement.performed_by.as_deref(), Some("Alex"));
    }

    #[test]
    fn issue_material_rejects_quantity_above_available_stock() {
        let test_db = setup_test_db();
        let item_id = create_item(&test_db, "SKU-OVERISSUE", "Limited Widget", 2, 4);

        let error = err_string(test_db.db.issue_material(StockMutationInput {
            item_id: item_id.clone(),
            quantity: 5,
            reason: "Over issue".to_string(),
            performed_by: "Alex".to_string(),
        }));

        assert!(error.contains("Cannot issue 5 units"));

        let connection = test_db.connection();
        let (quantity, _) = query_item_quantity_and_status(&connection, &item_id);
        assert_eq!(quantity, 4);
        assert_eq!(count_rows(&connection, "inventory_movements", &item_id), 1);
    }

    #[test]
    fn batch_issue_happy_path() {
        let test_db = setup_test_db();
        let item_id_1 = create_item(&test_db, "SKU-BATCH-1", "Batch Widget One", 5, 10);
        let item_id_2 = create_item(&test_db, "SKU-BATCH-2", "Batch Widget Two", 2, 8);
        let item_id_3 = create_item(&test_db, "SKU-BATCH-3", "Batch Widget Three", 1, 2);

        let snapshot = test_db
            .db
            .batch_issue_material(BatchIssueMaterialInput {
                items: vec![
                    BatchIssueItem {
                        item_id: item_id_1.clone(),
                        quantity: 6,
                    },
                    BatchIssueItem {
                        item_id: item_id_2.clone(),
                        quantity: 1,
                    },
                    BatchIssueItem {
                        item_id: item_id_3.clone(),
                        quantity: 2,
                    },
                ],
                performed_by: "Morgan".to_string(),
                reason: "WO-42".to_string(),
            })
            .expect("batch issue materials");

        let item_1 = snapshot
            .items
            .iter()
            .find(|item| item.id == item_id_1)
            .expect("find first item");
        let item_2 = snapshot
            .items
            .iter()
            .find(|item| item.id == item_id_2)
            .expect("find second item");
        let item_3 = snapshot
            .items
            .iter()
            .find(|item| item.id == item_id_3)
            .expect("find third item");
        assert_eq!(item_1.current_quantity, 4);
        assert_eq!(item_1.status, StockStatus::LowStock);
        assert_eq!(item_2.current_quantity, 7);
        assert_eq!(item_2.status, StockStatus::InStock);
        assert_eq!(item_3.current_quantity, 0);
        assert_eq!(item_3.status, StockStatus::OutOfStock);

        let connection = test_db.connection();
        assert_eq!(
            count_rows(&connection, "inventory_movements", &item_id_1),
            2
        );
        assert_eq!(
            count_rows(&connection, "inventory_movements", &item_id_2),
            2
        );
        assert_eq!(
            count_rows(&connection, "inventory_movements", &item_id_3),
            2
        );
        assert_eq!(count_rows(&connection, "low_stock_alerts", &item_id_1), 1);
        assert_eq!(count_rows(&connection, "low_stock_alerts", &item_id_2), 0);
        assert_eq!(count_rows(&connection, "low_stock_alerts", &item_id_3), 1);

        let movement_1 = query_latest_movement(&connection, &item_id_1);
        let movement_2 = query_latest_movement(&connection, &item_id_2);
        let movement_3 = query_latest_movement(&connection, &item_id_3);
        assert_eq!(movement_1.movement_type, "issue");
        assert_eq!(movement_2.movement_type, "issue");
        assert_eq!(movement_3.movement_type, "issue");
        assert_eq!(movement_1.performed_by.as_deref(), Some("Morgan"));
        assert_eq!(movement_2.performed_by.as_deref(), Some("Morgan"));
        assert_eq!(movement_3.performed_by.as_deref(), Some("Morgan"));
    }

    #[test]
    fn batch_issue_partial_failure_rolls_back() {
        let test_db = setup_test_db();
        let item_id_1 = create_item(&test_db, "SKU-BATCH-ROLL-1", "Rollback Widget One", 2, 6);
        let item_id_2 = create_item(&test_db, "SKU-BATCH-ROLL-2", "Rollback Widget Two", 2, 3);
        let item_id_3 = create_item(&test_db, "SKU-BATCH-ROLL-3", "Rollback Widget Three", 2, 7);

        let error = err_string(test_db.db.batch_issue_material(BatchIssueMaterialInput {
            items: vec![
                BatchIssueItem {
                    item_id: item_id_1.clone(),
                    quantity: 1,
                },
                BatchIssueItem {
                    item_id: item_id_2.clone(),
                    quantity: 10,
                },
                BatchIssueItem {
                    item_id: item_id_3.clone(),
                    quantity: 2,
                },
            ],
            performed_by: "Morgan".to_string(),
            reason: "Rollback test".to_string(),
        }));

        assert!(error.contains("Rollback Widget Two"));
        assert!(error.contains("only 3 are available"));

        let connection = test_db.connection();
        assert_eq!(query_item_quantity_and_status(&connection, &item_id_1).0, 6);
        assert_eq!(query_item_quantity_and_status(&connection, &item_id_2).0, 3);
        assert_eq!(query_item_quantity_and_status(&connection, &item_id_3).0, 7);
        assert_eq!(
            count_rows(&connection, "inventory_movements", &item_id_1),
            1
        );
        assert_eq!(
            count_rows(&connection, "inventory_movements", &item_id_2),
            1
        );
        assert_eq!(
            count_rows(&connection, "inventory_movements", &item_id_3),
            1
        );
        assert_eq!(count_rows(&connection, "low_stock_alerts", &item_id_1), 0);
        assert_eq!(count_rows(&connection, "low_stock_alerts", &item_id_2), 0);
        assert_eq!(count_rows(&connection, "low_stock_alerts", &item_id_3), 0);
    }

    #[test]
    fn batch_issue_empty_input_rejected() {
        let test_db = setup_test_db();

        let error = err_string(test_db.db.batch_issue_material(BatchIssueMaterialInput {
            items: Vec::new(),
            performed_by: "Morgan".to_string(),
            reason: "Empty".to_string(),
        }));

        assert!(error.contains("at least one item"));
    }

    #[test]
    fn low_stock_alert_triggers_once_when_quantity_reaches_threshold() {
        let test_db = setup_test_db();
        let item_id = create_item(&test_db, "SKU-ALERT", "Alert Widget", 10, 12);

        test_db
            .db
            .issue_material(StockMutationInput {
                item_id: item_id.clone(),
                quantity: 2,
                reason: "First issue".to_string(),
                performed_by: "Taylor".to_string(),
            })
            .expect("issue to threshold");

        let connection = test_db.connection();
        let alert = query_latest_alert(&connection, &item_id);
        assert_eq!(alert.threshold_quantity, 10);
        assert_eq!(alert.quantity_at_trigger, 10);
        assert_eq!(alert.status, "open");
        assert_eq!(count_rows(&connection, "low_stock_alerts", &item_id), 1);

        drop(connection);

        test_db
            .db
            .issue_material(StockMutationInput {
                item_id: item_id.clone(),
                quantity: 1,
                reason: "Second issue".to_string(),
                performed_by: "Taylor".to_string(),
            })
            .expect("issue again below threshold");

        let connection = test_db.connection();
        assert_eq!(count_rows(&connection, "low_stock_alerts", &item_id), 1);
        let alert = query_latest_alert(&connection, &item_id);
        assert_eq!(alert.status, "open");
    }

    #[test]
    fn receiving_stock_above_threshold_resolves_open_alert() {
        let test_db = setup_test_db();
        let item_id = create_item(&test_db, "SKU-RESOLVE", "Resolve Widget", 10, 12);

        test_db
            .db
            .issue_material(StockMutationInput {
                item_id: item_id.clone(),
                quantity: 2,
                reason: "Drop to threshold".to_string(),
                performed_by: "Jordan".to_string(),
            })
            .expect("create open alert");

        let connection = test_db.connection();
        let original_alert = query_latest_alert(&connection, &item_id);
        drop(connection);

        test_db
            .db
            .receive_stock(StockMutationInput {
                item_id: item_id.clone(),
                quantity: 5,
                reason: "Restock above threshold".to_string(),
                performed_by: "Jordan".to_string(),
            })
            .expect("receive stock above threshold");

        let connection = test_db.connection();
        let resolved_alert = query_optional_alert(&connection, &original_alert.id)
            .expect("alert should still exist");
        assert_eq!(resolved_alert.status, "resolved");
        assert!(resolved_alert.resolved_at.is_some());
    }

    #[test]
    fn get_item_movements_returns_latest_first_with_created_at() {
        let test_db = setup_test_db();
        let item_id = create_item(&test_db, "SKU-MOVES", "Movement Widget", 2, 5);

        test_db
            .db
            .issue_material(StockMutationInput {
                item_id: item_id.clone(),
                quantity: 1,
                reason: "Issue first".to_string(),
                performed_by: "Jamie".to_string(),
            })
            .expect("issue material");

        std::thread::sleep(Duration::from_millis(1100));

        test_db
            .db
            .receive_stock(StockMutationInput {
                item_id: item_id.clone(),
                quantity: 3,
                reason: "Receive second".to_string(),
                performed_by: "Jamie".to_string(),
            })
            .expect("receive stock");

        let movements = test_db
            .db
            .get_item_movements(&item_id)
            .expect("get item movements");

        assert_eq!(movements.len(), 3);
        assert_eq!(movements[0].movement_type, "receive");
        assert_eq!(movements[0].created_at.len() > 0, true);
        assert_eq!(movements[1].movement_type, "issue");
        assert_eq!(movements[1].reason.as_deref(), Some("Issue first"));
    }

    #[test]
    fn create_inventory_item_enforces_case_insensitive_unique_sku() {
        let test_db = setup_test_db();
        create_item(&test_db, "SKU-UNIQUE", "First Widget", 5, 1);

        let error = err_string(test_db.db.create_inventory_item(CreateInventoryItemInput {
            sku: "sku-unique".to_string(),
            name: "Second Widget".to_string(),
            category: "Hardware".to_string(),
            location: "Main Shelf".to_string(),
            unit: "pcs".to_string(),
            supplier: "ACME".to_string(),
            reorder_quantity: 5,
            initial_quantity: 0,
        }));

        assert!(error.contains("SKU already exists"));
    }

    #[test]
    fn create_inventory_item_validates_required_fields() {
        let test_db = setup_test_db();

        let name_error = err_string(test_db.db.create_inventory_item(CreateInventoryItemInput {
            sku: "SKU-NAME".to_string(),
            name: "   ".to_string(),
            category: "Hardware".to_string(),
            location: "Main Shelf".to_string(),
            unit: "pcs".to_string(),
            supplier: "ACME".to_string(),
            reorder_quantity: 1,
            initial_quantity: 0,
        }));
        assert!(name_error.contains("Item name is required"));

        let category_error =
            err_string(test_db.db.create_inventory_item(CreateInventoryItemInput {
                sku: "SKU-CATEGORY".to_string(),
                name: "Widget".to_string(),
                category: "  ".to_string(),
                location: "Main Shelf".to_string(),
                unit: "pcs".to_string(),
                supplier: "ACME".to_string(),
                reorder_quantity: 1,
                initial_quantity: 0,
            }));
        assert!(category_error.contains("Category is required"));

        let unit_error = err_string(test_db.db.create_inventory_item(CreateInventoryItemInput {
            sku: "SKU-UNIT".to_string(),
            name: "Widget".to_string(),
            category: "Hardware".to_string(),
            location: "Main Shelf".to_string(),
            unit: " ".to_string(),
            supplier: "ACME".to_string(),
            reorder_quantity: 1,
            initial_quantity: 0,
        }));
        assert!(unit_error.contains("Unit is required"));
    }

    #[test]
    fn create_inventory_item_sets_initial_quantity_correctly() {
        let test_db = setup_test_db();
        let item_id = create_item(&test_db, "SKU-INITIAL", "Initial Widget", 5, 7);

        let connection = test_db.connection();
        let (quantity, status) = query_item_quantity_and_status(&connection, &item_id);
        assert_eq!(quantity, 7);
        assert_eq!(status, "in_stock");

        let movement = query_latest_movement(&connection, &item_id);
        assert_eq!(movement.movement_type, "receive");
        assert_eq!(movement.previous_quantity, 0);
        assert_eq!(movement.new_quantity, 7);
    }

    #[test]
    fn qr_payload_omits_access_key_when_lan_access_is_enabled() {
        let test_db = setup_test_db();
        let settings = LanAccessSettings {
            enabled: true,
            port: 4123,
            access_key: "super-secret-key".to_string(),
            primary_url: "http://192.168.1.20:4123".to_string(),
        };

        test_db
            .db
            .save_lan_access_settings(&settings)
            .expect("save lan settings");

        let payload = test_db
            .db
            .qr_payload_for_item("item-123", "SKU-123")
            .expect("build qr payload");

        assert_eq!(payload, "http://192.168.1.20:4123/issue/item-123");
    }

    #[test]
    fn qr_payload_signature_does_not_change_when_access_key_rotates() {
        let test_db = setup_test_db();
        let mut settings = LanAccessSettings {
            enabled: true,
            port: 4123,
            access_key: "first-key".to_string(),
            primary_url: "http://192.168.1.20:4123".to_string(),
        };

        test_db
            .db
            .save_lan_access_settings(&settings)
            .expect("save initial lan settings");
        let initial_signature = test_db
            .db
            .qr_payload_signature()
            .expect("build initial signature");

        settings.access_key = "rotated-key".to_string();
        test_db
            .db
            .save_lan_access_settings(&settings)
            .expect("save rotated lan settings");
        let rotated_signature = test_db
            .db
            .qr_payload_signature()
            .expect("build rotated signature");

        assert_eq!(initial_signature, rotated_signature);
        assert_eq!(initial_signature, "issue:http://192.168.1.20:4123");
    }

    #[test]
    fn update_inventory_item_changes_fields_without_touching_quantity() {
        let test_db = setup_test_db();
        let item_id = create_item(&test_db, "SKU-UPDATE", "Original Widget", 2, 7);

        test_db
            .db
            .update_inventory_item(UpdateInventoryItemInput {
                item_id: item_id.clone(),
                sku: "SKU-UPDATE".to_string(),
                name: "Updated Widget".to_string(),
                category: "Electrical".to_string(),
                location: "Secondary Shelf".to_string(),
                unit: "pcs".to_string(),
                supplier: "Beta Supply".to_string(),
                reorder_quantity: 4,
            })
            .expect("update inventory item");

        let connection = test_db.connection();
        let (quantity, _) = query_item_quantity_and_status(&connection, &item_id);
        assert_eq!(quantity, 7);

        let updated = test_db
            .db
            .load_snapshot()
            .expect("load snapshot")
            .items
            .into_iter()
            .find(|item| item.id == item_id)
            .expect("find updated item");
        assert_eq!(updated.name, "Updated Widget");
        assert_eq!(updated.category, "Electrical");
        assert_eq!(updated.location, "Secondary Shelf");
        assert_eq!(updated.current_quantity, 7);
        assert_eq!(updated.reorder_quantity, 4);
    }

    #[test]
    fn load_snapshot_still_returns_inventory_items_with_expected_quantities() {
        let test_db = setup_test_db();
        let item_id = create_item(&test_db, "SKU-SNAPSHOT", "Snapshot Widget", 3, 7);

        let snapshot = test_db.db.load_snapshot().expect("load snapshot");
        let item = snapshot
            .items
            .into_iter()
            .find(|item| item.id == item_id)
            .expect("find snapshot item");

        assert_eq!(item.sku, "SKU-SNAPSHOT");
        assert_eq!(item.reorder_quantity, 3);
        assert_eq!(item.current_quantity, 7);
    }

    #[test]
    fn update_inventory_item_enforces_case_insensitive_unique_sku() {
        let test_db = setup_test_db();
        create_item(&test_db, "SKU-PRIMARY", "Primary Widget", 2, 1);
        let second_item_id = create_item(&test_db, "SKU-SECONDARY", "Secondary Widget", 2, 1);

        let error = err_string(test_db.db.update_inventory_item(UpdateInventoryItemInput {
            item_id: second_item_id,
            sku: "sku-primary".to_string(),
            name: "Secondary Widget".to_string(),
            category: "Hardware".to_string(),
            location: "Main Shelf".to_string(),
            unit: "pcs".to_string(),
            supplier: "ACME".to_string(),
            reorder_quantity: 2,
        }));

        assert!(error.contains("SKU already exists"));
    }

    #[test]
    fn remove_inventory_item_deletes_item_and_related_records() {
        let test_db = setup_test_db();
        let item_id = create_item(&test_db, "SKU-REMOVE", "Remove Widget", 10, 15);

        test_db
            .db
            .issue_material(StockMutationInput {
                item_id: item_id.clone(),
                quantity: 10,
                reason: "Create alert".to_string(),
                performed_by: "Morgan".to_string(),
            })
            .expect("issue material to create movement and alert");

        let connection = test_db.connection();
        assert_eq!(count_rows(&connection, "inventory_movements", &item_id), 2);
        assert_eq!(count_rows(&connection, "low_stock_alerts", &item_id), 1);
        drop(connection);

        test_db
            .db
            .remove_inventory_item(item_id.clone())
            .expect("remove inventory item");

        let connection = test_db.connection();
        let item_count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM inventory_items WHERE id = ?1",
                params![item_id],
                |row| row.get(0),
            )
            .expect("count items");
        assert_eq!(item_count, 0);
        assert_eq!(count_rows(&connection, "inventory_movements", &item_id), 0);
        assert_eq!(count_rows(&connection, "low_stock_alerts", &item_id), 0);
    }

    #[test]
    fn add_personnel_enforces_case_insensitive_name_uniqueness() {
        let test_db = setup_test_db();

        let snapshot = test_db
            .db
            .add_personnel(AddPersonnelInput {
                name: "Jamie".to_string(),
            })
            .expect("add personnel");
        assert_eq!(snapshot.personnel.len(), 1);
        assert_eq!(snapshot.personnel[0].name, "Jamie");

        let error = err_string(test_db.db.add_personnel(AddPersonnelInput {
            name: "jamie".to_string(),
        }));
        assert!(error.contains("Personnel name already exists"));
    }

    #[test]
    fn remove_personnel_deletes_record() {
        let test_db = setup_test_db();

        let snapshot = test_db
            .db
            .add_personnel(AddPersonnelInput {
                name: "Robin".to_string(),
            })
            .expect("add personnel");
        let personnel_id = snapshot.personnel[0].id.clone();

        let snapshot = test_db
            .db
            .remove_personnel(personnel_id.clone())
            .expect("remove personnel");
        assert!(snapshot.personnel.is_empty());

        let connection = test_db.connection();
        let count: i64 = connection
            .query_row(
                "SELECT COUNT(*) FROM personnel WHERE id = ?1",
                params![personnel_id],
                |row| row.get(0),
            )
            .expect("count personnel rows");
        assert_eq!(count, 0);
    }
}
