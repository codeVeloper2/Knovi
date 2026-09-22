import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import * as api from "../../api";

const META = {
  Mathematics: ["#7657ff", "π"],
  Physics: ["#2f8cff", "⚛"],
  Chemistry: ["#18b98b", "⚗"],
  Biology: ["#36b875", "⌁"],
  "Computer Science": ["#16a9d8", "</>"],
  English: ["#e05c9e", "Aa"],
  "English Language": ["#e05c9e", "Aa"],
  Accounting: ["#f0a93b", "▤"],
  Economics: ["#9a72ff", "↗"],
  Geography: ["#22b8c8", "◎"],
  History: ["#e1a33d", "▥"],
  Literature: ["#df5a9d", "▥"],
};

function Icon({ name, size = 20 }) {
  const paths = {
    path: <><path d="M5 19V7.5A2.5 2.5 0 0 1 7.5 5H19v14H7.5A2.5 2.5 0 0 0 5 21.5V19Z"/><path d="M8 9h7M8 12h5"/></>,
    arrow: <path d="m9 5 7 7-7 7"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    lock: <><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    play: <path d="m9 7 9 5-9 5V7Z"/>,
    target: <><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="m16.5 7.5 2-2"/></>,
    spark: <path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z"/>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function subjectMeta(subject, index = 0) {
  const fallback = [["#7657ff","✦"],["#2f8cff","◌"],["#18b98b","◇"],["#f0a93b","▤"],["#df5a9d","◈"]];
  const [accent, symbol] = META[subject?.name] || fallback[index % fallback.length];
  return { accent, symbol };
}

function SubjectBadge({ subject, index = 0, large = false }) {
  const meta = subjectMeta(subject, index);
  return <span className={`lp2-subject-badge${large ? " large" : ""}`} style={{ "--accent": meta.accent }}>{meta.symbol}</span>;
}

function Progress({ value, compact = false }) {
  const pct = Math.max(0, Math.min(100, value));
  return (
    <div className={`lp2-progress${compact ? " compact" : ""}`} aria-label={`${pct}% complete`}>
      <span style={{ width: `${pct}%` }} />
    </div>
  );
}

function statusText(status) {
  return status === "completed" ? "Completed" : status === "in_progress" ? "In progress" : status === "available" ? "Ready to start" : "Locked";
}

function normalizeSubjects(value) {
  return Array.isArray(value) ? value : Array.isArray(value?.subjects) ? value.subjects : [];
}

function normalizeTopics(value) {
  return Array.isArray(value) ? value : Array.isArray(value?.topics) ? value.topics : [];
}

export default function LearningPathPage() {
  const navigate = useNavigate();
  const [subjectGroups, setSubjectGroups] = useState([]);
  const [topicsBySubject, setTopicsBySubject] = useState({});
  const [sessions, setSessions] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.getSubjects().catch(() => []),
      api.getAISessions({ limit: 100, offset: 0 }).catch(() => []),
    ]).then(async ([subjectResult, sessionResult]) => {
      if (!alive) return;
      const list = normalizeSubjects(subjectResult);
      const sessionList = Array.isArray(sessionResult) ? sessionResult : (sessionResult?.items || []);
      setSessions(sessionList);

      // The curriculum stores one Subject row per class level (SSS1/SSS2/SSS3).
      // The learning path should present one subject card and combine all of its
      // class-level content instead of showing duplicate subject cards.
      const grouped = new Map();
      list.forEach(subject => {
        const key = String(subject.name || "").trim().toLowerCase();
        if (!key) return;
        const existing = grouped.get(key);
        if (existing) existing.variants.push(subject);
        else grouped.set(key, { ...subject, variants: [subject] });
      });
      const groups = Array.from(grouped.values()).sort((a, b) =>
        String(a.name || "").localeCompare(String(b.name || ""))
      );
      setSubjectGroups(groups);

      const pairs = await Promise.all(list.map(async subject => {
        try {
          const topics = normalizeTopics(await api.getTopics(subject.id));
          return [subject.id, topics.map(topic => ({
            ...topic,
            sourceSubjectId: subject.id,
            sourceClassLevel: subject.classLevel || "",
          }))];
        } catch {
          return [subject.id, []];
        }
      }));
      if (!alive) return;
      const map = Object.fromEntries(pairs);
      setTopicsBySubject(map);

      const preferredGroup =
        groups.find(s => String(s.name).toLowerCase() === "physics") ||
        groups.find(s => s.variants.some(v => map[v.id]?.length)) ||
        groups[0];

      if (preferredGroup) setSelectedId(preferredGroup.id);
    }).catch(() => alive && setError("We couldn't load your learning path."))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, []);

  const selectedSubject = useMemo(
    () => subjectGroups.find(s => Number(s.id) === Number(selectedId)) || null,
    [subjectGroups, selectedId]
  );

  const selectedVariants = selectedSubject?.variants || [];
  const rawTopics = useMemo(() => (
    selectedVariants
      .flatMap(subject => topicsBySubject[subject.id] || [])
      .sort((a, b) => {
        const levelA = String(a.sourceClassLevel || "");
        const levelB = String(b.sourceClassLevel || "");
        return levelA.localeCompare(levelB) || String(a.name || "").localeCompare(String(b.name || ""));
      })
  ), [selectedVariants, topicsBySubject]);

  const topicStates = useMemo(() => {
    let activeFound = false;
    return rawTopics.map((topic, index) => {
      const topicSessions = sessions.filter(s => Number(s.topicId) === Number(topic.id));
      const completedSessions = topicSessions.filter(s => s.status === "completed");
      const activeSession = topicSessions.find(s => !["completed", "abandoned"].includes(s.status));
      let status = "locked";
      if (completedSessions.length) status = "completed";
      else if (activeSession) { status = "in_progress"; activeFound = true; }
      else if (!activeFound && index === 0) status = "available";
      return {
        ...topic,
        index: index + 1,
        status,
        completedSessions: completedSessions.length,
        activeSession: activeSession || null,
        conceptCount: Number(topic.conceptCount || 0),
      };
    });
  }, [rawTopics, sessions]);

  const counts = {
    all: topicStates.length,
    completed: topicStates.filter(t => t.status === "completed").length,
    progress: topicStates.filter(t => t.status === "in_progress").length,
    available: topicStates.filter(t => t.status === "available").length,
    locked: topicStates.filter(t => t.status === "locked").length,
  };
  const percent = counts.all ? Math.round((counts.completed / counts.all) * 100) : 0;
  const nextTopic = topicStates.find(t => t.status === "in_progress") || topicStates.find(t => t.status === "available");
  const visibleTopics = filter === "all" ? topicStates : topicStates.filter(t => t.status === filter);

  const overall = useMemo(() => {
    const all = Object.values(topicsBySubject).flat();
    const completed = all.filter(topic => sessions.some(s => Number(s.topicId) === Number(topic.id) && s.status === "completed")).length;
    return { total: all.length, completed, percent: all.length ? Math.round(completed / all.length * 100) : 0 };
  }, [topicsBySubject, sessions]);

  const openTopic = topic => {
    if (!selectedSubject || topic.status === "locked") return;
    if (topic.activeSession?.id) navigate(`/app/learn/ai/session/${topic.activeSession.id}`);
    else navigate(`/app/learn/ai/subject/${topic.sourceSubjectId || selectedSubject.id}/topic/${topic.id}`);
  };

  if (loading) return (
    <div className="lp2-page">
      <div className="lp2-skeleton hero" />
      <div className="lp2-skeleton strip" />
      <div className="lp2-skeleton body" />
    </div>
  );

  if (error) return (
    <div className="lp2-page"><div className="lp2-error"><Icon name="path" size={32}/><h2>Learning Path</h2><p>{error}</p><button onClick={() => window.location.reload()}>Try again</button></div></div>
  );

  return (
    <div className="lp2-page">
      <header className="lp2-hero">
        <div className="lp2-hero-icon"><Icon name="path" size={31}/></div>
        <div className="lp2-hero-copy">
          <div className="lp2-eyebrow">YOUR ROADMAP</div>
          <h1>Build your learning path.</h1>
          <p>Work through focused topics, keep momentum, and turn each completed step into progress.</p>
        </div>
        <div className="lp2-hero-stat">
          <span>CURRICULUM</span>
          <strong>{overall.percent}%</strong>
          <small>{overall.completed} / {overall.total} topics</small>
        </div>
      </header>

      <section className="lp2-subjects">
        <div className="lp2-section-label"><span>1</span><div><strong>Choose a subject</strong><small>Switch your roadmap</small></div></div>
        <div className="lp2-subject-scroller">
          {subjectGroups.map((subject, index) => {
            const levels = [...new Set(subject.variants.map(v => v.classLevel).filter(Boolean))]
              .map(level => String(level).replace(/^SSS/i, "SS"));
            const topicTotal = subject.variants.reduce(
              (sum, variant) => sum + (topicsBySubject[variant.id] || []).length,
              0
            );
            return (
              <button
                key={subject.id}
                type="button"
                className={`lp2-subject-card${Number(selectedId) === Number(subject.id) ? " active" : ""}`}
                onClick={() => { setSelectedId(subject.id); setFilter("all"); }}
              >
                <SubjectBadge subject={subject} index={index} />
                <span>
                  <strong>{subject.name}</strong>
                  <small>{topicTotal} topics · {levels.join(" · ") || "All classes"}</small>
                </span>
                {Number(selectedId) === Number(subject.id) && <b>✓</b>}
              </button>
            );
          })}
        </div>
      </section>

      <div className="lp2-workspace">
        <main className="lp2-roadmap">
          <div className="lp2-roadmap-head">
            <div>
              <div className="lp2-current">
                <SubjectBadge subject={selectedSubject} large />
                <div><span>NOW LEARNING</span><h2>{selectedSubject?.name || "Select a subject"}</h2></div>
              </div>
              <p>{selectedSubject?.description || "Choose a subject to see its roadmap."}</p>
            </div>
            <div className="lp2-current-progress">
              <strong>{percent}%</strong><span>complete</span><Progress value={percent}/>
            </div>
          </div>

          <div className="lp2-filters">
            {[
              ["all","All",counts.all],["completed","Done",counts.completed],["in_progress","Active",counts.progress],["available","Next",counts.available],["locked","Locked",counts.locked]
            ].map(([value,label,count]) => (
              <button key={value} type="button" className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}<b>{count}</b></button>
            ))}
          </div>

          <div className="lp2-timeline">
            {visibleTopics.length ? visibleTopics.map((topic, index) => (
              <article className={`lp2-step ${topic.status}`} key={topic.id}>
                <div className="lp2-step-line" aria-hidden="true" />
                <div className="lp2-node">
                  {topic.status === "completed" ? <Icon name="check" size={17}/> : topic.status === "locked" ? <Icon name="lock" size={15}/> : <span>{topic.index}</span>}
                </div>
                <div className="lp2-step-card">
                  <div className="lp2-step-top">
                    <div>
                      <span className="lp2-step-kicker">STEP {String(topic.index).padStart(2, "0")} · {statusText(topic.status).toUpperCase()}</span>
                      <h3>{topic.name}</h3>
                      <p>{topic.description || "Build your understanding one concept at a time."}</p>
                    </div>
                    <span className="lp2-status-pill">{statusText(topic.status)}</span>
                  </div>
                  <div className="lp2-step-meta">
                    {topic.sourceClassLevel && <span>{String(topic.sourceClassLevel).replace(/^SSS/i, "SS")}</span>}
                    <span>{topic.conceptCount || 0} concepts</span>
                    {topic.completedSessions > 0 && <span>{topic.completedSessions} session{topic.completedSessions === 1 ? "" : "s"} completed</span>}
                    {topic.status === "locked" && <span>Finish the previous step</span>}
                  </div>
                  <div className="lp2-step-action">
                    <button type="button" disabled={topic.status === "locked"} onClick={() => openTopic(topic)}>
                      {topic.status === "completed" ? "Review topic" : topic.status === "in_progress" ? "Continue" : "Start topic"}
                      <Icon name="arrow" size={16}/>
                    </button>
                  </div>
                </div>
              </article>
            )) : (
              <div className="lp2-empty"><Icon name="target" size={30}/><h3>No topics here</h3><p>Try another roadmap filter.</p></div>
            )}
          </div>
        </main>

        <aside className="lp2-side">
          <section className="lp2-side-card lp2-next">
            <div className="lp2-side-label"><Icon name="spark" size={16}/> NEXT MOVE</div>
            {nextTopic ? <>
              <h2>{nextTopic.name}</h2>
              <p>{nextTopic.status === "in_progress" ? "Pick up where you left off." : "This is your next available step."}</p>
              <button onClick={() => openTopic(nextTopic)} disabled={nextTopic.status === "locked"}>Keep learning <Icon name="arrow" size={16}/></button>
            </> : <p>Complete a subject setup to unlock your next step.</p>}
          </section>

          <section className="lp2-side-card">
            <div className="lp2-side-label"><Icon name="target" size={16}/> SUBJECT PROGRESS</div>
            <div className="lp2-big-progress"><strong>{percent}%</strong><span>{counts.completed} of {counts.all} complete</span></div>
            <Progress value={percent}/>
            <div className="lp2-mini-stats">
              <div><b>{counts.completed}</b><span>Done</span></div>
              <div><b>{counts.progress}</b><span>Active</span></div>
              <div><b>{counts.locked}</b><span>Locked</span></div>
            </div>
          </section>

          <section className="lp2-side-card lp2-focus">
            <div className="lp2-side-label">QUICK LINKS</div>
            <button onClick={() => navigate("/app/learn")}><span>Browse subjects</span><Icon name="arrow" size={15}/></button>
            <button onClick={() => navigate("/app/learn/sessions")}><span>Study sessions</span><Icon name="arrow" size={15}/></button>
            <button onClick={() => navigate("/app/learn/saved")}><span>Saved resources</span><Icon name="arrow" size={15}/></button>
          </section>
        </aside>
      </div>
    </div>
  );
}
