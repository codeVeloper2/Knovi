import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";
import { GRADES } from "../../subjects";
import StudentProfilePanel from "./StudentProfilePanel";
import FiltersPanel from "./FiltersPanel";

// ── Hooks ──────────────────────────────────────────────────────────────────
function useIsMobile() {
  const [mobile, setMobile] = useState(() => window.innerWidth <= 768);
  useEffect(() => {
    const handler = () => setMobile(window.innerWidth <= 768);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);
  return mobile;
}

// ── Icons ──────────────────────────────────────────────────────────────────
const SearchIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
  </svg>
);
const FilterIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
  </svg>
);
const ChatIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);

// ── Avatar helper ──────────────────────────────────────────────────────────
function avatarBg(name) {
  const colors = ["#f59e0b","#34d399","#a78bfa","#60a5fa","#f472b6","#fb923c"];
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

// ── Student Card ───────────────────────────────────────────────────────────
function StudentCard({ student, onViewProfile, onMessage }) {
  const initials = (student.displayName || "?")[0].toUpperCase();
  const bg = avatarBg(student.displayName);

  return (
    <div className="disc-student-card">
      <div className="disc-student-top">
        <div className="disc-student-avatar-wrap">
          {student.photoURL
            ? <img src={student.photoURL} alt={student.displayName} className="disc-student-avatar" referrerPolicy="no-referrer" />
            : <div className="disc-student-avatar-fallback" style={{ background: bg }}>{initials}</div>}
          {student.isOnline && <span className="disc-student-online" />}
        </div>
        <div className="disc-student-info">
          <div className="disc-student-name-row">
            <span className="disc-student-name">{student.displayName}</span>
            {student.emailVerified && (
              <svg className="disc-student-verified" width="14" height="14" viewBox="0 0 24 24" fill="#60a5fa">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            )}
          </div>
          <span className="disc-student-grade">{student.grade || "Student"}</span>
          <div className="disc-student-meta-row">
            {student.isOnline
              ? <span className="disc-student-status disc-student-status--on">● Online</span>
              : <span className="disc-student-status disc-student-status--off">○ Offline</span>}
            {student.rating > 0 && (
              <span className="disc-student-rating">⭐ {student.rating.toFixed(1)}</span>
            )}
          </div>
        </div>
      </div>

      {student.bio && (
        <p className="disc-student-bio">
          {student.bio.length > 100 ? student.bio.slice(0, 100) + "…" : student.bio}
        </p>
      )}

      <div className="disc-student-actions">
        <button className="disc-student-btn disc-student-btn--ghost" onClick={onViewProfile}>
          View Profile
        </button>
        <button className="disc-student-btn disc-student-btn--primary" onClick={onMessage}>
          <ChatIcon /> Message
        </button>
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function DiscoverPage() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const isMobile = useIsMobile();

  const [students,    setStudents]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [level,        setLevel]        = useState("All Levels");
  const [availability, setAvailability] = useState("all");
  const [sort,         setSort]         = useState("recommended");

  const [showFilters,     setShowFilters]     = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.discoverUsers(level, availability, sort);
      setStudents(data);
    } catch (err) {
      toast.error(err.message || "Failed to load students");
    } finally {
      setLoading(false);
    }
  }, [level, availability, sort, toast]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  const filteredStudents = students.filter(s => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.displayName || "").toLowerCase().includes(q) ||
      (s.bio         || "").toLowerCase().includes(q) ||
      (s.grade       || "").toLowerCase().includes(q)
    );
  });

  async function handleMessage(student) {
    if (!student.allowDirectMessage) {
      toast.error("This student has disabled direct messages.");
      return;
    }
    try {
      const conv = await api.startConversation(student.uid, "", null);
      navigate(`/app/chat/${conv.id}`);
    } catch (err) {
      toast.error(err.message || "Couldn't start chat.");
    }
  }

  function handleFiltersApply(filters) {
    setLevel(filters.level);
    setAvailability(filters.availability);
    setSort(filters.sort);
    setShowFilters(false);
  }

  // ── Mobile layout ──────────────────────────────────────────────────────
  if (isMobile) {
    return (
      <div className="disc-mobile-wrap">
        <div className="disc-mobile-title-row">
          <div>
            <h1 className="disc-mobile-title">Discover</h1>
            <p className="disc-mobile-subtitle">Find peers to study and chat with</p>
          </div>
        </div>

        <div className="disc-mobile-search">
          <SearchIcon />
          <input
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search peers..."
            aria-label="Search peers"
          />
          {searchQuery && <button type="button" onClick={() => setSearchQuery("")} aria-label="Clear search">×</button>}
        </div>

        <div className="disc-mobile-controls">
          <button className="disc-mobile-filter-btn disc-mobile-filter-btn--full" onClick={() => setShowFilters(true)}>
            <FilterIcon />
            <span>Filters</span>
          </button>
          <span className="disc-mobile-result-note">{loading ? "Finding peers…" : `${filteredStudents.length} available`}</span>
        </div>

        {sort !== "recommended" && (
          <div className="disc-mobile-chips">
            <span className="disc-mobile-chip">
              {sort === "top_rated" ? "Top Rated" : sort === "most_active" ? "Most Active" : "Newest"}
              <button onClick={() => setSort("recommended")}>✕</button>
            </span>
          </div>
        )}

        <div className="disc-mobile-sort-tabs">
          {[
            { val: "recommended", label: "For You" },
            { val: "top_rated",   label: "Top Rated" },
            { val: "most_active", label: "Active" },
            { val: "newest",      label: "New" },
          ].map(tab => (
            <button key={tab.val}
              className={`disc-mobile-sort-tab${sort === tab.val ? " active" : ""}`}
              onClick={() => setSort(tab.val)}>
              {tab.label}
            </button>
          ))}
        </div>

        <div className="disc-mobile-list">
          {loading ? (
            <>
              <div className="disc-mobile-shimmer" />
              <div className="disc-mobile-shimmer" />
              <div className="disc-mobile-shimmer" />
              <div className="disc-mobile-shimmer" />
            </>
          ) : filteredStudents.length === 0 ? (
            <div className="disc-mobile-empty">
              <span className="disc-mobile-empty-icon">🔍</span>
              <h3>No peers found</h3>
              <p>{searchQuery ? `No results for "${searchQuery}"` : "Try adjusting your filters."}</p>
              {searchQuery && (
                <button className="disc-mobile-empty-btn" onClick={() => setSearchQuery("")}>Clear search</button>
              )}
            </div>
          ) : (
            filteredStudents.map(student => (
              <StudentCard
                key={student.uid}
                student={student}
                onViewProfile={() => setSelectedStudent(student)}
                onMessage={() => handleMessage(student)}
              />
            ))
          )}
        </div>

        <div style={{ height: 32 }} />

        {selectedStudent && (
          <StudentProfilePanel
            student={selectedStudent}
            currentUser={profile}
            onClose={() => setSelectedStudent(null)}
            onMessage={() => { handleMessage(selectedStudent); setSelectedStudent(null); }}
          />
        )}

        {showFilters && (
          <FiltersPanel
            initialFilters={{ level, availability, sort }}
            onClose={() => setShowFilters(false)}
            onApply={handleFiltersApply}
          />
        )}
      </div>
    );
  }

  // ── Desktop layout ─────────────────────────────────────────────────────
  return (
    <div className="discover-page">
      <div className="discover-header">
        <div className="discover-title-row">
          <div className="discover-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <div>
            <h1 className="discover-title">Discover</h1>
            <p className="discover-subtitle">Find peers to study, chat, and learn with.</p>
          </div>
        </div>
        <div className="discover-controls">
          <div className="discover-search-wrap">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search by name, grade or bio..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="discover-search-input"
            />
          </div>
          <select value={level} onChange={e => setLevel(e.target.value)} className="discover-select">
            <option>All Levels</option>
            {GRADES.map(g => <option key={g}>{g}</option>)}
          </select>
          <select value={sort} onChange={e => setSort(e.target.value)} className="discover-select">
            <option value="recommended">Sort: Recommended</option>
            <option value="top_rated">Sort: Top Rated</option>
            <option value="most_active">Sort: Most Active</option>
            <option value="newest">Sort: Newest</option>
          </select>
          <button type="button" className="discover-filter-btn" onClick={() => setShowFilters(true)}>
            <FilterIcon />
            Filters
          </button>
        </div>
      </div>

      <div className="discover-content">
        {loading ? (
          <div className="discover-loading">
            <span className="discover-spinner" />
            <span>Loading students…</span>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="discover-empty">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.3">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <h3>{searchQuery ? `No results for "${searchQuery}"` : "No students found"}</h3>
            <p>{searchQuery ? "Try a different name or grade." : "Try adjusting your filters."}</p>
            {searchQuery && (
              <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setSearchQuery("")}>
                Clear search
              </button>
            )}
          </div>
        ) : (
          <div className="discover-grid">
            {filteredStudents.map(student => (
              <StudentCard
                key={student.uid}
                student={student}
                onViewProfile={() => setSelectedStudent(student)}
                onMessage={() => handleMessage(student)}
              />
            ))}
          </div>
        )}
      </div>

      {selectedStudent && (
        <StudentProfilePanel
          student={selectedStudent}
          currentUser={profile}
          onClose={() => setSelectedStudent(null)}
          onMessage={() => { handleMessage(selectedStudent); setSelectedStudent(null); }}
        />
      )}

      {showFilters && (
        <FiltersPanel
          initialFilters={{ level, availability, sort }}
          onClose={() => setShowFilters(false)}
          onApply={handleFiltersApply}
        />
      )}
    </div>
  );
}
