import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import * as api from "../../api";

const META = {
  Mathematics: ["purple", "π"],
  Physics: ["purple", "⚛"],
  Chemistry: ["green", "⚗"],
  Biology: ["green", "⌁"],
  "Computer Science": ["purple", "</>"],
  "English Language": ["pink", "Aa"],
  Accounting: ["gold", "▤"],
  Economics: ["purple", "↗"],
  Geography: ["cyan", "◎"],
  History: ["gold", "▥"],
  Literature: ["pink", "▥"],
  "Art & Design": ["cyan", "◉"],
};

const FALLBACK = [["purple","✦"],["blue","◌"],["green","◇"],["gold","▤"],["pink","◈"],["cyan","◎"]];

function subjectMeta(name, index = 0) {
  const item = META[name];
  if (item) return { tone: item[0], symbol: item[1] };
  const item2 = FALLBACK[index % FALLBACK.length];
  return { tone: item2[0], symbol: item2[1] };
}

function Icon({ children, size = 20 }) {
  return <svg className="cp-icon" width={size} height={size} viewBox="0 0 24 24" fill="none">{children}</svg>;
}
function Arrow() {
  return <Icon size={18}><path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Icon>;
}
function Back() {
  return <Icon size={18}><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></Icon>;
}
function Layers() {
  return <Icon><path d="M12 3 4 7l8 4 8-4-8-4Z" stroke="currentColor" strokeWidth="1.7"/><path d="m4 12 8 4 8-4M4 17l8 4 8-4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"/></Icon>;
}
function Clock() {
  return <Icon><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.7"/><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round"/></Icon>;
}

