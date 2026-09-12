/**
 * /admin/curriculum — Internal Curriculum Admin Tool
 *
 * A minimal, functional interface for populating curriculum content:
 *   Subject → Topic → Objectives / Concepts / Misconceptions /
 *             Activities / Questions / Resources
 *
 * This is NOT the student-facing Learn UI.
 * It is protected by AdminRoute (role=admin) both in the router and
 * the backend API layer.
 */
import { useEffect, useReducer, useRef, useState } from "react";
import * as api from "../../api";

// ─── tiny helpers ────────────────────────────────────────────────────────────

function slug(name) {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

function Msg({ err, ok }) {
  if (err) return <p style={S.err}>{err}</p>;
  if (ok)  return <p style={S.ok}>{ok}</p>;
  return null;
}

function Spinner() {
  return <span style={{ opacity: 0.5 }}> ⏳</span>;
}

// ─── collapsible section wrapper ─────────────────────────────────────────────

function Section({ title, count, children }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={S.section}>
      <button style={S.sectionToggle} onClick={() => setOpen(o => !o)}>
        {open ? "▼" : "▶"} {title}
        {count != null && <span style={S.badge}>{count}</span>}
      </button>
      {open && <div style={S.sectionBody}>{children}</div>}
    </div>
  );
}

// ─── small inline form factory ────────────────────────────────────────────────

function useForm(init) {
  const [fields, setFields] = useState(init);
  const set = (k, v) => setFields(f => ({ ...f, [k]: v }));
  const reset = () => setFields(init);
  return [fields, set, reset, setFields];
}

// ─── ObjectiveForm ─────────────────────────────────────────────────────────

