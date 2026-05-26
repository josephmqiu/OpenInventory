import { useEffect, useMemo, useRef, useState } from "react";
import i18n from "i18next";
import { translateErrorMessage } from "../../app/i18n";
import type { LanAccessState, UpdateLanAccessInput } from "../../domain/models";
import { useTT } from "../hooks/useTT";
import { QrCodeImage } from "./QrCodeImage";

interface LanAccessPanelProps {
  busy: boolean;
  lanAccess: LanAccessState;
  onSave: (input: UpdateLanAccessInput) => Promise<void>;
  onRegenerateKey: () => Promise<void>;
}

export function LanAccessPanel({ busy, lanAccess, onSave, onRegenerateKey }: LanAccessPanelProps) {
  const tt = useTT();
  const [formPort, setFormPort] = useState(lanAccess.port);
  const [copyFeedback, setCopyFeedback] = useState<{ message: string; tone: "success" | "error" } | null>(null);
  const [showRegenConfirm, setShowRegenConfirm] = useState(false);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    setFormPort(lanAccess.port);
  }, [lanAccess.port]);

  const hasChanges = useMemo(() => formPort !== lanAccess.port, [formPort, lanAccess.port]);

  const handleToggle = () => {
    if (busy) return;
    void onSave({ enabled: !lanAccess.enabled, port: formPort });
  };

  const handlePortSave = () => {
    void onSave({ enabled: lanAccess.enabled, port: formPort });
  };

  const handleCopyAccessKey = async () => {
    try {
      await navigator.clipboard.writeText(lanAccess.accessKey);
      setCopyFeedback({ message: tt("lanCopySuccess", "Access key copied to clipboard."), tone: "success" });
      setTimeout(() => setCopyFeedback(null), 3000);
    } catch {
      setCopyFeedback({ message: tt("lanCopyError", "Unable to copy the access key on this device."), tone: "error" });
      setTimeout(() => setCopyFeedback(null), 3000);
    }
  };

  const handleRegenConfirm = () => {
    setShowRegenConfirm(false);
    void onRegenerateKey();
  };

  const statusLabel = (status: LanAccessState["status"]): string => {
    if (busy && lanAccess.enabled) return tt("lanStatusStarting", "Starting...");
    switch (status) {
      case "running":
        return tt("lanStatusRunning", "Running");
      case "error":
        return tt("lanStatusError", "Error");
      default:
        return tt("lanStatusStopped", "Stopped");
    }
  };

  const statusClass = busy && lanAccess.enabled ? "lan-warning" : `lan-${lanAccess.status}`;
  const lookupUrls = useMemo(
    () => lanAccess.urls.map((url) => `${url.replace(/\/$/, "")}/issue/`),
    [lanAccess.urls],
  );

  // Focus cancel button when regen dialog opens
  useEffect(() => {
    if (showRegenConfirm) cancelRef.current?.focus();
  }, [showRegenConfirm]);

  const handleDialogKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      setShowRegenConfirm(false);
      return;
    }
    if (e.key === "Tab") {
      const dialog = e.currentTarget as HTMLElement;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  return (
    <section className="panel">
      {/* Header with toggle */}
      <div className="panel__header">
        <div>
          <h2>{tt("lanAccess", "LAN Access")} <span className={`status-pill status-pill--${statusClass}`} data-testid="lan-status">{statusLabel(lanAccess.status)}</span></h2>
          <p>{tt("lanEnableHint", "Serve the inventory app on your local network so phones and tablets can look up and manage items.")}</p>
        </div>
        <div className="lan-toggle-row">
          <label className="toggle-switch">
            <input
              type="checkbox"
              role="switch"
              aria-label={tt("lanEnabled", "Enabled")}
              checked={lanAccess.enabled}
              disabled={busy}
              onChange={handleToggle}
            />
            <span className="toggle-switch__track" />
          </label>
        </div>
      </div>

      {/* IP changed warning */}
      {lanAccess.ipChanged && (
        <div className="panel-banner panel-banner--warning">{tt("lanIpChanged", "Your network address has changed. Printed QR codes may point to the old address.")}</div>
      )}

      {/* Copy feedback */}
      {copyFeedback && <div className={`feedback-banner feedback-banner--${copyFeedback.tone}`}>{copyFeedback.message}</div>}

      {/* Config + status: dimmed when disabled */}
      <div className={lanAccess.enabled ? "" : "lan-disabled-overlay"}>
        {/* Config form: port + access key (single-column) */}
        <div className="backup-config">
          <label>
            <span>{tt("lanPort", "Port")}</span>
            <input
              min="1"
              max="65535"
              type="number"
              value={formPort}
              onChange={(e) => setFormPort(Number(e.target.value))}
              onKeyDown={(e) => { if (e.key === "Enter" && !busy && hasChanges && formPort > 0 && formPort <= 65535) { e.preventDefault(); handlePortSave(); } }}
            />
          </label>
          <label>
            <span>{tt("lanAccessKey", "Access Key")}</span>
            <div className="row-actions row-actions--spread">
              <input readOnly value={lanAccess.accessKey} />
              <button className="button-secondary button-inline" disabled={busy} onClick={() => void handleCopyAccessKey()} type="button">
                {tt("lanCopy", "Copy")}
              </button>
            </div>
          </label>
        </div>

        {/* Status section (visually separated) */}
        <dl className="lan-status-section">
          <div>
            <dt>{tt("lanStatus", "Status")}</dt>
            <dd>
              {lanAccess.statusMessage
                ? translateErrorMessage(
                    { messageId: lanAccess.statusMessage, debugMessage: lanAccess.statusMessage },
                    i18n.language === "zh-CN" ? "zh-CN" : "en",
                    tt("lanDesktopOnly", "LAN server management is only available in the desktop app."),
                  )
                : tt("notProvided", "Not provided")}
            </dd>
          </div>
          <div>
            <dt>{tt("lanOpenOnDevice", "QR Lookup Page")}</dt>
            <dd className="lan-url-list">
              {lookupUrls.length > 0 ? (
                lookupUrls.map((url) => (
                  <a key={url} href={url} rel="noreferrer" target="_blank">
                    {url}
                  </a>
                ))
              ) : (
                <span>{tt("lanUrlsUnavailable", "Enable LAN access to see QR lookup URLs.")}</span>
              )}
            </dd>
          </div>
        </dl>

        {/* Generic "Inventory Lookup" QR — post one code so staff can browse the
            read-only catalog without scanning an individual item. */}
        {lookupUrls.length > 0 && (
          <div className="lan-lookup-qr">
            <div className="lan-lookup-qr__text">
              <dt>{tt("lanInventoryLookupQr", "Inventory Lookup QR")}</dt>
              <dd>{tt("lanInventoryLookupQrHint", "Post this code so staff can browse the catalog (read-only). No item scan needed.")}</dd>
              <a href={lookupUrls[0]} rel="noreferrer" target="_blank">{lookupUrls[0]}</a>
            </div>
            <QrCodeImage text={lookupUrls[0]} alt={tt("lanInventoryLookupQr", "Inventory Lookup QR")} size={160} />
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="action-panel__footer action-panel__footer--spread">
        <button className="button-secondary" data-testid="lan-regen-key" disabled={busy} onClick={() => setShowRegenConfirm(true)} type="button">
          {tt("lanRegenerateKey", "Regenerate Access Key")}
        </button>
        <button data-testid="lan-save" disabled={busy || !hasChanges || formPort <= 0 || formPort > 65535} onClick={handlePortSave} type="button">
          {busy ? `${tt("save", "Save")}...` : tt("lanSaveSettings", "Save LAN Settings")}
        </button>
      </div>

      {/* Regen confirm dialog */}
      {showRegenConfirm && (
        <div className="restore-dialog-backdrop" data-testid="regen-key-dialog" onClick={() => setShowRegenConfirm(false)}>
          <div
            className="restore-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="regen-dialog-title"
            onClick={(e) => e.stopPropagation()}
            onKeyDown={handleDialogKeyDown}
          >
            <h2 id="regen-dialog-title" className="restore-dialog__title">
              {tt("lanRegenConfirmTitle", "Regenerate Access Key")}
            </h2>
            <div className="restore-dialog__comparison">
              <div className="restore-dialog__warning">
                {tt("lanRegenConfirmWarning", "This will invalidate all printed QR codes and shared URLs. All devices will need the new access key to connect.")}
              </div>
            </div>
            <div className="restore-dialog__footer">
              <button
                ref={cancelRef}
                className="button-secondary"
                data-testid="regen-dialog-cancel"
                onClick={() => setShowRegenConfirm(false)}
                type="button"
              >
                {tt("cancel", "Cancel")}
              </button>
              <button
                className="button-secondary button-secondary--danger"
                data-testid="regen-dialog-confirm"
                onClick={handleRegenConfirm}
                type="button"
              >
                {tt("lanRegenConfirmButton", "Regenerate Key")}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
