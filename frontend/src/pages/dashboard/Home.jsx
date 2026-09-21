import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";

const STATUS_LABELS = {
  created: "Ready to start",
  teaching: "In progress",
  studying: "In progress",
  retrieval: "In progress",
  reteaching: "Reviewing",
  practice: "Practicing",
};

function greeting() {
  const h = new Date().getHours();
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

function formatAgo(value) {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Math.max(0, Date.now() - d.getTime());
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return days < 7 ? `${days}d ago` : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function pctFromLearning(learning) {
  const active = learning?.inProgress || [];
  const completed = learning?.completed || [];
  const total = active.length + completed.length;
  if (!total) return null;
  const weighted = [...active, ...completed].reduce((sum, c) => sum + (Number(c.progressPct ?? c.progress ?? 0) || 0), 0);
  return Math.round(weighted / total);
}

function Skeleton({ className = "" }) { return <div className={`home2-skeleton ${className}`} />; }

function DashboardSkeleton() {
  return <div className="home2 page-loading" aria-busy="true">
    <div className="home2-top"><Skeleton className="sk-search" /><Skeleton className="sk-avatar" /></div>
    <div className="home2-hero"><div><Skeleton className="sk-title" /><Skeleton className="sk-line" /></div><Skeleton className="sk-visual" /></div>
    <div className="home2-stats">{[1,2,3,4].map(i => <div className="home2-card sk-stat" key={i}><Skeleton className="sk-icon"/><Skeleton className="sk-copy"/></div>)}</div>
    <div className="home2-grid"><div>{[1,2,3].map(i => <div className="home2-card sk-block" key={i}><Skeleton className="sk-heading"/><Skeleton className="sk-row"/><Skeleton className="sk-row"/></div>)}</div><div>{[1,2].map(i => <div className="home2-card sk-block" key={i}><Skeleton className="sk-heading"/><Skeleton className="sk-row"/><Skeleton className="sk-row"/></div>)}</div></div>
  </div>;
}

function Stat({ icon, label, value, detail, tone }) {
  return <div className={`home2-card home2-stat home2-stat--${tone}`}><div className="home2-stat-icon">{icon}</div><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div></div>;
}

function Section({ title, subtitle, action, children, className = "" }) {
  return <section className={`home2-card home2-section ${className}`}><div className="home2-section-head"><div><h2>{title}</h2>{subtitle && <p>{subtitle}</p>}</div>{action}</div>{children}</section>;
}

export default function Home() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState({ learning: null, progress: null, ai: null, sessions: [] });

  useEffect(() => {
    let alive = true;
    Promise.allSettled([
      api.getMyLearning(),
      api.getProgress(),
      api.getLearningProfile(),
      api.getAISessions({ limit: 12 }),
    ]).then(results => {
      if (!alive) return;
      const [learning, progress, ai, sessions] = results;
      setData({
        learning: learning.status === "fulfilled" ? learning.value : null,
        progress: progress.status === "fulfilled" ? progress.value : null,
        ai: ai.status === "fulfilled" ? ai.value : null,
        sessions: sessions.status === "fulfilled" ? sessions.value : [],
      });
      setLoading(false);
    });
    return () => { alive = false; };
  }, []);

  if (loading) return <DashboardSkeleton />;

  const name = profile?.displayName || user?.displayName || "there";
  const firstName = name.split(/\s+/)[0] || "there";
  const progress = data.progress || {};
  const learning = data.learning || {};
  const ai = data.ai || {};
  const activeSessions = (data.sessions || []).filter(s => !["completed", "abandoned"].includes(s.status));
  const activeSession = activeSessions[0];
  const recentActivity = (learning.history || []).slice(0, 5);
  const learningPath = activeSessions.slice(0, 4);
  const overall = pctFromLearning(learning);
  const observations = (ai.aiObservations || []).slice().sort((a,b) => Number(b.confidence || 0) - Number(a.confidence || 0)).slice(0, 3);

  return <div className="home2">
    <section className="home2-hero">
      <div className="home2-hero-content">
        <div className="home2-search">
          <span aria-hidden="true">⌕</span>
          <input
            placeholder="Search subjects, topics, or ask AI..."
            aria-label="Search subjects, topics, or ask AI"
            onKeyDown={e => {
              if (e.key === "Enter" && e.currentTarget.value.trim()) {
                navigate(`/app/learn?search=${encodeURIComponent(e.currentTarget.value.trim())}`);
              }
            }}
          />
        </div>
        <div className="home2-hero-copy">
          <span className="home2-eyebrow">PEERUP LEARNING SPACE</span>
          <h1>{greeting()}, <b>{firstName}</b> 👋</h1>
          <p>Keep learning, keep growing. Pick up where you left off or explore your next concept.</p>
        </div>
      </div>
      <div className="home2-hero-art" aria-hidden="true"><span>AI</span><i/><i/><i/></div>
    </section>

    <div className="home2-stats">
      <Stat icon="🔥" label="Learning streak" value={`${progress.dayStreak ?? 0} days`} detail={progress.dayStreak ? "Keep it going" : "Start a learning activity"} tone="orange" />
      <Stat icon="◈" label="Concepts mastered" value="--" detail="Not available yet" tone="blue" />
      <Stat icon="🏆" label="Challenges won" value="--" detail="Not available yet" tone="green" />
      <Stat icon="◔" label="Overall progress" value={overall == null ? "--" : `${overall}%`} detail={overall == null ? "Start learning to track progress" : "Across your active courses"} tone="purple" />
    </div>

    <div className="home2-grid">
      <main className="home2-main">
        <Section title="Continue Learning" subtitle="Pick up where you left off" action={<Link to="/app/learn" className="home2-link">View all →</Link>}>
          {activeSession ? <button className="home2-continue" onClick={() => navigate(`/app/learn/ai/session/${activeSession.id}`)}>
            <div className="home2-session-icon">AI</div><div className="home2-session-copy"><span className="home2-kicker">{activeSession.subjectName || "AI learning"}</span><h3>{activeSession.conceptName || "Current learning session"}</h3><p>{activeSession.topicName || "Continue your learning session"}</p><div className="home2-session-progress"><span style={{ width: activeSession.status === "created" ? "4%" : "50%" }}/></div><small>{STATUS_LABELS[activeSession.status] || "In progress"}</small></div><span className="home2-continue-arrow">→</span>
          </button> : <div className="home2-empty"><span>◎</span><div><strong>No active learning session</strong><p>Choose a concept and start learning with AI.</p></div><Link to="/app/learn/ai">Start learning</Link></div>}
        </Section>

        <Section title="Recent Activity" subtitle="Your latest learning activity" action={<Link to="/app/progress" className="home2-link">View all →</Link>}>
          {recentActivity.length ? <div className="home2-activity">{recentActivity.map((item, i) => <button key={`${item.type}-${item.id}-${i}`} className="home2-activity-row" onClick={() => navigate(item.type === "tutorial" ? `/app/learn/tutorials/${item.id}` : `/app/learn/courses/${item.courseId}`)}><span className="home2-activity-icon">{item.completed ? "✓" : "▶"}</span><span><strong>{item.title}</strong><small>{item.type === "tutorial" ? item.subject || "Tutorial" : "Learning session"} · {formatAgo(item.lastWatchedAt)}</small></span><b>›</b></button>)}</div> : <div className="home2-empty"><span>◌</span><div><strong>No recent activity</strong><p>Your learning activity will appear here.</p></div></div>}
        </Section>

        <Section title="Your Learning Path" subtitle="Next up in your learning journey">
          {learningPath.length ? <div className="home2-path">{learningPath.map((s, i) => <button key={s.id} className="home2-path-row" onClick={() => navigate(`/app/learn/ai/session/${s.id}`)}><span className={`home2-path-dot ${i === 0 ? "current" : ""}`}>{i === 0 ? "●" : "○"}</span><span><strong>{s.conceptName || "Learning concept"}</strong><small>{s.subjectName || "Subject"}{s.topicName ? ` · ${s.topicName}` : ""}</small></span><em>{i === 0 ? "In progress" : "Next"}</em></button>)}</div> : <div className="home2-empty"><span>◇</span><div><strong>Your path will build as you learn</strong><p>Start an AI learning session to create your next steps.</p></div><Link to="/app/learn/ai">Explore AI learning</Link></div>}
        </Section>
      </main>

      <aside className="home2-side">
        <Section title="Quick Actions" subtitle="Start something useful">
          <div className="home2-actions">
            <button onClick={() => navigate("/app/learn/ai")}><span>✦</span><div><strong>Start Learning</strong><small>Choose a concept and learn with AI</small></div><b>→</b></button>
            <button onClick={() => navigate("/app/learn/ai")}><span>⚡</span><div><strong>Join a Challenge</strong><small>Challenge flow from your learning area</small></div><b>→</b></button>
            <button onClick={() => navigate("/app/learn/ai")}><span>◉</span><div><strong>Open AI Study Room</strong><small>Get personalized help</small></div><b>→</b></button>
            <button onClick={() => navigate("/app/progress")}><span>◔</span><div><strong>View Progress</strong><small>Track your growth</small></div><b>→</b></button>
          </div>
        </Section>

        <Section title="AI Learning Insights" subtitle="Based on your recent activity">
          {observations.length ? <div className="home2-insights">{observations.map((o, i) => <div className="home2-insight" key={`${o.session_id || i}-${o.created_at || i}`}><span>✦</span><div><p>{o.observation}</p><small>{o.confidence >= .8 ? "High confidence" : o.confidence >= .65 ? "Medium confidence" : "Developing signal"}</small></div></div>)}</div> : <div className="home2-empty home2-empty--compact"><span>✦</span><p>Your AI learning insights will appear as you complete more sessions.</p></div>}
        </Section>

        <Section title="Your Learning Snapshot">
          <div className="home2-snapshot"><div><span>XP</span><strong>{progress.xp ?? 0}</strong></div><div><span>Level</span><strong>{progress.levelName || "Beginner"}</strong></div><div><span>Sessions</span><strong>{progress.sessionCount ?? 0}</strong></div></div>
        </Section>
      </aside>
    </div>
  </div>;
}
