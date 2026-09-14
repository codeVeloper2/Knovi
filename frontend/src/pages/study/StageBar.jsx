/**
 * StageBar — progress indicator shown at top of every stage page.
 */
import { useNavigate } from "react-router-dom";
import { STAGES, STAGE_LABELS, STAGE_ICONS } from "./sessionUtils";

export default function StageBar({ current, sessionId }) {
  const navigate = useNavigate();
  const currentIdx = STAGES.indexOf(current);

  return (
    <div className="ls-stage-bar" role="navigation" aria-label="Session stages">
      {STAGES.map((stage, i) => {
        const done   = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={stage} className={`ls-stage-step ${active ? "active" : ""} ${done ? "done" : ""}`}>
            <div className="ls-stage-dot">
              {done ? "✓" : STAGE_ICONS[stage]}
            </div>
            <span className="ls-stage-step-label">{STAGE_LABELS[stage]}</span>
            {i < STAGES.length - 1 && <div className={`ls-stage-connector ${done ? "done" : ""}`} />}
          </div>
        );
      })}
    </div>
  );
}
