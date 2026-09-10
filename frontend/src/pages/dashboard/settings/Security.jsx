import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../context/AuthContext";
import { useToast } from "../../../context/ToastContext";
import { Eye, EyeOff } from "../../auth/Login";
import ConfirmDialog from "../../../components/ConfirmDialog";

function PwField({ id, label, value, onChange, placeholder }) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="input-wrap password-wrap">
        <input id={id} type={show ? "text" : "password"} value={value} onChange={onChange}
          placeholder={placeholder} autoComplete="off" />
        <button type="button" className="toggle-pass" onClick={() => setShow((v) => !v)}
          aria-label={show ? "Hide" : "Show"}>{show ? <EyeOff /> : <Eye />}</button>
      </div>
    </div>
  );
}

const TrashIcon = (p) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...p}>
    <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
    <path d="M10 11v6M14 11v6" />
  </svg>
);

export default function SettingsSecurity() {
  const { changePassword, deleteAccount, profile, mapError } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();

  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  // Whether this account has a password to verify (email/password accounts).
  const hasPassword = profile?.hasPassword ?? profile?.provider !== "google";

  // ── Delete account flow ──
  const [delPassword, setDelPassword] = useState("");
  const [delConfirmText, setDelConfirmText] = useState("");
  const [delModalOpen, setDelModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelPass, setShowDelPass] = useState(false);

  // The "Delete account" button is only enabled once the gates are satisfied:
  // password entered (if required) AND the word DELETE typed exactly.
  const typedDelete = delConfirmText.trim() === "DELETE";
  const canDelete = typedDelete && (!hasPassword || delPassword.length > 0);

  async function submit(e) {
    e.preventDefault();
    if (next.length < 8) return toast.error("New password must be at least 8 characters.");
    if (next !== confirm) return toast.error("New passwords don't match.");
    if (next === current) return toast.error("Your new password can't be the same as your current password.");
    setBusy(true);
    try {
      await changePassword(current, next);
      toast.success("Your password has been updated.");
      setCurrent(""); setNext(""); setConfirm("");
    } catch (err) {
      toast.error(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    setDeleting(true);
    try {
      await deleteAccount(delPassword);
      toast.success("Your account has been deleted.");
      navigate("/login", { replace: true });
    } catch (err) {
      setDelModalOpen(false);
      toast.error(mapError(err));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="settings-page">
      <h1>Change Password</h1>
      <p className="settings-sub">Only available for email/password accounts.</p>

      <form onSubmit={submit} className="settings-card">
        <PwField id="cur" label="Current password" value={current}
          onChange={(e) => setCurrent(e.target.value)} placeholder="Enter current password" />
        <PwField id="new" label="New password" value={next}
          onChange={(e) => setNext(e.target.value)} placeholder="Create a new password" />
        <PwField id="cnf" label="Confirm new password" value={confirm}
          onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" />

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? "Updating…" : "Update password"}
        </button>
      </form>

      {/* ── Danger zone: delete account ── */}
      <div className="settings-card danger-card">
        <div className="danger-icon"><TrashIcon /></div>
        <h2 className="danger-title">Delete account</h2>
        <p className="danger-text">
          This action is permanent and cannot be undone. All your data — your profile,
          messages, and progress — will be lost.
        </p>

        {hasPassword && (
          <div className="field">
            <label htmlFor="del-pass">Confirm your password</label>
            <div className="input-wrap password-wrap">
              <input
                id="del-pass"
                type={showDelPass ? "text" : "password"}
                value={delPassword}
                onChange={(e) => setDelPassword(e.target.value)}
                placeholder="Enter your password"
                autoComplete="off"
              />
              <button type="button" className="toggle-pass" onClick={() => setShowDelPass((v) => !v)}
                aria-label={showDelPass ? "Hide" : "Show"}>{showDelPass ? <EyeOff /> : <Eye />}</button>
            </div>
          </div>
        )}

        <div className="field">
          <label htmlFor="del-confirm">
            Type <b>DELETE</b> to confirm
          </label>
          <div className="input-wrap">
            <input
              id="del-confirm"
              type="text"
              value={delConfirmText}
              onChange={(e) => setDelConfirmText(e.target.value)}
              placeholder="DELETE"
              autoComplete="off"
              autoCapitalize="characters"
            />
          </div>
        </div>

        <button
          className="btn btn-danger"
          type="button"
          disabled={!canDelete}
          onClick={() => setDelModalOpen(true)}
        >
          Delete account
        </button>
      </div>

      <ConfirmDialog
        open={delModalOpen}
        title="Are you sure you want to delete your account?"
        message="This permanently erases your account and all its data. We'll email you a confirmation. This cannot be undone."
        confirmText="Yes, delete my account"
        cancelText="Keep my account"
        danger
        loading={deleting}
        onConfirm={confirmDelete}
        onCancel={() => !deleting && setDelModalOpen(false)}
      />
    </div>
  );
}
