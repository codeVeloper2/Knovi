import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Mail, Menu, Sparkles, Users, X, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { landingDemo } from "../api";
import { KnoAILogo, LogoMark } from "../components/Logo";
import "../styles/learn-interface.css";
import "./landing.css";
import HowKnoviWorks from "./HowKnoviWorks";

const DEMO_QUESTIONS = [
  "Can you explain what a number base is in a simple way?",
  "Can you give me a simple example of a number base?",
];

function WhatsAppIcon({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <path
        fill="currentColor"
        d="M20.52 3.48A11.8 11.8 0 0 0 12.07 0C5.55 0 .24 5.31.24 11.83c0 2.09.55 4.13 1.59 5.92L.14 24l6.4-1.68a11.78 11.78 0 0 0 5.53 1.38h.01c6.52 0 11.82-5.31 11.82-11.83 0-3.16-1.23-6.13-3.38-8.39Zm-8.45 18.2h-.01a9.82 9.82 0 0 1-5.01-1.37l-.36-.21-3.8 1 1.01-3.7-.23-.38a9.82 9.82 0 0 1-1.5-5.2C2.17 6.4 6.61 1.96 12.08 1.96c2.65 0 5.14 1.03 7.02 2.92a9.85 9.85 0 0 1 2.9 7.01c0 5.47-4.45 9.79-9.93 9.79Zm5.42-7.34c-.3-.15-1.77-.87-2.04-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.95 1.17-.17.2-.35.22-.65.07-.3-.15-1.27-.47-2.42-1.49-.89-.79-1.49-1.77-1.67-2.07-.17-.3-.02-.46.13-.61.14-.14.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.07-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.49s1.07 2.89 1.22 3.09c.15.2 2.1 3.2 5.09 4.49.71.31 1.27.49 1.7.63.72.23 1.37.2 1.89.12.58-.09 1.77-.72 2.02-1.42.25-.7.25-1.3.17-1.42-.07-.12-.27-.2-.57-.35Z"
      />
    </svg>
  );
}


