/**
 * StartSessionPage — /app/rooms
 * Shows available curriculum topics. User picks a topic, selects a connected
 * partner, then creates a peer-teaching session.
 */
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api";

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtDuration(mins) {
  if (!mins) return "—";
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)}h ${mins % 60 ? `${mins % 60}m` : ""}`.trim();
}

function diffBadge(d) {
  const cls = { beginner: "pt-diff-beginner", intermediate: "pt-diff-intermediate", advanced: "pt-diff-advanced" };
  return d ? <span className={`pt-diff-badge ${cls[d] ?? "pt-diff-intermediate"}`}>{d}</span> : null;
}

// ── Skeleton card ─────────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="pt-topic-card pt-skeleton">
      <div className="pt-sk-line pt-sk-icon" />
      <div className="pt-sk-line pt-sk-title" />
      <div className="pt-sk-line pt-sk-sub" />
      <div className="pt-sk-line pt-sk-sub" style={{ width: "60%" }} />
    </div>
  );
}

// ── Partner selector modal ────────────────────────────────────────────────────
function PartnerModal({ topic, onClose, onCreated }) {
  const navigate = useNavigate();
  const [partners, setPartners]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [selected, setSelected]   = useState(null);
  const [busy, setBusy]           = useState(false);
  const [err, setErr]             = useState("");

  useEffect(() => {
    api.getAcceptedMatchPartners()
      .then(setPartners)
      .catch(() => setPartners([]))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!selected) return;
    setBusy(true); setErr("");
    try {
      const sess = await api.createLearningSession(topic.id, selected.partnerId);
      onCreated(sess);
      navigate(`/app/rooms/lobby/${sess.id}`);
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="pt-modal-backdrop" onClick={onClose}>
      <div className="pt-modal" onClick={e => e.stopPropagation()}>
        <div className="pt-modal-header">
          <h2 className="pt-modal-title">Start a Learning Session</h2>
          <button className="pt-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <div className="pt-modal-body">
          {/* Selected topic */}
          <div className="pt-modal-topic">
            <span className="pt-modal-topic-icon">{topic.subjectIcon || "📚"}</span>
            <div>
              <p className="pt-modal-topic-name">{topic.name}</p>
              <p className="pt-modal-topic-sub">{topic.subject} · {fmtDuration(topic.estimatedMinutes)}</p>
            </div>
          </div>

          <p className="pt-modal-label">Select your study partner</p>

          {loading ? (
            <div className="pt-partner-loading">Loading your connections…</div>
          ) : partners.length === 0 ? (
            <div className="pt-partner-empty">
              <p>You have no connected study partners yet.</p>
              <button className="pt-btn-ghost pt-btn-sm" onClick={() => navigate("/app/discover")}>
                Find a Study Partner →
              </button>
            </div>
          ) : (
            <ul className="pt-partner-list">
              {partners.map(p => (
                <li
                  key={p.partnerId}
                  className={`pt-partner-item ${selected?.partnerId === p.partnerId ? "selected" : ""}`}
                  onClick={() => setSelected(p)}
                >
                  {p.photoURL
                    ? <img src={p.photoURL} alt={p.displayName} className="pt-partner-avatar" referrerPolicy="no-referrer" />
                    : <div className="pt-partner-avatar pt-partner-avatar-fb">{p.displayName?.charAt(0).toUpperCase()}</div>
                  }
                  <div className="pt-partner-info">
                    <span className="pt-partner-name">{p.displayName}</span>
                    <span className="pt-partner-grade">{p.grade || "Student"}</span>
                    {p.subject && <span className="pt-partner-subject">can teach {p.subject}</span>}
                  </div>
                  {selected?.partnerId === p.partnerId && <span className="pt-partner-check">✓</span>}
                </li>
              ))}
            </ul>
          )}

          {err && <p className="pt-form-err">{err}</p>}
        </div>

        <div className="pt-modal-footer">
          <button className="pt-btn-ghost" onClick={onClose}>Cancel</button>
          <button
            className="pt-btn-primary"
            onClick={handleCreate}
            disabled={!selected || busy}
          >
            {busy ? "Creating…" : "Create Learning Session →"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Topic card ────────────────────────────────────────────────────────────────
function TopicCard({ topic, onStart }) {
  return (
    <div className="pt-topic-card">
      <div className="pt-topic-header">
        <span className="pt-topic-subject-icon">{topic.subjectIcon || "📚"}</span>
        <span className="pt-topic-subject-name">{topic.subject}</span>
        {diffBadge(topic.difficulty)}
      </div>
      <h3 className="pt-topic-name">{topic.name}</h3>
      {topic.description && <p className="pt-topic-desc">{topic.description}</p>}
      <div className="pt-topic-stats">
        <span>🎯 {topic.objectivesCount ?? 0} Objectives</span>
        <span>💡 {topic.conceptsCount ?? 0} Concepts</span>
        <span>🎓 {topic.activitiesCount ?? 0} Activities</span>
        <span>❓ {topic.questionsCount ?? 0} Questions</span>
      </div>
      <div className="pt-topic-footer">
        <span className="pt-topic-duration">⏱ {fmtDuration(topic.estimatedMinutes)}</span>
        <button className="pt-btn-primary pt-topic-start-btn" onClick={() => onStart(topic)}>
          Start Session →
        </button>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function StartSessionPage() {
  const [topics,  setTopics]  = useState([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState("");
  const [search,  setSearch]  = useState("");
  const [subjectFilter, setSubjectFilter] = useState("All");
  const [modal,   setModal]   = useState(null);

  useEffect(() => {
    api.getLearningTopics()
      .then(setTopics)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  const subjects = ["All", ...new Set(topics.map(t => t.subject).filter(Boolean))];
  const displayed = topics.filter(t => {
    const matchSubject = subjectFilter === "All" || t.subject === subjectFilter;
    const matchSearch  = !search || t.name.toLowerCase().includes(search.toLowerCase());
    return matchSubject && matchSearch;
  });

  return (
    <div className="pt-page">
      <div className="pt-page-header">
        <div>
          <h1 className="pt-page-title">Start a Study Room</h1>
          <p className="pt-page-sub">Choose a topic to begin your peer learning session</p>
        </div>
      </div>

      {/* Search + filter */}
      <div className="pt-filters">
        <input
          className="pt-search-input"
          placeholder="🔍 Search for a topic…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <div className="pt-subject-chips">
          {subjects.map(s => (
            <button
              key={s}
              className={`pt-chip ${subjectFilter === s ? "active" : ""}`}
              onClick={() => setSubjectFilter(s)}
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="pt-error-banner">
          ⚠️ {error}
          <button className="pt-btn-ghost pt-btn-sm" onClick={() => { setError(""); setLoading(true); api.getLearningTopics().then(setTopics).catch(e => setError(e.message)).finally(() => setLoading(false)); }}>
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="pt-topic-grid">{[1,2,3].map(i => <SkeletonCard key={i} />)}</div>
      ) : displayed.length === 0 ? (
        <div className="pt-empty-state">
          <span className="pt-empty-icon">📚</span>
          <p className="pt-empty-title">No topics available yet</p>
          <p className="pt-empty-sub">The curriculum is still being built. Check back soon.</p>
        </div>
      ) : (
        <div className="pt-topic-grid">
          {displayed.map(t => <TopicCard key={t.id} topic={t} onStart={setModal} />)}
        </div>
      )}

      {modal && (
        <PartnerModal
          topic={modal}
          onClose={() => setModal(null)}
          onCreated={() => {}}
        />
      )}
    </div>
  );
}
