/**
 * TopicsPage — /admin/curriculum/topics
 *
 * Lists ALL topics across all subjects, with subject filter.
 * Links to the topic detail page.
 * Inline modal to create a new topic.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import * as api from "../../../api";

function toSlug(name) {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

const DIFFICULTIES = ["beginner", "intermediate", "advanced"];

// ── Create / Edit Modal ───────────────────────────────────────────────────────
function TopicModal({ topic, subjects, onClose, onSaved }) {
  const editing = !!topic;
  const [form, setForm] = useState({
    subject_id:  topic?.subjectId   || (subjects[0]?.id ?? ""),
    name:        topic?.name        || "",
    slug:        topic?.slug        || "",
    description: topic?.description || "",
    difficulty:  topic?.difficulty  || "intermediate",
    is_active:   topic?.isActive    ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");

  function set(k, v) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      if (k === "name" && !editing) next.slug = toSlug(v);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const body = {
        subject_id:  Number(form.subject_id),
        name:        form.name.trim(),
        slug:        form.slug.trim() || toSlug(form.name),
        description: form.description.trim() || null,
        difficulty:  form.difficulty || null,
        is_active:   form.is_active,
      };
      const saved = editing
        ? await api.adminUpdateTopic(topic.id, body)
        : await api.adminCreateTopic(body);
      onSaved(saved);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div className="adm-modal" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-header">
          <h2 className="adm-modal-title">{editing ? "Edit Topic" : "Add Topic"}</h2>
          <button className="adm-modal-close" onClick={onClose}>✕</button>
        </div>
        <form onSubmit={handleSubmit} className="adm-modal-body">
          <div className="adm-field">
            <label className="adm-label">Subject *</label>
            <select
              className="adm-select"
              value={form.subject_id}
              onChange={(e) => set("subject_id", e.target.value)}
              required
              disabled={editing}
            >
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>{s.icon ? `${s.icon} ` : ""}{s.name}</option>
              ))}
            </select>
          </div>

          <div className="adm-field">
            <label className="adm-label">Topic Name *</label>
            <input
              className="adm-input"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Newton's Laws of Motion"
              required
            />
          </div>

          <div className="adm-field">
            <label className="adm-label">Slug *</label>
            <input
              className="adm-input"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
              placeholder="e.g. newtons-laws-of-motion"
              pattern="^[a-z0-9-]+$"
              required
            />
            <span className="adm-field-hint">Lowercase letters, numbers, and hyphens only.</span>
          </div>

          <div className="adm-field">
            <label className="adm-label">Description</label>
            <textarea
              className="adm-textarea"
              value={form.description}
              onChange={(e) => set("description", e.target.value)}
              placeholder="Optional description…"
              rows={3}
            />
          </div>

          <div className="adm-field-row">
            <div className="adm-field" style={{ flex: 1 }}>
              <label className="adm-label">Difficulty</label>
              <select
                className="adm-select"
                value={form.difficulty}
                onChange={(e) => set("difficulty", e.target.value)}
              >
                {DIFFICULTIES.map((d) => (
                  <option key={d} value={d}>
                    {d.charAt(0).toUpperCase() + d.slice(1)}
                  </option>
                ))}
              </select>
            </div>
            <div className="adm-field" style={{ flex: 1 }}>
              <label className="adm-label">Status</label>
              <select
                className="adm-select"
                value={form.is_active ? "active" : "inactive"}
                onChange={(e) => set("is_active", e.target.value === "active")}
              >
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {err && <p className="adm-form-err">{err}</p>}

          <div className="adm-modal-footer">
            <button type="button" className="adm-btn-ghost" onClick={onClose}>Cancel</button>
            <button type="submit" className="adm-btn-primary" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save Changes" : "Save Topic"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Delete confirm ────────────────────────────────────────────────────────────
function ConfirmDelete({ topic, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr]   = useState("");

  async function handleDelete() {
    setBusy(true); setErr("");
    try {
      await api.adminDeleteTopic(topic.id);
      onDeleted(topic.id);
      onClose();
    } catch (e) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="adm-modal-backdrop" onClick={onClose}>
      <div className="adm-modal adm-modal-sm" onClick={(e) => e.stopPropagation()}>
        <div className="adm-modal-header">
          <h2 className="adm-modal-title">Delete Topic</h2>
          <button className="adm-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="adm-modal-body">
          <p className="adm-confirm-text">
            Delete <strong>{topic.name}</strong>? All objectives, concepts, questions,
            and other content under this topic will be permanently deleted.
          </p>
          {err && <p className="adm-form-err">{err}</p>}
          <div className="adm-modal-footer">
            <button className="adm-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="adm-btn-danger" onClick={handleDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete Topic"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TopicsPage() {
  const [topics,   setTopics]   = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [filter,   setFilter]   = useState(""); // subject_id filter
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState("");
  const [modal,    setModal]    = useState(null);
  const [deleting, setDeleting] = useState(null);

  async function load() {
    setLoading(true); setError("");
    try {
      const [topicData, subjectData] = await Promise.all([
        api.adminGetAllTopics(),
        api.adminGetSubjects(),
      ]);
      setTopics(topicData);
      setSubjects(subjectData);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  function subjectName(id) {
    return subjects.find((s) => s.id === id)?.name ?? "—";
  }

  function handleSaved(saved) {
    setTopics((ts) => {
      const idx = ts.findIndex((t) => t.id === saved.id);
      if (idx >= 0) { const next = [...ts]; next[idx] = saved; return next; }
      return [...ts, saved];
    });
  }

  const displayed = filter
    ? topics.filter((t) => String(t.subjectId) === filter)
    : topics;

  const diffClass = (d) => ({
    beginner:     "adm-badge-teal",
    intermediate: "adm-badge-blue",
    advanced:     "adm-badge-purple",
  }[d] ?? "adm-badge-grey");

  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Topics</h1>
          <p className="adm-page-sub">{topics.length} topic{topics.length !== 1 ? "s" : ""} across all subjects</p>
        </div>
        <button
          className="adm-btn-primary"
          onClick={() => setModal("create")}
          disabled={subjects.length === 0}
          title={subjects.length === 0 ? "Create a subject first" : ""}
        >
          + Add Topic
        </button>
      </div>

      {/* Subject filter */}
      {subjects.length > 0 && (
        <div className="adm-filter-bar">
          <label className="adm-filter-label">Filter by subject:</label>
          <select
            className="adm-select adm-select-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="">All Subjects</option>
            {subjects.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </div>
      )}

      {loading && <div className="adm-loading">Loading topics…</div>}
      {error   && <p className="adm-page-err">{error}</p>}

      {!loading && !error && displayed.length === 0 && (
        <div className="adm-empty-state">
          <span className="adm-empty-icon">📝</span>
          <p className="adm-empty-title">No topics yet</p>
          <p className="adm-empty-sub">
            {subjects.length === 0
              ? "Create a subject first, then add topics under it."
              : "Add a topic to start building curriculum content."}
          </p>
          {subjects.length > 0 && (
            <button className="adm-btn-primary" onClick={() => setModal("create")}>
              + Add Topic
            </button>
          )}
        </div>
      )}

      {!loading && displayed.length > 0 && (
        <div className="adm-card adm-card-wide">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Topic</th>
                <th>Subject</th>
                <th>Difficulty</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((t) => (
                <tr key={t.id}>
                  <td className="adm-table-name">
                    <Link to={`/admin/curriculum/topics/${t.id}`} className="adm-table-link">
                      {t.name}
                    </Link>
                  </td>
                  <td>
                    <span className="adm-tag">{subjectName(t.subjectId)}</span>
                  </td>
                  <td>
                    {t.difficulty ? (
                      <span className={`adm-badge ${diffClass(t.difficulty)}`}>
                        {t.difficulty.charAt(0).toUpperCase() + t.difficulty.slice(1)}
                      </span>
                    ) : "—"}
                  </td>
                  <td>
                    <span className={`adm-badge ${t.isActive ? "adm-badge-green" : "adm-badge-grey"}`}>
                      {t.isActive ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="adm-table-actions">
                    <Link
                      to={`/admin/curriculum/topics/${t.id}`}
                      className="adm-action-btn"
                      title="Open"
                    >
                      📂
                    </Link>
                    <button
                      className="adm-action-btn"
                      onClick={() => setModal(t)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="adm-action-btn adm-action-danger"
                      onClick={() => setDeleting(t)}
                      title="Delete"
                    >
                      🗑️
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {modal && (
        <TopicModal
          topic={modal === "create" ? null : modal}
          subjects={subjects}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}
      {deleting && (
        <ConfirmDelete
          topic={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(id) => setTopics((ts) => ts.filter((t) => t.id !== id))}
        />
      )}
    </div>
  );
}
