/**
 * How Knovi Works — animated product walkthrough (landing only).
 * Non-interactive: no API calls, no real auth, no real chat/match.
 * Reuses existing Knovi visual language (learn-*, auth, disc, chat cues).
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Pause, Play } from "lucide-react";
import { KnoAILogo, LogoMark } from "../components/Logo";
import "../styles/learn-interface.css";
import "./how-knovi-works.css";

const STEP_MS = 3200;

const STEPS = [
  { id: "login", label: "Sign in", title: "Login / Sign up" },
  { id: "dashboard", label: "Home", title: "Dashboard" },
  { id: "learn", label: "Learn", title: "Learn hub" },
  { id: "subject", label: "Subject", title: "General Mathematics" },
  { id: "class", label: "Class", title: "Choose class" },
  { id: "topics", label: "Topics", title: "Topics" },
  { id: "concept", label: "Concept", title: "Quadratic equations" },
  { id: "plan", label: "Plan", title: "Learning plan" },
  { id: "room", label: "KnoAI", title: "Learning Room" },
  { id: "practice", label: "Practice", title: "Practice" },
  { id: "progress", label: "Progress", title: "Progress" },
  { id: "discover", label: "Discover", title: "Discover peers" },
  { id: "match", label: "Match", title: "Match request" },
  { id: "chat", label: "Chat", title: "Chat" },
  { id: "study", label: "Study", title: "Study Room" },
  { id: "settings", label: "Settings", title: "Settings" },
  { id: "cta", label: "Start", title: "Get started" },
];

function ShellChrome({ title, children }) {
  return (
    <div className="hkw-frame" aria-hidden="true">
      <div className="hkw-chrome">
        <span className="hkw-dots"><i /><i /><i /></span>
        <small>Knovi · {title}</small>
      </div>
      <div className="hkw-screen">{children}</div>
    </div>
  );
}

function AppChrome({ active, children }) {
  return (
    <div className="hkw-app">
      <aside className="hkw-side">
        <div className="hkw-side-brand">
          <LogoMark size={22} />
          <b>Knovi</b>
        </div>
        {["Home", "Discover", "Chat", "Learn", "Progress", "Settings"].map((item) => (
          <div key={item} className={`hkw-side-link${active === item ? " active" : ""}`}>{item}</div>
        ))}
      </aside>
      <div className="hkw-main">{children}</div>
    </div>
  );
}

function ScreenLogin() {
  return (
    <ShellChrome title="Sign in">
      <div className="hkw-auth">
        <div className="hkw-auth-brand">
          <LogoMark size={28} />
          <span>Kno<span className="logo-accent">vi</span></span>
          <p>Learn Smarter. Grow Faster.</p>
        </div>
        <div className="hkw-auth-card">
          <h3>Welcome back</h3>
          <div className="hkw-field"><span>Email</span><div className="hkw-input">you@school.edu</div></div>
          <div className="hkw-field"><span>Password</span><div className="hkw-input">••••••••</div></div>
          <div className="hkw-btn primary">Log in</div>
          <div className="hkw-btn ghost">Continue with Google</div>
        </div>
      </div>
    </ShellChrome>
  );
}

function ScreenDashboard() {
  return (
    <ShellChrome title="Home">
      <AppChrome active="Home">
        <div className="hkw-dash">
          <p className="hkw-kicker">PEERUP LEARNING SPACE</p>
          <h2>Good to see you, Ada</h2>
          <div className="hkw-cards">
            <div className="hkw-card accent">
              <KnoAILogo size={28} />
              <div><b>Continue with KnoAI</b><small>Quadratic equations · Teaching</small></div>
            </div>
            <div className="hkw-card"><b>Discover peers</b><small>3 new matches nearby</small></div>
            <div className="hkw-card"><b>Study streak</b><small>5 days · keep going</small></div>
          </div>
        </div>
      </AppChrome>
    </ShellChrome>
  );
}

function ScreenLearn() {
  return (
    <ShellChrome title="Learn">
      <AppChrome active="Learn">
        <div className="learn-home hkw-learn-pad">
          <div className="learn-hero">
            <div className="learn-hero-copy">
              <div>
                <h1>What would you like to learn today?</h1>
                <p>Choose a subject and explore topics with your AI tutor.</p>
              </div>
            </div>
            <div className="learn-hero-search"><span>Search subjects…</span></div>
          </div>
          <div className="learn-subject-grid hkw-subject-grid">
            {[
              { name: "General Mathematics", tone: "purple", symbol: "π" },
              { name: "Physics", tone: "blue", symbol: "⚛" },
              { name: "Chemistry", tone: "green", symbol: "⚗" },
              { name: "Biology", tone: "green", symbol: "⌁" },
            ].map((s) => (
              <div key={s.name} className="learn-subject-card">
                <div className="learn-subject-card-top">
                  <span className={`learn-subject-icon learn-tone-${s.tone}`}>{s.symbol}</span>
                </div>
                <div className="learn-subject-card-copy">
                  <h3>{s.name}</h3>
                  <p>Explore topics and concepts</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </AppChrome>
    </ShellChrome>
  );
}

function ScreenSubject() {
  return (
    <ShellChrome title="General Mathematics">
      <AppChrome active="Learn">
        <div className="hkw-stack">
          <div className="hkw-breadcrumb">Learn / General Mathematics</div>
          <h2>General Mathematics</h2>
          <p className="hkw-muted">Algebra, geometry, and problem-solving for senior secondary.</p>
          <div className="hkw-pill-row">
            <span className="hkw-pill active">SSS1</span>
            <span className="hkw-pill">SSS2</span>
            <span className="hkw-pill">SSS3</span>
          </div>
          <div className="hkw-list">
            <div className="hkw-list-item"><b>Number & Numeration</b><small>8 topics</small></div>
            <div className="hkw-list-item highlight"><b>Algebraic Processes</b><small>12 topics</small></div>
            <div className="hkw-list-item"><b>Geometry</b><small>10 topics</small></div>
          </div>
        </div>
      </AppChrome>
    </ShellChrome>
  );
}

function ScreenClass() {
  return (
    <ShellChrome title="Choose class">
      <AppChrome active="Learn">
        <div className="hkw-stack center">
          <h2>Select your class</h2>
          <p className="hkw-muted">General Mathematics</p>
          <div className="hkw-class-grid">
            {["SSS1", "SSS2", "SSS3"].map((c, i) => (
              <div key={c} className={`hkw-class-card${i === 1 ? " selected" : ""}`}>
                <b>{c}</b>
                <small>Senior Secondary {c.slice(-1)}</small>
              </div>
            ))}
          </div>
        </div>
      </AppChrome>
    </ShellChrome>
  );
}

function ScreenTopics() {
  return (
    <ShellChrome title="Topics · SSS2">
      <AppChrome active="Learn">
        <div className="hkw-stack">
          <div className="hkw-breadcrumb">General Mathematics / SSS2</div>
          <h2>Algebraic Processes</h2>
          <div className="hkw-list">
            {["Linear equations", "Quadratic equations", "Simultaneous equations", "Inequalities"].map((t, i) => (
              <div key={t} className={`hkw-list-item${i === 1 ? " highlight" : ""}`}>
                <b>{t}</b>
                <small>{i === 1 ? "In progress" : "Not started"}</small>
              </div>
            ))}
          </div>
        </div>
      </AppChrome>
    </ShellChrome>
  );
}

function ScreenConcept() {
  return (
    <ShellChrome title="Concept">
      <AppChrome active="Learn">
        <div className="hkw-stack">
          <div className="hkw-breadcrumb">Quadratic equations</div>
          <h2>Solving by factorization</h2>
          <div className="hkw-concept-card">
            <p>
              A quadratic equation has the form <code>ax² + bx + c = 0</code>.
              Factorization rewrites it as a product of linear factors so you can find the roots.
            </p>
            <div className="hkw-btn primary sm">Start with KnoAI</div>
          </div>
        </div>
      </AppChrome>
    </ShellChrome>
  );
}

function ScreenPlan() {
  return (
    <ShellChrome title="Learning plan">
      <AppChrome active="Learn">
        <div className="hkw-stack">
          <h2>Your learning plan</h2>
          <div className="hkw-plan">
            {[
              { n: "✓", t: "Understand the form ax² + bx + c", done: true },
              { n: "2", t: "Factor simple quadratics", active: true },
              { n: "3", t: "Solve by factorization", done: false },
              { n: "4", t: "Check roots in the original equation", done: false },
            ].map((row) => (
              <div key={row.t} className={`hkw-plan-row${row.active ? " active" : ""}${row.done ? " done" : ""}`}>
                <span>{row.n}</span>
                <b>{row.t}</b>
              </div>
            ))}
          </div>
        </div>
      </AppChrome>
    </ShellChrome>
  );
}

function ScreenRoom() {
  return (
    <ShellChrome title="AI Learning Room">
      <div className="hkw-room">
        <header className="hkw-room-head">
          <div>
            <strong>AI Learning Room</strong>
            <small>Teaching · Quadratic equations</small>
          </div>
          <span className="hkw-badge">TEACHING</span>
        </header>
        <div className="hkw-room-body">
          <div className="hkw-msg ai">
            <KnoAILogo size={20} />
            <div>
              <b>KnoAI</b>
              <p>Let’s factor <code>x² − 5x + 6</code>. We look for two numbers that multiply to 6 and add to −5: −2 and −3.</p>
            </div>
          </div>
          <div className="hkw-msg user">
            <p>So it becomes (x − 2)(x − 3) = 0?</p>
          </div>
          <div className="hkw-msg ai">
            <KnoAILogo size={20} />
            <div>
              <b>KnoAI</b>
              <p>Exactly. Roots are x = 2 and x = 3. Next we’ll verify by expanding.</p>
            </div>
          </div>
        </div>
        <div className="hkw-room-input locked">Ask anything about this concept… 🔒</div>
      </div>
    </ShellChrome>
  );
}

function ScreenPractice() {
  return (
    <ShellChrome title="Practice">
      <div className="hkw-room">
        <header className="hkw-room-head">
          <div>
            <strong>Practice mode</strong>
            <small>Question 1 of 3</small>
          </div>
          <span className="hkw-badge practice">PRACTICE</span>
        </header>
        <div className="hkw-room-body">
          <div className="hkw-quiz">
            <p className="hkw-quiz-q">Factorize: x² − 7x + 12</p>
            <div className="hkw-quiz-opts">
              <div className="hkw-opt">(x − 3)(x − 4)</div>
              <div className="hkw-opt selected correct">(x − 3)(x − 4) ✓</div>
              <div className="hkw-opt">(x − 2)(x − 6)</div>
            </div>
            <p className="hkw-quiz-fb">Correct — 3 and 4 multiply to 12 and add to 7.</p>
          </div>
        </div>
      </div>
    </ShellChrome>
  );
}

function ScreenProgress() {
  return (
    <ShellChrome title="Progress">
      <AppChrome active="Progress">
        <div className="hkw-stack">
          <h2>Your progress</h2>
          <div className="hkw-progress-grid">
            <div className="hkw-stat"><b>12</b><small>Sessions</small></div>
            <div className="hkw-stat"><b>68%</b><small>Mastery</small></div>
            <div className="hkw-stat"><b>5</b><small>Day streak</small></div>
          </div>
          <div className="hkw-bar-row"><span>Quadratic equations</span><div className="hkw-bar"><i style={{ width: "72%" }} /></div></div>
          <div className="hkw-bar-row"><span>Linear equations</span><div className="hkw-bar"><i style={{ width: "90%" }} /></div></div>
          <div className="hkw-bar-row"><span>Simultaneous equations</span><div className="hkw-bar"><i style={{ width: "40%" }} /></div></div>
        </div>
      </AppChrome>
    </ShellChrome>
  );
}

function ScreenDiscover() {
  return (
    <ShellChrome title="Discover">
      <AppChrome active="Discover">
        <div className="hkw-stack">
          <h2>Find learning partners</h2>
          <div className="hkw-peer-grid">
            {[
              { n: "Chidi O.", s: "Mathematics · Physics", m: "92% overlap" },
              { n: "Fatima A.", s: "Mathematics · Chemistry", m: "81% overlap" },
              { n: "Tunde B.", s: "Physics · Further Maths", m: "76% overlap" },
            ].map((p) => (
              <div key={p.n} className="hkw-peer">
                <div className="hkw-avatar">{p.n[0]}</div>
                <div>
                  <b>{p.n}</b>
                  <small>{p.s}</small>
                  <em>{p.m}</em>
                </div>
              </div>
            ))}
          </div>
        </div>
      </AppChrome>
    </ShellChrome>
  );
}

function ScreenMatch() {
  return (
    <ShellChrome title="Match request">
      <AppChrome active="Discover">
        <div className="hkw-stack center">
          <div className="hkw-peer big">
            <div className="hkw-avatar lg">C</div>
            <div>
              <b>Chidi O.</b>
              <small>Can teach: Quadratic equations</small>
            </div>
          </div>
          <div className="hkw-match-card">
            <p>Request help with <b>General Mathematics · Quadratic equations</b></p>
            <div className="hkw-btn primary">Send match request</div>
            <small className="hkw-sent">✓ Request sent — waiting for Chidi</small>
          </div>
        </div>
      </AppChrome>
    </ShellChrome>
  );
}

function ScreenChat() {
  return (
    <ShellChrome title="Chat">
      <AppChrome active="Chat">
        <div className="hkw-chat">
          <div className="hkw-chat-head">
            <div className="hkw-avatar">C</div>
            <div><b>Chidi O.</b><small>Online · Mathematics</small></div>
          </div>
          <div className="hkw-chat-body">
            <div className="hkw-bubble them">Hey! Happy to help with factoring quadratics.</div>
            <div className="hkw-bubble me">Thanks — stuck on x² − 5x + 6.</div>
            <div className="hkw-bubble them">Look for two numbers that multiply to 6 and add to −5.</div>
          </div>
          <div className="hkw-chat-input locked">Message… 🔒</div>
        </div>
      </AppChrome>
    </ShellChrome>
  );
}

function ScreenStudy() {
  return (
    <ShellChrome title="Study Room">
      <div className="hkw-study">
        <div className="hkw-study-top">
          <div>
            <strong>Study Room</strong>
            <small>Goal: Master factorization · with Chidi</small>
          </div>
          <div className="hkw-timer">24:18</div>
        </div>
        <div className="hkw-study-grid">
          <div className="hkw-study-panel">
            <b>Shared notes</b>
            <p>(x − 2)(x − 3) = x² − 5x + 6</p>
          </div>
          <div className="hkw-study-panel">
            <b>Whiteboard</b>
            <div className="hkw-whiteboard">x² − 5x + 6 = 0</div>
          </div>
          <div className="hkw-study-panel">
            <b>Materials</b>
            <small>Quadratic equations · Worksheet</small>
          </div>
          <div className="hkw-study-panel">
            <b>Partner</b>
            <small>Chidi · focused</small>
          </div>
        </div>
      </div>
    </ShellChrome>
  );
}

function ScreenSettings() {
  return (
    <ShellChrome title="Settings">
      <AppChrome active="Settings">
        <div className="hkw-stack">
          <h2>Settings</h2>
          <div className="hkw-list">
            <div className="hkw-list-item"><b>Profile</b><small>Name, photo, grade</small></div>
            <div className="hkw-list-item"><b>Learning profile</b><small>How you learn best</small></div>
            <div className="hkw-list-item"><b>Privacy</b><small>Discoverability & messages</small></div>
            <div className="hkw-list-item"><b>Notifications</b><small>Matches, chat, reminders</small></div>
          </div>
        </div>
      </AppChrome>
    </ShellChrome>
  );
}

function ScreenCta() {
  return (
    <ShellChrome title="Get started">
      <div className="hkw-cta">
        <LogoMark size={48} />
        <h2>Ready to learn with Knovi?</h2>
        <p>AI tutoring, practice, peers, and progress — in one place.</p>
        <Link to="/signup" className="hkw-btn primary lg" tabIndex={-1}>
          Get Started <ArrowRight size={16} />
        </Link>
        <Link to="/login" className="hkw-btn ghost" tabIndex={-1}>Log in</Link>
      </div>
    </ShellChrome>
  );
}

const SCREENS = {
  login: ScreenLogin,
  dashboard: ScreenDashboard,
  learn: ScreenLearn,
  subject: ScreenSubject,
  class: ScreenClass,
  topics: ScreenTopics,
  concept: ScreenConcept,
  plan: ScreenPlan,
  room: ScreenRoom,
  practice: ScreenPractice,
  progress: ScreenProgress,
  discover: ScreenDiscover,
  match: ScreenMatch,
  chat: ScreenChat,
  study: ScreenStudy,
  settings: ScreenSettings,
  cta: ScreenCta,
};

export default function HowKnoviWorks() {
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    if (!playing) return undefined;
    const t = setTimeout(() => {
      setIndex((i) => (i + 1) % STEPS.length);
      setAnimKey((k) => k + 1);
    }, STEP_MS);
    return () => clearTimeout(t);
  }, [index, playing]);

  const step = STEPS[index];
  const Screen = SCREENS[step.id];

  return (
    <section id="how-knovi-works" className="landing-section hkw-section">
      <div className="section-heading reveal">
        <span className="section-label">PRODUCT TOUR</span>
        <h2>How Knovi Works</h2>
        <p>Everything you need to learn, practice, and grow — in one place.</p>
      </div>

      <div className="hkw-tour reveal delay-one">
        <div className="hkw-toolbar">
          <div className="hkw-step-meta">
            <span className="hkw-step-count">
              {String(index + 1).padStart(2, "0")} / {String(STEPS.length).padStart(2, "0")}
            </span>
            <span className="hkw-step-title">{step.title}</span>
          </div>
          <div className="hkw-toolbar-actions">
            <button
              type="button"
              className="hkw-ctrl"
              onClick={() => setPlaying((p) => !p)}
              aria-label={playing ? "Pause walkthrough" : "Play walkthrough"}
            >
              {playing ? <Pause size={16} /> : <Play size={16} />}
            </button>
          </div>
        </div>

        <div className="hkw-stage" key={animKey}>
          <Screen />
        </div>

        <div className="hkw-dots-nav" role="tablist" aria-label="Walkthrough steps">
          {STEPS.map((s, i) => (
            <button
              key={s.id}
              type="button"
              className={`hkw-dot${i === index ? " active" : ""}`}
              aria-label={s.title}
              aria-current={i === index ? "step" : undefined}
              onClick={() => {
                setIndex(i);
                setAnimKey((k) => k + 1);
              }}
            />
          ))}
        </div>

        <p className="hkw-disclaimer">
          This is a visual walkthrough only. Sign up to use the real Knovi features.
        </p>

        <div className="hkw-final-cta">
          <h3>Ready to start learning?</h3>
          <Link to="/signup" className="primary-btn">
            Get Started <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}