function ObjectiveForm({ topicId, onAdded }) {
  const [f, set, reset] = useForm({ title: "", description: "", order_index: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({});

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg({});
    try {
      const obj = await api.adminAddObjective(topicId, {
        title: f.title, description: f.description, order_index: Number(f.order_index),
      });
      onAdded(obj); reset(); setMsg({ ok: "Objective added." });
    } catch (err) { setMsg({ err: err.message }); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={S.form}>
      <input style={S.input} placeholder="Title" value={f.title}
        onChange={e => set("title", e.target.value)} required />
      <textarea style={S.textarea} placeholder="Description" value={f.description}
        onChange={e => set("description", e.target.value)} required />
      <input style={{ ...S.input, width: 80 }} type="number" placeholder="Order" value={f.order_index}
        onChange={e => set("order_index", e.target.value)} />
      <button style={S.btn} disabled={busy}>Add{busy && <Spinner />}</button>
      <Msg {...msg} />
    </form>
  );
}

// ─── ConceptForm ──────────────────────────────────────────────────────────────

function ConceptForm({ topicId, onAdded }) {
  const [f, set, reset] = useForm({ name: "", explanation: "", key_points: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({});

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg({});
    try {
      const kp = f.key_points.split("\n").map(s => s.trim()).filter(Boolean);
      const c = await api.adminAddConcept(topicId, {
        name: f.name, explanation: f.explanation, key_points: kp,
      });
      onAdded(c); reset(); setMsg({ ok: "Concept added." });
    } catch (err) { setMsg({ err: err.message }); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={S.form}>
      <input style={S.input} placeholder="Concept name" value={f.name}
        onChange={e => set("name", e.target.value)} required />
      <textarea style={S.textarea} placeholder="Explanation" value={f.explanation}
        onChange={e => set("explanation", e.target.value)} required />
      <textarea style={S.textarea} placeholder="Key points — one per line" value={f.key_points}
        onChange={e => set("key_points", e.target.value)} rows={4} />
      <button style={S.btn} disabled={busy}>Add{busy && <Spinner />}</button>
      <Msg {...msg} />
    </form>
  );
}

// ─── MisconceptionForm ────────────────────────────────────────────────────────

function MisconceptionForm({ topicId, onAdded }) {
  const [f, set, reset] = useForm({ misconception: "", correction: "", hint: "" });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({});

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg({});
    try {
      const m = await api.adminAddMisconception(topicId, {
        misconception: f.misconception, correction: f.correction, hint: f.hint,
      });
      onAdded(m); reset(); setMsg({ ok: "Misconception added." });
    } catch (err) { setMsg({ err: err.message }); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={S.form}>
      <textarea style={S.textarea} placeholder='Misconception — e.g. "Acceleration means how fast an object is moving."'
        value={f.misconception} onChange={e => set("misconception", e.target.value)} required />
      <textarea style={S.textarea} placeholder="Correction"
        value={f.correction} onChange={e => set("correction", e.target.value)} required />
      <textarea style={S.textarea} placeholder="Hint for the student"
        value={f.hint} onChange={e => set("hint", e.target.value)} required />
      <button style={S.btn} disabled={busy}>Add{busy && <Spinner />}</button>
      <Msg {...msg} />
    </form>
  );
}

// ─── ActivityForm ─────────────────────────────────────────────────────────────

const ACTIVITY_TYPES = ["learn", "explain", "practice", "challenge", "check"];

function ActivityForm({ topicId, onAdded }) {
  const [f, set, reset] = useForm({ type: "learn", title: "", prompt: "", order_index: 0 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({});

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg({});
    try {
      const a = await api.adminAddActivity(topicId, {
        type: f.type, title: f.title,
        prompt: f.prompt || null,
        order_index: Number(f.order_index),
      });
      onAdded(a); reset(); setMsg({ ok: "Activity added." });
    } catch (err) { setMsg({ err: err.message }); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={S.form}>
      <div style={S.row}>
        <select style={S.select} value={f.type} onChange={e => set("type", e.target.value)}>
          {ACTIVITY_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <input style={{ ...S.input, width: 80 }} type="number" placeholder="Order"
          value={f.order_index} onChange={e => set("order_index", e.target.value)} />
      </div>
      <input style={S.input} placeholder="Title" value={f.title}
        onChange={e => set("title", e.target.value)} required />
      <textarea style={S.textarea} placeholder="Prompt (optional)" value={f.prompt}
        onChange={e => set("prompt", e.target.value)} />
      <button style={S.btn} disabled={busy}>Add{busy && <Spinner />}</button>
      <Msg {...msg} />
    </form>
  );
}

// ─── QuestionForm ─────────────────────────────────────────────────────────────

const QUESTION_TYPES = ["multiple_choice", "short_answer", "numeric", "explanation"];

function QuestionForm({ topicId, onAdded }) {
  const [f, set, reset] = useForm({
    question: "", question_type: "short_answer", difficulty: "intermediate",
    answer: "", explanation: "", hint: "",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({});

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg({});
    try {
      const q = await api.adminAddQuestion(topicId, {
        question: f.question, question_type: f.question_type,
        difficulty: f.difficulty,
        answer: f.answer || null, explanation: f.explanation || null,
        hint: f.hint || null,
      });
      onAdded(q); reset(); setMsg({ ok: "Question added." });
    } catch (err) { setMsg({ err: err.message }); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={S.form}>
      <textarea style={S.textarea} placeholder="Question text" value={f.question}
        onChange={e => set("question", e.target.value)} required />
      <div style={S.row}>
        <select style={S.select} value={f.question_type}
          onChange={e => set("question_type", e.target.value)}>
          {QUESTION_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <input style={S.input} placeholder="Difficulty (e.g. intermediate)" value={f.difficulty}
          onChange={e => set("difficulty", e.target.value)} required />
      </div>
      <input style={S.input} placeholder="Answer (optional)" value={f.answer}
        onChange={e => set("answer", e.target.value)} />
      <textarea style={S.textarea} placeholder="Explanation (optional)" value={f.explanation}
        onChange={e => set("explanation", e.target.value)} />
      <input style={S.input} placeholder="Hint (optional)" value={f.hint}
        onChange={e => set("hint", e.target.value)} />
      <button style={S.btn} disabled={busy}>Add{busy && <Spinner />}</button>
      <Msg {...msg} />
    </form>
  );
}

// ─── ResourceForm ─────────────────────────────────────────────────────────────

const RESOURCE_TYPES = ["video", "textbook", "pdf", "study_guide", "tutorial"];

function ResourceForm({ topicId, onAdded }) {
  const [f, set, reset] = useForm({
    title: "", type: "video", url: "", description: "",
    source: "", duration: "", is_downloadable: false,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState({});

  async function submit(e) {
    e.preventDefault();
    setBusy(true); setMsg({});
    try {
      const r = await api.adminAddResource(topicId, {
        title: f.title, type: f.type,
        url: f.url || null, description: f.description || null,
        source: f.source || null, duration: f.duration || null,
        is_downloadable: f.is_downloadable,
      });
      onAdded(r); reset(); setMsg({ ok: "Resource added." });
    } catch (err) { setMsg({ err: err.message }); }
    finally { setBusy(false); }
  }

  return (
    <form onSubmit={submit} style={S.form}>
      <input style={S.input} placeholder="Title" value={f.title}
        onChange={e => set("title", e.target.value)} required />
      <div style={S.row}>
        <select style={S.select} value={f.type} onChange={e => set("type", e.target.value)}>
          {RESOURCE_TYPES.map(t => <option key={t}>{t}</option>)}
        </select>
        <input style={S.input} placeholder="Duration e.g. 12:34" value={f.duration}
          onChange={e => set("duration", e.target.value)} />
      </div>
      <input style={S.input} placeholder="URL (YouTube, etc.)" value={f.url}
        onChange={e => set("url", e.target.value)} />
      <input style={S.input} placeholder="Source (e.g. Khan Academy)" value={f.source}
        onChange={e => set("source", e.target.value)} />
      <textarea style={S.textarea} placeholder="Description (optional)" value={f.description}
        onChange={e => set("description", e.target.value)} />
      <label style={S.checkLabel}>
        <input type="checkbox" checked={f.is_downloadable}
          onChange={e => set("is_downloadable", e.target.checked)} />
        {" "}Downloadable (only if PeerUP holds distribution rights)
      </label>
      <button style={S.btn} disabled={busy}>Add{busy && <Spinner />}</button>
      <Msg {...msg} />
    </form>
  );
}

// ─── TopicPanel ───────────────────────────────────────────────────────────────

function TopicPanel({ topicId }) {
  const [data, setData] = useState(null);
  const [loadMsg, setLoadMsg] = useState("");

  useEffect(() => {
    if (!topicId) return;
    setData(null); setLoadMsg("");
    api.adminGetTopic(topicId).then(setData).catch(e => setLoadMsg(e.message));
  }, [topicId]);

  if (!topicId) return <p style={S.hint}>← Select or create a topic to manage its content.</p>;
  if (loadMsg)  return <p style={S.err}>{loadMsg}</p>;
  if (!data)    return <p style={S.hint}>Loading topic…</p>;

  const addTo = (key) => (item) => setData(d => ({ ...d, [key]: [...(d[key] || []), item] }));

  return (
    <div>
      <h3 style={S.topicTitle}>{data.name}
        <span style={S.difficulty}>{data.difficulty || "—"}</span>
      </h3>
      {data.description && <p style={S.desc}>{data.description}</p>}

      <Section title="Learning Objectives" count={data.learning_objectives?.length}>
        <ItemList items={data.learning_objectives} renderItem={o => `[${o.order_index}] ${o.title}`} />
        <ObjectiveForm topicId={topicId} onAdded={addTo("learning_objectives")} />
      </Section>

      <Section title="Concepts" count={data.concepts?.length}>
        <ItemList items={data.concepts} renderItem={c => `${c.name} — ${c.key_points?.length ?? 0} key points`} />
        <ConceptForm topicId={topicId} onAdded={addTo("concepts")} />
      </Section>

      <Section title="Misconceptions" count={data.misconceptions?.length}>
        <ItemList items={data.misconceptions} renderItem={m => m.misconception.slice(0, 80)} />
        <MisconceptionForm topicId={topicId} onAdded={addTo("misconceptions")} />
      </Section>

      <Section title="Activities" count={data.learning_activities?.length}>
        <ItemList items={data.learning_activities}
          renderItem={a => `[${a.order_index}] ${a.type.toUpperCase()} — ${a.title}`} />
        <ActivityForm topicId={topicId} onAdded={addTo("learning_activities")} />
      </Section>

      <Section title="Questions" count={data.questions?.length}>
        <ItemList items={data.questions}
          renderItem={q => `[${q.question_type}] ${q.question.slice(0, 80)}`} />
        <QuestionForm topicId={topicId} onAdded={addTo("questions")} />
      </Section>

      <Section title="Resources" count={data.resources?.length}>
        <ItemList items={data.resources} renderItem={r => `[${r.type}] ${r.title}`} />
        <ResourceForm topicId={topicId} onAdded={addTo("resources")} />
      </Section>
    </div>
  );
}

function ItemList({ items, renderItem }) {
  if (!items?.length) return <p style={S.hint}>None yet.</p>;
  return (
    <ul style={S.list}>
      {items.map(item => <li key={item.id} style={S.listItem}>{renderItem(item)}</li>)}
    </ul>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CurriculumAdmin() {
  // ── Subjects ──
  const [subjects, setSubjects]   = useState([]);
  const [selSubject, setSelSubject] = useState("");
  const [newSubj, setNewSubj] = useState({ name: "", slug: "", description: "" });
  const [subjMsg, setSubjMsg] = useState({});
  const [subjBusy, setSubjBusy] = useState(false);

  // ── Topics ──
  const [topics, setTopics]       = useState([]);
  const [selTopic, setSelTopic]   = useState(null);
  const [newTopic, setNewTopic]   = useState({ name: "", slug: "", difficulty: "intermediate", description: "" });
  const [topicMsg, setTopicMsg]   = useState({});
  const [topicBusy, setTopicBusy] = useState(false);

  // Load subjects on mount
  useEffect(() => {
    api.adminGetSubjects().then(setSubjects).catch(e => setSubjMsg({ err: e.message }));
  }, []);

  // Load topics when subject changes
  useEffect(() => {
    if (!selSubject) { setTopics([]); setSelTopic(null); return; }
    api.adminGetTopics(selSubject).then(t => { setTopics(t); setSelTopic(null); })
      .catch(e => setTopicMsg({ err: e.message }));
  }, [selSubject]);

  async function createSubject(e) {
    e.preventDefault();
    setSubjBusy(true); setSubjMsg({});
    try {
      const s = await api.adminCreateSubject({
        name: newSubj.name,
        slug: newSubj.slug || slug(newSubj.name),
        description: newSubj.description || null,
      });
      setSubjects(ss => [...ss, s]);
      setSelSubject(String(s.id));
      setNewSubj({ name: "", slug: "", description: "" });
      setSubjMsg({ ok: `Subject "${s.name}" created.` });
    } catch (err) { setSubjMsg({ err: err.message }); }
    finally { setSubjBusy(false); }
  }

  async function createTopic(e) {
    e.preventDefault();
    setTopicBusy(true); setTopicMsg({});
    try {
      const t = await api.adminCreateTopic({
        subject_id: Number(selSubject),
        name: newTopic.name,
        slug: newTopic.slug || slug(newTopic.name),
        difficulty: newTopic.difficulty || null,
        description: newTopic.description || null,
      });
      setTopics(ts => [...ts, t]);
      setSelTopic(t.id);
      setNewTopic({ name: "", slug: "", difficulty: "intermediate", description: "" });
      setTopicMsg({ ok: `Topic "${t.name}" created.` });
    } catch (err) { setTopicMsg({ err: err.message }); }
    finally { setTopicBusy(false); }
  }

  return (
    <div style={S.page}>
      <h1 style={S.pageTitle}>🛠 Curriculum Admin</h1>
      <p style={S.pageSubtitle}>Internal tool — populate curriculum content for the Learning Session system.</p>

      <div style={S.layout}>
        {/* ── LEFT: Subject + Topic selector ── */}
        <aside style={S.sidebar}>
          <h2 style={S.sideH}>Subject</h2>

          <select style={S.select} value={selSubject}
            onChange={e => setSelSubject(e.target.value)}>
            <option value="">— select —</option>
            {subjects.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>

          <details style={S.details}>
            <summary style={S.summary}>+ New subject</summary>
            <form onSubmit={createSubject} style={S.form}>
              <input style={S.input} placeholder="Name" value={newSubj.name}
                onChange={e => setNewSubj(n => ({ ...n, name: e.target.value, slug: slug(e.target.value) }))}
                required />
              <input style={S.input} placeholder="Slug (auto)" value={newSubj.slug}
                onChange={e => setNewSubj(n => ({ ...n, slug: e.target.value }))} />
              <textarea style={S.textarea} placeholder="Description (optional)"
                value={newSubj.description}
                onChange={e => setNewSubj(n => ({ ...n, description: e.target.value }))} rows={2} />
              <button style={S.btn} disabled={subjBusy}>Create{subjBusy && <Spinner />}</button>
              <Msg {...subjMsg} />
            </form>
          </details>

          {selSubject && (
            <>
              <h2 style={{ ...S.sideH, marginTop: 24 }}>Topic</h2>

              <ul style={S.topicList}>
                {topics.map(t => (
                  <li key={t.id}>
                    <button
                      style={{ ...S.topicBtn, ...(selTopic === t.id ? S.topicBtnActive : {}) }}
                      onClick={() => setSelTopic(t.id)}
                    >
                      {t.name}
                      {t.difficulty && <span style={S.difficulty}>{t.difficulty}</span>}
                    </button>
                  </li>
                ))}
              </ul>

              <details style={S.details}>
                <summary style={S.summary}>+ New topic</summary>
                <form onSubmit={createTopic} style={S.form}>
                  <input style={S.input} placeholder="Name" value={newTopic.name}
                    onChange={e => setNewTopic(n => ({ ...n, name: e.target.value, slug: slug(e.target.value) }))}
                    required />
                  <input style={S.input} placeholder="Slug (auto)" value={newTopic.slug}
                    onChange={e => setNewTopic(n => ({ ...n, slug: e.target.value }))} />
                  <input style={S.input} placeholder="Difficulty" value={newTopic.difficulty}
                    onChange={e => setNewTopic(n => ({ ...n, difficulty: e.target.value }))} />
                  <textarea style={S.textarea} placeholder="Description (optional)"
                    value={newTopic.description}
                    onChange={e => setNewTopic(n => ({ ...n, description: e.target.value }))} rows={2} />
                  <button style={S.btn} disabled={topicBusy}>Create{topicBusy && <Spinner />}</button>
                  <Msg {...topicMsg} />
                </form>
              </details>
            </>
          )}
        </aside>

        {/* ── RIGHT: Topic content panel ── */}
        <main style={S.main}>
          <TopicPanel topicId={selTopic} />
        </main>
      </div>
    </div>
  );
}

// ─── Inline styles (minimal, no deps) ────────────────────────────────────────

const S = {
  page:        { maxWidth: 1100, margin: "0 auto", padding: "24px 16px", fontFamily: "system-ui, sans-serif", color: "#1a1a1a" },
  pageTitle:   { fontSize: 22, fontWeight: 700, margin: "0 0 4px" },
  pageSubtitle:{ fontSize: 13, color: "#666", margin: "0 0 24px" },
  layout:      { display: "flex", gap: 24, alignItems: "flex-start" },
  sidebar:     { width: 260, flexShrink: 0, position: "sticky", top: 16 },
  main:        { flex: 1, minWidth: 0 },
  sideH:       { fontSize: 13, fontWeight: 600, textTransform: "uppercase", letterSpacing: ".05em", color: "#555", margin: "0 0 8px" },
  select:      { width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14, marginBottom: 8 },
  details:     { marginTop: 4 },
  summary:     { cursor: "pointer", fontSize: 13, color: "#2563eb", userSelect: "none", padding: "4px 0" },
  form:        { display: "flex", flexDirection: "column", gap: 8, marginTop: 8 },
  input:       { padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14, width: "100%", boxSizing: "border-box" },
  textarea:    { padding: "6px 8px", borderRadius: 6, border: "1px solid #ccc", fontSize: 14, width: "100%", boxSizing: "border-box", resize: "vertical", minHeight: 64 },
  btn:         { padding: "7px 14px", borderRadius: 6, border: "none", background: "#2563eb", color: "#fff", fontSize: 14, cursor: "pointer", alignSelf: "flex-start" },
  checkLabel:  { fontSize: 13, display: "flex", alignItems: "center", gap: 6 },
  row:         { display: "flex", gap: 8 },
  err:         { color: "#dc2626", fontSize: 13, margin: "4px 0 0" },
  ok:          { color: "#16a34a", fontSize: 13, margin: "4px 0 0" },
  hint:        { color: "#888", fontSize: 13, fontStyle: "italic" },
  topicList:   { listStyle: "none", padding: 0, margin: "0 0 8px" },
  topicBtn:    { width: "100%", textAlign: "left", background: "none", border: "1px solid #e5e7eb", borderRadius: 6, padding: "7px 10px", fontSize: 13, cursor: "pointer", marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center" },
  topicBtnActive: { background: "#eff6ff", borderColor: "#2563eb", fontWeight: 600 },
  topicTitle:  { fontSize: 18, fontWeight: 700, margin: "0 0 4px", display: "flex", gap: 10, alignItems: "center" },
  difficulty:  { fontSize: 11, background: "#f3f4f6", borderRadius: 4, padding: "2px 6px", fontWeight: 400, color: "#555" },
  desc:        { fontSize: 13, color: "#555", margin: "0 0 16px" },
  section:     { border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 12, overflow: "hidden" },
  sectionToggle: { width: "100%", textAlign: "left", background: "#f9fafb", border: "none", padding: "10px 14px", fontSize: 14, fontWeight: 600, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 },
  sectionBody: { padding: "12px 14px", borderTop: "1px solid #e5e7eb" },
  badge:       { marginLeft: "auto", background: "#e0e7ff", color: "#3730a3", borderRadius: 10, padding: "2px 8px", fontSize: 11, fontWeight: 700 },
  list:        { listStyle: "disc", paddingLeft: 20, margin: "0 0 12px", fontSize: 13, color: "#333" },
  listItem:    { marginBottom: 4 },
};
