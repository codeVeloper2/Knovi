import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";
import { SUBJECTS, GRADES } from "../../subjects";
import StudentCard from "./StudentCard";
import StudentProfilePanel from "./StudentProfilePanel";
import FiltersPanel from "./FiltersPanel";
import SendMatchRequestModal from "./SendMatchRequestModal";

// ── Icons ─────────────────────────────────────────────────────────
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
const ChevronDownIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="m6 9 6 6 6-6"/>
  </svg>
);

export default function DiscoverPage() {
  const { profile } = useAuth();
  const toast = useToast();

  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  
  // Filters
  const [mode, setMode] = useState("learn"); // learn | teach
  const [subject, setSubject] = useState("All Subjects");
  const [level, setLevel] = useState("All Levels");
  const [availability, setAvailability] = useState("all"); // all | online
  const [sort, setSort] = useState("recommended");
  
  // UI state
  const [showFilters, setShowFilters] = useState(false);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showMatchModal, setShowMatchModal] = useState(false);
  const [matchModalStudent, setMatchModalStudent] = useState(null);

  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.discoverUsers(mode, subject, level, availability, sort);
      setStudents(data);
    } catch (err) {
      toast.error(err.message || "Failed to load students");
    } finally {
      setLoading(false);
    }
  }, [mode, subject, level, availability, sort, toast]);

  useEffect(() => {
    loadStudents();
  }, [loadStudents]);

  // Client-side search filter — runs on every keystroke, no debounce needed
  const filteredStudents = students.filter(s => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.displayName || "").toLowerCase().includes(q) ||
      (s.bio || "").toLowerCase().includes(q) ||
      (s.grade || "").toLowerCase().includes(q) ||
      (s.subjectsGoodAt || []).some(sub => sub.toLowerCase().includes(q)) ||
      (s.subjectsNeedHelp || []).some(sub => sub.toLowerCase().includes(q))
    );
  });

  function openMatchModal(student) {
    setMatchModalStudent(student);
    setShowMatchModal(true);
  }

  function handleFiltersApply(filters) {
    setMode(filters.mode);
    setSubject(filters.subject);
    setLevel(filters.level);
    setAvailability(filters.availability);
    setSort(filters.sort);
    setShowFilters(false);
  }

  return (
    <div className="discover-page">
      {/* Header */}
      <div className="discover-header">
        <div className="discover-title-row">
          <div className="discover-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
          </div>
          <div>
            <h1 className="discover-title">Discover</h1>
            <p className="discover-subtitle">Find and connect with peers who can help you learn.</p>
          </div>
        </div>

        {/* Search and filters bar */}
        <div className="discover-controls">
          <div className="discover-search-wrap">
            <SearchIcon />
            <input
              type="text"
              placeholder="Search by name or subject..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="discover-search-input"
            />
          </div>

          <select value={subject} onChange={e => setSubject(e.target.value)} className="discover-select">
            <option>All Subjects</option>
            {SUBJECTS.map(s => <option key={s}>{s}</option>)}
          </select>

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

          <button
            type="button"
            className="discover-filter-btn"
            onClick={() => setShowFilters(true)}
          >
            <FilterIcon />
            Filters
          </button>
        </div>
      </div>

      {/* Student cards grid */}
      <div className="discover-content">
        {loading ? (
          <div className="discover-loading">
            <span className="discover-spinner" />
            <span>Loading students…</span>
          </div>
        ) : filteredStudents.length === 0 && searchQuery.trim() ? (
          <div className="discover-empty">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.3">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <h3>No results for "{searchQuery}"</h3>
            <p>Try a different name or subject.</p>
            <button type="button" className="btn btn-ghost" style={{ marginTop: 8 }} onClick={() => setSearchQuery("")}>Clear search</button>
          </div>
        ) : filteredStudents.length === 0 ? (
          <div className="discover-empty">
            <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2" opacity="0.3">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <h3>No students found</h3>
            <p>No one matches your current filters. Try adjusting the subject, level, or mode.</p>
          </div>
        ) : (
          <div className="discover-grid">
            {filteredStudents.map(student => (
              <StudentCard
                key={student.uid}
                student={student}
                currentUser={profile}
                onViewProfile={() => setSelectedStudent(student)}
                onSendRequest={() => openMatchModal(student)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Profile panel */}
      {selectedStudent && (
        <StudentProfilePanel
          student={selectedStudent}
          currentUser={profile}
          onClose={() => setSelectedStudent(null)}
          onSendRequest={() => {
            openMatchModal(selectedStudent);
            setSelectedStudent(null);
          }}
        />
      )}

      {/* Filters panel */}
      {showFilters && (
        <FiltersPanel
          initialFilters={{ mode, subject, level, availability, sort }}
          onClose={() => setShowFilters(false)}
          onApply={handleFiltersApply}
        />
      )}

      {/* Match request modal */}
      {showMatchModal && matchModalStudent && (
        <SendMatchRequestModal
          student={matchModalStudent}
          currentUser={profile}
          onClose={() => {
            setShowMatchModal(false);
            setMatchModalStudent(null);
          }}
          onSuccess={() => {
            setShowMatchModal(false);
            setMatchModalStudent(null);
            toast.success("Match request sent!");
            loadStudents();
          }}
        />
      )}
    </div>
  );
}