export default function AISubjectPage() {
  const { subjectId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const selectedClassLevel = searchParams.get("classLevel");
  const [subject, setSubject] = useState(null);
  const [subjectVariants, setSubjectVariants] = useState([]);
  const [topics, setTopics] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("overview");

  useEffect(() => {
    let alive = true;
    setLoading(true);

    Promise.all([
      api.getSubject(subjectId),
      api.getSubjects("ALL").catch(() => []),
    ]).then(async ([baseSubject, allSubjectsResult]) => {
      if (!alive) return;

      const allSubjects = Array.isArray(allSubjectsResult)
        ? allSubjectsResult
        : (allSubjectsResult?.subjects || []);

      const variants = allSubjects
        .filter(s => String(s.name || "").trim().toLowerCase() === String(baseSubject?.name || "").trim().toLowerCase())
        .sort((a, b) => String(a.classLevel || "").localeCompare(String(b.classLevel || "")));

      setSubjectVariants(variants);

      // No class has been selected yet: this route is the subject landing page.
      if (!selectedClassLevel) {
        setSubject(baseSubject);
        setTopics([]);
        setSessions([]);
        return;
      }

      const selected = variants.find(
        s => String(s.classLevel || "").toUpperCase() === String(selectedClassLevel).toUpperCase()
      ) || baseSubject;

      const [topicResult, sessionResult] = await Promise.all([
        api.getTopics(selected.id),
        api.getAISessions({ subjectId: selected.id, limit: 100, offset: 0 }).catch(() => []),
      ]);

      if (!alive) return;

      setSubject(selected);
      setTopics(Array.isArray(topicResult) ? topicResult : (topicResult?.topics || []));
      setSessions(Array.isArray(sessionResult) ? sessionResult : (sessionResult?.items || []));
    }).catch(() => {}).finally(() => alive && setLoading(false));

    return () => { alive = false; };
  }, [subjectId, selectedClassLevel]);

  const annotated = useMemo(() => topics.map((topic) => {
    const ts = sessions.filter(s => Number(s.topicId) === Number(topic.id));
    const completed = ts.filter(s => s.status === "completed").length;
    const active = ts.find(s => !["completed","abandoned"].includes(s.status));
    return { ...topic, completed, activeSession: active || null };
  }), [topics, sessions]);

  const total = annotated.length;
  const completed = annotated.filter(t => t.completed > 0).length;
  const active = annotated.filter(t => t.activeSession).length;
  const percent = total ? Math.round((completed / total) * 100) : 0;
  const meta = subjectMeta(subject?.name);

  if (loading) return <CurriculumSkeleton />;
  if (!subject) return <EmptyPage text="Subject not found." onBack={() => navigate("/app/learn")} />;

  if (!selectedClassLevel) {
    return (
      <ClassSelection
        subject={subject}
        variants={subjectVariants}
        onBack={() => navigate("/app/learn")}
        onSelect={(variant) => {
          navigate(
            `/app/learn/ai/subject/${variant.id}?classLevel=${encodeURIComponent(variant.classLevel)}`
          );
        }}
      />
    );
  }

  const openTopic = topic => {
    navigate(`/app/learn/ai/subject/${subject.id}/topic/${topic.id}`);
  };

  return (
    <div className="cp-page">
      <button className="cp-back" onClick={() => navigate("/app/learn")}><Back/> Back to Subjects</button>

      <section className={`cp-subject-hero tone-${meta.tone}`}>
        <div className="cp-hero-icon"><span>{meta.symbol}</span></div>
        <div className="cp-hero-copy">
          <div className="cp-eyebrow">Subject</div>
          <h1>{subject.name}</h1>
          <p>{subject.description || `Build your understanding of ${subject.name}, one topic at a time.`}</p>
          <div className="cp-hero-chips">
            <span><Layers/> {total} topics</span>
            <span><Clock/> Self-paced learning</span>
          </div>
        </div>
        <div className="cp-hero-progress">
          <div className="cp-progress-ring" style={{"--p":`${percent * 3.6}deg`}}><strong>{percent}%</strong></div>
          <span>Subject progress</span>
          <small>{completed} of {total} topics started</small>
        </div>
      </section>

      <div className="cp-tabs">
        {[
          ["overview","Overview"],
          ["topics","Topics"],
          ["path","Learning Path"],
        ].map(([value,label]) => (
          <button key={value} className={tab === value ? "active" : ""} onClick={() => setTab(value)}>{label}</button>
        ))}
      </div>

      {tab === "overview" && (
        <section className="cp-subject-grid">
          <main>
            <div className="cp-section-heading">
              <div><span className="cp-section-icon"><Layers/></span><div><h2>Topics in {subject.name}</h2><p>Choose a topic to explore its concepts.</p></div></div>
              <span className="cp-count">{total} topics</span>
            </div>
            <div className="cp-topic-grid">
              {annotated.map((topic, i) => <TopicCard key={topic.id} topic={topic} index={i} onClick={openTopic}/>)}
            </div>
          </main>
          <SubjectRail subject={subject} annotated={annotated} percent={percent} active={active} onTopic={openTopic}/>
        </section>
      )}

      {tab === "topics" && (
        <section>
          <div className="cp-section-heading">
            <div><span className="cp-section-icon"><Layers/></span><div><h2>All Topics</h2><p>Explore every topic available in this subject.</p></div></div>
            <span className="cp-count">{completed}/{total} started</span>
          </div>
          <div className="cp-topic-list">{annotated.map((topic,i)=><TopicCard key={topic.id} topic={topic} index={i} onClick={openTopic} list/>)}</div>
        </section>
      )}

      {tab === "path" && (
        <section className="cp-path">
          <div className="cp-section-heading">
            <div><span className="cp-section-icon">↗</span><div><h2>Your learning path</h2><p>Move through the subject from foundation to deeper concepts.</p></div></div>
          </div>
          {annotated.map((topic,i)=>(
            <button key={topic.id} className="cp-path-row" onClick={() => openTopic(topic)}>
              <span className={`cp-path-number ${topic.completed ? "done" : ""}`}>{topic.completed ? "✓" : i+1}</span>
              <span><strong>{topic.name}</strong><small>{topic.description || "Explore this topic"} · {topic.completed ? "Started" : "Not started"}</small></span>
              <Arrow/>
            </button>
          ))}
        </section>
      )}
    </div>
  );
}

function formatClassLevel(value) {
  const normalized = String(value || "").trim().toUpperCase();
  const match = normalized.match(/^SSS([123])$/);
  return match ? `SSS ${match[1]}` : normalized || "Class";
}

function ClassSelection({ subject, variants, onBack, onSelect }) {
  return (
    <div className="cp-page">
      <button className="cp-back" onClick={onBack}><Back /> Back to Subjects</button>

      <section className="cp-class-picker">
        <div className="cp-class-picker-icon">
          {subjectMeta(subject.name).symbol}
        </div>
        <div className="cp-class-picker-eyebrow">Subject</div>
        <h1>{subject.name}</h1>
        <p>
          Choose your class to load the curriculum for your level.
        </p>

        <div className="cp-class-options">
          {variants.map((variant) => (
            <button
              key={variant.id}
              type="button"
              className="cp-class-option"
              onClick={() => onSelect(variant)}
            >
              <span className="cp-class-option-number">
                {String(variant.classLevel || "").replace(/^SSS/i, "") || "•"}
              </span>
              <span>
                <strong>{formatClassLevel(variant.classLevel)}</strong>
                <small>View {subject.name} curriculum</small>
              </span>
              <Arrow />
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function TopicCard({topic,index,onClick,list=false}) {
  return (
    <button className={`cp-topic-card${list ? " list" : ""}`} onClick={() => onClick(topic)}>
      <span className="cp-topic-number">{String(index+1).padStart(2,"0")}</span>
      <span className="cp-topic-main">
        <strong>{topic.name}</strong>
        <small>{topic.description || "Explore this topic with your AI tutor."}</small>
        <span className="cp-topic-meta"><Layers/> {topic.conceptCount || 0} concepts {topic.completed ? `· ${topic.completed} session${topic.completed > 1 ? "s" : ""}` : ""}</span>
      </span>
      <span className="cp-topic-arrow"><Arrow/></span>
    </button>
  );
}

function SubjectRail({subject,annotated,percent,active,onTopic}) {
  const next = annotated.find(t => t.activeSession) || annotated.find(t => !t.completed);
  return (
    <aside className="cp-rail">
      <div className="cp-rail-card">
        <div className="cp-rail-title">Your Progress</div>
        <div className="cp-rail-progress"><div className="cp-progress-ring small" style={{"--p":`${percent*3.6}deg`}}><strong>{percent}%</strong></div><div><strong>{annotated.filter(t=>t.completed).length} topics started</strong><small>Keep building your knowledge.</small></div></div>
        <div className="cp-rail-bars">{annotated.slice(0,4).map(t=><div key={t.id}><span>{t.name}</span><i><b style={{width:`${t.completed ? "100%" : "0%"}`}}/></i></div>)}</div>
      </div>
      <div className="cp-rail-card">
        <div className="cp-rail-title">Next up</div>
        {next ? <button className="cp-next" onClick={()=>onTopic(next)}><span><strong>{next.name}</strong><small>{subject.name}</small></span><Arrow/></button> : <p className="cp-muted">You have explored every topic.</p>}
      </div>
      <div className="cp-rail-card cp-rail-tip"><strong>Learn with AI</strong><p>Open a topic, choose a concept, and let your tutor adapt the session to you.</p></div>
    </aside>
  );
}

function CurriculumSkeleton() {
  return <div className="cp-page"><div className="cp-skeleton hero"/><div className="cp-skeleton tabs"/><div className="cp-skeleton block"/></div>;
}
function EmptyPage({text,onBack}) {
  return <div className="cp-page"><div className="cp-empty"><h2>{text}</h2><button onClick={onBack}>Back</button></div></div>;
}
