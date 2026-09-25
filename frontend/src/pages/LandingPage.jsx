import { useEffect, useRef, useState } from "react";
import { ArrowRight, CheckCircle2, Github, Mail, Menu, Sparkles, Users, X, Zap } from "lucide-react";
import { Link } from "react-router-dom";
import { landingDemo } from "../api";
import { KnoAILogo, LogoMark } from "../components/Logo";
import "./landing.css";

const DEMO_QUESTIONS = [
  "Can you explain photosynthesis simply?",
  "Why does the moon not fall to Earth?",
  "How do I solve 2x + 4 = 10?",
  "What is the difference between speed and velocity?",
];

function scrollToId(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function LandingPage() {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [demo, setDemo] = useState({ question: DEMO_QUESTIONS[0], answer: "", loading: true, questionIndex: 0 });
  const [demoError, setDemoError] = useState("");
  const timerRef = useRef(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const questionIndex = demo.questionIndex;
    const question = DEMO_QUESTIONS[questionIndex];
    setDemo((current) => ({ ...current, question, answer: "", loading: true }));
    setDemoError("");

    landingDemo(questionIndex)
      .then((data) => {
        if (cancelled || !mountedRef.current) return;
        setDemo((current) => ({ ...current, answer: data.answer || "", loading: false }));
        timerRef.current = setTimeout(() => {
          setDemo((current) => ({
            ...current,
            questionIndex: (current.questionIndex + 1) % DEMO_QUESTIONS.length,
          }));
        }, 6200);
      })
      .catch((error) => {
        if (cancelled || !mountedRef.current) return;
        setDemoError(error.message || "KnoAI is temporarily unavailable.");
        setDemo((current) => ({ ...current, loading: false }));
        timerRef.current = setTimeout(() => {
          setDemo((current) => ({
            ...current,
            questionIndex: (current.questionIndex + 1) % DEMO_QUESTIONS.length,
          }));
        }, 3500);
      });

    return () => {
      cancelled = true;
      clearTimeout(timerRef.current);
    };
  }, [demo.questionIndex]);

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
            <h1>Learn with people.<br /><span>Think with KnoAI.</span></h1>
            <p className="hero-lede">Knovi brings peer learning and an adaptive AI tutor into one place — so when you are stuck, you have somewhere to turn.</p>
            <div className="hero-actions">
              <Link to="/signup" className="primary-btn">Start learning free <ArrowRight size={18} /></Link>
              <button className="ghost-btn" onClick={() => scrollToId("demo")}><span className="play-dot">▶</span> See KnoAI in action</button>
            </div>
            <div className="hero-note"><CheckCircle2 size={15} /> Built for students · No subscription required to explore Knovi</div>
          </div>

          <div className="hero-visual reveal delay-one" aria-label="Knovi learning preview">
            <div className="hero-glow" />
            <div className="hero-window">
              <div className="window-top"><span /><span /><span /><small>Knovi · Learning room</small></div>
              <div className="hero-window-body">
                <div className="preview-side">
                  <div className="preview-brand"><LogoMark size={26} /><b>Knovi</b></div>
                  <div className="preview-nav active">Learn</div>
                  <div className="preview-nav">Discover</div>
                  <div className="preview-nav">Chat</div>
                </div>
                <div className="preview-main">
                  <span className="mini-kicker">TODAY'S FOCUS</span>
                  <h3>Quadratic equations</h3>
                  <div className="preview-card"><KnoAILogo size={42} /><div><b>KnoAI is ready</b><small>Let's work through this together.</small></div></div>
                  <div className="preview-lines"><i /><i /><i /></div>
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
          <div className="step reveal"><span className="step-number">01</span><div className="step-icon"><Users size={22} /></div><h3>Find your people</h3><p>Discover students who can teach what you need or learn what you know.</p></div>
          <div className="step reveal delay-one"><span className="step-number">02</span><div className="step-icon"><KnoAILogo size={25} /></div><h3>Ask KnoAI</h3><p>Work through concepts with an adaptive tutor that guides the conversation instead of dumping an answer.</p></div>
          <div className="step reveal delay-two"><span className="step-number">03</span><div className="step-icon"><Zap size={22} /></div><h3>Keep going</h3><p>Study together, practise, challenge yourself and build progress around what you actually need.</p></div>
        </div>
      </section>

      <section id="demo" className="landing-section demo-section">
        <div className="section-heading reveal"><span className="section-label">LIVE KNOAI DEMO</span><h2>Not a video.<br /><span>A real AI response.</span></h2><p>The questions below are fixed for the public demo. KnoAI still generates the replies through the live AI service — visitors cannot use this demo as an open chatbot.</p></div>
        <div className="demo-shell reveal delay-one">
          <div className="demo-head"><div className="demo-agent"><KnoAILogo size={46} /><div><strong>KnoAI</strong><span><i /> Live AI demonstration</span></div></div><span className="demo-badge">AUTO DEMO</span></div>
          <div className="demo-thread">
            <div className="demo-context"><span>KNOVI · AI LEARNING</span><small>Watch a real learning exchange happen</small></div>
            <div className="demo-message-row outgoing">
              <div key={`${demo.questionIndex}-q`} className="demo-bubble demo-bubble-user is-new-sent">{demo.question}</div>
            </div>
            <div className="demo-message-row incoming">
              <KnoAILogo size={28} className="demo-ai-avatar" />
              <div className="demo-bubble demo-bubble-ai">
                {demo.loading ? <span className="demo-thinking"><i /><i /><i /></span> : demoError ? <span>{demoError}</span> : demo.answer}
              </div>
            </div>
          </div>
          <div className="demo-footer"><span><span className="lock-dot">●</span> Demo questions are preset</span><Link to="/signup">Create an account to use KnoAI yourself <ArrowRight size={15} /></Link></div>
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
          <div className="contact-actions"><a href="https://github.com/codeVeloper2/Knovi" target="_blank" rel="noreferrer" className="contact-btn"><Github size={18} /> GitHub</a><a href="mailto:hello@knovi.app" className="contact-btn secondary"><Mail size={18} /> Email</a></div>
        </div>
      </section>

      <section className="landing-final-cta reveal"><KnoAILogo size={54} /><span className="section-label">READY WHEN YOU ARE</span><h2>Learning gets better when you don't have to do it alone.</h2><Link to="/signup" className="primary-btn">Join Knovi <ArrowRight size={18} /></Link></section>

      <footer className="landing-footer"><div className="landing-footer-inner"><div className="footer-brand"><LogoMark size={30} /><strong>Knovi</strong><span>Learn. Connect. Grow.</span></div><div className="footer-links"><button onClick={() => scrollToId("problem")}>Why Knovi</button><button onClick={() => scrollToId("demo")}>KnoAI</button><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link></div><span>© {new Date().getFullYear()} Knovi</span></div></footer>
    </main>
  );
}
