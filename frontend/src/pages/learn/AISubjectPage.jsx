import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import * as api from "../../api";

// ── Subject accent colours & icons ───────────────────────────────────────────
const SUBJECT_META = {
  Mathematics:        { tone: "purple", symbol: "π",   quote: "Mathematics is the language in which God has written the universe. — Galileo" },
  Physics:            { tone: "blue",   symbol: "⚛",   quote: "The universe is not only stranger than we imagine, it is stranger than we can imagine. — J.B.S. Haldane" },
  Chemistry:          { tone: "green",  symbol: "⚗",   quote: "Chemistry is the study of matter, but I prefer to see it as the study of change. — Walter White" },
  Biology:            { tone: "green",  symbol: "⌁",   quote: "Nothing in biology makes sense except in the light of evolution. — Theodosius Dobzhansky" },
  "Computer Science": { tone: "cyan",   symbol: "</>", quote: "Any sufficiently advanced technology is indistinguishable from magic. — Arthur C. Clarke" },
  "English Language": { tone: "pink",   symbol: "Aa",  quote: "The limits of my language mean the limits of my world. — Ludwig Wittgenstein" },
  Accounting:         { tone: "gold",   symbol: "₦",   quote: "Accounting is the language of business. — Warren Buffett" },
  Economics:          { tone: "purple", symbol: "↗",   quote: "Economics is the study of how people use scarce resources to satisfy unlimited wants." },
};
const FALLBACK = { tone: "blue", symbol: "✦", quote: "Every expert was once a beginner." };

function meta(name) { return SUBJECT_META[name] || FALLBACK; }

// ── Difficulty label ──────────────────────────────────────────────────────────
function diffLabel(d) {
  if (!d) return "Mixed";
  return d.charAt(0).toUpperCase() + d.slice(1);
}

// ── Tone → CSS class mapping ──────────────────────────────────────────────────
const TONE_CLASS = {
  purple: "sp-tone-purple", blue: "sp-tone-blue", green: "sp-tone-green",
  gold: "sp-tone-gold", pink: "sp-tone-pink", cyan: "sp-tone-cyan",
};

// ── Back arrow ────────────────────────────────────────────────────────────────
function BackIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
function ArrowRight() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}
function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/>
    </svg>
  );
}
function LayersIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 3 2 8l10 5 10-5-10-5ZM2 16l10 5 10-5M2 12l10 5 10-5"/>
    </svg>
  );
}
function StarIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2Z"/>
    </svg>
  );
}
function LightningIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8Z"/>
    </svg>
  );
}
function PathIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="6" r="2.5"/>
      <path d="M8.5 17.5h5a4.5 4.5 0 0 0 4.5-4.5V8.5"/>
    </svg>
  );
}
function DocIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
      <path d="M6 3.5h9.5l3 3V21H6z"/><path d="M15 3.5V7h4M9 11h6M9 14h6M9 17h4"/>
    </svg>
  );
}

// ── Topic card ────────────────────────────────────────────────────────────────
const TOPIC_ICONS = ["⚡","🔥","🌊","⚡","🛸","⚗","🧬","💡","🔬","📐","🌍","📊"];

