use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum StockStatus {
    InStock,
    LowStock,
    OutOfStock,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AlertStatus {
    Open,
    Acknowledged,
    Resolved,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum RefillOrderStatus {
    Draft,
    Ordered,
    PartiallyReceived,
    Received,
    Cancelled,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryItem {
    pub id: String,
    pub sku: String,
    pub name: String,
    pub category: String,
    pub location: String,
    pub unit: String,
    pub supplier: String,
    pub current_quantity: i64,
    pub min_quantity: i64,
    pub reorder_quantity: i64,
    pub status: StockStatus,
    pub last_updated: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryAlert {
    pub id: String,
    pub item_name: String,
    pub sku: String,
    pub current_quantity: i64,
    pub threshold_quantity: i64,
    pub status: AlertStatus,
    pub triggered_at: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefillOrderLine {
    pub id: String,
    pub item_name: String,
    pub sku: String,
    pub ordered_quantity: i64,
    pub received_quantity: i64,
    pub unit_cost: f64,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefillOrder {
    pub id: String,
    pub order_number: String,
    pub supplier: String,
    pub order_date: String,
    pub expected_delivery_date: String,
    pub received_date: Option<String>,
    pub status: RefillOrderStatus,
    pub total_amount: f64,
    pub created_by: String,
    pub lines: Vec<RefillOrderLine>,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PersonnelMember {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupTargetType {
    LocalFolder,
    LanShare,
    CloudFolder,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum BackupStatus {
    Healthy,
    Warning,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BackupPlan {
    pub target_path: String,
    pub target_type: BackupTargetType,
    pub schedule: String,
    pub retention: String,
    pub last_successful_backup: String,
    pub next_scheduled_backup: String,
    pub status: BackupStatus,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSnapshot {
    pub items: Vec<InventoryItem>,
    pub alerts: Vec<InventoryAlert>,
    pub refill_orders: Vec<RefillOrder>,
    pub personnel: Vec<PersonnelMember>,
    pub backup_plan: BackupPlan,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateInventoryItemInput {
    pub sku: String,
    pub name: String,
    pub category: String,
    pub location: String,
    pub unit: String,
    pub supplier: String,
    pub reorder_quantity: i64,
    pub initial_quantity: i64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StockMutationInput {
    pub item_id: String,
    pub quantity: i64,
    pub reason: String,
    pub performed_by: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateRefillOrderInput {
    pub order_number: String,
    pub supplier: String,
    pub item_id: String,
    pub order_date: String,
    pub expected_delivery_date: String,
    pub created_by: String,
    pub ordered_quantity: i64,
    pub unit_cost: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AddPersonnelInput {
    pub name: String,
}
