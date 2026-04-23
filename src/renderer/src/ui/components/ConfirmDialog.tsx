import React from "react";
import { X, Trash2 } from "lucide-react";

interface ConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmText?: string;
  cancelText?: string;
}

export function ConfirmDialog({ isOpen, title, message, onConfirm, onCancel, confirmText = "Delete", cancelText = "Cancel" }: ConfirmDialogProps) {
  if (!isOpen) return null;

  return (
    <div className="confirm-dialog-backdrop">
      <div className="confirm-dialog">
        <div className="confirm-dialog__header">
          <h3 className="confirm-dialog__title">{title}</h3>
          <button
            onClick={onCancel}
            className="button-icon-only"
            aria-label="Close"
          >
            <X size={20} />
          </button>
        </div>
        <p className="confirm-dialog__message">{message}</p>
        <div className="confirm-dialog__footer">
          <button
            onClick={onCancel}
            className="button-secondary button-inline"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            className="button-danger button-inline flex items-center space-x-2"
          >
            <Trash2 size={16} />
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
