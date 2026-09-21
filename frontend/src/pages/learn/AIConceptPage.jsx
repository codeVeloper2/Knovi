import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

function Icon({children,size=22}){return <svg className="cp-icon" width={size} height={size} viewBox="0 0 24 24" fill="none">{children}</svg>}
function Back(){return <Icon><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></Icon>}
function Spark(){return <Icon><path d="m12 3 1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7L12 3Z" stroke="currentColor" strokeWidth="1.6"/><path d="m19 16 .8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8L19 16Z" stroke="currentColor" strokeWidth="1.3"/></Icon>}
function Book(){return <Icon><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" stroke="currentColor" strokeWidth="1.7"/><path d="M8 8h6M8 11h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></Icon>}

export default function AIConceptPage(){
  const {subjectId,topicId,conceptId}=useParams();
  const navigate=useNavigate();
  const [concept,setConcept]=useState(null);
  const [topic,setTopic]=useState(null);
  const [subject,setSubject]=useState(null);
  const [sessions,setSessions]=useState([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{
    let alive=true;
    Promise.all([
      api.getConcept(conceptId),
      api.getTopic(topicId),
      api.getSubject(subjectId),
      api.getAISessions({limit:100,offset:0}).catch(()=>[])
    ]).then(([c,t,s,ss])=>{
      if(!alive)return;
      setConcept(c);setTopic(t);setSubject(s);
      setSessions(Array.isArray(ss)?ss:(ss?.items||[]));
    }).catch(()=>{}).finally(()=>alive&&setLoading(false));
    return()=>{alive=false};
  },[conceptId,topicId,subjectId]);

  const history=useMemo(()=>sessions.filter(s=>Number(s.conceptId)===Number(conceptId)),[sessions,conceptId]);
  const completed=history.filter(s=>s.status==="completed").length;
  const active=history.find(s=>!["completed","abandoned"].includes(s.status));
  const lastCompleted=useMemo(()=>[...history].filter(s=>s.status==="completed").sort((a,b)=>new Date(b.updatedAt||b.createdAt)-new Date(a.updatedAt||a.createdAt))[0],[history]);

  if(loading)return <div className="cp-page"><div className="cp-skeleton hero"/><div className="cp-skeleton block"/></div>;
  if(!concept)return <div className="cp-page"><div className="cp-empty"><h2>Concept not found.</h2><button onClick={()=>navigate(`/app/learn/ai/subject/${subjectId}/topic/${topicId}`)}>Back to Topic</button></div></div>;

  const start=()=>{
    if(active?.id) navigate(`/app/learn/ai/session/${active.id}`);
    else if(lastCompleted?.id) navigate(`/app/learn/ai/session/${lastCompleted.id}`);
    else navigate(`/app/learn/ai/subject/${subjectId}/topic/${topicId}/concept/${conceptId}/setup`);
  };

  return <div className="cp-page">
    <button className="cp-back" onClick={()=>navigate(`/app/learn/ai/subject/${subjectId}/topic/${topicId}`)}><Back/> {topic?.name || "Topic"}</button>

    <div className="cp-breadcrumb cp-breadcrumb-wide">
      <button onClick={()=>navigate(`/app/learn/ai/subject/${subjectId}`)}>{subject?.name || "Subject"}</button><b>›</b>
      <button onClick={()=>navigate(`/app/learn/ai/subject/${subjectId}/topic/${topicId}`)}>{topic?.name || "Topic"}</button><b>›</b><span>{concept.name}</span>
    </div>

    <section className="cp-concept-hero">
      <div className="cp-concept-icon"><Book/></div>
      <div className="cp-hero-copy">
        <div className="cp-eyebrow">Concept</div>
        <h1>{concept.name}</h1>
        <p>{concept.explanation}</p>
        <div className="cp-hero-chips"><span>{subject?.name}</span><span>{topic?.name}</span>{completed>0&&<span>{completed} completed session{completed>1?"s":""}</span>}</div>
      </div>
      <button className="cp-primary cp-start-hero" onClick={start}>
        <Spark/> {active ? "Continue Learning" : completed ? "Review Session" : "Start Learning"}
      </button>
    </section>

    <section className="cp-concept-layout">
      <main>
        <div className="cp-content-card">
          <div className="cp-content-heading"><span className="cp-section-icon"><Spark/></span><div><h2>What you'll learn</h2><p>These key ideas will guide your AI learning session.</p></div></div>
          {concept.keyPoints?.length ? <div className="cp-keypoint-list">{concept.keyPoints.map((point,i)=><div key={i}><span>{i+1}</span><p>{point}</p></div>)}</div> : <div className="cp-muted-block">UPRAD will build the key ideas with you during the session.</div>}
        </div>
        <div className="cp-content-card">
          <div className="cp-content-heading"><span className="cp-section-icon"><Book/></span><div><h2>How the AI session works</h2><p>A continuous learning room adapts to your understanding.</p></div></div>
          <div className="cp-flow">
            <div><b>1</b><span><strong>Tell your tutor</strong><small>Choose how familiar you are and what you want to do.</small></span></div>
            <div><b>2</b><span><strong>Learn</strong><small>The tutor teaches using a method suited to your needs.</small></span></div>
            <div><b>3</b><span><strong>Retrieve</strong><small>Teaching content is hidden while you recall and answer.</small></span></div>
            <div><b>4</b><span><strong>Adapt</strong><small>If you're struggling, the tutor reteaches using a different approach.</small></span></div>
          </div>
        </div>
      </main>

      <aside className="cp-rail">
        <div className="cp-rail-card">
          <div className="cp-rail-title">Your concept progress</div>
          <div className="cp-concept-progress">
            <span className={`cp-big-status ${active ? "active" : completed ? "done" : ""}`}>{active ? "In progress" : completed ? "Completed" : "Not started"}</span>
            <strong>{completed} session{completed!==1?"s":""} completed</strong>
            <small>{history.length ? "You can continue from your latest session." : "Start when you're ready."}</small>
          </div>
          <button className="cp-primary cp-full" onClick={start}>{active ? "Continue Learning" : completed ? "Review Session" : "Start AI Session"}</button>
        </div>
        <div className="cp-rail-card cp-rail-tip"><strong>Be honest with your tutor</strong><p>Your familiarity and answers help the AI choose how to teach you. You don't need to pretend you already know something.</p></div>
      </aside>
    </section>
  </div>;
}
