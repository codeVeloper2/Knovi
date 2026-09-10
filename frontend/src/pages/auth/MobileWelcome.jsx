import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { LogoMark } from "../../components/Logo";

/* ── Redirect desktops straight to login ────────────────────────── */
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth <= 767);
  useEffect(() => {
    const fn = () => setMobile(window.innerWidth <= 767);
    window.addEventListener("resize", fn, { passive: true });
    return () => window.removeEventListener("resize", fn);
  }, []);
  return mobile;
}

/* ── Illustration: two students learning ───────────────────────── */
function SplashIllustration() {
  return (
    <svg width="220" height="180" viewBox="0 0 220 180" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      {/* Glow blobs */}
      <ellipse cx="110" cy="140" rx="90" ry="28" fill="rgba(91,110,245,0.15)" />
      <ellipse cx="70" cy="120" rx="50" ry="50" fill="rgba(52,211,153,0.07)" />
      <ellipse cx="155" cy="115" rx="45" ry="45" fill="rgba(37,99,235,0.09)" />

      {/* Book / Laptop */}
      <rect x="62" y="98" width="96" height="60" rx="6" fill="url(#bookGrad)" />
      <rect x="74" y="106" width="72" height="44" rx="3" fill="#0e1b34" />
      {/* Screen content lines */}
      <rect x="80" y="114" width="44" height="4" rx="2" fill="rgba(91,110,245,0.6)" />
      <rect x="80" y="122" width="32" height="3" rx="1.5" fill="rgba(96,165,250,0.4)" />
      <rect x="80" y="129" width="38" height="3" rx="1.5" fill="rgba(96,165,250,0.3)" />
      {/* Keyboard ridge */}
      <rect x="62" y="158" width="96" height="5" rx="2.5" fill="rgba(91,110,245,0.3)" />
      <line x1="110" y1="158" x2="110" y2="163" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />

      {/* Left student */}
      <circle cx="72" cy="78" r="18" fill="url(#stu1Grad)" />
      <circle cx="72" cy="74" r="9" fill="#1a2744" />
      <path d="M58 93 Q72 86 86 93 L88 116 H56 Z" fill="url(#stu1Grad)" />
      {/* Graduation cap */}
      <rect x="63" y="65" width="18" height="3" rx="1" fill="#fbbf24" />
      <polygon points="72,62 80,66 72,70 64,66" fill="#fbbf24" />
      <line x1="80" y1="66" x2="82" y2="72" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="82" cy="73" r="1.5" fill="#fbbf24" />

      {/* Right student */}
      <circle cx="148" cy="78" r="18" fill="url(#stu2Grad)" />
      <circle cx="148" cy="74" r="9" fill="#1a2744" />
      <path d="M134 93 Q148 86 162 93 L164 116 H132 Z" fill="url(#stu2Grad)" />
      {/* Hair */}
      <path d="M139 68 Q148 62 157 68" stroke="#a78bfa" strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* Chat bubble (top right of right student) */}
      <rect x="155" y="54" width="38" height="22" rx="8" fill="rgba(91,110,245,0.9)" />
      <path d="M163 76 L160 84 L169 76" fill="rgba(91,110,245,0.9)" />
      <rect x="160" y="60" width="24" height="3" rx="1.5" fill="rgba(255,255,255,0.7)" />
      <rect x="160" y="66" width="18" height="3" rx="1.5" fill="rgba(255,255,255,0.5)" />

      {/* Star sparkles */}
      <circle cx="40" cy="50" r="3" fill="#fbbf24" opacity="0.7" />
      <circle cx="185" cy="44" r="2" fill="#60a5fa" opacity="0.8" />
      <circle cx="28" cy="90" r="2" fill="#a78bfa" opacity="0.6" />
      <circle cx="195" cy="90" r="2.5" fill="#34d399" opacity="0.7" />
      <path d="M38 30 L40 24 L42 30 L48 32 L42 34 L40 40 L38 34 L32 32 Z" fill="#fbbf24" opacity="0.5" />

      <defs>
        <linearGradient id="bookGrad" x1="62" y1="98" x2="158" y2="158" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563eb" /><stop offset="1" stopColor="#5b6ef5" />
        </linearGradient>
        <linearGradient id="stu1Grad" x1="54" y1="60" x2="90" y2="116" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" /><stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
        <linearGradient id="stu2Grad" x1="130" y1="60" x2="165" y2="116" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7c3aed" /><stop offset="1" stopColor="#a78bfa" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ── Email/envelope illustration for verify screen ─────────────── */
export function EmailIllustration() {
  return (
    <svg width="100" height="80" viewBox="0 0 100 80" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect x="10" y="20" width="80" height="52" rx="8" fill="url(#envGrad)" />
      <path d="M10 28 L50 52 L90 28" stroke="rgba(255,255,255,0.3)" strokeWidth="2" fill="none" />
      <rect x="10" y="20" width="80" height="52" rx="8" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1.5" />
      {/* Checkmark badge */}
      <circle cx="75" cy="22" r="14" fill="#0e1b34" />
      <circle cx="75" cy="22" r="12" fill="#34d399" />
      <path d="M68 22 L73 27 L82 17" stroke="#0e1b34" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Sparkles */}
      <circle cx="20" cy="16" r="2.5" fill="#fbbf24" opacity="0.7" />
      <circle cx="88" cy="62" r="2" fill="#60a5fa" opacity="0.7" />
      <defs>
        <linearGradient id="envGrad" x1="10" y1="20" x2="90" y2="72" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2563eb" /><stop offset="1" stopColor="#5b6ef5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ── Success checkmark illustration ───────────────────────────── */
export function SuccessIllustration() {
  return (
    <svg width="110" height="110" viewBox="0 0 110 110" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="55" cy="55" r="50" fill="rgba(52,211,153,0.1)" />
      <circle cx="55" cy="55" r="38" fill="url(#successGrad)" />
      <path d="M36 55 L48 67 L74 42" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      {/* Confetti */}
      <rect x="15" y="20" width="7" height="7" rx="2" fill="#fbbf24" transform="rotate(30 15 20)" opacity="0.8" />
      <rect x="85" y="15" width="6" height="6" rx="1.5" fill="#a78bfa" transform="rotate(-20 85 15)" opacity="0.8" />
      <rect x="88" y="78" width="6" height="6" rx="2" fill="#60a5fa" transform="rotate(15 88 78)" opacity="0.8" />
      <rect x="12" y="80" width="5" height="5" rx="1.5" fill="#34d399" transform="rotate(-10 12 80)" opacity="0.8" />
      <circle cx="95" cy="44" r="3.5" fill="#fbbf24" opacity="0.7" />
      <circle cx="16" cy="52" r="3" fill="#5b6ef5" opacity="0.7" />
      <defs>
        <linearGradient id="successGrad" x1="17" y1="17" x2="93" y2="93" gradientUnits="userSpaceOnUse">
          <stop stopColor="#34d399" /><stop offset="1" stopColor="#10b981" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ── Lock illustration for forgot password ─────────────────────── */
export function LockIllustration() {
  return (
    <svg width="90" height="90" viewBox="0 0 90 90" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="45" cy="45" r="42" fill="rgba(91,110,245,0.1)" />
      <rect x="22" y="42" width="46" height="34" rx="8" fill="url(#lockGrad)" />
      <path d="M30 42 V30 A15 15 0 0 1 60 30 V42" stroke="url(#lockGrad)" strokeWidth="6" fill="none" strokeLinecap="round" />
      <circle cx="45" cy="59" r="5" fill="rgba(0,0,0,0.3)" />
      <rect x="43" y="59" width="4" height="8" rx="2" fill="rgba(0,0,0,0.3)" />
      {/* Sparkles */}
      <circle cx="18" cy="22" r="3" fill="#60a5fa" opacity="0.6" />
      <circle cx="72" cy="20" r="2.5" fill="#fbbf24" opacity="0.7" />
      <circle cx="75" cy="65" r="2" fill="#a78bfa" opacity="0.6" />
      <defs>
        <linearGradient id="lockGrad" x1="22" y1="28" x2="68" y2="76" gradientUnits="userSpaceOnUse">
          <stop stopColor="#60a5fa" /><stop offset="1" stopColor="#5b6ef5" />
        </linearGradient>
      </defs>
    </svg>
  );
}

const FEATURES = [
  { emoji: "🔍", text: "Find study partners" },
  { emoji: "📚", text: "Access learning resources" },
  { emoji: "💬", text: "Join study rooms" },
  { emoji: "📈", text: "Track your progress" },
];

export default function MobileWelcome() {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [phase, setPhase] = useState("splash"); // "splash" | "welcome"

  /* Desktop: skip to login immediately */
  useEffect(() => {
    if (!isMobile) { navigate("/login", { replace: true }); }
  }, [isMobile, navigate]);

  /* Splash → welcome after 2 s (or instantly if already seen) */
  useEffect(() => {
    if (!isMobile) return;
    const seen = sessionStorage.getItem("pu-splash-seen");
    if (seen) { setPhase("welcome"); return; }
    const t = setTimeout(() => {
      sessionStorage.setItem("pu-splash-seen", "1");
      setPhase("welcome");
    }, 2000);
    return () => clearTimeout(t);
  }, [isMobile]);

  if (!isMobile) return null;

  /* ── SPLASH ────────────────────────────────────────────────────── */
  if (phase === "splash") {
    return (
      <div className="mob-splash">
        <div className="mob-splash-inner">
          <div className="mob-splash-logo">
            <LogoMark size={72} />
            <span className="mob-splash-wordmark">Peer<span className="mob-accent">Up</span></span>
          </div>
          <div className="mob-splash-tags">Learn · Teach · Grow</div>
          <div className="mob-splash-illus">
            <SplashIllustration />
          </div>
          <p className="mob-splash-tagline">Connecting students.<br />Building better futures.</p>
          <div className="mob-splash-dots">
            <span className="mob-dot mob-dot--active" />
            <span className="mob-dot" />
            <span className="mob-dot" />
          </div>
        </div>
      </div>
    );
  }

  /* ── WELCOME ───────────────────────────────────────────────────── */
  return (
    <div className="mob-welcome">
      <div className="mob-welcome-inner">
        {/* Logo */}
        <div className="mob-auth-logo">
          <LogoMark size={36} />
          <span className="mob-auth-wordmark">Peer<span className="mob-accent">Up</span></span>
        </div>

        {/* Hero text */}
        <div className="mob-welcome-hero">
          <h1 className="mob-welcome-title">Welcome to<br /><span className="mob-accent">PeerUp!</span></h1>
          <p className="mob-welcome-sub">Join a community of learners and start your learning journey today.</p>
        </div>

        {/* Feature list */}
        <ul className="mob-feature-list">
          {FEATURES.map(f => (
            <li key={f.text} className="mob-feature-item">
              <span className="mob-feature-check">✓</span>
              <span>{f.text}</span>
            </li>
          ))}
        </ul>

        {/* CTA */}
        <div className="mob-welcome-actions">
          <button type="button" className="mob-btn-primary" onClick={() => navigate("/signup")}>
            Get Started <span className="mob-arrow">→</span>
          </button>
          <button type="button" className="mob-btn-ghost" onClick={() => navigate("/login")}>
            I already have an account
          </button>
        </div>
      </div>
    </div>
  );
}
