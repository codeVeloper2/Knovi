import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { LogoMark } from "../../components/Logo";

/* ────────────────────────────────────────────
   Shared auth shell (left brand + right panel)
   ──────────────────────────────────────────── */
const FEATURES = [
  { icon: "users",  color: "blue",   title: "Find study partners", body: "Learn from people who get you" },
  { icon: "chat",   color: "teal",   title: "Connect & chat",      body: "Chat, share notes, collaborate" },
  { icon: "spark",  color: "gold",   title: "Use AI tools",        body: "Get help, create notes, build flashcards" },
  { icon: "chart",  color: "purple", title: "Track your progress", body: "Earn XP, unlock badges, reach your goals" },
];

export function AuthShell({ topRight, mobileBack, children }) {
  return (
    <div className="auth-shell">
      <section className="auth-brand">
        <div className="brand-top">
          <div className="logo">
            <span className="logo-mark logo-mark--img"><LogoMark size={30} /></span>
            <span className="logo-text">Peer<span className="logo-accent">Up</span></span>
          </div>
          <div className="brand-tags"><span>Learn</span><span className="dot">•</span><span>Teach</span><span className="dot">•</span><span>Grow</span></div>
        </div>

        <div className="brand-hero">
          <h1>Better Students.<br /><span className="gradient-text">Brighter Futures.</span></h1>
          <p>Join a community of learners and start your journey today. Teach, learn, share and grow — together.</p>
          <ul className="feature-list">
            {FEATURES.map((f) => (
              <li key={f.title}>
                <span className={`feature-icon feature-icon--${f.color}`}><FeatureIcon name={f.icon} /></span>
                <div><strong>{f.title}</strong><span>{f.body}</span></div>
              </li>
            ))}
          </ul>
        </div>

        <div className="brand-footer">
          <span className="brand-tagline">Real students. Real help. Real progress.</span>
        </div>
      </section>

      <section className="auth-panel">
        {topRight ? <div className="panel-top-link">{topRight}</div> : null}
        <div className="auth-card">
          {/* Mobile: back button row */}
          {mobileBack && (
            <div className="mob-auth-back-row">
              {mobileBack}
            </div>
          )}
          {/* Mobile: logo */}
          <div className="logo logo-mobile">
            <span className="logo-mark logo-mark--img"><LogoMark size={26} /></span>
            <span className="logo-text">Peer<span className="logo-accent">Up</span></span>
          </div>
          {children}
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────
   Login page
   ──────────────────────────────────────────── */
export default function Login() {
  const { signIn, signInWithGoogle, mapError, firebaseReady } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError(""); setBusy(true);
    try {
      await signIn(email.trim(), password, rememberMe);
      navigate("/app");
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
      topRight={<>Don't have an account? <Link to="/signup">Sign up <Arrow small /></Link></>}
      mobileBack={<Link to="/welcome" className="mob-back-link"><MobBackIcon /> Back</Link>}
    >
      <h2>Welcome Back!</h2>
      <p className="card-subtitle">Log in to your PeerUp account</p>

      {!firebaseReady && (
        <div className="alert alert-error">Firebase isn't configured. Add your keys to <code>frontend/.env</code>.</div>
      )}
      {error && <div className="alert alert-error">{error}</div>}

      <form onSubmit={handleSubmit} noValidate>
        <div className="field">
          <label htmlFor="login-email">Email address</label>
          <div className="input-wrap">
            <span className="input-icon"><MailIcon /></span>
            <input id="login-email" type="email" autoComplete="email" value={email}
              onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
          </div>
        </div>

        <div className="field">
          <label htmlFor="login-password">Password</label>
          <div className="input-wrap password-wrap has-icon">
            <span className="input-icon"><LockIcon /></span>
            <input id="login-password" type={showPassword ? "text" : "password"} autoComplete="current-password"
              value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" required />
            <button type="button" className="toggle-pass" onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}>
              {showPassword ? <EyeOff /> : <Eye />}
            </button>
          </div>
        </div>

        <div className="row-between">
          <label className="check-row">
            <input type="checkbox" checked={rememberMe} onChange={(e) => setRememberMe(e.target.checked)} />
            <span>Remember me</span>
          </label>
          <Link to="/forgot-password" className="field-link">Forgot password?</Link>
        </div>

        <button className="btn btn-primary" type="submit" disabled={busy || !firebaseReady}>
          {busy ? <span className="btn-inner"><Spinner /> Logging in…</span> : <span className="btn-inner">Log In <Arrow /></span>}
        </button>
      </form>

      <div className="auth-divider"><span>or</span></div>

      <button className="btn-social" type="button" onClick={handleGoogle} disabled={busy || !firebaseReady}>
        <GoogleIcon /> Continue with Google
      </button>

      <p className="auth-footer">Don't have an account? <Link to="/signup">Sign up</Link></p>
    </AuthShell>
  );
}

/* ────────────────────────────────────────────
   Shared icons (exported for Signup)
   ──────────────────────────────────────────── */
// Kept as an alias so other pages importing { PeersIcon } from "./Login" still work.
export function PeersIcon() {
  return <LogoMark size={26} />;
}

export function FeatureIcon({ name }) {
  const p = { width: 18, height: 18, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true };
  if (name === "users")  return <svg {...p}><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /></svg>;
  if (name === "chat")   return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>;
  if (name === "spark")  return <svg {...p}><path d="M9 18h6M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1h6c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" /></svg>;
  if (name === "chart")  return <svg {...p}><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg>;
  return null;
}

export function MailIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg>;
}
export function LockIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>;
}
export function UserIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>;
}
export function Eye() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></svg>;
}
export function EyeOff() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9.9 4.24A9.1 9.1 0 0 1 12 4c6.5 0 10 8 10 8a13.2 13.2 0 0 1-1.67 2.68" /><path d="M6.6 6.6C3.9 8.3 2 12 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.4-1.6" /><path d="m2 2 20 20" /></svg>;
}
export function Arrow({ small }) {
  const s = small ? 14 : 18;
  return <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>;
}
export function Spinner() {
  return <svg className="spinner" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeDasharray="30 70" /></svg>;
}
export function MobBackIcon() {
  return <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>;
}
export function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.71H.96v2.33A9 9 0 0 0 9 18z" />
      <path fill="#FBBC05" d="M3.97 10.71A5.41 5.41 0 0 1 3.69 9c0-.59.1-1.17.26-1.71V4.96H.96A9 9 0 0 0 0 9c0 1.45.35 2.82.96 4.04l3.01-2.33z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.96l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58z" />
    </svg>
  );
}
