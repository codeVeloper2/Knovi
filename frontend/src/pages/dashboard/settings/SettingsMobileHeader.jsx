import { useNavigate } from "react-router-dom";

/**
 * SettingsMobileHeader — shown at the top of every settings sub-page on mobile.
 * Has a back arrow → Settings, and the page title.
 */
export default function SettingsMobileHeader({ title }) {
  const navigate = useNavigate();

  return (
    <div className="sph-wrap">
      <button
        type="button"
        className="sph-back"
        onClick={() => navigate("/app/settings")}
        aria-label="Back to Settings"
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
          stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
      </button>
      <span className="sph-title">{title}</span>
      {/* spacer keeps title centred */}
      <span className="sph-spacer" aria-hidden="true" />
    </div>
  );
}
