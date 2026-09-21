import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { AuthShell, Spinner, MobBackIcon } from "./Login";
import { EmailIllustration, SuccessIllustration } from "./MobileWelcome";
import { useAuth } from "../../context/AuthContext";

const LEN = 6;

export default function VerifyEmail() {
  const { verifyEmail, resendVerification, mapError } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // Email is passed from Signup via router state; fall back to a manual field.
  const [email, setEmail] = useState(location.state?.email || "");
  const [digits, setDigits] = useState(Array(LEN).fill(""));
  const [status, setStatus] = useState("idle"); // idle | verifying | success
  const [error, setError] = useState("");
  const [info, setInfo] = useState(location.state?.email ? "We sent a 6-digit code to your email." : "");
  const [busy, setBusy] = useState(false);
  const inputs = useRef([]);

  // Show the dev code if signup returned one (no SMTP configured).
  const devCode = location.state?.devCode;

  useEffect(() => {
    inputs.current[0]?.focus();
  }, []);

  function setDigit(i, val) {
    const clean = val.replace(/\D/g, "");
    if (!clean) {
      setDigits((d) => d.map((x, idx) => (idx === i ? "" : x)));
      return;
    }
    // Support pasting the whole code into one box.
    if (clean.length > 1) {
      const chars = clean.slice(0, LEN).split("");
      const next = Array(LEN).fill("");
      chars.forEach((c, idx) => (next[idx] = c));
      setDigits(next);
      inputs.current[Math.min(chars.length, LEN - 1)]?.focus();
      return;
    }
    setDigits((d) => d.map((x, idx) => (idx === i ? clean : x)));
    if (i < LEN - 1) inputs.current[i + 1]?.focus();
  }

  function onKeyDown(i, e) {
    if (e.key === "Backspace" && !digits[i] && i > 0) {
      inputs.current[i - 1]?.focus();
    }
  }

  async function submit(e) {
    e?.preventDefault();
    setError("");
    const code = digits.join("");
    if (!email.trim()) { setError("Enter the email you signed up with."); return; }
    if (code.length !== LEN) { setError("Enter the 6-digit code from your email."); return; }
    setStatus("verifying");
    try {
      await verifyEmail(email.trim(), code);
      setStatus("success");
      setTimeout(() => navigate("/onboarding"), 1000);
    } catch (err) {
      setError(mapError(err));
      setStatus("idle");
    }
  }

  async function resend() {
    setError("");
    setInfo("");
    if (!email.trim()) { setError("Enter your email so we can resend the code."); return; }
    setBusy(true);
    try {
      const res = await resendVerification(email.trim());
      setInfo("A new code is on the way. Check your inbox and spam folder.");
      if (res?.devCode) setInfo(`Dev mode: your code is ${res.devCode}`);
    } catch (err) {
      setError(mapError(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell topRight={<>Back to <Link to="/login">sign in</Link></>}
      mobileBack={<Link to="/login" className="mob-back-link"><MobBackIcon /> Back</Link>}
    >
      <div className="mob-auth-illus"><EmailIllustration /></div>
      <h2>Verify your email</h2>
      <p className="card-subtitle">
        Enter the 6-digit code we sent to{" "}
        {email ? <strong style={{ color: "#fff" }}>{email}</strong> : "your email"}.
      </p>

      {devCode && (
        <div className="alert alert-ok">Dev mode (no email set): your code is <strong>{devCode}</strong></div>
      )}
      {error && <div className="alert alert-error">{error}</div>}
      {info && !devCode && <div className="alert alert-ok">{info}</div>}

      {status === "success" ? (
        <div className="mob-success-state">
          <div className="mob-auth-illus"><SuccessIllustration /></div>
          <h2 className="mob-success-title">You're verified!</h2>
          <p className="mob-success-sub">Your account is ready. Let's set up your learning profile.</p>
          <div className="alert alert-ok" style={{ display: "none" }}>Email verified! Taking you into PeerUp…</div>
        </div>
      ) : (
        <form onSubmit={submit} noValidate>
          {!location.state?.email && (
            <div className="field">
              <label htmlFor="verify-email">Email address</label>
              <div className="input-wrap">
                <input
                  id="verify-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@school.edu"
                  required
                />
              </div>
            </div>
          )}

          <div className="field">
            <label>Verification code</label>
            <div className="code-row">
              {digits.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => (inputs.current[i] = el)}
                  className="code-box"
                  inputMode="numeric"
                  maxLength={LEN}
                  value={d}
                  onChange={(e) => setDigit(i, e.target.value)}
                  onKeyDown={(e) => onKeyDown(i, e)}
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>
          </div>

          <button className="btn btn-primary" type="submit" disabled={status === "verifying"}>
            {status === "verifying" ? <span className="btn-inner"><Spinner /> Verifying…</span> : "Verify email"}
          </button>
        </form>
      )}

      <p className="auth-footer">
        Didn't get it?{" "}
        <button type="button" className="link-btn" onClick={resend} disabled={busy}>
          {busy ? "Sending…" : "Resend code"}
        </button>
      </p>
    </AuthShell>
  );
}
