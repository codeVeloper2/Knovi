import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../context/AuthContext";
import { useToast } from "../../context/ToastContext";
import * as api from "../../api";
import { SUBJECTS, GRADES } from "../../subjects";
import StudentCard from "./StudentCard";
import StudentProfilePanel from "./StudentProfilePanel";
import FiltersPanel from "./FiltersPanel";
import SendMatchRequestModal from "./SendMatchRequestModal";

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
const HamburgerIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="3" y1="6" x2="21" y2="6"/>
    <line x1="3" y1="12" x2="21" y2="12"/>
    <line x1="3" y1="18" x2="21" y2="18"/>
  </svg>
);
const BellIcon = () => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

function MobileAvatar({ name, photo, size = 34 }) {
  const initials = (name || "?")[0].toUpperCase();
  if (photo) {
    return (
      <img src={photo} alt={name} referrerPolicy="no-referrer"
        style={{ width: size, height: size, borderRadius: "50%", objectFit: "cover" }} />
    );
  }
  const colors = ["#f59e0b","#34d399","#a78bfa","#60a5fa","#f472b6","#fb923c"];
  let h = 0;
  for (let i = 0; i < (name||"").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return (
    <span style={{
      width: size, height: size, borderRadius: "50%", background: colors[h % colors.length],
      display: "flex", alignItems: "center", justifyContent: "center",
      fontWeight: 700, fontSize: size * 0.4, color: "#fff", flexShrink: 0,
    }}>{initials}</span>
  );
}

// ── Mobile Discover ────────────────────────────────────────────────────────
function MobileDiscover({
  profile, students, loading, filteredStudents,
  searchQuery, setSearchQuery,
  subject, setSubject,
  sort, setSort,
  showFilters, setShowFilters,
  selectedStudent, setSelectedStudent,
  openMatchModal,
  mode, level, availability,
  handleFiltersApply,
  showMatchModal, matchModalStudent,
  setShowMatchModal, setMatchModalStudent,
  loadStudents,
}) {
  const name = profile?.displayName || "";
  const photo = profile?.photoURL || "";

  return (
    <div className="disc-mobile-wrap">

      {/* ── Header ── */}
      <div className="disc-mobile-header">
        <div className="disc-mobile-header-left">
          <button className="disc-menu-btn" aria-label="Open menu"
            onClick={() => window.dispatchEvent(new CustomEvent("peerup:open-nav"))}>
            <HamburgerIcon />
          </button>
          <span className="disc-logo-text">Peer<span className="disc-logo-accent">Up</span></span>
        </div>
        <div className="disc-mobile-header-right">
          <button className="disc-bell-btn" aria-label="Notifications">
            <BellIcon />
          </button>
          <MobileAvatar name={name} photo={photo} size={34} />
        </div>
      </div>

      {/* ── Page title ── */}
      <div className="disc-mobile-title-row">
        <div>
          <h1 className="disc-mobile-title">Discover</h1>
          <p className="disc-mobile-subtitle">Find peers who can help you learn</p>
        </div>
      </div>

      {/* ── Sticky search + filter bar ── */}
      <div className="disc-mobile-controls">
        <div className="disc-mobile-search-wrap">
          <SearchIcon />
          <input
            type="text"
            placeholder="Search by name or subject…"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="disc-mobile-search-input"
          />
          {searchQuery && (
            <button className="disc-mobile-search-clear" onClick={() => setSearchQuery("")}>✕</button>
          )}
        </div>
        <button className="disc-mobile-filter-btn" onClick={() => setShowFilters(true)}>
          <FilterIcon />
        </button>
      </div>

      {/* ── Active filter chips ── */}
      {(subject !== "All Subjects" || sort !== "recommended") && (
        <div className="disc-mobile-chips">
          {subject !== "All Subjects" && (
            <span className="disc-mobile-chip">
              {subject}
              <button onClick={() => setSubject("All Subjects")}>✕</button>
            </span>
          )}
          {sort !== "recommended" && (
            <span className="disc-mobile-chip">
              {sort === "top_rated" ? "Top Rated" : sort === "most_active" ? "Most Active" : "Newest"}
              <button onClick={() => setSort("recommended")}>✕</button>
            </span>
          )}
        </div>
      )}

      {/* ── Sort tabs ── */}
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

      {/* ── Results count ── */}
      {!loading && (
        <div className="disc-mobile-count">
          {filteredStudents.length} peer{filteredStudents.length !== 1 ? "s" : ""} found
        </div>
      )}

      {/* ── Cards ── */}
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
            <MobileStudentCard
              key={student.uid}
              student={student}
              currentUser={profile}
              onViewProfile={() => setSelectedStudent(student)}
              onSendRequest={() => openMatchModal(student)}
            />
          ))
        )}
      </div>

      <div style={{ height: 32 }} />

      {/* ── Profile panel ── */}
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

      {/* ── Filters panel ── */}
      {showFilters && (
        <FiltersPanel
          initialFilters={{ mode, subject, level, availability, sort }}
          onClose={() => setShowFilters(false)}
          onApply={handleFiltersApply}
        />
      )}

      {/* ── Match request modal ── */}
      {showMatchModal && matchModalStudent && (
        <SendMatchRequestModal
          student={matchModalStudent}
          currentUser={profile}
          onClose={() => { setShowMatchModal(false); setMatchModalStudent(null); }}
          onSuccess={() => {
            setShowMatchModal(false);
            setMatchModalStudent(null);
            loadStudents();
          }}
        />
      )}
    </div>
  );
}

