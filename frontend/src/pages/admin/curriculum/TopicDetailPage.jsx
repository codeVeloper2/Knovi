/**
 * TopicDetailPage — /admin/curriculum/topics/:topicId
 *
 * Tabbed interface for managing all content within a topic:
 *   Overview | Learning Objectives | Concepts | Misconceptions |
 *   Activities | Questions | Resources
 *
 * Every CRUD action persists to the backend immediately.
 * Refreshing the page restores all data from the API.
 */
import { useEffect, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import * as api from "../../../api";

// ─────────────────────────────────────────────────────────────────────────────
// SHARED HELPERS
// ─────────────────────────────────────────────────────────────────────────────

function useForm(init) {
  const [fields, setFields] = useState(init);
  const set = (k, v) => setFields((f) => ({ ...f, [k]: v }));
  const reset = () => setFields(init);
  return [fields, set, reset, setFields];
}

function FormErr({ msg }) {
  if (!msg) return null;
  return <p className="adm-form-err">{msg}</p>;
}
function FormOk({ msg }) {
  if (!msg) return null;
  return <p className="adm-form-ok">{msg}</p>;
}

function DeleteBtn({ onDelete, busy }) {
  return (
    <button
      className="adm-action-btn adm-action-danger"
      onClick={onDelete}
      disabled={busy}
      title="Delete"
      aria-label="Delete"
    >
      🗑️
    </button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OVERVIEW TAB
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab({ topic, subjects, onTopicUpdated }) {
  const [editing, setEditing] = useState(false);
  const [form, set, , setFields] = useForm({
    name:        topic.name,
    slug:        topic.slug,
    description: topic.description || "",
    difficulty:  topic.difficulty  || "intermediate",
    is_active:   topic.is_active,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");
  const [ok, setOk]     = useState("");

  const subjectName = subjects.find((s) => s.id === topic.subject_id)?.name ?? "Unknown";

  async function handleSave(e) {
    e.preventDefault();
    setBusy(true); setErr(""); setOk("");
    try {
      const updated = await api.adminUpdateTopic(topic.id, {
        name:        form.name.trim(),
        slug:        form.slug.trim(),
        description: form.description.trim() || null,
        difficulty:  form.difficulty,
        is_active:   form.is_active,
      });
      onTopicUpdated(updated);
      setEditing(false);
      setOk("Topic updated.");
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (!editing) {
    return (
      <div className="adm-overview">
        <dl className="adm-dl">
          <div className="adm-dl-row"><dt>Subject</dt>    <dd><span className="adm-tag">{subjectName}</span></dd></div>
          <div className="adm-dl-row"><dt>Name</dt>       <dd>{topic.name}</dd></div>
          <div className="adm-dl-row"><dt>Slug</dt>       <dd><code className="adm-code">{topic.slug}</code></dd></div>
          <div className="adm-dl-row"><dt>Difficulty</dt> <dd>{topic.difficulty || "—"}</dd></div>
          <div className="adm-dl-row"><dt>Description</dt><dd>{topic.description || "—"}</dd></div>
          <div className="adm-dl-row">
            <dt>Status</dt>
            <dd>
              <span className={`adm-badge ${topic.is_active ? "adm-badge-green" : "adm-badge-grey"}`}>
                {topic.is_active ? "Active" : "Inactive"}
              </span>
            </dd>
          </div>
          <div className="adm-dl-row"><dt>Created</dt>    <dd>{new Date(topic.created_at).toLocaleDateString()}</dd></div>
          <div className="adm-dl-row"><dt>Updated</dt>    <dd>{new Date(topic.updated_at).toLocaleDateString()}</dd></div>
        </dl>
        {ok && <FormOk msg={ok} />}
        <button className="adm-btn-primary" style={{ marginTop: 16 }} onClick={() => setEditing(true)}>
          Edit Topic
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSave} className="adm-form-panel">
      <div className="adm-field">
        <label className="adm-label">Topic Name *</label>
        <input className="adm-input" value={form.name} onChange={(e) => set("name", e.target.value)} required />
      </div>
      <div className="adm-field">
        <label className="adm-label">Slug *</label>
        <input className="adm-input" value={form.slug} onChange={(e) => set("slug", e.target.value)}
          pattern="^[a-z0-9-]+$" required />
      </div>
      <div className="adm-field">
        <label className="adm-label">Description</label>
        <textarea className="adm-textarea" rows={3} value={form.description}
          onChange={(e) => set("description", e.target.value)} />
      </div>
      <div className="adm-field-row">
        <div className="adm-field" style={{ flex: 1 }}>
          <label className="adm-label">Difficulty</label>
          <select className="adm-select" value={form.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
            {["beginner","intermediate","advanced"].map((d) => (
              <option key={d} value={d}>{d.charAt(0).toUpperCase()+d.slice(1)}</option>
            ))}
          </select>
        </div>
        <div className="adm-field" style={{ flex: 1 }}>
          <label className="adm-label">Status</label>
          <select className="adm-select" value={form.is_active ? "active" : "inactive"}
            onChange={(e) => set("is_active", e.target.value === "active")}>
            <option value="active">Active</option>
            <option value="inactive">Inactive</option>
          </select>
        </div>
      </div>
      <FormErr msg={err} />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" className="adm-btn-ghost" onClick={() => setEditing(false)}>Cancel</button>
        <button type="submit" className="adm-btn-primary" disabled={busy}>{busy ? "Saving…" : "Save Changes"}</button>
      </div>
    </form>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// OBJECTIVES TAB
// ─────────────────────────────────────────────────────────────────────────────

function ObjectivesTab({ topicId }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, set, reset]       = useForm({ title: "", description: "", order_index: 0 });
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState({});
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    api.adminGetObjectives(topicId)
      .then(setItems)
      .catch((e) => setMsg({ err: e.message }))
      .finally(() => setLoading(false));
  }, [topicId]);

  async function handleAdd(e) {
    e.preventDefault(); setBusy(true); setMsg({});
    try {
      const item = await api.adminAddObjective(topicId, {
        title: f.title, description: f.description, order_index: Number(f.order_index),
      });
      setItems((ii) => [...ii, item].sort((a, b) => a.order_index - b.order_index));
      reset(); setMsg({ ok: "Objective added." });
    } catch (e) { setMsg({ err: e.message }); }
    finally { setBusy(false); }
  }

  async function handleUpdate(id, body) {
    try {
      const updated = await api.adminUpdateObjective(topicId, id, body);
      setItems((ii) => ii.map((i) => (i.id === id ? updated : i)));
      setEditing(null);
    } catch (e) { alert(e.message); }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this objective?")) return;
    try {
      await api.adminDeleteObjective(topicId, id);
      setItems((ii) => ii.filter((i) => i.id !== id));
    } catch (e) { alert(e.message); }
  }

  if (loading) return <div className="adm-loading">Loading…</div>;

  return (
    <div className="adm-tab-content">
      <h3 className="adm-section-title">Learning Objectives ({items.length})</h3>

      {items.length === 0
        ? <p className="adm-empty-hint">No objectives yet.</p>
        : (
          <ul className="adm-content-list">
            {items.map((item) =>
              editing === item.id ? (
                <InlineEditObjective
                  key={item.id}
                  item={item}
                  onSave={(body) => handleUpdate(item.id, body)}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <li key={item.id} className="adm-content-item">
                  <div className="adm-item-meta">
                    <span className="adm-item-order">#{item.order_index}</span>
                    <div>
                      <p className="adm-item-title">{item.title}</p>
                      <p className="adm-item-sub">{item.description}</p>
                    </div>
                  </div>
                  <div className="adm-item-actions">
                    <button className="adm-action-btn" onClick={() => setEditing(item.id)} title="Edit">✏️</button>
                    <DeleteBtn onDelete={() => handleDelete(item.id)} />
                  </div>
                </li>
              )
            )}
          </ul>
        )
      }

      <div className="adm-add-form">
        <h4 className="adm-add-form-title">+ Add Objective</h4>
        <form onSubmit={handleAdd} className="adm-form-grid">
          <div className="adm-field">
            <label className="adm-label">Title *</label>
            <input className="adm-input" value={f.title} onChange={(e) => set("title", e.target.value)} required />
          </div>
          <div className="adm-field">
            <label className="adm-label">Description *</label>
            <textarea className="adm-textarea" rows={2} value={f.description}
              onChange={(e) => set("description", e.target.value)} required />
          </div>
          <div className="adm-field adm-field-sm">
            <label className="adm-label">Order</label>
            <input className="adm-input" type="number" min={0} value={f.order_index}
              onChange={(e) => set("order_index", e.target.value)} />
          </div>
          <FormErr msg={msg.err} /><FormOk msg={msg.ok} />
          <button className="adm-btn-primary" disabled={busy}>{busy ? "Saving…" : "Add Objective"}</button>
        </form>
      </div>
    </div>
  );
}

function InlineEditObjective({ item, onSave, onCancel }) {
  const [f, set] = useState({ title: item.title, description: item.description, order_index: item.order_index });
  return (
    <li className="adm-content-item adm-content-item-editing">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <input className="adm-input" value={f.title} onChange={(e) => set((x) => ({ ...x, title: e.target.value }))} />
        <textarea className="adm-textarea" rows={2} value={f.description}
          onChange={(e) => set((x) => ({ ...x, description: e.target.value }))} />
        <input className="adm-input" type="number" value={f.order_index} style={{ width: 80 }}
          onChange={(e) => set((x) => ({ ...x, order_index: Number(e.target.value) }))} />
      </div>
      <div className="adm-item-actions">
        <button className="adm-action-btn adm-action-save" onClick={() => onSave(f)} title="Save">💾</button>
        <button className="adm-action-btn" onClick={onCancel} title="Cancel">✕</button>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// CONCEPTS TAB
// ─────────────────────────────────────────────────────────────────────────────

function ConceptsTab({ topicId }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, set, reset]       = useForm({ name: "", explanation: "", key_points: "" });
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState({});
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    api.adminGetConcepts(topicId)
      .then(setItems)
      .catch((e) => setMsg({ err: e.message }))
      .finally(() => setLoading(false));
  }, [topicId]);

  function parseKP(raw) {
    return raw.split("\n").map((s) => s.trim()).filter(Boolean);
  }

  async function handleAdd(e) {
    e.preventDefault(); setBusy(true); setMsg({});
    try {
      const item = await api.adminAddConcept(topicId, {
        name: f.name, explanation: f.explanation, key_points: parseKP(f.key_points),
      });
      setItems((ii) => [...ii, item]);
      reset(); setMsg({ ok: "Concept added." });
    } catch (e) { setMsg({ err: e.message }); }
    finally { setBusy(false); }
  }

  async function handleUpdate(id, body) {
    try {
      const updated = await api.adminUpdateConcept(topicId, id, body);
      setItems((ii) => ii.map((i) => (i.id === id ? updated : i)));
      setEditing(null);
    } catch (e) { alert(e.message); }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this concept?")) return;
    try {
      await api.adminDeleteConcept(topicId, id);
      setItems((ii) => ii.filter((i) => i.id !== id));
    } catch (e) { alert(e.message); }
  }

  if (loading) return <div className="adm-loading">Loading…</div>;

  return (
    <div className="adm-tab-content">
      <h3 className="adm-section-title">Concepts ({items.length})</h3>

      {items.length === 0
        ? <p className="adm-empty-hint">No concepts yet.</p>
        : (
          <ul className="adm-content-list">
            {items.map((item) =>
              editing === item.id ? (
                <InlineEditConcept key={item.id} item={item}
                  onSave={(body) => handleUpdate(item.id, body)}
                  onCancel={() => setEditing(null)} />
              ) : (
                <li key={item.id} className="adm-content-item">
                  <div style={{ flex: 1 }}>
                    <p className="adm-item-title">{item.name}</p>
                    <p className="adm-item-sub">{item.explanation}</p>
                    {item.key_points?.length > 0 && (
                      <ul className="adm-kp-list">
                        {item.key_points.map((kp, i) => <li key={i}>{kp}</li>)}
                      </ul>
                    )}
                  </div>
                  <div className="adm-item-actions">
                    <button className="adm-action-btn" onClick={() => setEditing(item.id)} title="Edit">✏️</button>
                    <DeleteBtn onDelete={() => handleDelete(item.id)} />
                  </div>
                </li>
              )
            )}
          </ul>
        )
      }

      <div className="adm-add-form">
        <h4 className="adm-add-form-title">+ Add Concept</h4>
        <form onSubmit={handleAdd} className="adm-form-grid">
          <div className="adm-field">
            <label className="adm-label">Concept Name *</label>
            <input className="adm-input" value={f.name} onChange={(e) => set("name", e.target.value)} required />
          </div>
          <div className="adm-field">
            <label className="adm-label">Explanation *</label>
            <textarea className="adm-textarea" rows={3} value={f.explanation}
              onChange={(e) => set("explanation", e.target.value)} required />
          </div>
          <div className="adm-field">
            <label className="adm-label">Key Points (one per line)</label>
            <textarea className="adm-textarea" rows={4} value={f.key_points}
              onChange={(e) => set("key_points", e.target.value)}
              placeholder={"velocity can change in magnitude\nvelocity can change in direction\nacceleration is different from speed"} />
          </div>
          <FormErr msg={msg.err} /><FormOk msg={msg.ok} />
          <button className="adm-btn-primary" disabled={busy}>{busy ? "Saving…" : "Add Concept"}</button>
        </form>
      </div>
    </div>
  );
}

function InlineEditConcept({ item, onSave, onCancel }) {
  const [f, set] = useState({
    name: item.name,
    explanation: item.explanation,
    key_points_raw: (item.key_points || []).join("\n"),
  });
  function handleSave() {
    onSave({
      name: f.name,
      explanation: f.explanation,
      key_points: f.key_points_raw.split("\n").map((s) => s.trim()).filter(Boolean),
    });
  }
  return (
    <li className="adm-content-item adm-content-item-editing">
      <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
        <input className="adm-input" value={f.name} onChange={(e) => set((x) => ({ ...x, name: e.target.value }))} />
        <textarea className="adm-textarea" rows={3} value={f.explanation}
          onChange={(e) => set((x) => ({ ...x, explanation: e.target.value }))} />
        <textarea className="adm-textarea" rows={3} value={f.key_points_raw}
          placeholder="Key points (one per line)"
          onChange={(e) => set((x) => ({ ...x, key_points_raw: e.target.value }))} />
      </div>
      <div className="adm-item-actions">
        <button className="adm-action-btn adm-action-save" onClick={handleSave} title="Save">💾</button>
        <button className="adm-action-btn" onClick={onCancel} title="Cancel">✕</button>
      </div>
    </li>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MISCONCEPTIONS TAB
// ─────────────────────────────────────────────────────────────────────────────

function MisconceptionsTab({ topicId, concepts }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, set, reset]       = useForm({ misconception: "", correction: "", hint: "", concept_id: "" });
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState({});
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    api.adminGetMisconceptions(topicId)
      .then(setItems)
      .catch((e) => setMsg({ err: e.message }))
      .finally(() => setLoading(false));
  }, [topicId]);

  async function handleAdd(e) {
    e.preventDefault(); setBusy(true); setMsg({});
    try {
      const item = await api.adminAddMisconception(topicId, {
        misconception: f.misconception,
        correction: f.correction,
        hint: f.hint,
        concept_id: f.concept_id ? Number(f.concept_id) : null,
      });
      setItems((ii) => [...ii, item]);
      reset(); setMsg({ ok: "Misconception added." });
    } catch (e) { setMsg({ err: e.message }); }
    finally { setBusy(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this misconception?")) return;
    try {
      await api.adminDeleteMisconception(topicId, id);
      setItems((ii) => ii.filter((i) => i.id !== id));
    } catch (e) { alert(e.message); }
  }

  const conceptName = (id) => concepts.find((c) => c.id === id)?.name ?? null;

  if (loading) return <div className="adm-loading">Loading…</div>;

  return (
    <div className="adm-tab-content">
      <h3 className="adm-section-title">Misconceptions ({items.length})</h3>

      {items.length === 0
        ? <p className="adm-empty-hint">No misconceptions yet.</p>
        : (
          <ul className="adm-content-list">
            {items.map((item) => (
              <li key={item.id} className="adm-content-item">
                <div style={{ flex: 1 }}>
                  <p className="adm-item-label">Misconception</p>
                  <p className="adm-item-text adm-misc-misconception">"{item.misconception}"</p>
                  <p className="adm-item-label">Correction</p>
                  <p className="adm-item-text">{item.correction}</p>
                  <p className="adm-item-label">Hint</p>
                  <p className="adm-item-text adm-item-hint">{item.hint}</p>
                  {item.concept_id && (
                    <p className="adm-item-sub">Related concept: <em>{conceptName(item.concept_id)}</em></p>
                  )}
                </div>
                <div className="adm-item-actions">
                  <DeleteBtn onDelete={() => handleDelete(item.id)} />
                </div>
              </li>
            ))}
          </ul>
        )
      }

      <div className="adm-add-form">
        <h4 className="adm-add-form-title">+ Add Misconception</h4>
        <form onSubmit={handleAdd} className="adm-form-grid">
          <div className="adm-field">
            <label className="adm-label">Misconception *</label>
            <textarea className="adm-textarea" rows={2} value={f.misconception}
              onChange={(e) => set("misconception", e.target.value)}
              placeholder="What students often incorrectly believe…" required />
          </div>
          <div className="adm-field">
            <label className="adm-label">Correction *</label>
            <textarea className="adm-textarea" rows={2} value={f.correction}
              onChange={(e) => set("correction", e.target.value)}
              placeholder="The correct understanding…" required />
          </div>
          <div className="adm-field">
            <label className="adm-label">Hint *</label>
            <textarea className="adm-textarea" rows={2} value={f.hint}
              onChange={(e) => set("hint", e.target.value)}
              placeholder="A guiding hint to steer thinking…" required />
          </div>
          {concepts.length > 0 && (
            <div className="adm-field">
              <label className="adm-label">Related Concept (optional)</label>
              <select className="adm-select" value={f.concept_id} onChange={(e) => set("concept_id", e.target.value)}>
                <option value="">— none —</option>
                {concepts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          )}
          <FormErr msg={msg.err} /><FormOk msg={msg.ok} />
          <button className="adm-btn-primary" disabled={busy}>{busy ? "Saving…" : "Add Misconception"}</button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// ACTIVITIES TAB
// ─────────────────────────────────────────────────────────────────────────────

const ACTIVITY_TYPES = ["learn", "explain", "practice", "challenge", "check"];

function ActivitiesTab({ topicId }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, set, reset]       = useForm({ type: "learn", title: "", prompt: "", order_index: 0 });
  const [busy, setBusy]       = useState(false);
  const [msg, setMsg]         = useState({});
  const [editing, setEditing] = useState(null);

  useEffect(() => {
    api.adminGetActivities(topicId)
      .then(setItems)
      .catch((e) => setMsg({ err: e.message }))
      .finally(() => setLoading(false));
  }, [topicId]);

  async function handleAdd(e) {
    e.preventDefault(); setBusy(true); setMsg({});
    try {
      const item = await api.adminAddActivity(topicId, {
        type: f.type, title: f.title,
        prompt: f.prompt || null, order_index: Number(f.order_index),
      });
      setItems((ii) => [...ii, item].sort((a, b) => a.order_index - b.order_index));
      reset(); setMsg({ ok: "Activity added." });
    } catch (e) { setMsg({ err: e.message }); }
    finally { setBusy(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this activity?")) return;
    try {
      await api.adminDeleteActivity(topicId, id);
      setItems((ii) => ii.filter((i) => i.id !== id));
    } catch (e) { alert(e.message); }
  }

  const typeColors = {
    learn: "adm-badge-blue", explain: "adm-badge-purple", practice: "adm-badge-teal",
    challenge: "adm-badge-gold", check: "adm-badge-green",
  };

  if (loading) return <div className="adm-loading">Loading…</div>;

  return (
    <div className="adm-tab-content">
      <h3 className="adm-section-title">Learning Activities ({items.length})</h3>

      {items.length === 0
        ? <p className="adm-empty-hint">No activities yet.</p>
        : (
          <ul className="adm-content-list">
            {items.map((item) => (
              <li key={item.id} className="adm-content-item">
                <span className="adm-item-order">#{item.order_index}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span className={`adm-badge ${typeColors[item.type] ?? "adm-badge-grey"}`}>
                      {item.type}
                    </span>
                    <p className="adm-item-title" style={{ margin: 0 }}>{item.title}</p>
                  </div>
                  {item.prompt && <p className="adm-item-sub">{item.prompt}</p>}
                </div>
                <div className="adm-item-actions">
                  <DeleteBtn onDelete={() => handleDelete(item.id)} />
                </div>
              </li>
            ))}
          </ul>
        )
      }

      <div className="adm-add-form">
        <h4 className="adm-add-form-title">+ Add Activity</h4>
        <form onSubmit={handleAdd} className="adm-form-grid">
          <div className="adm-field-row">
            <div className="adm-field" style={{ flex: 1 }}>
              <label className="adm-label">Type *</label>
              <select className="adm-select" value={f.type} onChange={(e) => set("type", e.target.value)}>
                {ACTIVITY_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="adm-field adm-field-sm">
              <label className="adm-label">Order</label>
              <input className="adm-input" type="number" min={0} value={f.order_index}
                onChange={(e) => set("order_index", e.target.value)} />
            </div>
          </div>
          <div className="adm-field">
            <label className="adm-label">Title *</label>
            <input className="adm-input" value={f.title} onChange={(e) => set("title", e.target.value)} required />
          </div>
          <div className="adm-field">
            <label className="adm-label">Prompt / Instructions</label>
            <textarea className="adm-textarea" rows={3} value={f.prompt}
              onChange={(e) => set("prompt", e.target.value)} />
          </div>
          <FormErr msg={msg.err} /><FormOk msg={msg.ok} />
          <button className="adm-btn-primary" disabled={busy}>{busy ? "Saving…" : "Add Activity"}</button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// QUESTIONS TAB
// ─────────────────────────────────────────────────────────────────────────────

const QUESTION_TYPES = ["multiple_choice", "short_answer", "numeric", "explanation"];

function QuestionsTab({ topicId, activities }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, set, reset]       = useForm({
    question: "", question_type: "short_answer", difficulty: "intermediate",
    answer: "", explanation: "", hint: "",
    optA: "", optB: "", optC: "", optD: "", activity_id: "",
  });
  const [busy, setBusy]   = useState(false);
  const [msg, setMsg]     = useState({});

  useEffect(() => {
    api.adminGetQuestions(topicId)
      .then(setItems)
      .catch((e) => setMsg({ err: e.message }))
      .finally(() => setLoading(false));
  }, [topicId]);

  async function handleAdd(e) {
    e.preventDefault(); setBusy(true); setMsg({});
    try {
      let options = null;
      if (f.question_type === "multiple_choice") {
        options = [
          { label: "A", text: f.optA },
          { label: "B", text: f.optB },
          { label: "C", text: f.optC },
          { label: "D", text: f.optD },
        ].filter((o) => o.text.trim());
      }
      const item = await api.adminAddQuestion(topicId, {
        question: f.question,
        question_type: f.question_type,
        difficulty: f.difficulty,
        answer: f.answer || null,
        explanation: f.explanation || null,
        hint: f.hint || null,
        options,
        activity_id: f.activity_id ? Number(f.activity_id) : null,
      });
      setItems((ii) => [...ii, item]);
      reset(); setMsg({ ok: "Question added." });
    } catch (e) { setMsg({ err: e.message }); }
    finally { setBusy(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this question?")) return;
    try {
      await api.adminDeleteQuestion(topicId, id);
      setItems((ii) => ii.filter((i) => i.id !== id));
    } catch (e) { alert(e.message); }
  }

  const qtColors = { multiple_choice: "adm-badge-blue", short_answer: "adm-badge-teal",
    numeric: "adm-badge-gold", explanation: "adm-badge-purple" };

  if (loading) return <div className="adm-loading">Loading…</div>;

  return (
    <div className="adm-tab-content">
      <h3 className="adm-section-title">Questions ({items.length})</h3>

      {items.length === 0
        ? <p className="adm-empty-hint">No questions yet.</p>
        : (
          <ul className="adm-content-list">
            {items.map((item) => (
              <li key={item.id} className="adm-content-item">
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span className={`adm-badge ${qtColors[item.question_type] ?? "adm-badge-grey"}`}>
                      {item.question_type}
                    </span>
                    <span className="adm-badge adm-badge-grey">{item.difficulty}</span>
                  </div>
                  <p className="adm-item-title">{item.question}</p>
                  {item.options?.length > 0 && (
                    <ul className="adm-kp-list">
                      {item.options.map((o) => (
                        <li key={o.label}><strong>{o.label}.</strong> {o.text}
                          {item.answer === o.label && <span className="adm-correct-mark"> ✓</span>}
                        </li>
                      ))}
                    </ul>
                  )}
                  {item.answer && item.question_type !== "multiple_choice" && (
                    <p className="adm-item-sub"><strong>Answer:</strong> {item.answer}</p>
                  )}
                  {item.hint && <p className="adm-item-sub"><strong>Hint:</strong> {item.hint}</p>}
                  {item.explanation && <p className="adm-item-sub"><strong>Explanation:</strong> {item.explanation}</p>}
                </div>
                <div className="adm-item-actions">
                  <DeleteBtn onDelete={() => handleDelete(item.id)} />
                </div>
              </li>
            ))}
          </ul>
        )
      }

      <div className="adm-add-form">
        <h4 className="adm-add-form-title">+ Add Question</h4>
        <form onSubmit={handleAdd} className="adm-form-grid">
          <div className="adm-field-row">
            <div className="adm-field" style={{ flex: 1 }}>
              <label className="adm-label">Question Type *</label>
              <select className="adm-select" value={f.question_type} onChange={(e) => set("question_type", e.target.value)}>
                {QUESTION_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="adm-field" style={{ flex: 1 }}>
              <label className="adm-label">Difficulty *</label>
              <select className="adm-select" value={f.difficulty} onChange={(e) => set("difficulty", e.target.value)}>
                {["beginner","intermediate","advanced"].map((d) => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
          </div>

          <div className="adm-field">
            <label className="adm-label">Question *</label>
            <textarea className="adm-textarea" rows={3} value={f.question}
              onChange={(e) => set("question", e.target.value)} required />
          </div>

          {f.question_type === "multiple_choice" && (
            <>
              <div className="adm-field-row">
                <div className="adm-field" style={{ flex: 1 }}>
                  <label className="adm-label">Option A</label>
                  <input className="adm-input" value={f.optA} onChange={(e) => set("optA", e.target.value)} />
                </div>
                <div className="adm-field" style={{ flex: 1 }}>
                  <label className="adm-label">Option B</label>
                  <input className="adm-input" value={f.optB} onChange={(e) => set("optB", e.target.value)} />
                </div>
              </div>
              <div className="adm-field-row">
                <div className="adm-field" style={{ flex: 1 }}>
                  <label className="adm-label">Option C</label>
                  <input className="adm-input" value={f.optC} onChange={(e) => set("optC", e.target.value)} />
                </div>
                <div className="adm-field" style={{ flex: 1 }}>
                  <label className="adm-label">Option D</label>
                  <input className="adm-input" value={f.optD} onChange={(e) => set("optD", e.target.value)} />
                </div>
              </div>
            </>
          )}

          <div className="adm-field">
            <label className="adm-label">
              {f.question_type === "multiple_choice" ? "Correct Answer (A/B/C/D)" : "Answer"}
            </label>
            <input className="adm-input" value={f.answer}
              onChange={(e) => set("answer", e.target.value)}
              placeholder={f.question_type === "multiple_choice" ? "A" : ""} />
          </div>

          <div className="adm-field">
            <label className="adm-label">Explanation</label>
            <textarea className="adm-textarea" rows={2} value={f.explanation}
              onChange={(e) => set("explanation", e.target.value)} />
          </div>

          <div className="adm-field">
            <label className="adm-label">Hint</label>
            <input className="adm-input" value={f.hint} onChange={(e) => set("hint", e.target.value)} />
          </div>

          {activities.length > 0 && (
            <div className="adm-field">
              <label className="adm-label">Link to Activity (optional)</label>
              <select className="adm-select" value={f.activity_id} onChange={(e) => set("activity_id", e.target.value)}>
                <option value="">— none —</option>
                {activities.map((a) => <option key={a.id} value={a.id}>[{a.type}] {a.title}</option>)}
              </select>
            </div>
          )}

          <FormErr msg={msg.err} /><FormOk msg={msg.ok} />
          <button className="adm-btn-primary" disabled={busy}>{busy ? "Saving…" : "Add Question"}</button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RESOURCES TAB
// ─────────────────────────────────────────────────────────────────────────────

const RESOURCE_TYPES = ["video", "textbook", "pdf", "study_guide", "tutorial"];

function ResourcesTab({ topicId }) {
  const [items, setItems]     = useState([]);
  const [loading, setLoading] = useState(true);
  const [f, set, reset]       = useForm({
    title: "", type: "video", url: "", description: "",
    source: "", duration: "", is_downloadable: false, is_verified: false,
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg]   = useState({});

  useEffect(() => {
    api.adminGetResources(topicId)
      .then(setItems)
      .catch((e) => setMsg({ err: e.message }))
      .finally(() => setLoading(false));
  }, [topicId]);

  async function handleAdd(e) {
    e.preventDefault(); setBusy(true); setMsg({});
    try {
      const item = await api.adminAddResource(topicId, {
        title: f.title, type: f.type,
        url: f.url || null, description: f.description || null,
        source: f.source || null, duration: f.duration || null,
        is_downloadable: f.is_downloadable, is_verified: f.is_verified,
      });
      setItems((ii) => [...ii, item]);
      reset(); setMsg({ ok: "Resource added." });
    } catch (e) { setMsg({ err: e.message }); }
    finally { setBusy(false); }
  }

  async function handleDelete(id) {
    if (!confirm("Delete this resource?")) return;
    try {
      await api.adminDeleteResource(topicId, id);
      setItems((ii) => ii.filter((i) => i.id !== id));
    } catch (e) { alert(e.message); }
  }

  const rtColors = { video: "adm-badge-blue", textbook: "adm-badge-purple",
    pdf: "adm-badge-gold", study_guide: "adm-badge-teal", tutorial: "adm-badge-green" };

  if (loading) return <div className="adm-loading">Loading…</div>;

  return (
    <div className="adm-tab-content">
      <h3 className="adm-section-title">Resources ({items.length})</h3>

      {items.length === 0
        ? <p className="adm-empty-hint">No resources yet.</p>
        : (
          <ul className="adm-content-list">
            {items.map((item) => (
              <li key={item.id} className="adm-content-item">
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                    <span className={`adm-badge ${rtColors[item.type] ?? "adm-badge-grey"}`}>{item.type}</span>
                    <p className="adm-item-title" style={{ margin: 0 }}>{item.title}</p>
                    {item.is_verified && <span className="adm-verified-mark" title="Verified">✓</span>}
                  </div>
                  {item.description && <p className="adm-item-sub">{item.description}</p>}
                  {item.url && (
                    <a href={item.url} target="_blank" rel="noopener noreferrer" className="adm-resource-link">
                      {item.url}
                    </a>
                  )}
                  <div className="adm-resource-meta">
                    {item.source && <span>Source: {item.source}</span>}
                    {item.duration && <span>Duration: {item.duration}</span>}
                    {item.is_downloadable && <span className="adm-dl-badge">Downloadable</span>}
                  </div>
                </div>
                <div className="adm-item-actions">
                  <DeleteBtn onDelete={() => handleDelete(item.id)} />
                </div>
              </li>
            ))}
          </ul>
        )
      }

      <div className="adm-add-form">
        <h4 className="adm-add-form-title">+ Add Resource</h4>
        <form onSubmit={handleAdd} className="adm-form-grid">
          <div className="adm-field">
            <label className="adm-label">Title *</label>
            <input className="adm-input" value={f.title} onChange={(e) => set("title", e.target.value)} required />
          </div>
          <div className="adm-field-row">
            <div className="adm-field" style={{ flex: 1 }}>
              <label className="adm-label">Resource Type *</label>
              <select className="adm-select" value={f.type} onChange={(e) => set("type", e.target.value)}>
                {RESOURCE_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
              </select>
            </div>
            <div className="adm-field" style={{ flex: 1 }}>
              <label className="adm-label">Duration (e.g. 12:34)</label>
              <input className="adm-input" value={f.duration} onChange={(e) => set("duration", e.target.value)} />
            </div>
          </div>
          <div className="adm-field">
            <label className="adm-label">URL (YouTube, PDF link, etc.)</label>
            <input className="adm-input" type="url" value={f.url} onChange={(e) => set("url", e.target.value)}
              placeholder="https://" />
          </div>
          <div className="adm-field">
            <label className="adm-label">Source (e.g. Khan Academy)</label>
            <input className="adm-input" value={f.source} onChange={(e) => set("source", e.target.value)} />
          </div>
          <div className="adm-field">
            <label className="adm-label">Description</label>
            <textarea className="adm-textarea" rows={2} value={f.description}
              onChange={(e) => set("description", e.target.value)} />
          </div>
          <div className="adm-checkbox-row">
            <label className="adm-checkbox-label">
              <input type="checkbox" checked={f.is_downloadable}
                onChange={(e) => set("is_downloadable", e.target.checked)} />
              Downloadable (only if PeerUP holds distribution rights)
            </label>
            <label className="adm-checkbox-label">
              <input type="checkbox" checked={f.is_verified}
                onChange={(e) => set("is_verified", e.target.checked)} />
              Verified
            </label>
          </div>
          <FormErr msg={msg.err} /><FormOk msg={msg.ok} />
          <button className="adm-btn-primary" disabled={busy}>{busy ? "Saving…" : "Add Resource"}</button>
        </form>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN TOPIC DETAIL PAGE
// ─────────────────────────────────────────────────────────────────────────────

const TABS = ["Overview", "Objectives", "Concepts", "Misconceptions", "Activities", "Questions", "Resources"];

export default function TopicDetailPage() {
  const { topicId } = useParams();
  const navigate = useNavigate();
  const tid = Number(topicId);

  const [topic, setTopic]       = useState(null);
  const [subjects, setSubjects] = useState([]);
  const [concepts, setConcepts] = useState([]);
  const [activities, setActivities] = useState([]);
  const [activeTab, setActiveTab]   = useState("Overview");
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState("");

  useEffect(() => {
    Promise.all([
      api.adminGetTopic(tid),
      api.adminGetSubjects(),
    ]).then(([t, s]) => {
      setTopic(t);
      setSubjects(s);
    }).catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [tid]);

  // Load concepts + activities upfront so they're available for Misconceptions + Questions tabs
  useEffect(() => {
    if (!topic) return;
    api.adminGetConcepts(tid).then(setConcepts).catch(() => {});
    api.adminGetActivities(tid).then(setActivities).catch(() => {});
  }, [topic, tid]);

  if (loading) return <div className="adm-page"><div className="adm-loading">Loading topic…</div></div>;
  if (error)   return <div className="adm-page"><p className="adm-page-err">{error}</p></div>;
  if (!topic)  return null;

  const subjectName = subjects.find((s) => s.id === topic.subject_id)?.name ?? "Unknown";
  const diffClass = { beginner: "adm-badge-teal", intermediate: "adm-badge-blue", advanced: "adm-badge-purple" };

  return (
    <div className="adm-page">
      {/* Breadcrumb */}
      <nav className="adm-breadcrumb" aria-label="Breadcrumb">
        <Link to="/admin/curriculum/subjects" className="adm-breadcrumb-link">Subjects</Link>
        <span className="adm-breadcrumb-sep">›</span>
        <Link to="/admin/curriculum/topics" className="adm-breadcrumb-link">Topics</Link>
        <span className="adm-breadcrumb-sep">›</span>
        <span className="adm-breadcrumb-current">{topic.name}</span>
      </nav>

      {/* Topic header */}
      <div className="adm-topic-header">
        <div className="adm-topic-header-info">
          <h1 className="adm-page-title">{topic.name}</h1>
          <div className="adm-topic-meta">
            <span className="adm-tag">{subjectName}</span>
            {topic.difficulty && (
              <span className={`adm-badge ${diffClass[topic.difficulty] ?? "adm-badge-grey"}`}>
                {topic.difficulty.charAt(0).toUpperCase() + topic.difficulty.slice(1)}
              </span>
            )}
            <span className={`adm-badge ${topic.is_active ? "adm-badge-green" : "adm-badge-grey"}`}>
              {topic.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          {topic.description && <p className="adm-page-sub">{topic.description}</p>}
        </div>
      </div>

      {/* Tabs */}
      <div className="adm-tabs" role="tablist">
        {TABS.map((tab) => (
          <button
            key={tab}
            role="tab"
            aria-selected={activeTab === tab}
            className={`adm-tab ${activeTab === tab ? "active" : ""}`}
            onClick={() => setActiveTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab panels */}
      <div className="adm-tab-panel">
        {activeTab === "Overview" && (
          <OverviewTab topic={topic} subjects={subjects} onTopicUpdated={setTopic} />
        )}
        {activeTab === "Objectives" && <ObjectivesTab topicId={tid} />}
        {activeTab === "Concepts" && (
          <ConceptsTab topicId={tid} />
        )}
        {activeTab === "Misconceptions" && (
          <MisconceptionsTab topicId={tid} concepts={concepts} />
        )}
        {activeTab === "Activities" && <ActivitiesTab topicId={tid} />}
        {activeTab === "Questions" && (
          <QuestionsTab topicId={tid} activities={activities} />
        )}
        {activeTab === "Resources" && <ResourcesTab topicId={tid} />}
      </div>
    </div>
  );
}
