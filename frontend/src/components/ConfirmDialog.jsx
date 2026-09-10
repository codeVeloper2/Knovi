import { useEffect, useRef } from "react";
import { Spinner } from "../pages/auth/Login";

/**
 * A reusable confirmation modal for important / destructive actions
 * (logout, delete, etc.). Controlled via `open`.
 *
 * Props:
 *  - open        : boolean
 *  - title       : heading text
 *  - message     : body text (string or node)
 *  - confirmText : confirm button label (default "Confirm")
 *  - cancelText  : cancel button label (default "Cancel")
 *  - danger      : when true, the confirm button is styled red
 *  - loading     : when true, disables buttons and shows a spinner
 *  - onConfirm   : called when the user confirms
 *  - onCancel    : called on cancel / overlay click / Escape
 */
export default function ConfirmDialog({
  open,
  title = "Are you sure?",
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  danger = false,
  loading = false,
  onConfirm,
  onCancel,
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    function onKey(e) {
      if (e.key === "Escape" && !loading) onCancel?.();
    }
    window.addEventListener("keydown", onKey);
    // Focus the confirm button when the dialog opens.
    confirmRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open, loading, onCancel]);

  if (!open) return null;

  return (
    <div className="sc-overlay" onClick={() => !loading && onCancel?.()}>
      <div
        className="confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className={`confirm-icon${danger ? " confirm-icon--danger" : ""}`}>
          {danger ? (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <path d="M12 9v4M12 17h.01" />
            </svg>
          ) : (
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 16v-4M12 8h.01" />
            </svg>
          )}
        </div>

        <h2 className="confirm-title">{title}</h2>
        {message && <p className="confirm-message">{message}</p>}

        <div className="confirm-actions">
          <button
            type="button"
            className="btn btn-ghost"
            onClick={() => onCancel?.()}
            disabled={loading}
          >
            {cancelText}
          </button>
          <button
            ref={confirmRef}
            type="button"
            className={`btn ${danger ? "btn-danger" : "btn-primary"}`}
            onClick={() => onConfirm?.()}
            disabled={loading}
          >
            {loading ? <span className="btn-inner"><Spinner /> Please wait…</span> : confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
