import { useRef, useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { AuthShell, MailIcon, Spinner } from "./Login";
import { useAuth } from "../../context/AuthContext";

const LEN = 6;

export default function ForgotPassword() {
  const { resetPassword, verifyResetCode, mapError } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState("email"); // email | code
  const [email, setEmail] = useState("");
  const [digits, setDigits] = useState(Array(LEN).fill(""));
  const [error, setError] = useState("");
  const [info, setInfo] = useState("");
  const [devCode, setDevCode] = useState("");
  const [busy, setBusy] = useState(false);
  const inputs = useRef([]);

  useEffect(() => {
    if (step === "code") inputs.current[0]?.focus();
  }, [step]);

  async function sendCode(e) {
    e?.preventDefault();
    setError("");
    setInfo("");
    if (!email.trim()) { setError("Enter your email address."); return; }
    setBusy(true);
    try {
      const res = await resetPassword(email.trim());
      // Always advance to the code step (don't reveal if the email exists).
      setStep("code");
      setInfo("If that email is registered, a 6-digit code is on its way.");
      if (res?.devCode) setDevCode(res.devCode);
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  function setDigit(i, val) {
    const clean = val.replace(/\D/g, "");
    if (!clean) { setDigits((d) => d.map((x, idx) => (idx === i ? "" : x))); return; }
    if (clean.length > 1) {
      const next = Array(LEN).fill("");
      clean.slice(0, LEN).split("").forEach((c, idx) => (next[idx] = c));
      setDigits(next);
      inputs.current[Math.min(clean.length, LEN - 1)]?.focus();
      return;
    }
    setDigits((d) => d.map((x, idx) => (idx === i ? clean : x)));
    if (i < LEN - 1) inputs.current[i + 1]?.focus();
  }

  function onKeyDown(i, e) {
    if (e.key === "Backspace" && !digits[i] && i > 0) inputs.current[i - 1]?.focus();
  }

  async function submitCode(e) {
    e?.preventDefault();
    setError("");
    const code = digits.join("");
    if (code.length !== LEN) { setError("Enter the 6-digit code from your email."); return; }
    setBusy(true);
    try {
      await verifyResetCode(email.trim(), code);
      // Code valid — go set a new password.
      navigate("/reset-password", { state: { email: email.trim(), code } });
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    setError(""); setInfo(""); setDevCode("");
    setBusy(true);
    try {
      const res = await resetPassword(email.trim());
      setInfo("A new code is on the way. Check your inbox and spam folder.");
      if (res?.devCode) setDevCode(res.devCode);
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell topRight={<>Remembered it? <Link to="/login">Log in</Link></>}>
      <div className="lock-badge"><LockBadge /></div>
      <h2>Forgot Password?</h2>

      {step === "email" ? (
        <>
          <p className="card-subtitle">
            Enter your email address and we'll send you a 6-digit code to reset your password.
          </p>
          {error && <div className="alert alert-error">{error}</div>}
          <form onSubmit={sendCode} noValidate>
            <div className="field">
              <label htmlFor="forgot-email">Email address</label>
              <div className="input-wrap">
                <span className="input-icon"><MailIcon /></span>
                <input id="forgot-email" type="email" autoComplete="email" value={email}
                  onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required />
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? <span className="btn-inner"><Spinner /> Sending…</span> : "Send reset code"}
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="card-subtitle">
            Enter the 6-digit code we sent to <strong style={{ color: "#fff" }}>{email}</strong>.
          </p>
          {devCode && <div className="alert alert-ok">Dev mode: your code is <strong>{devCode}</strong></div>}
          {error && <div className="alert alert-error">{error}</div>}
          {info && !devCode && <div className="alert alert-ok">{info}</div>}
          <form onSubmit={submitCode} noValidate>
            <div className="field">
              <label>Reset code</label>
              <div className="code-row">
                {digits.map((d, i) => (
                  <input key={i} ref={(el) => (inputs.current[i] = el)} className="code-box"
                    inputMode="numeric" maxLength={LEN} value={d}
                    onChange={(e) => setDigit(i, e.target.value)} onKeyDown={(e) => onKeyDown(i, e)}
                    aria-label={`Digit ${i + 1}`} />
                ))}
              </div>
            </div>
            <button className="btn btn-primary" type="submit" disabled={busy}>
              {busy ? <span className="btn-inner"><Spinner /> Verifying…</span> : "Verify code"}
            </button>
          </form>
          <p className="auth-footer">
            Didn't get it?{" "}
            <button type="button" className="link-btn" onClick={resend} disabled={busy}>
              {busy ? "Sending…" : "Resend code"}
            </button>
          </p>
        </>
      )}

      <p className="auth-footer"><Link to="/login">← Back to sign in</Link></p>
    </AuthShell>
  );
}

function LockBadge() {
  return (
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="11" width="18" height="10" rx="2.5" fill="url(#lg)" />
      <path d="M7 11V8a5 5 0 0 1 10 0v3" stroke="url(#lg)" strokeWidth="2" fill="none" strokeLinecap="round" />
      <circle cx="12" cy="16" r="1.6" fill="#0a1428" />
      <defs>
        <linearGradient id="lg" x1="3" y1="6" x2="21" y2="21" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60a5fa" /><stop offset="1" stopColor="#5b6ef5" />
        </linearGradient>
      </defs>
    </svg>
  );
}