function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [demo, setDemo] = useState(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem("knovi.landingDemo") || "null");
      if (saved && Number.isInteger(saved.completed) && saved.completed >= 0 && saved.completed <= DEMO_QUESTIONS.length) {
        return {
          completed: saved.completed,
          answers: Array.isArray(saved.answers) ? saved.answers.slice(0, DEMO_QUESTIONS.length) : [],
          loading: false,
        };
      }
    } catch {}
    return { completed: 0, answers: [], loading: false };
  });
  const [demoError, setDemoError] = useState("");

  useEffect(() => {
    try {
      sessionStorage.setItem("knovi.landingDemo", JSON.stringify({
        completed: demo.completed,
        answers: demo.answers,
      }));
    } catch {}
  }, [demo.completed, demo.answers]);

  async function runDemoPrompt() {
    if (demo.loading || demo.completed >= DEMO_QUESTIONS.length) return;

    const questionIndex = demo.completed;
    setDemoError("");
    setDemo((current) => ({ ...current, loading: true }));

    try {
      const data = await landingDemo(questionIndex);
      setDemo((current) => ({
        completed: questionIndex + 1,
        answers: [...current.answers, data.answer || ""],
        loading: false,
      }));
    } catch (error) {
      setDemoError(error.message || "KnoAI is temporarily unavailable.");
      setDemo((current) => ({ ...current, loading: false }));
    }
  }

  const closeMenu = () => setMobileOpen(false);

  return (
    <main className="landing-page">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link to="/" className="landing-brand" aria-label="Knovi home">
            <LogoMark size={38} />
            <span>Knovi</span>
          </Link>

          <nav className={`landing-nav-links ${mobileOpen ? "is-open" : ""}`}>
            <button onClick={() => { scrollToId("problem"); closeMenu(); }}>Why Knovi</button>
            <button onClick={() => { scrollToId("how-it-works"); closeMenu(); }}>How it works</button>
            <button onClick={() => { scrollToId("how-knovi-works"); closeMenu(); }}>Tour</button>
            <button onClick={() => { scrollToId("demo"); closeMenu(); }}>KnoAI</button>
            <button onClick={() => { scrollToId("about"); closeMenu(); }}>The builder</button>
            <button onClick={() => { scrollToId("contact"); closeMenu(); }}>Contact</button>
            <Link className="nav-login" to="/login" onClick={closeMenu}>Log in</Link>
            <Link className="nav-cta" to="/signup" onClick={closeMenu}>Get started <ArrowRight size={16} /></Link>
          </nav>

          <button className="landing-menu" onClick={() => setMobileOpen((value) => !value)} aria-label="Toggle navigation">
            {mobileOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>
      </header>

      <section className="landing-hero">
        <div className="landing-orb orb-one" />
        <div className="landing-orb orb-two" />
        <div className="landing-hero-inner">
          <div className="landing-hero-copy reveal">
            <div className="eyebrow"><Sparkles size={15} /> Learning should feel less lonely.</div>
            <h1>Learn with KnoAI.<br /><span>Challenge your peers.</span></h1>
            <p className="hero-lede">Knovi pairs an adaptive AI tutor with peer challenges — so you learn with KnoAI, then test yourself against classmates who studied the same concepts.</p>
            <div className="hero-actions">
              <Link to="/signup" className="primary-btn">Start learning free <ArrowRight size={18} /></Link>
              <button className="ghost-btn" onClick={() => scrollToId("demo")}><span className="play-dot">▶</span> See KnoAI in action</button>
            </div>
            <div className="hero-note"><CheckCircle2 size={15} /> Built for students · No subscription required to explore Knovi</div>
          </div>

          <div className="hero-visual reveal delay-one" aria-label="Knovi Learn tab preview">
            <div className="hero-glow" />
            <div className="hero-window">
              <div className="window-top"><span /><span /><span /><small>Knovi · Learn</small></div>
              <div className="hero-window-body hero-learn-clone" aria-hidden="true">
                {/* Exact structural clone of /app/learn (LearnLayout + LearnHome) — non-interactive */}
                <div className="learn-shell preview-learn-shell">
                  <aside className="learn-sidebar">
                    <div className="learn-sidebar-brand">
                      <div className="learn-sidebar-brand-icon">
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path d="M4.5 5.5A2.5 2.5 0 0 1 7 3h11v16H7a2.5 2.5 0 0 0-2.5 2.5v-16Z" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M7 19h11M8 7h7M8 10h6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div>
                        <div className="learn-sidebar-title">Learn</div>
                        <div className="learn-sidebar-subtitle">Your AI-powered learning space</div>
                      </div>
                    </div>
                    <nav className="learn-sidebar-nav">
                      <span className="learn-side-link active">
                        <span className="learn-side-icon">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4.5h9.5A3.5 3.5 0 0 1 18 8v11.5H8.5A3.5 3.5 0 0 0 5 23V4.5Z" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M5 19.5h9.5A3.5 3.5 0 0 1 18 23" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M9 8h5M9 11h5" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
                        </span>
                        <span>Subjects</span>
                      </span>
                      <span className="learn-side-link">
                        <span className="learn-side-icon">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M8 9h8M8 13h5M8 17h3" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></svg>
                        </span>
                        <span>Study Sessions</span>
                      </span>
                      <span className="learn-side-link">
                        <span className="learn-side-icon">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3.5h10v17l-5-3-5 3v-17Z" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>
                        </span>
                        <span>Saved Resources</span>
                      </span>
                      <span className="learn-side-link">
                        <span className="learn-side-icon">
                          <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="6" cy="18" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><circle cx="18" cy="6" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><circle cx="18" cy="18" r="2.5" fill="none" stroke="currentColor" strokeWidth="1.7"/><path d="M8.5 17.5h5a4.5 4.5 0 0 0 4.5-4.5V8.5" fill="none" stroke="currentColor" strokeWidth="1.7"/></svg>
                        </span>
                        <span>Learning Path</span>
                      </span>
                    </nav>
                  </aside>

                  <div className="learn-main">
                    <div className="learn-home">
                      <div className="learn-hero">
                        <div className="learn-hero-copy">
                          <div className="learn-hero-icon">
                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" stroke="currentColor" strokeWidth="1.8"/>
                              <path d="M6.5 19H18M8 7h6M8 10h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
                            </svg>
                          </div>
                          <div>
                            <h1>What would you like to learn today?</h1>
                            <p>Choose a subject and explore topics. Your AI tutor will guide you from basics to mastery.</p>
                          </div>
                        </div>
                        <form className="learn-hero-search" onSubmit={(e) => e.preventDefault()}>
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/><path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg>
                          <input
                            readOnly
                            tabIndex={-1}
                            value=""
                            placeholder="Search for a subject, topic or keyword..."
                            aria-label="Search (demo only)"
                          />
                        </form>
                      </div>

                      <div className="learn-home-highlights">
                        <section className="learn-panel learn-robot-card">
                          <div>
                            <h3>Small steps.<br />Big progress.</h3>
                            <p>Keep learning, one concept at a time.</p>
                          </div>
                          <div className="learn-growth-arrow">↗</div>
                        </section>
                        <div className="learn-focus-card">
                          <span className="learn-focus-icon">◎</span>
                          <span>
                            <strong>Today's Focus</strong>
                            <small>Mathematics · Quadratic equations</small>
                          </span>
                        </div>
                      </div>

                      <div className="learn-home-grid">
                        <section className="learn-subject-area">
                          <div className="learn-section-head">
                            <h2>All Subjects</h2>
                          </div>
                          <div className="learn-subject-grid">
                            {[
                              { name: "Mathematics", tone: "purple", symbol: "π", desc: "Algebra, Geometry, Calculus…" },
                              { name: "Physics", tone: "blue", symbol: "⚛", desc: "Mechanics, Waves, Energy…" },
                              { name: "Chemistry", tone: "green", symbol: "⚗", desc: "Organic, Inorganic, Physical…" },
                              { name: "Biology", tone: "green", symbol: "⌁", desc: "Cells, Genetics, Ecology…" },
                            ].map((s) => (
                              <div key={s.name} className="learn-subject-card">
                                <div className="learn-subject-card-top">
                                  <span className={`learn-subject-icon learn-tone-${s.tone}`}>{s.symbol}</span>
                                </div>
                                <div className="learn-subject-card-copy">
                                  <h3>{s.name}</h3>
                                  <p>{s.desc}</p>
                                </div>
                                <div className="learn-subject-card-foot">
                                  <span>Choose your class</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        </section>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="problem" className="landing-section problem-section">
        <div className="section-heading reveal"><span className="section-label">THE PROBLEM</span><h2>Studying alone gets hard <span>fast.</span></h2><p>Students can find content everywhere. What is harder is getting the right help at the right moment.</p></div>
        <div className="problem-grid">
          <article className="problem-card reveal"><div className="problem-icon">?</div><h3>“I don't get it.”</h3><p>A lesson moves on before a student has a chance to understand the part that confused them.</p></article>
          <article className="problem-card reveal delay-one"><div className="problem-icon">↔</div><h3>Learning is isolated</h3><p>Knowing other students exist does not automatically make it easy to find someone who can actually help.</p></article>
          <article className="problem-card reveal delay-two"><div className="problem-icon">⌁</div><h3>Too much scattered help</h3><p>Videos, notes, chats and AI tools live in different places, making it harder to keep a learning flow.</p></article>
        </div>
      </section>

      <section id="how-it-works" className="landing-section how-section">
        <div className="section-heading reveal"><span className="section-label">HOW IT WORKS</span><h2>One learning space.<br /><span>Three ways to move forward.</span></h2></div>
        <div className="steps-grid">
          <div className="step reveal"><span className="step-number">01</span><div className="step-icon"><Users size={22} /></div><h3>Find your people</h3><p>Discover classmates on the same journey — chat, compare progress, and challenge each other on shared concepts.</p></div>
          <div className="step reveal delay-one"><span className="step-number">02</span><div className="step-icon"><KnoAILogo size={25} /></div><h3>Ask KnoAI</h3><p>Work through concepts with an adaptive tutor that guides the conversation instead of dumping an answer.</p></div>
          <div className="step reveal delay-two"><span className="step-number">03</span><div className="step-icon"><Zap size={22} /></div><h3>Keep going</h3><p>Practise with KnoAI, challenge peers on what you both learned, and track XP, streaks, and progress.</p></div>
        </div>
      </section>

      <HowKnoviWorks />

      <section id="demo" className="landing-section demo-section">
        <div className="section-heading reveal">
          <span className="section-label">LIVE KNOAI DEMO</span>
          <h2>The real learning room.<br /><span>One guided demo session.</span></h2>
          <p>
            This uses the same Learning Room structure and message experience as <strong>/app/learn</strong>.
            The demo keeps the learner's input locked to two guided questions, while every KnoAI response is generated live.
          </p>
        </div>

        <div className="demo-room reveal delay-one" aria-label="KnoAI live learning room demo">
          <header className="demo-room-header">
            <div className="demo-room-header-left">
              <span className="demo-room-back" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </span>
              <div className="demo-room-titles">
                <strong>AI Learning Room</strong>
                <span>Teaching · Mathematics · Number Bases</span>
              </div>
            </div>
            <div className="demo-room-header-right">
              <span className="demo-room-phase">TEACHING</span>
              <span className="demo-room-badge">LIVE DEMO</span>
            </div>
          </header>

          <div className="demo-room-body">
            <aside className="demo-room-sidebar" aria-hidden="true">
              <div className="demo-sidebar-head">
                <span className="demo-eyebrow">LEARNING PLAN</span>
                <strong>{demo.completed >= 2 ? "2 of 3 complete" : demo.completed >= 1 ? "1 of 3 complete" : "0 of 3 complete"}</strong>
              </div>
              <div className="demo-plan-progress">
                <div className="demo-plan-ring"><span>{demo.completed >= 2 ? "67%" : demo.completed >= 1 ? "33%" : "0%"}</span></div>
                <div>
                  <b>Understand number bases</b>
                  <small>CURRENT FOCUS</small>
                </div>
              </div>
              <ul className="demo-task-list">
                <li className={demo.completed >= 1 ? "done" : "active"}><span>{demo.completed >= 1 ? "✓" : "1"}</span> Core explanation</li>
                <li className={demo.completed >= 2 ? "done" : demo.completed === 1 ? "active" : ""}><span>{demo.completed >= 2 ? "✓" : "2"}</span> Worked example</li>
                <li><span>3</span> Quick check</li>
              </ul>
            </aside>

            <div className="demo-room-main">
              <div className="demo-room-thread">
                <div className="demo-room-context">
                  <KnoAILogo size={22} />
                  <div>
                    <strong>KnoAI tutor</strong>
                    <small>Guided learning session</small>
                  </div>
                </div>

                {DEMO_QUESTIONS.slice(0, Math.min(demo.completed + (demo.loading ? 1 : 0), DEMO_QUESTIONS.length)).map((question, index) => (
                  <Fragment key={`demo-turn-${index}`}>
                    <div className="demo-msg demo-msg-user">
                      <div className="demo-msg-meta">You</div>
                      <div className="demo-msg-bubble demo-msg-bubble-user">{question}</div>
                    </div>
                    {(index < demo.completed || (demo.loading && index === demo.completed)) && (
                      <div className="demo-msg demo-msg-ai">
                        <div className="demo-msg-meta"><KnoAILogo size={18} /><span>KnoAI</span></div>
                        <div className="demo-msg-bubble demo-msg-bubble-ai">
                          {demo.loading && index === demo.completed ? (
                            <span className="demo-thinking" aria-label="KnoAI is thinking"><i /><i /><i /></span>
                          ) : (demo.answers[index] || "")}
                        </div>
                      </div>
                    )}
                  </Fragment>
                ))}

                {demoError && <div className="demo-error demo-inline-error">{demoError}</div>}

                {demo.completed === 1 && !demo.loading && (
                  <div className="demo-next-prompt">
                    <span>Next guided prompt</span>
                    <strong>{DEMO_QUESTIONS[1]}</strong>
                  </div>
                )}

              </div>

              <div className="demo-room-composer" aria-disabled="true">
                {demo.completed < DEMO_QUESTIONS.length ? (
                  <>
                    <div className="demo-composer-lock">
                      <span className="demo-lock-icon" aria-hidden="true">🔒</span>
                      <div className="demo-composer-field">
                        <span className="demo-composer-placeholder">{DEMO_QUESTIONS[demo.completed]}</span>
                        <span className="demo-composer-hint">Guided demo prompt · input is locked</span>
                      </div>
                      <button type="button" className="demo-composer-send" onClick={runDemoPrompt} disabled={demo.loading}>
                        {demo.loading ? "Thinking…" : demo.completed === 0 ? "Send" : "Continue"}
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="demo-composer-cta demo-limit-cta">
                    <div>
                      <strong>You've reached the end of the demo.</strong>
                      <span>Create an account or log in to get full access to KNoAI.</span>
                    </div>
                    <div className="demo-cta-actions">
                      <Link to="/signup" className="demo-cta-primary">Create account <ArrowRight size={15} /></Link>
                      <Link to="/login" className="demo-cta-secondary">Log in</Link>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section id="about" className="landing-section builder-section">
        <div className="builder-card reveal">
          <div className="builder-avatar">BE</div>
          <div className="builder-copy"><span className="section-label">THE PERSON BEHIND KNOVI</span><h2>Built by <span>Babalola Ezekiel.</span></h2><p>Knovi is a solo-built project focused on making learning more connected and more useful for students. The product, interface, backend, AI learning system and real-time features are being built hands-on from the ground up.</p><div className="builder-tags"><span>Product</span><span>Frontend</span><span>Backend</span><span>AI</span><span>UI/UX</span></div></div>
          <div className="builder-mark"><LogoMark size={76} /></div>
        </div>
      </section>

      <section id="contact" className="landing-section contact-section">
        <div className="contact-card reveal">
          <div><span className="section-label">CONTACT</span><h2>Want to talk about Knovi?</h2><p>Questions, feedback, collaboration ideas or just want to see what is being built? Reach out through the project.</p></div>
          <div className="contact-actions"><a href="mailto:codeveloper95@gmail.com" className="contact-btn"><Mail size={18} /> codeveloper95@gmail.com</a><a href="https://wa.me/2347041344892" target="_blank" rel="noreferrer" className="contact-btn secondary"><WhatsAppIcon size={18} /> 07041344892</a></div>
        </div>
      </section>

      <section className="landing-final-cta reveal"><KnoAILogo size={54} /><span className="section-label">READY WHEN YOU ARE</span><h2>Learn with AI. Prove it with peers.</h2><Link to="/signup" className="primary-btn">Join Knovi <ArrowRight size={18} /></Link></section>

      <footer className="landing-footer"><div className="landing-footer-inner"><div className="footer-brand"><LogoMark size={30} /><strong>Knovi</strong><span>Learn. Connect. Grow.</span></div><div className="footer-links"><button onClick={() => scrollToId("problem")}>Why Knovi</button><button onClick={() => scrollToId("demo")}>KnoAI</button><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div><span>© {new Date().getFullYear()} Knovi</span></div></footer>
    </main>
  );
}