function TopicCard({ topic, index, subjectId, onStart }) {
  const icon = TOPIC_ICONS[index % TOPIC_ICONS.length];
  const completed = topic.completed || 0;
  const total     = topic.conceptCount || topic.total || 0;
  const pct       = total > 0 ? Math.round((completed / total) * 100) : 0;
  const status    = completed >= total && total > 0 ? "completed"
                  : completed > 0 ? "in_progress"
                  : "not_started";
  const statusLabel = { completed: "Completed", in_progress: "In Progress", not_started: "Not Started" }[status];
  const weeks = total <= 3 ? "~1 week" : total <= 8 ? "~1–2 weeks" : "~2–3 weeks";

  return (
    <button
      type="button"
      className={`sp-topic-card sp-topic-${status}`}
      onClick={() => onStart(topic)}
    >
      <div className="sp-topic-card-header">
        <span className="sp-topic-icon">{icon}</span>
        <div className="sp-topic-title-row">
          <span className="sp-topic-index">{index + 1}.</span>
          <strong className="sp-topic-name">{topic.name}</strong>
        </div>
        <span className={`sp-topic-badge sp-badge-${status}`}>{statusLabel}</span>
      </div>
      <p className="sp-topic-desc">{topic.description || "Explore this topic with your AI tutor."}</p>
      <div className="sp-topic-meta">
        <span><LayersIcon />{total} concept{total !== 1 ? "s" : ""}</span>
        <span><ClockIcon />{weeks}</span>
      </div>
      <div className="sp-topic-progress">
        <div className="sp-progress-bar">
          <div className="sp-progress-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="sp-progress-label">{completed}/{total} completed</span>
      </div>
    </button>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function AISubjectPage() {
  const { subjectId } = useParams();
  const navigate = useNavigate();

  const [loading,   setLoading]   = useState(true);
  const [subject,   setSubject]   = useState(null);
  const [topics,    setTopics]    = useState([]);
  const [sessions,  setSessions]  = useState([]);
  const [activeTab, setActiveTab] = useState("overview");

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getSubject(subjectId),
      api.getTopics(subjectId),
      api.getAISessions({ limit: 100 }).catch(() => []),
    ]).then(([subj, tops, sess]) => {
      setSubject(subj);
      const topicList = Array.isArray(tops) ? tops : (tops?.topics || []);
      setSessions(Array.isArray(sess) ? sess : []);
      // Annotate topics with progress from sessions
      const annotated = topicList.map(t => {
        const topicSessions = (Array.isArray(sess) ? sess : [])
          .filter(s => Number(s.topicId) === Number(t.id));
        const completed = topicSessions.filter(s => s.status === "completed").length;
        return { ...t, completed, conceptCount: t.conceptCount || 0 };
      });
      setTopics(annotated);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [subjectId]);

  if (loading) return <SubjectSkeleton />;
  if (!subject) return (
    <div className="sp-shell">
      <div className="sp-empty">
        <p>Subject not found.</p>
        <button className="sp-btn-outline" onClick={() => navigate("/app/learn")}>Back to Learn</button>
      </div>
    </div>
  );

  const m = meta(subject.name);
  const totalTopics = topics.length;
  const completedTopics = topics.filter(t => (t.completed || 0) >= (t.conceptCount || 1) && t.conceptCount > 0).length;
  const overallPct = totalTopics > 0 ? Math.round((completedTopics / totalTopics) * 100) : 0;
  const weekEst = totalTopics <= 4 ? "2–3 weeks" : totalTopics <= 8 ? "4–6 weeks" : "5–8 weeks";
  const difficulties = [...new Set(topics.map(t => t.difficulty).filter(Boolean))];
  const diffRange = difficulties.length === 0 ? "Beginner – Intermediate"
    : difficulties.length === 1 ? diffLabel(difficulties[0])
    : `${diffLabel(difficulties[0])} – ${diffLabel(difficulties[difficulties.length - 1])}`;

  // Right rail progress list (top 4 topics)
  const railTopics = topics.slice(0, 4);
  const ringCirc = 2 * Math.PI * 32;
  const ringDash = ringCirc * overallPct / 100;

  const TABS = ["overview", "topics", "path", "resources"];
  const TAB_LABELS = { overview: "Overview", topics: "Topics", path: "Learning Path", resources: "Resources" };

  function handleStartTopic(topic) {
    navigate(`/app/learn/ai/subject/${subjectId}/topic/${topic.id}`);
  }

  return (
    <div className="sp-shell">
      {/* ── Subject header banner ── */}
      <div className={`sp-header sp-header-${m.tone}`}>
        <button className="sp-back" onClick={() => navigate("/app/learn")}>
          <BackIcon /> Back to Subjects
        </button>
        <div className="sp-header-body">
          <div className="sp-header-left">
            <div className={`sp-subject-icon ${TONE_CLASS[m.tone]}`}>
              <span>{m.symbol}</span>
            </div>
            <div>
              <h1 className="sp-subject-name">{subject.name}</h1>
              <p className="sp-subject-desc">{subject.description || `Explore the study of ${subject.name}.`}</p>
              <div className="sp-topic-chips">
                {topics.slice(0, 5).map(t => (
                  <span key={t.id} className="sp-chip">{t.name}</span>
                ))}
                {topics.length > 5 && <span className="sp-chip sp-chip-more">+{topics.length - 5} more</span>}
              </div>
            </div>
          </div>
          <blockquote className="sp-header-quote">
            <p>"{m.quote.split("—")[0].trim()}"</p>
            {m.quote.includes("—") && <cite>— {m.quote.split("—")[1].trim()}</cite>}
          </blockquote>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div className="sp-tabs-bar">
        {TABS.map(tab => (
          <button
            key={tab}
            type="button"
            className={`sp-tab${activeTab === tab ? " active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </div>

      {/* ── Content + Rail ── */}
      <div className="sp-content-grid">
        <div className="sp-main">

          {/* OVERVIEW TAB */}
          {activeTab === "overview" && (
            <>
              <div className="sp-about-card">
                <div className="sp-about-left">
                  <div className="sp-about-title-row">
                    <DocIcon />
                    <h2>About {subject.name}</h2>
                  </div>
                  <p className="sp-about-text">
                    {subject.description || `${subject.name} is a fascinating field of study. Explore topics from foundational concepts to advanced theory with your AI tutor.`}
                  </p>
                </div>
                <div className="sp-about-stats">
                  <div className="sp-stat">
                    <LayersIcon />
                    <div>
                      <strong>Total Topics</strong>
                      <span>{totalTopics}</span>
                    </div>
                  </div>
                  <div className="sp-stat">
                    <ClockIcon />
                    <div>
                      <strong>Estimated Time</strong>
                      <span>{weekEst}</span>
                    </div>
                  </div>
                  <div className="sp-stat sp-stat-full">
                    <StarIcon />
                    <div>
                      <strong>Difficulty Level</strong>
                      <span>{diffRange}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="sp-section-head">
                <div>
                  <LayersIcon />
                  <h2>Topics in {subject.name}</h2>
                </div>
                <p>Explore all topics in this subject. Start with what interests you or follow your learning path.</p>
              </div>
              <div className="sp-topics-grid">
                {topics.map((topic, i) => (
                  <TopicCard key={topic.id} topic={topic} index={i} subjectId={subjectId} onStart={handleStartTopic} />
                ))}
                {topics.length === 0 && (
                  <div className="sp-empty-topics">No topics available yet.</div>
                )}
              </div>
            </>
          )}

          {/* TOPICS TAB */}
          {activeTab === "topics" && (
            <>
              <div className="sp-section-head">
                <div><LayersIcon /><h2>All Topics</h2></div>
                <p>{totalTopics} topics · {completedTopics} completed</p>
              </div>
              <div className="sp-topics-grid">
                {topics.map((topic, i) => (
                  <TopicCard key={topic.id} topic={topic} index={i} subjectId={subjectId} onStart={handleStartTopic} />
                ))}
              </div>
            </>
          )}

          {/* LEARNING PATH TAB */}
          {activeTab === "path" && (
            <div className="sp-path-list">
              {topics.map((topic, i) => {
                const completed = (topic.completed || 0) >= (topic.conceptCount || 1) && topic.conceptCount > 0;
                const inProgress = !completed && (topic.completed || 0) > 0;
                return (
                  <button
                    key={topic.id}
                    type="button"
                    className={`sp-path-row${completed ? " done" : inProgress ? " active" : ""}`}
                    onClick={() => handleStartTopic(topic)}
                  >
                    <div className={`sp-path-dot${completed ? " done" : inProgress ? " active" : ""}`}>
                      {completed ? "✓" : i + 1}
                    </div>
                    <div className="sp-path-info">
                      <strong>{topic.name}</strong>
                      <small>{topic.conceptCount || 0} concepts · {completed ? "Completed" : inProgress ? "In Progress" : "Not Started"}</small>
                    </div>
                    <ArrowRight />
                  </button>
                );
              })}
            </div>
          )}

          {/* RESOURCES TAB */}
          {activeTab === "resources" && (
            <div className="sp-resources-empty">
              <DocIcon />
              <h3>No resources yet</h3>
              <p>Your AI tutor can still teach any concept without resources.</p>
              <button className="sp-btn-primary" onClick={() => setActiveTab("overview")}>
                Start Learning
              </button>
            </div>
          )}
        </div>

        {/* ── Right rail ── */}
        <aside className="sp-rail">
          {/* Progress card */}
          <div className="sp-rail-card">
            <div className="sp-rail-head">
              <strong>Your Progress</strong>
              <button className="sp-rail-x" onClick={() => {}}>×</button>
            </div>
            <div className="sp-progress-row">
              <div className="sp-ring-wrap">
                <svg viewBox="0 0 80 80">
                  <circle cx="40" cy="40" r="32" className="sp-ring-track" />
                  <circle
                    cx="40" cy="40" r="32"
                    className="sp-ring-fill"
                    strokeDasharray={`${ringDash} ${ringCirc}`}
                    transform="rotate(-90 40 40)"
                    strokeLinecap="round"
                  />
                </svg>
                <span>{overallPct}%</span>
              </div>
              <div>
                <strong>Overall Completion</strong>
                <small>{completedTopics} of {totalTopics} topics</small>
              </div>
            </div>
            <div className="sp-rail-topic-list">
              {railTopics.map((t, i) => {
                const pct = t.conceptCount > 0 ? Math.round(((t.completed || 0) / t.conceptCount) * 100) : 0;
                const tm = meta(subject.name);
                return (
                  <div key={t.id} className="sp-rail-topic-row">
                    <span className={`sp-rail-dot ${TONE_CLASS[tm.tone]}`} />
                    <div className="sp-rail-topic-info">
                      <span>{t.name}</span>
                      <div className="sp-mini-bar"><div className="sp-mini-fill" style={{ width: `${pct}%` }} /></div>
                    </div>
                    <span className="sp-rail-frac">{t.completed || 0}/{t.conceptCount || 0}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Recommended next */}
          {topics.filter(t => (t.completed || 0) < (t.conceptCount || 1)).length > 0 && (() => {
            const next = topics.find(t => (t.completed || 0) > 0 && (t.completed || 0) < (t.conceptCount || 1))
              || topics.find(t => (t.completed || 0) === 0);
            if (!next) return null;
            return (
              <div className="sp-rail-card">
                <div className="sp-rail-head"><LightningIcon /><strong>Recommended Next</strong><a href="#" className="sp-rail-viewall" onClick={e => { e.preventDefault(); setActiveTab("topics"); }}>View all</a></div>
                <div className="sp-rec-card">
                  <div className="sp-rec-info">
                    <strong>{next.name}</strong>
                    <small>{subject.name} · {next.conceptCount || 0} concepts</small>
                  </div>
                  <button className="sp-btn-primary sp-btn-sm" onClick={() => handleStartTopic(next)}>
                    Start Learning <ArrowRight />
                  </button>
                </div>
              </div>
            );
          })()}

          {/* Quick actions */}
          <div className="sp-rail-card">
            <div className="sp-rail-head"><strong>Quick Actions</strong></div>
            <button className="sp-quick-action" onClick={() => {
              const first = topics[0]; if (first) handleStartTopic(first);
            }}>
              <span className="sp-qa-icon sp-qa-blue"><LightningIcon /></span>
              <span><strong>Start AI Session</strong><small>Get personalised help</small></span>
              <ArrowRight />
            </button>
            <button className="sp-quick-action" onClick={() => setActiveTab("path")}>
              <span className="sp-qa-icon sp-qa-teal"><PathIcon /></span>
              <span><strong>View Learning Path</strong><small>See your full roadmap</small></span>
              <ArrowRight />
            </button>
            <button className="sp-quick-action" onClick={() => setActiveTab("resources")}>
              <span className="sp-qa-icon sp-qa-purple"><DocIcon /></span>
              <span><strong>Browse Resources</strong><small>Notes, videos, and more</small></span>
              <ArrowRight />
            </button>
          </div>

          {/* Keep going card */}
          <div className="sp-rail-card sp-keepgoing">
            <div className="sp-keepgoing-content">
              <strong>Keep going!</strong>
              <p>Every topic you complete brings you closer to your goals.</p>
            </div>
            <span className="sp-keepgoing-arrow">↗</span>
          </div>
        </aside>
      </div>
    </div>
  );
}

// ── Skeleton loader ───────────────────────────────────────────────────────────
function SubjectSkeleton() {
  return (
    <div className="sp-shell">
      <div className="sp-skeleton sp-skeleton-header" />
      <div className="sp-skeleton sp-skeleton-tabs" />
      <div className="sp-content-grid">
        <div className="sp-main">
          <div className="sp-skeleton sp-skeleton-about" />
          <div className="sp-topics-grid">
            {[1,2,3,4,5,6].map(i => <div key={i} className="sp-skeleton sp-skeleton-card" />)}
          </div>
        </div>
        <div className="sp-skeleton sp-skeleton-rail" />
      </div>
    </div>
  );
}
