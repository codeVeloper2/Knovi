import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import { SUBJECTS } from "../../subjects";
import * as api from "../../api";

// ── Subject meta (icon + color per subject) ───────────────────────────────
const SUBJECT_META = {
  "Math":             { icon: "📐", color: "#6366f1" },
  "English":          { icon: "📖", color: "#3b82f6" },
  "Biology":          { icon: "🧬", color: "#22c55e" },
  "Chemistry":        { icon: "⚗️",  color: "#f59e0b" },
  "Physics":          { icon: "⚡",  color: "#eab308" },
  "History":          { icon: "🏛️",  color: "#a78bfa" },
  "Geography":        { icon: "🌍",  color: "#34d399" },
  "Computer Science": { icon: "💻",  color: "#06b6d4" },
  "Spanish":          { icon: "🇪🇸",  color: "#ef4444" },
  "French":           { icon: "🇫🇷",  color: "#60a5fa" },
  "Art":              { icon: "🎨",  color: "#f472b6" },
  "Music":            { icon: "🎵",  color: "#818cf8" },
  "Economics":        { icon: "📈",  color: "#f59e0b" },
  "Literature":       { icon: "📚",  color: "#a78bfa" },
  "Psychology":       { icon: "🧠",  color: "#34d399" },
};

const FOCUS_OPTIONS  = [15, 20, 25, 30, 45, 60];
const BREAK_OPTIONS  = [5, 10, 15];

