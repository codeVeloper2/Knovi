/**
 * SubjectsPage — /admin/curriculum/subjects
 *
 * Lists all subjects with topic count, status, edit, activate/deactivate.
 * Inline modal for create and edit.
 */
import { useEffect, useState } from "react";
import * as api from "../../../api";

// ── slug helper ───────────────────────────────────────────────────────────────
function toSlug(name) {
  return name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
}

// ── Modal ─────────────────────────────────────────────────────────────────────
function SubjectModal({ subject, onClose, onSaved }) {
  const editing = !!subject;
  const [form, setForm] = useState({
    name:        subject?.name        || "",
    slug:        subject?.slug        || "",
    description: subject?.description || "",
    icon:        subject?.icon        || "",
    is_active:   subject?.is_active   ?? true,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  function set(k, v) {
    setForm((f) => {
      const next = { ...f, [k]: v };
      // Auto-generate slug from name only when creating
      if (k === "name" && !editing) next.slug = toSlug(v);
      return next;
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const body = {
        name:        form.name.trim(),
        slug:        form.slug.trim() || toSlug(form.name),
        description: form.description.trim() || null,
        icon:        form.icon.trim() || null,
        is_active:   form.is_active,
      };
      const saved = editing
        ? await api.adminUpdateSubject(subject.id, body)
        : await api.adminCreateSubject(body);
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
          <h2 className="adm-modal-title">{editing ? "Edit Subject" : "Add Subject"}</h2>
          <button className="adm-modal-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="adm-modal-body">
          <div className="adm-field">
            <label className="adm-label">Subject Name *</label>
            <input
              className="adm-input"
              value={form.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Physics"
              required
            />
          </div>

          <div className="adm-field">
            <label className="adm-label">Slug *</label>
            <input
              className="adm-input"
              value={form.slug}
              onChange={(e) => set("slug", e.target.value)}
              placeholder="e.g. physics"
              pattern="^[a-z0-9-]+$"
              title="Lowercase letters, numbers and hyphens only"
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
              <label className="adm-label">Icon (emoji)</label>
              <input
                className="adm-input"
                value={form.icon}
                onChange={(e) => set("icon", e.target.value)}
                placeholder="e.g. ⚛️"
                maxLength={8}
              />
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
            <button type="button" className="adm-btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="adm-btn-primary" disabled={busy}>
              {busy ? "Saving…" : editing ? "Save Changes" : "Save Subject"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ── Confirm delete dialog ─────────────────────────────────────────────────────
function ConfirmDelete({ subject, onClose, onDeleted }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  async function handleDelete() {
    setBusy(true); setErr("");
    try {
      await api.adminDeleteSubject(subject.id);
      onDeleted(subject.id);
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
          <h2 className="adm-modal-title">Delete Subject</h2>
          <button className="adm-modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="adm-modal-body">
          <p className="adm-confirm-text">
            Are you sure you want to delete <strong>{subject.name}</strong>?{" "}
            This will permanently delete all topics and curriculum content under it.
          </p>
          {err && <p className="adm-form-err">{err}</p>}
          <div className="adm-modal-footer">
            <button className="adm-btn-ghost" onClick={onClose}>Cancel</button>
            <button className="adm-btn-danger" onClick={handleDelete} disabled={busy}>
              {busy ? "Deleting…" : "Delete Subject"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function SubjectsPage() {
  const [subjects, setSubjects]   = useState([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState("");
  const [modal, setModal]         = useState(null); // null | "create" | subject object
  const [deleting, setDeleting]   = useState(null); // subject object to delete

  async function loadSubjects() {
    setLoading(true); setError("");
    try {
      const data = await api.adminGetSubjects();
      setSubjects(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadSubjects(); }, []);

  function handleSaved(saved) {
    setSubjects((ss) => {
      const idx = ss.findIndex((s) => s.id === saved.id);
      if (idx >= 0) {
        const next = [...ss];
        next[idx] = saved;
        return next;
      }
      return [...ss, saved];
    });
  }

  async function toggleActive(subj) {
    try {
      const updated = await api.adminUpdateSubject(subj.id, { is_active: !subj.is_active });
      handleSaved(updated);
    } catch (e) {
      alert(e.message);
    }
  }

  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <div>
          <h1 className="adm-page-title">Subjects</h1>
          <p className="adm-page-sub">Top-level academic subjects in the curriculum</p>
        </div>
        <button className="adm-btn-primary" onClick={() => setModal("create")}>
          + Add Subject
        </button>
      </div>

      {loading && <div className="adm-loading">Loading subjects…</div>}
      {error   && <p className="adm-page-err">{error}</p>}

      {!loading && !error && subjects.length === 0 && (
        <div className="adm-empty-state">
          <span className="adm-empty-icon">📚</span>
          <p className="adm-empty-title">No subjects yet</p>
          <p className="adm-empty-sub">Create a subject to start building the curriculum.</p>
          <button className="adm-btn-primary" onClick={() => setModal("create")}>
            + Add Subject
          </button>
        </div>
      )}

      {!loading && subjects.length > 0 && (
        <div className="adm-card adm-card-wide">
          <table className="adm-table">
            <thead>
              <tr>
                <th>Icon</th>
                <th>Subject</th>
                <th>Slug</th>
                <th>Description</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {subjects.map((s) => (
                <tr key={s.id}>
                  <td className="adm-table-icon">{s.icon || "📚"}</td>
                  <td className="adm-table-name">{s.name}</td>
                  <td><code className="adm-code">{s.slug}</code></td>
                  <td className="adm-table-desc">{s.description || "—"}</td>
                  <td>
                    <span className={`adm-badge ${s.is_active ? "adm-badge-green" : "adm-badge-grey"}`}>
                      {s.is_active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="adm-table-actions">
                    <button
                      className="adm-action-btn"
                      onClick={() => setModal(s)}
                      title="Edit"
                    >
                      ✏️
                    </button>
                    <button
                      className="adm-action-btn"
                      onClick={() => toggleActive(s)}
                      title={s.is_active ? "Deactivate" : "Activate"}
                    >
                      {s.is_active ? "🔴" : "🟢"}
                    </button>
                    <button
                      className="adm-action-btn adm-action-danger"
                      onClick={() => setDeleting(s)}
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
        <SubjectModal
          subject={modal === "create" ? null : modal}
          onClose={() => setModal(null)}
          onSaved={handleSaved}
        />
      )}

      {deleting && (
        <ConfirmDelete
          subject={deleting}
          onClose={() => setDeleting(null)}
          onDeleted={(id) => setSubjects((ss) => ss.filter((s) => s.id !== id))}
        />
      )}
    </div>
  );
}
