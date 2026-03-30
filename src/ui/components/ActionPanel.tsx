import { useEffect, useMemo, useState } from "react";
import {
  DEFAULT_CATEGORIES,
  UNIT_OPTIONS,
  localizeCategory,
  localizeUnit,
  type Dictionary,
} from "../../app/i18n";
import type {
  ActionKind,
  CreateInventoryItemInput,
  InventoryItem,
  Language,
  PersonnelMember,
  StockMutationInput,
  UpdateInventoryItemInput,
} from "../../domain/models";

interface ActionPanelProps {
  action: ActionKind | null;
  activeItemId: string;
  busy: boolean;
  dictionary: Dictionary;
  language: Language;
  items: InventoryItem[];
  personnel: PersonnelMember[];
  onClose: () => void;
  onCreateItem: (input: CreateInventoryItemInput) => Promise<void>;
  onUpdateItem: (input: UpdateInventoryItemInput) => Promise<void>;
  onReceiveStock: (input: StockMutationInput) => Promise<void>;
  onIssueMaterial: (input: StockMutationInput) => Promise<void>;
  onRemoveItem: (itemId: string) => Promise<void>;
  onError: (message: string) => void;
}

const NEW_CATEGORY_VALUE = "__new__";

function toErrorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

function FieldLabel({ label, required, optionalText }: { label: string; required?: boolean; optionalText?: string }) {
  return (
    <span>
      {label}
      {required ? <strong className="field-indicator field-indicator--required"> *</strong> : null}
      {optionalText ? <em className="field-indicator field-indicator--optional"> ({optionalText})</em> : null}
    </span>
  );
}

