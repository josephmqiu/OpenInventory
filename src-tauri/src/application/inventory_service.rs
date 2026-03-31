use crate::domain::error::{AppError, AppResult};
use crate::domain::models::{
    AddPersonnelInput, AppSnapshot, CreateInventoryItemInput, Language, PublicIssueContext,
    StockMutationInput, UpdateBackupPlanInput, UpdateInventoryItemInput,
};
use crate::infrastructure::db::{InventoryDb, MutationResult};

pub fn initialize(db: &InventoryDb) -> AppResult<()> {
    db.initialize()
}

pub fn load_snapshot(db: &InventoryDb) -> AppResult<AppSnapshot> {
    db.load_snapshot()
}

pub fn load_public_issue_context(db: &InventoryDb, item_id: &str) -> AppResult<PublicIssueContext> {
    let snapshot = db.load_snapshot()?;
    let AppSnapshot {
        items,
        personnel,
        language,
        ..
    } = snapshot;
    let item = items
        .into_iter()
        .find(|entry| entry.id == item_id)
        .ok_or_else(|| AppError::NotFound("Item not found.".into()))?;

    Ok(PublicIssueContext {
        item,
        personnel,
        language,
    })
}

pub fn create_inventory_item(
    db: &InventoryDb,
    input: CreateInventoryItemInput,
) -> AppResult<MutationResult> {
    db.create_inventory_item(input)
}

pub fn update_inventory_item(
    db: &InventoryDb,
    input: UpdateInventoryItemInput,
) -> AppResult<MutationResult> {
    db.update_inventory_item(input)
}

pub fn receive_stock(db: &InventoryDb, input: StockMutationInput) -> AppResult<MutationResult> {
    db.receive_stock(input)
}

pub fn issue_material(db: &InventoryDb, input: StockMutationInput) -> AppResult<MutationResult> {
    db.issue_material(input)
}

pub fn issue_material_public(
    db: &InventoryDb,
    input: StockMutationInput,
) -> AppResult<PublicIssueContext> {
    let item_id = input.item_id.clone();
    let result = db.issue_material(input)?;
    let AppSnapshot {
        items,
        personnel,
        language,
        ..
    } = result.snapshot;
    let item = items
        .into_iter()
        .find(|entry| entry.id == item_id)
        .ok_or_else(|| AppError::NotFound("Item not found after issuing material.".into()))?;

    Ok(PublicIssueContext {
        item,
        personnel,
        language,
    })
}

pub fn update_backup_plan(
    db: &InventoryDb,
    input: UpdateBackupPlanInput,
) -> AppResult<AppSnapshot> {
    db.update_backup_plan(input)
}

pub fn backup_now(db: &InventoryDb) -> AppResult<AppSnapshot> {
    db.backup_now()
}

pub fn update_language(db: &InventoryDb, language: Language) -> AppResult<()> {
    db.update_language(language)
}

pub fn remove_inventory_item(db: &InventoryDb, item_id: String) -> AppResult<AppSnapshot> {
    db.remove_inventory_item(item_id)
}

pub fn add_personnel(db: &InventoryDb, input: AddPersonnelInput) -> AppResult<AppSnapshot> {
    db.add_personnel(input)
}

pub fn remove_personnel(db: &InventoryDb, personnel_id: String) -> AppResult<AppSnapshot> {
    db.remove_personnel(personnel_id)
}
