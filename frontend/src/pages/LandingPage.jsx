import { useEffect, useRef, useState } from "react";
import { ArrowRight, BookOpen, Check, ChevronDown, Github, Mail, Menu, MessageCircle, Play, Sparkles, Users, X } from "lucide-react";
import { Link } from "react-router-dom";
import { LogoMark, KnoAILogo } from "../components/Logo";
import "./landing.css";

const API_BASE = import.meta.env.VITE_API_URL || "";

const demoSuggestions = [
  "Explain photosynthesis simply",
  "Why does 2x + 4 = 10 give x = 3?",
  "How do I study better for a test?",
];

function scrollTo(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

export default function LandingPage() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [demoInput, setDemoInput] = useState("");
  const [messages, setMessages] = useState([
    { role: "ai", text: "Hey! I’m KnoAI. Ask me anything you’re learning. I’ll help you understand it, not just give you the answer." },
  ]);
  const [demoBusy, setDemoBusy] = useState(false);
  const [demoError, setDemoError] = useState("");
  const demoRef = useRef(null);

  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    }, { threshold: 0.12 });
    document.querySelectorAll(".landing-reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    demoRef.current?.scrollTo({ top: demoRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, demoBusy]);

  async function sendDemo(e) {
    e?.preventDefault();
    const message = demoInput.trim();
    if (!message || demoBusy) return;
    setDemoInput("");
    setDemoError("");
    setMessages((prev) => [...prev, { role: "user", text: message }]);
    setDemoBusy(true);
    try {
      const res = await fetch(`${API_BASE}/api/ai/demo`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.detail || "KnoAI couldn't answer right now.");
      setMessages((prev) => [...prev, { role: "ai", text: data.reply || "I couldn't generate a reply just now." }]);
    } catch (err) {
      setDemoError(err.message || "KnoAI couldn't answer right now.");
      setMessages((prev) => prev.filter((item, index) => !(index === prev.length - 1 && item.role === "user" && item.text === message)));
    } finally {
      setDemoBusy(false);
    }
  }

  return (
    <div className="landing-page">
      <header className="landing-nav">
        <div className="landing-nav-inner">
          <Link className="landing-brand" to="/">
            <LogoMark size={38} />
            <span>Knovi</span>
          </Link>
          <nav className={`landing-nav-links ${menuOpen ? "open" : ""}`}>
            <button onClick={() => { scrollTo("problem"); setMenuOpen(false); }}>Why Knovi</button>
            <button onClick={() => { scrollTo("how"); setMenuOpen(false); }}>How it works</button>
            <button onClick={() => { scrollTo("demo"); setMenuOpen(false); }}>Try KnoAI</button>
            <button onClick={() => { scrollTo("story"); setMenuOpen(false); }}>The story</button>
            <button onClick={() => { scrollTo("contact"); setMenuOpen(false); }}>Contact</button>
            <div className="landing-mobile-actions">
              <Link to="/login" onClick={() => setMenuOpen(false)}>Log in</Link>
              <Link className="landing-btn landing-btn-small" to="/signup" onClick={() => setMenuOpen(false)}>Get started</Link>
            </div>
          </nav>
          <div className="landing-nav-actions">
            <Link className="landing-login" to="/login">Log in</Link>
            <Link className="landing-btn landing-btn-small" to="/signup">Get started <ArrowRight size={15} /></Link>
          </div>
          <button className="landing-menu" aria-label="Menu" onClick={() => setMenuOpen((v) => !v)}>{menuOpen ? <X /> : <Menu />}</button>
        </div>
      </header>

      <main>
        <section className="landing-hero">
          <div className="landing-hero-glow glow-one" />
          <div className="landing-hero-glow glow-two" />
          <div className="landing-hero-content landing-reveal">
            <div className="landing-eyebrow"><span><Sparkles size={14} /> Built for students</span></div>
            <h1>Learning should feel like <em>progress</em>, not pressure.</h1>
            <p>Knovi brings students together to learn, teach, practice, and grow — with an AI companion that actually helps you understand.</p>
            <div className="landing-hero-actions">
              <Link className="landing-btn landing-btn-primary" to="/signup">Start learning free <ArrowRight size={17} /></Link>
              <button className="landing-btn landing-btn-ghost" onClick={() => scrollTo("demo")}><Play size={16} /> Meet KnoAI</button>
            </div>
            <div className="landing-proof"><span><Check size={14} /> Free to start</span><span><Check size={14} /> Built for students</span><span><Check size={14} /> Learn with people + AI</span></div>
          </div>
          <div className="landing-hero-visual landing-reveal">
            <div className="hero-orbit orbit-a" /><div className="hero-orbit orbit-b" />
            <div className="hero-card hero-card-main">
              <div className="hero-card-top"><div><span className="mini-label">TODAY'S FOCUS</span><strong>Quadratic equations</strong></div><span className="focus-pill">In progress</span></div>
              <div className="hero-progress"><span style={{ width: "68%" }} /></div>
              <div className="hero-card-bottom"><span>68% complete</span><span>Keep going →</span></div>
            </div>
            <div className="hero-ai-float"><KnoAILogo size={44} /><div><b>KnoAI</b><span>Ready to help</span></div><span className="online-dot" /></div>
            <div className="hero-peer-float"><div className="peer-stack"><span>O</span><span>M</span><span>A</span></div><div><b>Learn together</b><span>Find students who get it</span></div></div>
          </div>
        </section>

        <section id="problem" className="landing-section problem-section">
          <div className="section-heading landing-reveal"><span className="section-kicker">THE PROBLEM</span><h2>School gives you information.<br /><span>Knovi helps you make sense of it.</span></h2><p>Students can get stuck between “I don’t understand” and “I don’t know who to ask.” Knovi closes that gap.</p></div>
          <div className="problem-grid">
            <ProblemCard icon={<MessageCircle />} title="Stuck with a question" text="You understand the first step, then suddenly the whole thing stops making sense." />
            <ProblemCard icon={<Users />} title="No one to learn with" text="Finding someone who knows what you need — and needs what you know — is harder than it should be." />
            <ProblemCard icon={<Sparkles />} title="AI that just gives answers" text="Getting an answer is not the same as learning. KnoAI is built around the learning process." />
          </div>
        </section>

        <section id="how" className="landing-section how-section">
          <div className="section-heading centered landing-reveal"><span className="section-kicker">HOW IT WORKS</span><h2>One place. <span>Three ways to grow.</span></h2></div>
          <div className="steps-grid">
            <Step number="01" icon={<BookOpen />} title="Tell Knovi what you're learning" text="Build your learning profile and choose the subjects you want to learn or teach." />
            <Step number="02" icon={<Users />} title="Connect with the right people" text="Discover peers with overlapping subjects, start a conversation, and study together." />
            <Step number="03" icon={<Sparkles />} title="Use KnoAI when you're stuck" text="Ask questions, practice concepts, get hints, and work through ideas without feeling judged." />
          </div>
        </section>

        <section id="demo" className="landing-section demo-section">
          <div className="demo-copy landing-reveal"><span className="section-kicker">THE REAL THING</span><h2>Don’t watch a fake AI demo.<br /><span>Talk to KnoAI.</span></h2><p>This is connected to the same Knovi AI backend. Send a question below and wait for the real response.</p><div className="demo-note"><span className="live-dot" /> Live AI response · Gemini with Groq fallback</div></div>
          <div className="ai-demo-window landing-reveal">
            <div className="ai-demo-top"><div className="ai-demo-identity"><KnoAILogo size={34} /><div><b>KnoAI</b><span>Learning companion · online</span></div></div><span className="demo-live"><i /> LIVE</span></div>
            <div className="ai-demo-messages" ref={demoRef}>
              {messages.map((msg, i) => <div key={`${i}-${msg.role}`} className={`demo-message-row ${msg.role}`}><div className={`demo-message ${msg.role}`}>{msg.role === "ai" && <KnoAILogo size={20} />}{msg.role === "ai" ? <span>{msg.text}</span> : <span>{msg.text}</span>}</div></div>)}
              {demoBusy && <div className="demo-message-row ai"><div className="demo-message ai typing"><KnoAILogo size={20} /><span className="typing-dots"><i /><i /><i /></span></div></div>}
            </div>
            {demoError && <div className="demo-error">{demoError}</div>}
            <div className="demo-suggestions">{demoSuggestions.map((s) => <button key={s} onClick={() => setDemoInput(s)}>{s}</button>)}</div>
            <form className="demo-composer" onSubmit={sendDemo}><input value={demoInput} onChange={(e) => setDemoInput(e.target.value)} maxLength={500} placeholder="Ask KnoAI something…" /><button disabled={!demoInput.trim() || demoBusy} aria-label="Send"><ArrowRight size={18} /></button></form>
          </div>
        </section>

        <section id="story" className="landing-section story-section">
          <div className="story-visual landing-reveal"><div className="story-ring" /><div className="story-avatar">BE</div><div className="story-badge">Solo builder</div></div>
          <div className="story-copy landing-reveal"><span className="section-kicker">THE PERSON BEHIND KNOVI</span><h2>Built because learning should feel less <span>lonely.</span></h2><p className="story-lead">Knovi is being built by <strong>Babalola Ezekiel (Izy moni)</strong>, a solo developer who wanted to bring the things students already need — peers, practice, collaboration, and useful AI — into one place.</p><p>From product direction and UI/UX to the frontend, backend, database, real-time systems, and AI learning experience, Knovi is a hands-on project built from the ground up.</p><div className="story-signature"><span>“</span><div><b>Learn. Connect. Grow.</b><small>— the idea behind Knovi</small></div></div></div>
        </section>

        <section className="landing-section features-section">
          <div className="section-heading centered landing-reveal"><span className="section-kicker">MORE THAN A CHATBOT</span><h2>Learning tools that work <span>together.</span></h2></div>
          <div className="feature-showcase">
            <Feature icon={<Users />} title="Peer learning" text="Find students to teach, learn from, chat with, and challenge." />
            <Feature icon={<BookOpen />} title="Study Rooms" text="Turn a conversation into a focused session with shared study tools." />
            <Feature icon={<Sparkles />} title="AI learning" text="KnoAI teaches, checks understanding, gives hints, and adapts the conversation." />
            <Feature icon={<MessageCircle />} title="Challenges" text="Put your understanding to work with peer or KnoAI quiz battles." />
          </div>
        </section>

        <section id="contact" className="landing-section contact-section">
          <div className="contact-card landing-reveal"><div><span className="section-kicker">CONTACT</span><h2>Have an idea, question, or want to build with Knovi?</h2><p>Send a message and start the conversation.</p></div><a className="landing-btn landing-btn-primary" href="https://github.com/codeVeloper2/Knovi/issues" target="_blank" rel="noreferrer">Contact Knovi <Github size={17} /></a></div>
        </section>
      </main>

      <footer className="landing-footer"><div className="footer-brand"><LogoMark size={34} /><div><b>Knovi</b><span>Learn. Connect. Grow.</span></div></div><div className="footer-links"><button onClick={() => scrollTo("problem")}>Why Knovi</button><button onClick={() => scrollTo("demo")}>KnoAI</button><Link to="/privacy">Privacy</Link><Link to="/terms">Terms</Link><a href="https://github.com/codeVeloper2/Knovi" target="_blank" rel="noreferrer"><Github size={15} /> GitHub</a></div><small>© {new Date().getFullYear()} Knovi. Built for learners.</small></footer>
    </div>
  );
}

function ProblemCard({ icon, title, text }) { return <article className="problem-card landing-reveal"><div className="feature-icon-box">{icon}</div><h3>{title}</h3><p>{text}</p></article>; }
function Step({ number, icon, title, text }) { return <article className="step-card landing-reveal"><span className="step-number">{number}</span><div className="step-icon">{icon}</div><h3>{title}</h3><p>{text}</p></article>; }
function Feature({ icon, title, text }) { return <article className="feature-item landing-reveal"><div className="feature-icon-box">{icon}</div><div><h3>{title}</h3><p>{text}</p></div></article>; }
