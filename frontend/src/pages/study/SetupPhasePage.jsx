/**
 * SetupPhasePage — /app/rooms/setup/:sessionId
 * Each student sees their assigned role (teacher/learner) and confirms ready.
 * Polls every 2 s. When both ready (phase = "concepts") → SessionRoomPage.
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import * as api from "../../api";

export default function SetupPhasePage() {
  const { sessionId } = useParams();
  const { user }      = useAuth();
  const navigate      = useNavigate();
  const [session, setSession]   = useState(null);
  const [ready,   setReady]     = useState(false);
  const [busy,    setBusy]      = useState(false);
  const [error,   setError]     = useState("");
  const intervalRef = useRef(null);

  async function load() {
    try {
      const data = await api.getLearningSession(Number(sessionId));
      setSession(data);
      if (data.phase === "concepts") {
        clearInterval(intervalRef.current);
        navigate(`/app/rooms/session/${sessionId}`);
      }
    } catch (e) {
      setError(e.message);
      clearInterval(intervalRef.current);
    }
  }

  useEffect(() => {
    load();
    intervalRef.current = setInterval(load, 2000);
    return () => clearInterval(intervalRef.current);
  }, [sessionId]);

  async function handleReady() {
    setBusy(true);
    try {
      await api.setStudentReady(Number(sessionId));
      setReady(true);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (error) return (
    <div className="pt-page pt-page-centered">
      <div className="pt-error-card"><p className="pt-err-text">⚠️ {error}</p></div>
    </div>
  );
  if (!session) return <div className="pt-page pt-page-centered"><div className="pt-spinner" /></div>;

  const myId     = Number(user?.uid);
  const isTeacher = myId === session.teacherId;
  const topic     = session.topic || {};
  const partner   = isTeacher ? session.learner : session.teacher;
  const concepts  = (topic.concepts || []).sort((a, b) => a.id - b.id);

  const myReady      = isTeacher ? session.teacherReady : session.learnerReady;
  const partnerReady = isTeacher ? session.learnerReady : session.teacherReady;
  const iAmReady     = ready || myReady;

  return (
    <div className="pt-page pt-page-centered">
      <div className="pt-setup-card">
        {/* Role badge */}
        <div className={`pt-role-badge ${isTeacher ? "teacher" : "learner"}`}>
          {isTeacher ? "Teacher 🎓" : "Learner 📖"}
        </div>

        <h1 className="pt-setup-title">
          {isTeacher ? "You are the Teacher" : "You are the Learner"}
        </h1>

        {isTeacher ? (
          <>
            <p className="pt-setup-sub">
              You are the <strong>{topic.subject}</strong> guide for this session.<br />
              Guide <strong>{partner?.name || "your partner"}</strong> through <strong>{topic.name}</strong> concept by concept.
            </p>
            <div className="pt-setup-mission">
              <h3>Your mission as Teacher:</h3>
              <ul>
                <li>✦ Explain each concept using the chat</li>
                <li>✦ Use examples, diagrams, or analogies</li>
                <li>✦ Ask your learner to explain it back</li>
                <li>✦ Give feedback on their explanation</li>
              </ul>
            </div>
          </>
        ) : (
          <>
            <p className="pt-setup-sub">
              <strong>{partner?.name || "Your partner"}</strong> will guide you through <strong>{topic.name}</strong>.
            </p>
            <div className="pt-setup-mission">
              <h3>Your mission as Learner:</h3>
              <ul>
                <li>✦ Ask questions freely in the chat</li>
                <li>✦ Listen to explanations carefully</li>
                <li>✦ Explain each concept back in your own words</li>
                <li>✦ Be honest — this helps you learn</li>
              </ul>
            </div>
          </>
        )}

        {/* Concepts to cover */}
        {concepts.length > 0 && (
          <div className="pt-setup-concepts">
            <h3>Concepts to cover:</h3>
            <ol className="pt-setup-concept-list">
              {concepts.map((c, i) => (
                <li key={c.id}>{i + 1}. {c.name}</li>
              ))}
            </ol>
          </div>
        )}

        {/* Readiness */}
        <div className="pt-setup-status">
          <div className={`pt-setup-dot ${iAmReady ? "green" : "blue"}`} />
          <span>{iAmReady ? "You're ready!" : "Waiting for you to be ready"}</span>
          <div className={`pt-setup-dot ${partnerReady ? "green" : "grey"}`} />
          <span>{partnerReady ? `${partner?.name || "Partner"} is ready!` : `Waiting for ${partner?.name || "partner"}…`}</span>
        </div>

        {error && <p className="pt-form-err">{error}</p>}

        <button
          className={`pt-btn-ready ${iAmReady ? "pt-btn-ready-done" : ""}`}
          onClick={handleReady}
          disabled={busy || iAmReady}
        >
          {iAmReady ? "✓ Ready!" : busy ? "Confirming…" : "I'm Ready →"}
        </button>
      </div>
    </div>
  );
}
