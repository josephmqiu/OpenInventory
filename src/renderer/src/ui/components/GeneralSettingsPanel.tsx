import { useTT } from "../hooks/useTT";
import type { CurrencyCode } from "../../domain/models";

// v1 picker: 2-decimal currencies only (constant minor-unit exponent, so
// switching currency never rescales stored prices). Must match
// CurrencyCodeSchema / CurrencyCode.
const CURRENCY_OPTIONS: CurrencyCode[] = [
  "CNY",
  "USD",
  "EUR",
  "GBP",
  "HKD",
  "AUD",
  "CAD",
  "SGD",
];

interface GeneralSettingsPanelProps {
  busy: boolean;
  currency: CurrencyCode;
  onCurrencyChange: (currency: CurrencyCode) => void;
}

export function GeneralSettingsPanel({
  busy,
  currency,
  onCurrencyChange,
}: GeneralSettingsPanelProps) {
  const tt = useTT();

  return (
    <section className="panel" data-testid="general-settings-panel">
      <div className="panel__header">
        <div>
          <h2>{tt("settings", "Settings")}</h2>
          <p>{tt("currencyHint", "Used to display item prices and total inventory value.")}</p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          <span>{tt("currency", "Currency")}</span>
          <select
            disabled={busy}
            value={currency}
            onChange={(event) => onCurrencyChange(event.target.value as CurrencyCode)}
            data-testid="currency-select"
          >
            {CURRENCY_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="field-hint">
        {tt("currencyChangeWarning", "Existing prices keep their numbers; only the currency label changes.")}
      </p>
    </section>
  );
}
