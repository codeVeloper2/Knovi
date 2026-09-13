/**
 * AdminPlaceholder — generic placeholder for admin sections not yet built
 * (Users, System). Keeps navigation working without dead routes.
 */
import { Link } from "react-router-dom";

export default function AdminPlaceholder({ title, icon = "🔧", description }) {
  return (
    <div className="adm-page">
      <div className="adm-page-header">
        <div>
          <h1 className="adm-page-title">{icon} {title}</h1>
          {description && <p className="adm-page-sub">{description}</p>}
        </div>
      </div>
      <div className="adm-empty-state">
        <span className="adm-empty-icon">{icon}</span>
        <p className="adm-empty-title">Coming soon</p>
        <p className="adm-empty-sub">This section is not yet built.</p>
        <Link to="/admin" className="adm-btn-ghost">← Back to Dashboard</Link>
      </div>
    </div>
  );
}
