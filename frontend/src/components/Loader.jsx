import { LogoMark } from "./Logo";

/**
 * Full-screen branded loader — the PeerUp mark with a spinning ring around it.
 * Use for route/session loading states.
 */
export default function Loader({ label = "Loading…" }) {
  return (
    <div className="loader-screen">
      <div className="loader-badge">
        <span className="loader-ring" />
        <span className="loader-mark"><LogoMark size={30} /></span>
      </div>
      <p className="loader-label">{label}</p>
    </div>
  );
}
