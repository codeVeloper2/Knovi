import { useState } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { AuthShell, LockIcon, Eye, EyeOff, Spinner } from "./Login";
import { useAuth } from "../../context/AuthContext";

function scorePassword(password) {
  const checks = {
    length: password.length >= 8,
    lower: /[a-z]/.test(password),
    upper: /[A-Z]/.test(password),
    number: /\d/.test(password),
    special: /[^A-Za-z0-9]/.test(password),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  if (!password.length) return { level: 0, label: "" };
  if (passed <= 2) return { level: 1, label: "Weak" };
  if (passed === 3) return { level: 2, label: "Fair" };
  if (passed === 4) return { level: 3, label: "Good" };
  return { level: 4, label: "Strong" };
}
const TONE = ["", "weak", "fair", "good", "strong"];

export default function ResetPassword() {
  const { confirmReset, mapError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const email = location.state?.email;
  const code = location.state?.code;

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const strength = scorePassword(password);

  // If someone lands here directly without going through forgot-password.
  if (!email || !code) {
    return (
      <AuthShell topRight={<>Remembered it? <Link to="/login">Log in</Link></>}>
        <h2>Reset your password</h2>
        <p className="card-subtitle">
          Start from the <Link to="/forgot-password">forgot password</Link> page to get a reset code.
        </p>
      </AuthShell>
    );
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (strength.level < 2) { setError("Please choose a stronger password."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setBusy(true);
    try {
      await confirmReset(email, code, password);
      setDone(true);
      setTimeout(() => navigate("/login"), 1500);
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell topRight={<>Remembered it? <Link to="/login">Log in</Link></>}>
      <h2>Reset Password</h2>
      <p className="card-subtitle">Make it strong and secure.</p>

      {error && <div className="alert alert-error">{error}</div>}

      {done ? (
        <div className="alert alert-ok">Password updated! Taking you to sign in…</div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <div className="field">
            <label htmlFor="new-pass">New password</label>
            <div className="input-wrap password-wrap has-icon">
              <span className="input-icon"><LockIcon /></span>
              <input id="new-pass" type={show ? "text" : "password"} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="Create a password" required />
              <button type="button" className="toggle-pass" onClick={() => setShow((v) => !v)}
                aria-label={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff /> : <Eye />}
              </button>
            </div>
          </div>

          <div className="field">
            <label htmlFor="confirm-pass">Confirm password</label>
            <div className="input-wrap password-wrap has-icon">
              <span className="input-icon"><LockIcon /></span>
              <input id="confirm-pass" type={show ? "text" : "password"} value={confirm}
                onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm your password" required />
            </div>
          </div>

          {password && (
            <div className="strength-row">
              <div className="strength" aria-hidden="true">
                {[1, 2, 3, 4].map((n) => (
                  <span key={n} className={`bar ${n <= strength.level ? `on ${TONE[strength.level]}` : ""}`} />
                ))}
              </div>
              <span className={`strength-label ${TONE[strength.level]}`}>{strength.label}</span>
            </div>
          )}

          <button className="btn btn-primary" type="submit" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? <span className="btn-inner"><Spinner /> Resetting…</span> : "Reset password"}
          </button>
        </form>
      )}

      <p className="auth-footer"><Link to="/login">← Back to login</Link></p>
    </AuthShell>
  );
}
