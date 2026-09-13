/**
 * CurriculumPlaceholder — generic placeholder for curriculum sub-sections
 * that are navigated to via the sidebar but whose primary management
 * lives inside a Topic's detail page.
 *
 * Used for: Concepts, Objectives, Misconceptions, Activities, Questions,
 * Resources — all accessed via /admin/curriculum/{section}
 *
 * These pages guide the admin to the correct workflow: open a Topic first.
 */
import { Link } from "react-router-dom";

const SECTION_META = {
  concepts:       { icon: "💡", label: "Concepts",       hint: "Concepts belong to a Topic." },
  objectives:     { icon: "🎯", label: "Objectives",     hint: "Learning objectives belong to a Topic." },
  misconceptions: { icon: "⚠️",  label: "Misconceptions", hint: "Misconceptions belong to a Topic." },
  activities:     { icon: "🎓", label: "Activities",     hint: "Activities belong to a Topic." },
  questions:      { icon: "❓", label: "Questions",      hint: "Questions belong to a Topic." },
  resources:      { icon: "🎬", label: "Resources",      hint: "Resources belong to a Topic." },
};

export default function CurriculumPlaceholder({ section }) {
  const meta = SECTION_META[section] ?? { icon: "📋", label: section, hint: "This content belongs to a Topic." };

  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <div>
          <h1 className="adm-page-title">{meta.icon} {meta.label}</h1>
          <p className="adm-page-sub">{meta.hint}</p>
        </div>
      </div>

      <div className="adm-empty-state">
        <span className="adm-empty-icon">{meta.icon}</span>
        <p className="adm-empty-title">Manage {meta.label} inside a Topic</p>
        <p className="adm-empty-sub">
          {meta.label} are managed from the Topic detail page.
          Open a topic to add, edit, or remove {meta.label.toLowerCase()}.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <Link to="/admin/curriculum/topics" className="adm-btn-primary">
            Browse Topics
          </Link>
          <Link to="/admin/curriculum/topics/new" className="adm-btn-ghost">
            + New Topic
          </Link>
        </div>
      </div>
    </div>
  );
}