// ── Session Setup Modal ───────────────────────────────────────────────────
function SessionSetupModal({ subject, profile, onClose, onStart }) {
  const [role, setRole]         = useState(
    (profile?.subjectsGoodAt || []).includes(subject) ? "teaching" : "learning"
  );
  const [goal, setGoal]         = useState("");
  const [focusMin, setFocusMin] = useState(25);
  const [breakMin, setBreakMin] = useState(5);
  const [starting, setStarting] = useState(false);
  const toast = useToast();

  const meta = SUBJECT_META[subject] || { icon: "📘", color: "#6366f1" };

  async function handleStart() {
    setStarting(true);
    try {
      // Find a conversation for the subject, or navigate to discover
      const convs = await api.listConversations();
      const match = convs.find(c => c.subject?.toLowerCase() === subject.toLowerCase());
      if (!match) {
        toast.error(`No study partner for ${subject} yet. Find one in Discover first.`);
        setStarting(false);
        return;
      }
      onStart({ conv: match, role, goal: goal.trim(), focusMin, breakMin });
    } catch (err) {
      toast.error(err.message || "Something went wrong.");
      setStarting(false);
    }
  }

  const canTeach = (profile?.subjectsGoodAt || []).includes(subject);
  const canLearn = (profile?.subjectsNeedHelp || []).includes(subject);

  return (
    <div className="lrn-overlay" onClick={onClose}>
      <div className="lrn-modal" onClick={e => e.stopPropagation()}>

        {/* ── Title ── */}
        <div className="lrn-modal-header">
          <h2>Set up your session</h2>
          <button type="button" className="lrn-modal-close" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M18 6 6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        {/* ── Subject chip ── */}
        <div className="lrn-modal-subject" style={{ borderColor: meta.color + "55", background: meta.color + "15" }}>
          <span>{meta.icon}</span>
          <span style={{ color: meta.color, fontWeight: 700 }}>{subject}</span>
        </div>

        {/* ── Role ── */}
        <div className="lrn-modal-section">
          <div className="lrn-section-label">YOUR ROLE IN THIS SESSION</div>
          <div className="lrn-role-row">
            <button
              type="button"
              className={`lrn-role-card ${role === "teaching" ? "active" : ""} ${!canTeach ? "dimmed" : ""}`}
              onClick={() => setRole("teaching")}
            >
              <span className="lrn-role-icon">🎓</span>
              <span className="lrn-role-title">I'm Teaching</span>
              {canTeach
                ? <span className="lrn-role-hint">You're good at {subject}</span>
                : <span className="lrn-role-hint lrn-role-hint--warn">Not in your subjects</span>
              }
            </button>
            <button
              type="button"
              className={`lrn-role-card ${role === "learning" ? "active" : ""} ${!canLearn ? "dimmed" : ""}`}
              onClick={() => setRole("learning")}
            >
              <span className="lrn-role-icon">📘</span>
              <span className="lrn-role-title">I'm Learning</span>
              {canLearn
                ? <span className="lrn-role-hint">You want to learn {subject}</span>
                : <span className="lrn-role-hint lrn-role-hint--warn">Not in your subjects</span>
              }
            </button>
          </div>
        </div>

        {/* ── Goal ── */}
        <div className="lrn-modal-section">
          <div className="lrn-section-label">SESSION GOAL <span className="lrn-optional">(optional)</span></div>
          <input
            type="text"
            className="lrn-goal-input"
            placeholder={`e.g. Understand the RTF topic in ${subject}`}
            value={goal}
            onChange={e => setGoal(e.target.value)}
            maxLength={200}
          />
        </div>

        {/* ── Timer ── */}
        <div className="lrn-modal-section">
          <div className="lrn-section-label">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Timer Settings
          </div>

          <div className="lrn-timer-group">
            <div className="lrn-timer-col">
              <span className="lrn-timer-label">Focus</span>
              <div className="lrn-chips">
                {FOCUS_OPTIONS.map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`lrn-chip ${focusMin === m ? "active" : ""}`}
                    onClick={() => setFocusMin(m)}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>
            <div className="lrn-timer-col">
              <span className="lrn-timer-label">Break</span>
              <div className="lrn-chips">
                {BREAK_OPTIONS.map(m => (
                  <button
                    key={m}
                    type="button"
                    className={`lrn-chip ${breakMin === m ? "active" : ""}`}
                    onClick={() => setBreakMin(m)}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            </div>
          </div>

          <p className="lrn-timer-hint">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            {focusMin} min focus → {breakMin} min break, repeat
          </p>
        </div>

        {/* ── Actions ── */}
        <div className="lrn-modal-actions">
          <button type="button" className="lrn-btn-cancel" onClick={onClose} disabled={starting}>
            Cancel
          </button>
          <button type="button" className="lrn-btn-start" onClick={handleStart} disabled={starting}>
            {starting ? "Starting…" : "Start Session"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Learn Page ────────────────────────────────────────────────────────────
export default function LearnPage() {
  const { profile } = useAuth();
  const navigate    = useNavigate();
  const toast       = useToast();

  const [search,        setSearch]        = useState("");
  const [activeTab,     setActiveTab]     = useState("all");   // "all" | "good" | "need"
  const [selectedSubj,  setSelectedSubj]  = useState(null);    // opens modal

  const myGoodAt   = new Set(profile?.subjectsGoodAt   || []);
  const myNeedHelp = new Set(profile?.subjectsNeedHelp || []);

  // Which subjects to show based on tab
  const base = activeTab === "good"
    ? SUBJECTS.filter(s => myGoodAt.has(s))
    : activeTab === "need"
    ? SUBJECTS.filter(s => myNeedHelp.has(s))
    : SUBJECTS;

  const visible = base.filter(s =>
    s.toLowerCase().includes(search.toLowerCase())
  );

  function handleStart({ conv, role, goal, focusMin, breakMin }) {
    // Navigate to study room with timer settings encoded in URL
    navigate(`/app/rooms?convId=${conv.id}&role=${role}&focus=${focusMin}&brk=${breakMin}${goal ? `&goal=${encodeURIComponent(goal)}` : ""}`);
  }

  return (
    <div className="lrn-page">

      {/* ── Hero ──────────────────────────────────────────────── */}
      <div className="lrn-hero">
        <div className="lrn-hero-text">
          <h1 className="lrn-hero-title">Learn</h1>
          <p className="lrn-hero-sub">
            Pick a subject and set up a focused study session with your partner.
          </p>
        </div>

        {/* Quick stats */}
        <div className="lrn-hero-stats">
          <div className="lrn-hero-stat">
            <span className="lrn-hero-stat-val">{myGoodAt.size}</span>
            <span className="lrn-hero-stat-lbl">Teaching</span>
          </div>
          <div className="lrn-hero-stat-div" />
          <div className="lrn-hero-stat">
            <span className="lrn-hero-stat-val">{myNeedHelp.size}</span>
            <span className="lrn-hero-stat-lbl">Learning</span>
          </div>
          <div className="lrn-hero-stat-div" />
          <div className="lrn-hero-stat">
            <span className="lrn-hero-stat-val">{profile?.sessionCount || 0}</span>
            <span className="lrn-hero-stat-lbl">Sessions</span>
          </div>
        </div>
      </div>

      {/* ── Controls ──────────────────────────────────────────── */}
      <div className="lrn-controls">
        {/* Search */}
        <div className="lrn-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            type="text"
            placeholder="Search subjects…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          {search && (
            <button type="button" className="lrn-search-clear" onClick={() => setSearch("")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M18 6 6 18M6 6l12 12"/>
              </svg>
            </button>
          )}
        </div>

        {/* Tabs */}
        <div className="lrn-tabs">
          {[
            { id: "all",  label: "All Subjects" },
            { id: "good", label: `Teaching (${myGoodAt.size})` },
            { id: "need", label: `Learning (${myNeedHelp.size})` },
          ].map(t => (
            <button
              key={t.id}
              type="button"
              className={`lrn-tab ${activeTab === t.id ? "active" : ""}`}
              onClick={() => setActiveTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Subject grid ──────────────────────────────────────── */}
      {visible.length === 0 ? (
        <div className="lrn-empty">
          <span className="lrn-empty-icon">🔍</span>
          <p>No subjects found{search ? ` for "${search}"` : ""}.</p>
          {activeTab !== "all" && (
            <button type="button" className="lrn-btn-ghost" onClick={() => setActiveTab("all")}>
              Show all subjects
            </button>
          )}
        </div>
      ) : (
        <div className="lrn-grid">
          {visible.map(subject => {
            const meta   = SUBJECT_META[subject] || { icon: "📘", color: "#6366f1" };
            const iGood  = myGoodAt.has(subject);
            const iNeed  = myNeedHelp.has(subject);

            return (
              <button
                key={subject}
                type="button"
                className={`lrn-card ${iGood ? "lrn-card--teach" : ""} ${iNeed ? "lrn-card--learn" : ""}`}
                onClick={() => setSelectedSubj(subject)}
              >
                {/* Accent bar */}
                <div className="lrn-card-bar" style={{ background: meta.color }} />

                <div className="lrn-card-icon" style={{ background: meta.color + "20", color: meta.color }}>
                  {meta.icon}
                </div>

                <div className="lrn-card-body">
                  <div className="lrn-card-title">{subject}</div>
                  <div className="lrn-card-tags">
                    {iGood && <span className="lrn-tag lrn-tag--teach">Teaching</span>}
                    {iNeed && <span className="lrn-tag lrn-tag--learn">Learning</span>}
                    {!iGood && !iNeed && <span className="lrn-tag lrn-tag--neutral">Explore</span>}
                  </div>
                </div>

                <svg className="lrn-card-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <polyline points="9 18 15 12 9 6"/>
                </svg>
              </button>
            );
          })}
        </div>
      )}

      {/* ── Session setup modal ───────────────────────────────── */}
      {selectedSubj && (
        <SessionSetupModal
          subject={selectedSubj}
          profile={profile}
          onClose={() => setSelectedSubj(null)}
          onStart={(opts) => {
            setSelectedSubj(null);
            handleStart(opts);
          }}
        />
      )}
    </div>
  );
}