export function ActionPanel({
  action,
  activeItemId,
  busy,
  dictionary,
  language,
  items,
  personnel,
  onClose,
  onCreateItem,
  onUpdateItem,
  onReceiveStock,
  onIssueMaterial,
  onRemoveItem,
  onError,
}: ActionPanelProps) {
  const [itemForm, setItemForm] = useState<CreateInventoryItemInput>({
    sku: "",
    name: "",
    category: DEFAULT_CATEGORIES[0],
    location: "",
    unit: UNIT_OPTIONS[0],
    supplier: "",
    reorderQuantity: 0,
    initialQuantity: 0,
  });
  const [categoryMode, setCategoryMode] = useState<string>(DEFAULT_CATEGORIES[0]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [stockForm, setStockForm] = useState<StockMutationInput>({
    itemId: "",
    quantity: 0,
    reason: "",
    performedBy: "",
  });
  const [removeItemId, setRemoveItemId] = useState("");

  const categoryOptions = useMemo(() => {
    const existing = items.map((item) => item.category.trim()).filter((value) => value.length > 0);
    return Array.from(new Set([...DEFAULT_CATEGORIES, ...existing])).sort((left, right) => left.localeCompare(right));
  }, [items]);

  const selectedManagedItem = useMemo(
    () => items.find((item) => item.id === activeItemId) ?? null,
    [activeItemId, items],
  );
  const selectedStockItem = useMemo(
    () => items.find((item) => item.id === stockForm.itemId) ?? null,
    [items, stockForm.itemId],
  );
  const selectedRemoveItem = useMemo(
    () => items.find((item) => item.id === removeItemId) ?? null,
    [items, removeItemId],
  );

  useEffect(() => {
    const firstCategory = categoryOptions[0] ?? DEFAULT_CATEGORIES[0];
    const preferredItemId = activeItemId || items[0]?.id || "";
    const preferredPersonnel = personnel[0]?.name ?? "";
    const managedItem = items.find((item) => item.id === activeItemId) ?? null;
    const initialCategory = managedItem?.category ?? firstCategory;
    const nextCategoryMode = categoryOptions.includes(initialCategory) ? initialCategory : NEW_CATEGORY_VALUE;

    setCategoryMode(nextCategoryMode);
    setNewCategoryName(nextCategoryMode === NEW_CATEGORY_VALUE ? initialCategory : "");
    setStockForm({ itemId: preferredItemId, quantity: 0, reason: "", performedBy: preferredPersonnel });
    setRemoveItemId(preferredItemId);
    setItemForm(
      managedItem
        ? {
            sku: managedItem.sku,
            name: managedItem.name,
            category: managedItem.category,
            location: managedItem.location,
            unit: managedItem.unit,
            supplier: managedItem.supplier,
            reorderQuantity: managedItem.reorderQuantity,
            initialQuantity: managedItem.currentQuantity,
          }
        : {
            sku: "",
            name: "",
            category: firstCategory,
            location: "",
            unit: UNIT_OPTIONS[0],
            supplier: "",
            reorderQuantity: 0,
            initialQuantity: 0,
          },
    );
  }, [action, activeItemId, categoryOptions, items, personnel]);

  if (!action) {
    return null;
  }

  const requiresExistingItems = action === "modifyItem" || action === "receiveStock" || action === "issueMaterial" || action === "removeItem";
  const requiresPersonnel = action === "receiveStock" || action === "issueMaterial";
  const hasItems = items.length > 0;
  const hasPersonnel = personnel.length > 0;

  const handleCategoryChange = (value: string) => {
    setCategoryMode(value);
    if (value === NEW_CATEGORY_VALUE) {
      setItemForm({ ...itemForm, category: "" });
      return;
    }
    setNewCategoryName("");
    setItemForm({ ...itemForm, category: value });
  };

  const handleSubmit = async () => {
    try {
      if (action === "createItem" || action === "modifyItem") {
        const categoryValue = categoryMode === NEW_CATEGORY_VALUE ? newCategoryName.trim() : itemForm.category.trim();
        if (
          !itemForm.name.trim() ||
          !categoryValue ||
          !itemForm.location.trim() ||
          !itemForm.unit.trim() ||
          itemForm.reorderQuantity < 0 ||
          (action === "createItem" && itemForm.initialQuantity < 0)
        ) {
          throw new Error(dictionary.formValidationError);
        }

        if (action === "createItem") {
          await onCreateItem({
            ...itemForm,
            category: categoryValue,
          });
          return;
        }

        if (!selectedManagedItem) {
          throw new Error(dictionary.formValidationError);
        }

        await onUpdateItem({
          itemId: selectedManagedItem.id,
          sku: itemForm.sku,
          name: itemForm.name,
          category: categoryValue,
          location: itemForm.location,
          unit: itemForm.unit,
          supplier: itemForm.supplier,
          reorderQuantity: itemForm.reorderQuantity,
        });
        return;
      }

      if (!hasItems) {
        throw new Error(dictionary.noInventoryItems);
      }

      if (requiresPersonnel && !hasPersonnel) {
        throw new Error(dictionary.personnelRequiredHint);
      }

      if (action === "receiveStock") {
        if (!stockForm.itemId || stockForm.quantity <= 0 || !stockForm.performedBy) {
          throw new Error(dictionary.formValidationError);
        }
        await onReceiveStock(stockForm);
        return;
      }

      if (action === "issueMaterial") {
        if (!stockForm.itemId || stockForm.quantity <= 0 || !stockForm.performedBy) {
          throw new Error(dictionary.formValidationError);
        }
        await onIssueMaterial(stockForm);
        return;
      }

      if (!removeItemId) {
        throw new Error(dictionary.formValidationError);
      }
      await onRemoveItem(removeItemId);
    } catch (error) {
      onError(toErrorMessage(error, dictionary.formValidationError));
    }
  };

  const submitDisabled = busy || (requiresPersonnel && !hasPersonnel);
  const itemFormMode = action === "createItem" || action === "modifyItem";

  return (
    <section className="panel action-panel">
      <div className="panel__header">
        <div>
          <h2>{dictionary.actionPanelTitle[action]}</h2>
          <p>{dictionary.actionPanelHint[action]}</p>
        </div>
        <button className="button-secondary" onClick={onClose} type="button">
          {dictionary.cancel}
        </button>
      </div>

      {requiresExistingItems && !hasItems ? (
        <div className="empty-state">
          <h3>{dictionary.noInventoryItems}</h3>
          <p>{dictionary.noInventoryItemsHint}</p>
        </div>
      ) : (
        <>
          {itemFormMode && (
            <div className="form-grid">
              <label>
                <FieldLabel label={dictionary.sku} optionalText={dictionary.autoGeneratedIfBlank} />
                <input placeholder={dictionary.autoGeneratedIfBlank} value={itemForm.sku} onChange={(event) => setItemForm({ ...itemForm, sku: event.target.value })} />
              </label>
              <label>
                <FieldLabel label={dictionary.itemName} required />
                <input required value={itemForm.name} onChange={(event) => setItemForm({ ...itemForm, name: event.target.value })} />
              </label>
              <label>
                <FieldLabel label={dictionary.category} required />
                <select required value={categoryMode} onChange={(event) => handleCategoryChange(event.target.value)}>
                  {categoryOptions.map((category) => (
                    <option key={category} value={category}>
                      {localizeCategory(category, language)}
                    </option>
                  ))}
                  <option value={NEW_CATEGORY_VALUE}>{dictionary.addNewCategory}</option>
                </select>
              </label>
              {categoryMode === NEW_CATEGORY_VALUE && (
                <label>
                  <FieldLabel label={dictionary.newCategoryName} required />
                  <input required value={newCategoryName} onChange={(event) => setNewCategoryName(event.target.value)} />
                </label>
              )}
              <label>
                <FieldLabel label={dictionary.location} required />
                <input required value={itemForm.location} onChange={(event) => setItemForm({ ...itemForm, location: event.target.value })} />
              </label>
              <label>
                <FieldLabel label={dictionary.unit} required />
                <select required value={itemForm.unit} onChange={(event) => setItemForm({ ...itemForm, unit: event.target.value })}>
                  {UNIT_OPTIONS.map((unit) => (
                    <option key={unit} value={unit}>
                      {localizeUnit(unit, language)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <FieldLabel label={dictionary.supplier} optionalText={dictionary.optionalField} />
                <input value={itemForm.supplier} onChange={(event) => setItemForm({ ...itemForm, supplier: event.target.value })} />
              </label>
              <label>
                <FieldLabel label={dictionary.reorderLevel} required />
                <input required type="number" min="0" value={itemForm.reorderQuantity} onChange={(event) => setItemForm({ ...itemForm, reorderQuantity: Number(event.target.value) })} />
              </label>
              {action === "createItem" ? (
                <label>
                  <FieldLabel label={dictionary.initialQuantity} required />
                  <input required type="number" min="0" value={itemForm.initialQuantity} onChange={(event) => setItemForm({ ...itemForm, initialQuantity: Number(event.target.value) })} />
                </label>
              ) : selectedManagedItem ? (
                <div className="form-summary">
                  <strong>{selectedManagedItem.name}</strong>
                  <span>
                    {dictionary.currentQuantity}: {selectedManagedItem.currentQuantity} {localizeUnit(selectedManagedItem.unit, language)}
                  </span>
                  <span>{dictionary.currentQuantityManagedHint}</span>
                </div>
              ) : null}
            </div>
          )}

          {(action === "receiveStock" || action === "issueMaterial") && (
            <div className="form-grid">
              {!hasPersonnel && (
                <div className="form-summary form-summary--warning">
                  <strong>{dictionary.personnel}</strong>
                  <span>{dictionary.personnelRequiredHint}</span>
                </div>
              )}
              <label>
                <FieldLabel label={dictionary.selectItem} required />
                <select value={stockForm.itemId} onChange={(event) => setStockForm({ ...stockForm, itemId: event.target.value })}>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} - {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <FieldLabel label={dictionary.quantity} required />
                <input type="number" min="0" value={stockForm.quantity} onChange={(event) => setStockForm({ ...stockForm, quantity: Number(event.target.value) })} />
              </label>
              <label>
                <FieldLabel label={dictionary.reason} />
                <input value={stockForm.reason} onChange={(event) => setStockForm({ ...stockForm, reason: event.target.value })} />
              </label>
              <label>
                <FieldLabel label={dictionary.performedBy} required />
                <select
                  value={stockForm.performedBy}
                  onChange={(event) => setStockForm({ ...stockForm, performedBy: event.target.value })}
                >
                  <option value="">{dictionary.selectPersonnel}</option>
                  {personnel.map((member) => (
                    <option key={member.id} value={member.name}>
                      {member.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedStockItem && (
                <div className="form-summary">
                  <strong>{selectedStockItem.name}</strong>
                  <span>
                    {dictionary.currentQuantity}: {selectedStockItem.currentQuantity} {localizeUnit(selectedStockItem.unit, language)}
                  </span>
                  <span>{dictionary.reorderLevel}: {selectedStockItem.reorderQuantity}</span>
                </div>
              )}
            </div>
          )}

          {action === "removeItem" && (
            <div className="form-grid">
              <label>
                <FieldLabel label={dictionary.selectItemToRemove} required />
                <select value={removeItemId} onChange={(event) => setRemoveItemId(event.target.value)}>
                  {items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.sku} - {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedRemoveItem && (
                <div className="form-summary form-summary--danger">
                  <strong>{selectedRemoveItem.name}</strong>
                  <span>
                    {dictionary.currentQuantity}: {selectedRemoveItem.currentQuantity} {localizeUnit(selectedRemoveItem.unit, language)}
                  </span>
                  <span>{dictionary.reorderLevel}: {selectedRemoveItem.reorderQuantity}</span>
                  <span>{dictionary.deleteItemWarning}</span>
                  <span>{dictionary.deleteItemImpact}</span>
                </div>
              )}
            </div>
          )}

          <div className="action-panel__footer">
            <button
              className={action === "removeItem" ? "button-danger" : undefined}
              onClick={() => void handleSubmit()}
              disabled={submitDisabled}
              type="button"
            >
              {busy
                ? `${dictionary.save}...`
                : action === "removeItem"
                  ? dictionary.removeItem
                  : action === "modifyItem"
                    ? dictionary.modifyItem
                    : dictionary.save}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
