use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize)]
pub enum Language {
    #[serde(rename = "en")]
    En,
    #[serde(rename = "zh-CN")]
    ZhCn,
}

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
    Resolved,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InventoryItem {
    pub id: String,
    pub sku: String,
    pub qr_code_data_url: String,
    pub name: String,
    pub category: String,
    pub location: String,
    pub unit: String,
    pub supplier: String,
    pub current_quantity: i64,
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
pub struct PersonnelMember {
    pub id: String,
    pub name: String,
}

#[derive(Clone, Serialize, Deserialize)]
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
    pub personnel: Vec<PersonnelMember>,
    pub backup_plan: BackupPlan,
    pub language: Language,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PublicIssueContext {
    pub item: InventoryItem,
    pub personnel: Vec<PersonnelMember>,
    pub language: Language,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum LanAccessStatus {
    Running,
    Stopped,
    Error,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LanAccessState {
    pub enabled: bool,
    pub port: u16,
    pub access_key: String,
    pub urls: Vec<String>,
    pub status: LanAccessStatus,
    pub status_message: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateBackupPlanInput {
    pub target_path: String,
    pub target_type: BackupTargetType,
    pub schedule: String,
    pub retention: String,
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
pub struct UpdateInventoryItemInput {
    pub item_id: String,
    pub sku: String,
    pub name: String,
    pub category: String,
    pub location: String,
    pub unit: String,
    pub supplier: String,
    pub reorder_quantity: i64,
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
pub struct AddPersonnelInput {
    pub name: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLanAccessInput {
    pub enabled: bool,
    pub port: u16,
}
