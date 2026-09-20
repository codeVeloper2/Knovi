import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import * as api from "../../api";

function Icon({children,size=20}){return <svg className="cp-icon" width={size} height={size} viewBox="0 0 24 24" fill="none">{children}</svg>}
function Back(){return <Icon><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></Icon>}
function Arrow(){return <Icon><path d="m9 5 7 7-7 7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></Icon>}
function Check(){return <span className="cp-check">✓</span>}
function Book(){return <Icon><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H18v16H6.5A2.5 2.5 0 0 0 4 21.5v-16Z" stroke="currentColor" strokeWidth="1.7"/><path d="M8 8h6M8 11h5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/></Icon>}

export default function AITopicPage(){
  const {subjectId,topicId}=useParams();
  const navigate=useNavigate();
  const [topic,setTopic]=useState(null);
  const [subject,setSubject]=useState(null);
  const [concepts,setConcepts]=useState([]);
  const [objectives,setObjectives]=useState([]);
  const [resources,setResources]=useState([]);
  const [sessions,setSessions]=useState([]);
  const [loading,setLoading]=useState(true);
  const [tab,setTab]=useState("concepts");

  useEffect(()=>{
    let alive=true;
    Promise.all([
      api.getTopic(topicId),
      api.getSubject(subjectId).catch(()=>null),
      api.getConcepts(topicId),
      api.getTopicObjectives(topicId).catch(()=>[]),
      api.getTopicResources(topicId).catch(()=>[]),
      api.getAISessions({limit:100,offset:0}).catch(()=>[])
    ]).then(([t,s,c,o,r,ss])=>{
      if(!alive)return;
      setTopic(t);setSubject(s);setConcepts(Array.isArray(c)?c:[]);
      setObjectives(Array.isArray(o)?o:[]);
      setResources(Array.isArray(r)?r:[]);
      setSessions(Array.isArray(ss)?ss:(ss?.items||[]));
    }).catch(()=>{}).finally(()=>alive&&setLoading(false));
    return()=>{alive=false};
  },[topicId,subjectId]);

  const conceptProgress=useMemo(()=>concepts.map(c=>{
    const cs=sessions.filter(s=>Number(s.conceptId)===Number(c.id));
    const completed=cs.some(s=>s.status==="completed");
    const active=cs.find(s=>!["completed","abandoned"].includes(s.status));
    return {...c,status:active?"in_progress":completed?"completed":"not_started",activeSession:active||null};
  }),[concepts,sessions]);

  const started=conceptProgress.filter(c=>c.status!=="not_started").length;
  const completed=conceptProgress.filter(c=>c.status==="completed").length;
  const pct=conceptProgress.length?Math.round((completed/conceptProgress.length)*100):0;

  if(loading)return <div className="cp-page"><div className="cp-skeleton hero"/><div className="cp-skeleton block"/></div>;
  if(!topic)return <div className="cp-page"><div className="cp-empty"><h2>Topic not found.</h2><button onClick={()=>navigate(`/app/learn/ai/subject/${subjectId}`)}>Back to Subject</button></div></div>;

  const openConcept=(concept)=>{
    navigate(`/app/learn/ai/subject/${subjectId}/topic/${topicId}/concept/${concept.id}`);
  };

  return <div className="cp-page">
    <button className="cp-back" onClick={()=>navigate(`/app/learn/ai/subject/${subjectId}`)}><Back/> {subject?.name || "Subject"}</button>

    <section className="cp-topic-hero">
      <div className="cp-breadcrumb"><span>{subject?.name || topic.subjectName || "Subject"}</span><b>›</b><span>Topic</span></div>
      <div className="cp-topic-hero-row">
        <div className="cp-topic-symbol"><Book/></div>
        <div className="cp-hero-copy">
          <div className="cp-eyebrow">Topic</div>
          <h1>{topic.name}</h1>
          <p>{topic.description || "Build your understanding through the concepts in this topic."}</p>
          <div className="cp-hero-chips">
            <span>{concepts.length} concepts</span>
            {topic.difficulty && <span className={`cp-difficulty ${String(topic.difficulty).toLowerCase()}`}>{topic.difficulty}</span>}
          </div>
        </div>
        <div className="cp-hero-progress">
          <div className="cp-progress-ring" style={{"--p":`${pct*3.6}deg`}}><strong>{pct}%</strong></div>
          <span>Topic progress</span>
          <small>{completed} of {concepts.length} concepts completed</small>
        </div>
      </div>
    </section>

    <div className="cp-tabs">
      <button className={tab==="concepts"?"active":""} onClick={()=>setTab("concepts")}>Concepts <b>{concepts.length}</b></button>
      <button className={tab==="objectives"?"active":""} onClick={()=>setTab("objectives")}>What you'll learn <b>{objectives.length}</b></button>
      <button className={tab==="resources"?"active":""} onClick={()=>setTab("resources")}>Resources <b>{resources.length}</b></button>
    </div>

    {tab==="concepts"&&<section>
      <div className="cp-section-heading"><div><span className="cp-section-icon"><Book/></span><div><h2>Concepts</h2><p>Choose a concept to see what it covers before starting your AI session.</p></div></div><span className="cp-count">{started}/{concepts.length} started</span></div>
      <div className="cp-concept-list">
        {conceptProgress.map((c,i)=><button key={c.id} className="cp-concept-card" onClick={()=>openConcept(c)}>
          <span className={`cp-concept-status ${c.status}`}>{c.status==="completed"?"✓":c.status==="in_progress"?"•":String(i+1).padStart(2,"0")}</span>
          <span className="cp-concept-main"><strong>{c.name}</strong><small>{c.explanation}</small>{c.keyPoints?.length>0&&<span className="cp-keypoints">{c.keyPoints.slice(0,3).map((p,j)=><em key={j}>{p}</em>)}</span>}</span>
          <Arrow/>
        </button>)}
        {!concepts.length&&<div className="cp-empty"><h3>No concepts available yet.</h3><p>Check back later as this topic is expanded.</p></div>}
      </div>
    </section>}

    {tab==="objectives"&&<section className="cp-info-grid">
      <div className="cp-info-card"><span className="cp-info-icon">✓</span><h3>By the end of this topic</h3><div className="cp-objectives">{objectives.map(o=><div key={o.id}><Check/><span><strong>{o.title}</strong><small>{o.description}</small></span></div>)}</div>{!objectives.length&&<p className="cp-muted">No learning objectives have been added yet.</p>}</div>
      <div className="cp-info-card cp-tip-card"><span className="cp-info-icon">✦</span><h3>Learn actively</h3><p>Pick one concept, tell the tutor what you already know, and use the retrieval checks to see what sticks.</p></div>
    </section>}

    {tab==="resources"&&<section className="cp-resource-list">
      {resources.length?resources.map(r=><a key={r.id} href={r.url||r.fileUrl||"#"} target="_blank" rel="noreferrer" className="cp-resource-card"><span className="cp-resource-icon">↗</span><span><strong>{r.title}</strong><small>{r.description||r.type||"Study resource"}</small></span><Arrow/></a>):<div className="cp-empty"><h3>No resources yet.</h3><p>The AI tutor can still teach every concept without extra resources.</p></div>}
    </section>}
  </div>;
}
