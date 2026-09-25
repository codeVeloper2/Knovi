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
const SwordIcon = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="14.5 17.5 3 6 3 3 6 3 17.5 14.5"/><line x1="13" y1="19" x2="19" y2="13"/>
    <line x1="16" y1="16" x2="19" y2="19"/><line x1="20" y1="21" x2="21" y2="20"/>
  </svg>
);
const UsersIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
    <path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
  </svg>
);
const SparkIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  </svg>
);

// ── Avatar helper ──────────────────────────────────────────────────────────
function avatarBg(name) {
  const colors = ["#f59e0b","#34d399","#a78bfa","#60a5fa","#f472b6","#fb923c"];
  let h = 0;
  for (let i = 0; i < (name || "").length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return colors[h % colors.length];
}

// ── Overlap Badge ──────────────────────────────────────────────────────────
function OverlapBadge({ overlap }) {
  if (!overlap) return null;
  const { type, subjectName, topicName, conceptName, reason, isActive } = overlap;
  return (
    <div className="disc-overlap-wrap">
      {isActive && (
        <span className="disc-overlap-active-dot" title="Learning now">
          🟢 Learning now
        </span>
      )}
      <div className="disc-overlap-breadcrumb">
        <span className="disc-overlap-crumb disc-overlap-crumb--subject">{subjectName}</span>
        {(type === "topic" || type === "concept") && topicName && (
          <>
            <span className="disc-overlap-arrow">→</span>
            <span className="disc-overlap-crumb disc-overlap-crumb--topic">{topicName}</span>
          </>
        )}
        {type === "concept" && conceptName && (
          <>
            <span className="disc-overlap-arrow">→</span>
            <span className="disc-overlap-crumb disc-overlap-crumb--concept">{conceptName}</span>
          </>
        )}
      </div>
      <p className="disc-overlap-reason">"{reason}"</p>
    </div>
  );
}

// ── Smart Action Button ────────────────────────────────────────────────────
function PeerActions({ peer, onConnect, onMessage, onChallenge, loading }) {
  const { relationship, challengeEligible } = peer;

  if (relationship === "conversation") {
    return (
      <div className="disc-student-actions">
        <button
          className="disc-student-btn disc-student-btn--primary"
          onClick={onMessage}
          disabled={loading}
        >
          <ChatIcon /> Message
        </button>
        {challengeEligible && (
          <button
            className="disc-student-btn disc-student-btn--challenge"
            onClick={onChallenge}
            disabled={loading}
            title="Start an AI Quiz Battle"
          >
            <SwordIcon /> Challenge
          </button>
        )}
      </div>
    );
  }

  // relationship === "none"
  return (
    <div className="disc-student-actions">
      <button
        className="disc-student-btn disc-student-btn--primary"
        onClick={onConnect}
        disabled={loading}
      >
        {loading ? "Connecting…" : "Connect"}
      </button>
    </div>
  );
}

// ── Learning Peer Card ─────────────────────────────────────────────────────
function LearningPeerCard({ peer, onViewProfile, onConnect, onMessage, onChallenge }) {
  // The discovery API is flat. Keep the fallback for older cached/API responses.
  const user = peer.user || peer;
  const { learningOverlap } = peer;
  const initials = (user.displayName || "?")[0].toUpperCase();
  const bg = avatarBg(user.displayName);
  const [connecting, setConnecting] = useState(false);

  async function handleConnect() {
    setConnecting(true);
    try {
      await onConnect(peer);
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="disc-peer-card">
      <div className="disc-student-top">
        <div className="disc-student-avatar-wrap">
          {user.photoURL
            ? <img src={user.photoURL} alt={user.displayName} className="disc-student-avatar" referrerPolicy="no-referrer" />
            : <div className="disc-student-avatar-fallback" style={{ background: bg }}>{initials}</div>}
          {user.isOnline && <span className="disc-student-online" />}
        </div>
        <div className="disc-student-info">
          <div className="disc-student-name-row">
            <span className="disc-student-name">{user.displayName}</span>
            {user.emailVerified && (
              <svg className="disc-student-verified" width="14" height="14" viewBox="0 0 24 24" fill="#60a5fa">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/>
              </svg>
            )}
          </div>
          <span className="disc-student-grade">{user.grade || "Student"}</span>
        </div>
      </div>

      <OverlapBadge overlap={learningOverlap} />

      <div className="disc-peer-card-footer">
        <button className="disc-student-btn disc-student-btn--ghost" onClick={() => onViewProfile(peer)}>
          View Profile
        </button>
        <PeerActions
          peer={peer}
          onConnect={handleConnect}
          onMessage={() => onMessage(peer)}
          onChallenge={() => onChallenge(peer)}
          loading={connecting}
        />
      </div>
    </div>
  );
}

// ── Standard Student Card (general Discover) ───────────────────────────────
function StudentCard({ peer, onViewProfile, onMessage, onConnect, onChallenge }) {
  // peer shape from enriched endpoint: { user, relationship, learningOverlap, challengeEligible }
  // for backward compat with any raw user shape, we normalise here.
  const student = peer.user || peer;
  const relationship = peer.relationship ?? "none";
  const challengeEligible = peer.challengeEligible ?? false;
  const learningOverlap = peer.learningOverlap ?? null;
  const [connecting, setConnecting] = useState(false);
  const initials = (student.displayName || "?")[0].toUpperCase();
  const bg = avatarBg(student.displayName);

  async function handleConnect() {
    setConnecting(true);
    try {
      await onConnect(peer);
    } finally {
      setConnecting(false);
    }
  }

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

      {learningOverlap && <OverlapBadge overlap={learningOverlap} />}

      {student.bio && !learningOverlap && (
        <p className="disc-student-bio">
          {student.bio.length > 100 ? student.bio.slice(0, 100) + "…" : student.bio}
        </p>
      )}

      <div className="disc-student-actions">
        <button className="disc-student-btn disc-student-btn--ghost" onClick={() => onViewProfile(peer)}>
          View Profile
        </button>
        {relationship === "conversation" ? (
          <>
            <button className="disc-student-btn disc-student-btn--primary" onClick={() => onMessage(peer)}>
              <ChatIcon /> Message
            </button>
            {challengeEligible && (
              <button
                className="disc-student-btn disc-student-btn--challenge"
                onClick={() => onChallenge(peer)}
                title="Start an AI Quiz Battle"
              >
                <SwordIcon /> Challenge
              </button>
            )}
          </>
        ) : (
          <button
            className="disc-student-btn disc-student-btn--primary"
            onClick={handleConnect}
            disabled={connecting}
          >
            {connecting ? "Connecting…" : "Connect"}
          </button>
        )}
      </div>
    </div>
  );
}

// ── Learning Peers Section ─────────────────────────────────────────────────
function LearningPeersSection({ peers, loading, onViewProfile, onConnect, onMessage, onChallenge }) {
  if (loading) {
    return (
      <div className="disc-learning-section">
        <div className="disc-section-header">
          <SparkIcon />
          <div>
            <h2 className="disc-section-title">Learning with peers</h2>
            <p className="disc-section-subtitle">People studying similar things right now.</p>
          </div>
        </div>
        <div className="disc-peer-grid">
          <div className="disc-mobile-shimmer" />
          <div className="disc-mobile-shimmer" />
          <div className="disc-mobile-shimmer" />
        </div>
      </div>
    );
  }

  if (peers.length === 0) {
    return (
      <div className="disc-learning-section">
        <div className="disc-section-header">
          <SparkIcon />
          <div>
            <h2 className="disc-section-title">Learning with peers</h2>
            <p className="disc-section-subtitle">People studying similar things right now.</p>
          </div>
        </div>
        <div className="disc-learning-empty">
          <span className="disc-learning-empty-icon">📚</span>
          <p className="disc-learning-empty-text">
            Start learning in the AI Learning Room to discover peers studying the same things.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="disc-learning-section">
      <div className="disc-section-header">
        <SparkIcon />
        <div>
          <h2 className="disc-section-title">Learning with peers</h2>
          <p className="disc-section-subtitle">People studying similar things right now.</p>
        </div>
      </div>
      <div className="disc-peer-grid">
        {peers.map(peer => (
          <LearningPeerCard
            key={(peer.user || peer).uid}
            peer={peer}
            onViewProfile={onViewProfile}
            onConnect={onConnect}
            onMessage={onMessage}
            onChallenge={onChallenge}
          />
        ))}
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

  // Learning peers state
  const [learningPeers,     setLearningPeers]     = useState([]);
  const [peersLoading,      setPeersLoading]      = useState(true);

  // General Discover state
  const [students,    setStudents]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [searchQuery, setSearchQuery] = useState("");

  const [level,        setLevel]        = useState("All Levels");
  const [availability, setAvailability] = useState("all");
  const [sort,         setSort]         = useState("recommended");

  const [showFilters,     setShowFilters]     = useState(false);
  const [selectedPeer,    setSelectedPeer]    = useState(null);

  // ── Load learning peers ────────────────────────────────────────────────
  const loadLearningPeers = useCallback(async () => {
    setPeersLoading(true);
    try {
      const data = await api.discoverLearningPeers({ level, availability });
      setLearningPeers(data);
    } catch (err) {
      // Non-fatal — the section just shows empty state.
      console.warn("Could not load learning peers:", err.message);
      setLearningPeers([]);
    } finally {
      setPeersLoading(false);
    }
  }, [level, availability]);

  // ── Load general students ──────────────────────────────────────────────
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

  useEffect(() => {
    loadLearningPeers();
    loadStudents();
  }, [loadLearningPeers, loadStudents]);

  // ── Search filter (applied to general students only) ───────────────────
  const filteredStudents = students.filter(item => {
    const s = item.user || item; // handle both enriched and legacy shapes
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      (s.displayName || "").toLowerCase().includes(q) ||
      (s.bio         || "").toLowerCase().includes(q) ||
      (s.grade       || "").toLowerCase().includes(q)
    );
  });

  // ── Action handlers ────────────────────────────────────────────────────

  /** Connect = create a conversation (Conversation IS the connection in Knovi). */
  async function handleConnect(peer) {
    const student = peer.user || peer;
    if (!student.allowDirectMessage) {
      toast.error("This student has disabled direct messages.");
      return;
    }
    try {
      await api.startConversation(student.uid, "", null);
      toast.success(`Connected with ${student.displayName}!`);
      // Reload both sections so relationship state updates to "conversation".
      await Promise.all([loadLearningPeers(), loadStudents()]);
    } catch (err) {
      toast.error(err.message || "Couldn't connect.");
    }
  }

  async function handleMessage(peer) {
    const student = peer.user || peer;
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

  async function handleChallenge(peer) {
    const { learningOverlap } = peer;
    if (!learningOverlap || learningOverlap.type !== "concept" || !learningOverlap.conceptId) {
      toast.error("Select a shared concept to start a challenge.");
      return;
    }
    const student = peer.user || peer;
    try {
      const result = await api.createChallenge({
        opponentId: student.uid,
        subjectId:  learningOverlap.subjectId,
        topicId:    learningOverlap.topicId,
        conceptId:  learningOverlap.conceptId,
        questionCount: 5,
      });
      navigate(`/app/challenge/${result.challenge.id}`);
    } catch (err) {
      toast.error(err.message || "Couldn't start challenge. Make sure you both have AI learning sessions for this concept.");
    }
  }

  function handleFiltersApply(filters) {
    setLevel(filters.level);
    setAvailability(filters.availability);
    setSort(filters.sort);
    setShowFilters(false);
  }

  // ── Profile panel handler ──────────────────────────────────────────────
  function handleViewProfile(peer) {
    // Normalise to a shape StudentProfilePanel understands.
    const student = peer.user || peer;
    setSelectedPeer({
      ...student,
      relationship: peer.relationship ?? "none",
      learningOverlap: peer.learningOverlap ?? null,
      challengeEligible: peer.challengeEligible ?? false,
    });
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
          <span className="disc-mobile-result-note">
            {loading ? "Finding peers…" : `${filteredStudents.length} available`}
          </span>
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

        {/* ── Mobile: Learning Peers ── */}
        <LearningPeersSection
          peers={learningPeers}
          loading={peersLoading}
          onViewProfile={handleViewProfile}
          onConnect={handleConnect}
          onMessage={handleMessage}
          onChallenge={handleChallenge}
        />

        {/* ── Mobile: All Students ── */}
        <div className="disc-section-divider">
          <div className="disc-section-header disc-section-header--all">
            <UsersIcon />
            <div>
              <h2 className="disc-section-title">All students</h2>
              <p className="disc-section-subtitle">Browse everyone on Knovi.</p>
            </div>
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
              filteredStudents.map(peer => (
                <StudentCard
                  key={(peer.user || peer).uid}
                  peer={peer}
                  onViewProfile={handleViewProfile}
                  onConnect={handleConnect}
                  onMessage={handleMessage}
                  onChallenge={handleChallenge}
                />
              ))
            )}
          </div>
        </div>

        <div style={{ height: 32 }} />

        {selectedPeer && (
          <StudentProfilePanel
            student={selectedPeer}
            currentUser={profile}
            onClose={() => setSelectedPeer(null)}
            onMessage={() => { handleMessage({ user: selectedPeer, relationship: selectedPeer.relationship, learningOverlap: selectedPeer.learningOverlap, challengeEligible: selectedPeer.challengeEligible }); setSelectedPeer(null); }}
            onChallenge={selectedPeer.challengeEligible ? () => { handleChallenge({ user: selectedPeer, relationship: selectedPeer.relationship, learningOverlap: selectedPeer.learningOverlap, challengeEligible: selectedPeer.challengeEligible }); setSelectedPeer(null); } : null}
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

        {/* ── Learning Peers ── */}
        <LearningPeersSection
          peers={learningPeers}
          loading={peersLoading}
          onViewProfile={handleViewProfile}
          onConnect={handleConnect}
          onMessage={handleMessage}
          onChallenge={handleChallenge}
        />

        {/* ── All Students ── */}
        <div className="disc-section-divider">
          <div className="disc-section-header disc-section-header--all">
            <UsersIcon />
            <div>
              <h2 className="disc-section-title">All students</h2>
              <p className="disc-section-subtitle">Browse everyone on Knovi.</p>
            </div>
          </div>

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
              {filteredStudents.map(peer => (
                <StudentCard
                  key={(peer.user || peer).uid}
                  peer={peer}
                  onViewProfile={handleViewProfile}
                  onConnect={handleConnect}
                  onMessage={handleMessage}
                  onChallenge={handleChallenge}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {selectedPeer && (
        <StudentProfilePanel
          student={selectedPeer}
          currentUser={profile}
          onClose={() => setSelectedPeer(null)}
          onMessage={() => { handleMessage({ user: selectedPeer, relationship: selectedPeer.relationship, learningOverlap: selectedPeer.learningOverlap, challengeEligible: selectedPeer.challengeEligible }); setSelectedPeer(null); }}
          onChallenge={selectedPeer.challengeEligible ? () => { handleChallenge({ user: selectedPeer, relationship: selectedPeer.relationship, learningOverlap: selectedPeer.learningOverlap, challengeEligible: selectedPeer.challengeEligible }); setSelectedPeer(null); } : null}
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
