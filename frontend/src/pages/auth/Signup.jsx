import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import {
  AuthShell, MailIcon, LockIcon, UserIcon, Eye, EyeOff,
  Arrow, Spinner, GoogleIcon,
} from "./Login";

/* password scoring — inline (no extra files) */
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

export default function Signup() {
  const { signUp, signInWithGoogle, mapError, firebaseReady } = useAuth();
  const navigate = useNavigate();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const strength = scorePassword(password);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    if (!fullName.trim()) { setError("Please enter your full name."); return; }
    if (strength.level < 2) { setError("Please choose a stronger password before creating your account."); return; }
    if (password !== confirm) { setError("Passwords don't match. Please re-enter them."); return; }
    setBusy(true);
    try {
      const res = await signUp(email.trim(), password, rememberMe, fullName.trim());
      // Pass the email (and dev code, if SMTP off) to the verify screen.
      navigate("/verify-email", {
        state: { email: email.trim(), devCode: res?.devCode },
      });
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(""); setBusy(true);
    try {
      await signInWithGoogle(rememberMe);
      navigate("/app");
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      topRight={<>Already have an account? <Link to="/login">Log in <Arrow small /></Link></>}
    >
      <h2>Create Your Account</h2>
      <p className="card-subtitle">Join our community of learners and start your journey today.</p>

      {!firebaseReady && (
        <div className="alert alert-error">Firebase isn't configured. Add your keys to <code>frontend/.env</code>.</div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="signup-name">Full name</label>
          <div className="input-wrap">
            <span className="input-icon"><UserIcon /></span>
            <input id="signup-name" type="text" autoComplete="name" value={fullName}
              onChange={(e) => setFullName(e.target.value)} placeholder="Enter your full name" required />
          </div>
        </div>

        <div className="field">
          <label htmlFor="signup-email">Email address</label>
          <div className="input-wrap">
            <span className="input-icon"><MailIcon /></span>
            <input id="signup-email" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
        </div>

        <div className="field">
          <label htmlFor="signup-password">Password</label>
          <div className="input-wrap password-wrap has-icon">
            <span className="input-icon"><LockIcon /></span>
            <input id="signup-password" type={showPassword ? "text" : "password"} autoComplete="new-password"
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Create a strong password" required />
            <button type="button" className="toggle-pass" onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
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
        </div>

        <div className="row-between">
          <label className="check-row">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            <span>Remember me</span>
          </label>
        </div>

        <div className="field">
          <label htmlFor="signup-confirm">Confirm password</label>
          <div className="input-wrap password-wrap has-icon">
            <span className="input-icon"><LockIcon /></span>
            <input id="signup-confirm" type={showConfirm ? "text" : "password"} autoComplete="new-password"
              value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Re-enter your password" required />
            <button type="button" className="toggle-pass" onClick={() => setShowConfirm((v) => !v)}
              aria-label={showConfirm ? "Hide password" : "Show password"}>
              {showConfirm ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy || !firebaseReady}>
          {busy ? <span className="btn-inner"><Spinner /> Creating account…</span> : <span className="btn-inner">Create Account <Arrow /></span>}
        </button>
      </form>

      <div className="auth-divider"><span>or</span></div>

      <button className="btn-social" type="button" onClick={handleGoogle} disabled={busy || !firebaseReady}>
        <GoogleIcon /> Continue with Google
      </button>

      <p className="terms-note">
        By creating an account, you agree to our{" "}
        <Link to="/agreement">Terms of Service</Link> and <Link to="/agreement">Privacy Policy</Link>.
      </p>
      <p className="auth-footer">Already have an account? <Link to="/login">Log in <Arrow small /></Link></p>
    </AuthShell>
  );
}
