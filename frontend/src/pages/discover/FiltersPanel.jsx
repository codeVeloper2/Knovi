import { useState } from "react";
import { SUBJECTS, GRADES } from "../../subjects";

// ── Icons ─────────────────────────────────────────────────────────
const CloseIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M18 6 6 18M6 6l12 12"/>
  </svg>
);
const TeachIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/>
  </svg>
);
const LearnIcon = () => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
  </svg>
);

export default function FiltersPanel({ initialFilters, onClose, onApply }) {
  const [mode, setMode] = useState(initialFilters.mode || "learn");
  const [subject, setSubject] = useState(initialFilters.subject || "All Subjects");
  const [level, setLevel] = useState(initialFilters.level || "All Levels");
  const [availability, setAvailability] = useState(initialFilters.availability || "all");
  const [sort, setSort] = useState(initialFilters.sort || "recommended");

  function handleReset() {
    setMode("learn");
    setSubject("All Subjects");
    setLevel("All Levels");
    setAvailability("all");
    setSort("recommended");
  }

  function handleApply() {
    onApply({ mode, subject, level, availability, sort });
  }

  return (
    <>
      <div className="filters-overlay" onClick={onClose} />
      <div className="filters-panel">
        {/* Header */}
        <div className="filters-header">
          <h2 className="filters-title">Filters</h2>
          <button type="button" className="filters-close" onClick={onClose}>
            <CloseIcon />
          </button>
        </div>

        {/* Content */}
        <div className="filters-content">
          {/* What do you want? */}
          <div className="filters-section">
            <label className="filters-label">What do you want?</label>
            <div className="filters-mode-cards">
              <button
                type="button"
                className={`filters-mode-card ${mode === "teach" ? "active" : ""}`}
                onClick={() => setMode("teach")}
              >
                <TeachIcon />
                <div className="filters-mode-card-title">Teach</div>
                <div className="filters-mode-card-desc">Find people who need help in your subject(s)</div>
              </button>
              <button
                type="button"
                className={`filters-mode-card ${mode === "learn" ? "active" : ""}`}
                onClick={() => setMode("learn")}
              >
                <LearnIcon />
                <div className="filters-mode-card-title">Learn</div>
                <div className="filters-mode-card-desc">Find people who can teach you</div>
              </button>
            </div>
          </div>

          {/* Subject */}
          <div className="filters-section">
            <label className="filters-label">Subject</label>
            <select value={subject} onChange={e => setSubject(e.target.value)} className="filters-select">
              <option>All Subjects</option>
              {SUBJECTS.map(s => <option key={s}>{s}</option>)}
            </select>
          </div>

          {/* Level */}
          <div className="filters-section">
            <label className="filters-label">Level</label>
            <select value={level} onChange={e => setLevel(e.target.value)} className="filters-select">
              <option>All Levels</option>
              {GRADES.map(g => <option key={g}>{g}</option>)}
            </select>
          </div>

          {/* Availability */}
          <div className="filters-section">
            <label className="filters-label">Availability</label>
            <div className="filters-radio-group">
              <label className="filters-radio">
                <input
                  type="radio"
                  name="availability"
                  value="online"
                  checked={availability === "online"}
                  onChange={() => setAvailability("online")}
                />
                <span>Online only</span>
              </label>
              <label className="filters-radio">
                <input
                  type="radio"
                  name="availability"
                  value="all"
                  checked={availability === "all"}
                  onChange={() => setAvailability("all")}
                />
                <span>All (Online & Offline)</span>
              </label>
            </div>
          </div>

          {/* Sort by */}
          <div className="filters-section">
            <label className="filters-label">Sort by</label>
            <select value={sort} onChange={e => setSort(e.target.value)} className="filters-select">
              <option value="recommended">Recommended</option>
              <option value="top_rated">Top Rated</option>
              <option value="most_active">Most Active</option>
              <option value="newest">Newest</option>
            </select>
          </div>

          {/* Quick tags */}
          <div className="filters-section">
            <label className="filters-label">Quick tags</label>
            <div className="filters-quick-tags">
              <button
                type="button"
                className={`filters-tag ${sort === "top_rated" ? "active" : ""}`}
                onClick={() => setSort("top_rated")}
              >
                Top Rated
              </button>
              <button
                type="button"
                className={`filters-tag ${sort === "most_active" ? "active" : ""}`}
                onClick={() => setSort("most_active")}
              >
                Most Active
              </button>
              <button
                type="button"
                className={`filters-tag ${sort === "newest" ? "active" : ""}`}
                onClick={() => setSort("newest")}
              >
                New
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="filters-footer">
          <button type="button" className="btn btn-ghost btn-full filters-reset-btn" onClick={handleReset}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}>
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>
            </svg>
            Reset Filters
          </button>
          <button type="button" className="btn btn-primary btn-full" onClick={handleApply}>
            Apply Filters
          </button>
        </div>
      </div>
    </>
  );
}