// ── Mobile student card ────────────────────────────────────────────────────
function MobileStudentCard({ student, currentUser, onViewProfile, onSendRequest }) {
  const myGoodAt   = new Set(currentUser?.subjectsGoodAt  || []);
  const myNeedHelp = new Set(currentUser?.subjectsNeedHelp || []);
  const theirGoodAt   = new Set(student.subjectsGoodAt  || []);
  const theirNeedHelp = new Set(student.subjectsNeedHelp || []);

  const theyCanTeachMe = [...theirGoodAt].filter(s => myNeedHelp.has(s));
  const iCanTeachThem  = [...myGoodAt].filter(s => theirNeedHelp.has(s));
  const canMatch = theyCanTeachMe.length > 0 || iCanTeachThem.length > 0;

  const initials = (student.displayName || "?")[0].toUpperCase();
  const colors = ["#f59e0b","#34d399","#a78bfa","#60a5fa","#f472b6","#fb923c"];
  let h = 0;
  for (let i = 0; i < (student.displayName||"").length; i++)
    h = (h * 31 + student.displayName.charCodeAt(i)) >>> 0;
  const bg = colors[h % colors.length];

  return (
    <div className="disc-student-card">
      {/* Avatar + info row */}
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

      {/* Bio */}
      {student.bio && (
        <p className="disc-student-bio">
          {student.bio.length > 100 ? student.bio.slice(0, 100) + "…" : student.bio}
        </p>
      )}

      {/* Subject tags */}
      {theyCanTeachMe.length > 0 && (
        <div className="disc-student-tags-row">
          <span className="disc-student-tags-label disc-tags-label--teach">Can teach you</span>
          <div className="disc-student-tags">
            {theyCanTeachMe.slice(0, 3).map(s => (
              <span key={s} className="disc-tag disc-tag--teach">{s}</span>
            ))}
            {theyCanTeachMe.length > 3 && (
              <span className="disc-tag disc-tag--teach">+{theyCanTeachMe.length - 3}</span>
            )}
          </div>
        </div>
      )}
      {iCanTeachThem.length > 0 && (
        <div className="disc-student-tags-row">
          <span className="disc-student-tags-label disc-tags-label--learn">You can teach</span>
          <div className="disc-student-tags">
            {iCanTeachThem.slice(0, 3).map(s => (
              <span key={s} className="disc-tag disc-tag--learn">{s}</span>
            ))}
            {iCanTeachThem.length > 3 && (
              <span className="disc-tag disc-tag--learn">+{iCanTeachThem.length - 3}</span>
            )}
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="disc-student-actions">
        <button className="disc-student-btn disc-student-btn--ghost" onClick={onViewProfile}>
          View Profile
        </button>
        {canMatch ? (
          <button className="disc-student-btn disc-student-btn--primary" onClick={onSendRequest}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="m22 2-7 20-4-9-9-4 20-7z"/><path d="M22 2 11 13"/>
            </svg>
            Connect
          </button>
        ) : (
          <button className="disc-student-btn disc-student-btn--ghost" disabled>No match</button>
        )}
      </div>
    </div>
  );
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function DiscoverPage() {
  const { profile } = useAuth();
  const toast = useToast();
  const isMobile = useIsMobile();

  const [students,    setStudents]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [mode,         setMode]         = useState("learn");
  const [subject,      setSubject]      = useState("All Subjects");
  const [level,        setLevel]        = useState("All Levels");
  const [availability, setAvailability] = useState("all");
  const [sort,         setSort]         = useState("recommended");

  const [showFilters,      setShowFilters]      = useState(false);
  const [selectedStudent,  setSelectedStudent]  = useState(null);
  const [showMatchModal,   setShowMatchModal]   = useState(false);
  const [matchModalStudent,setMatchModalStudent] = useState(null);

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

  useEffect(() => { loadStudents(); }, [loadStudents]);

  const filteredStudents = students.filter(s => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.displayName || "").toLowerCase().includes(q) ||
      (s.bio         || "").toLowerCase().includes(q) ||
      (s.grade       || "").toLowerCase().includes(q) ||
      (s.subjectsGoodAt  || []).some(sub => sub.toLowerCase().includes(q)) ||
      (s.subjectsNeedHelp|| []).some(sub => sub.toLowerCase().includes(q))
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

  // ── Shared modals (used by both layouts) ──
  const sharedModals = (
    <>
      {selectedStudent && (
        <StudentProfilePanel
          student={selectedStudent}
          currentUser={profile}
          onClose={() => setSelectedStudent(null)}
          onSendRequest={() => { openMatchModal(selectedStudent); setSelectedStudent(null); }}
        />
      )}
      {showFilters && (
        <FiltersPanel
          initialFilters={{ mode, subject, level, availability, sort }}
          onClose={() => setShowFilters(false)}
          onApply={handleFiltersApply}
        />
      )}
      {showMatchModal && matchModalStudent && (
        <SendMatchRequestModal
          student={matchModalStudent}
          currentUser={profile}
          onClose={() => { setShowMatchModal(false); setMatchModalStudent(null); }}
          onSuccess={() => {
            setShowMatchModal(false);
            setMatchModalStudent(null);
            toast.success("Match request sent!");
            loadStudents();
          }}
        />
      )}
    </>
  );

  // ── Mobile layout ──
  if (isMobile) {
    return (
      <MobileDiscover
        profile={profile}
        students={students}
        loading={loading}
        filteredStudents={filteredStudents}
        searchQuery={searchQuery}   setSearchQuery={setSearchQuery}
        subject={subject}           setSubject={setSubject}
        sort={sort}                 setSort={setSort}
        showFilters={showFilters}   setShowFilters={setShowFilters}
        selectedStudent={selectedStudent} setSelectedStudent={setSelectedStudent}
        openMatchModal={openMatchModal}
        mode={mode} level={level} availability={availability}
        handleFiltersApply={handleFiltersApply}
        showMatchModal={showMatchModal}     matchModalStudent={matchModalStudent}
        setShowMatchModal={setShowMatchModal} setMatchModalStudent={setMatchModalStudent}
        loadStudents={loadStudents}
      />
    );
  }

  // ── Desktop layout (unchanged) ──
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
            <p className="discover-subtitle">Find and connect with peers who can help you learn.</p>
          </div>
        </div>
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
            <p>{searchQuery ? "Try a different name or subject." : "Try adjusting your filters."}</p>
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
                currentUser={profile}
                onViewProfile={() => setSelectedStudent(student)}
                onSendRequest={() => openMatchModal(student)}
              />
            ))}
          </div>
        )}
      </div>

      {sharedModals}
    </div>
  );
}
