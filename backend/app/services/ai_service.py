"""Centralized AI service for PeerUP's Learn system.

Primary provider:  Google Gemini (gemini-2.0-flash)
Fallback provider: Groq      (llama-3.1-8b-instant)

All public methods return structured, validated dicts.
Never passes raw AI output directly to callers.

Public API:
  verify_explanation(...)     → structured verdict with feedback
  generate_lesson(...)        → block-based lesson structure
  generate_checkpoint(...)    → 3 MCQ questions from lesson content
  generate_reteaching(...)    → focused re-lesson for missed points
  ask_concept_question(...)   → curriculum-grounded Q&A answer
"""
from __future__ import annotations

import json
import logging
from typing import Any

logger = logging.getLogger(__name__)


# ─────────────────────────────────────────────────────────────────────────────
# Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

def _strip_fences(text: str) -> str:
    """Remove markdown code fences from AI response."""
    text = text.strip()
    if text.startswith("```"):
        parts = text.split("```", 2)
        if len(parts) >= 2:
            text = parts[1]
            if text.startswith("json"):
                text = text[4:]
    return text.strip()


def _parse_json(text: str) -> dict | list:
    text = _strip_fences(text)
    return json.loads(text)


def _call_gemini_sync(prompt: str, system: str | None, temperature: float, json_mode: bool) -> str:
    """Synchronous Gemini call. Runs in a thread via asyncio.to_thread."""
    from app.core.config import settings
    from google import genai
    from google.genai import types

    client = genai.Client(api_key=settings.GEMINI_API_KEY)

    cfg_kwargs: dict[str, Any] = {"temperature": temperature}
    if json_mode:
        cfg_kwargs["response_mime_type"] = "application/json"
    if system:
        cfg_kwargs["system_instruction"] = system

    config = types.GenerateContentConfig(**cfg_kwargs)

    response = client.models.generate_content(
        model=settings.GEMINI_MODEL,
        contents=prompt,
        config=config,
    )
    return response.text.strip()


async def _call_gemini(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.7,
    json_mode: bool = True,
    timeout: float | None = None,
) -> str:
    import asyncio
    from app.core.config import settings

    _timeout = timeout or float(settings.AI_REQUEST_TIMEOUT)
    return await asyncio.wait_for(
        asyncio.to_thread(_call_gemini_sync, prompt, system, temperature, json_mode),
        timeout=_timeout,
    )


async def _call_groq(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.7,
    timeout: float | None = None,
) -> str:
    from app.core.config import settings
    from groq import AsyncGroq

    _timeout = timeout or float(settings.AI_REQUEST_TIMEOUT)
    client = AsyncGroq(api_key=settings.GROQ_API_KEY, timeout=_timeout)
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})

    response = await client.chat.completions.create(
        model=settings.GROQ_MODEL,
        messages=messages,
        temperature=temperature,
        response_format={"type": "json_object"},
    )
    return response.choices[0].message.content


async def _call_with_fallback(
    prompt: str,
    *,
    system: str | None = None,
    temperature: float = 0.7,
    json_mode: bool = True,
    timeout: float | None = None,
) -> tuple[str, str]:
    """Try Gemini then Groq. Returns (raw_text, provider_name)."""
    from app.core.config import settings

    if settings.GEMINI_API_KEY:
        try:
            text = await _call_gemini(
                prompt, system=system, temperature=temperature,
                json_mode=json_mode, timeout=timeout,
            )
            return text, "gemini"
        except Exception as exc:
            logger.warning("Gemini call failed: %s", exc)

    if settings.GROQ_API_KEY:
        try:
            text = await _call_groq(prompt, system=system, temperature=temperature, timeout=timeout)
            return text, "groq"
        except Exception as exc:
            logger.warning("Groq call failed: %s", exc)

    raise RuntimeError("All AI providers failed")


# ─────────────────────────────────────────────────────────────────────────────
# 1. VERIFY EXPLANATION
# ─────────────────────────────────────────────────────────────────────────────

_VERIFY_SYSTEM = """You are PeerUP's learning verification assistant.

Your job is to evaluate whether a student's explanation demonstrates understanding of a curriculum concept.

Rules:
- Evaluate ONLY against the supplied curriculum context
- Do NOT invent curriculum facts
- Do NOT judge grammar, writing style, or intelligence
- Focus purely on conceptual understanding
- A student can explain simply and still pass
- Keep feedback concise, encouraging, and specific
- Detect known misconceptions from the supplied list only

Return ONLY valid JSON. No prose outside the JSON."""


def _build_verify_prompt(
    student_response: str,
    topic_name: str,
    subject_name: str,
    activity_prompt: str,
    concepts: list[dict],
    misconceptions: list[dict],
    learning_objectives: list[dict],
    previous_attempts: list[dict],
) -> str:
    def fmt_concepts(cs):
        lines = []
        for c in cs:
            lines.append(f"• {c.get('name','')}: {c.get('explanation','')}")
            for kp in c.get("key_points") or c.get("keyPoints") or []:
                lines.append(f"  - {kp}")
        return "\n".join(lines) or "(none)"

    def fmt_misc(ms):
        return "\n".join(
            f"• Misconception: \"{m.get('misconception','')}\"\n  Correction: {m.get('correction','')}"
            for m in ms
        ) or "(none)"

    def fmt_obj(os_):
        return "\n".join(f"• {o.get('title','')}" for o in os_) or "(none)"

    def fmt_prev(ats):
        if not ats:
            return "(none)"
        return "\n".join(f"Attempt {i+1}: \"{a.get('response','')}\"" for i, a in enumerate(ats))

    return f"""Topic: {topic_name} ({subject_name})
Activity: {activity_prompt}

Concepts the student should demonstrate:
{fmt_concepts(concepts)}

Known misconceptions to watch for:
{fmt_misc(misconceptions)}

Learning objectives:
{fmt_obj(learning_objectives)}

Previous attempts: {len(previous_attempts)}
{fmt_prev(previous_attempts)}

Student's explanation:
"{student_response}"

Evaluate and return JSON:
{{
  "verdict": "correct" | "partial" | "incorrect",
  "score": 0-100,
  "confidence": 0.0-1.0,
  "demonstrated_understanding": true/false,
  "correct_points": ["..."],
  "missing_points": ["..."],
  "incorrect_points": ["..."],
  "misconceptions_detected": [{{"name": "...", "correction": "..."}}],
  "feedback": "...",
  "hint": "..." or null,
  "should_retry": true/false
}}"""


def _validate_verify(raw: dict) -> dict:
    assert raw.get("verdict") in ("correct", "partial", "incorrect"), "invalid verdict"
    score = raw.get("score", 0)
    assert 0 <= float(score) <= 100, "score out of range"
    confidence = raw.get("confidence", 0.0)
    assert 0.0 <= float(confidence) <= 1.0, "confidence out of range"
    assert isinstance(raw.get("should_retry"), bool), "should_retry must be bool"
    feedback = raw.get("feedback", "")
    assert isinstance(feedback, str) and len(feedback) > 0, "feedback must be non-empty"
    return {
        "verdict": raw["verdict"],
        "score": int(float(score)),
        "confidence": float(confidence),
        "demonstrated_understanding": bool(raw.get("demonstrated_understanding", False)),
        "correct_points": list(raw.get("correct_points") or []),
        "missing_points": list(raw.get("missing_points") or []),
        "incorrect_points": list(raw.get("incorrect_points") or []),
        "misconceptions_detected": list(raw.get("misconceptions_detected") or []),
        "feedback": feedback,
        "hint": raw.get("hint") or None,
        "should_retry": raw["should_retry"],
    }


_FALLBACK_VERIFY: dict[str, Any] = {
    "success": False,
    "error": {
        "code": "AI_UNAVAILABLE",
        "message": "AI verification is temporarily unavailable. Please try again.",
    },
}


async def verify_explanation(
    student_response: str,
    topic_name: str,
    subject_name: str,
    activity_prompt: str,
    concepts: list[dict],
    misconceptions: list[dict],
    learning_objectives: list[dict],
    previous_attempts: list[dict] | None = None,
) -> dict[str, Any]:
    """Evaluate student explanation. Returns {success, provider, result} or {success:False, error}."""
    from app.core.config import settings

    previous_attempts = previous_attempts or []
    prompt = _build_verify_prompt(
        student_response, topic_name, subject_name, activity_prompt,
        concepts, misconceptions, learning_objectives, previous_attempts,
    )

    if settings.GEMINI_API_KEY:
        try:
            text = await _call_gemini(
                prompt, system=_VERIFY_SYSTEM, temperature=0.2, json_mode=True,
                timeout=float(settings.AI_REQUEST_TIMEOUT),
            )
            validated = _validate_verify(_parse_json(text))
            return {"success": True, "provider": "gemini", "result": validated}
        except Exception as exc:
            logger.warning("Gemini verify_explanation failed: %s", exc)

    if settings.GROQ_API_KEY:
        try:
            text = await _call_groq(
                prompt, system=_VERIFY_SYSTEM, temperature=0.2,
                timeout=float(settings.AI_REQUEST_TIMEOUT),
            )
            validated = _validate_verify(_parse_json(text))
            return {"success": True, "provider": "groq", "result": validated}
        except Exception as exc:
            logger.warning("Groq verify_explanation failed: %s", exc)

    logger.error("All AI providers failed for session explanation verification.")
    return _FALLBACK_VERIFY


# ─────────────────────────────────────────────────────────────────────────────
# 2. GENERATE LESSON
# ─────────────────────────────────────────────────────────────────────────────

_LESSON_SYSTEM = """You are PeerUP's AI Tutor — a knowledgeable, conversational teacher.

Your job is to teach a specific concept to a student.

Teaching philosophy:
- Teach like a human tutor, not like a textbook or article writer
- Start with intuition before formulas
- Use real-world examples, analogies, and worked problems
- Make the student understand WHY, not just WHAT
- Keep language clear, direct, and encouraging
- Vary your teaching style to match the concept

IMPORTANT CONSTRAINTS:
- Teach ONLY the supplied concept and learning objectives
- Do not invent additional learning objectives not in the curriculum
- Do not teach unrelated concepts, even if they are related topics
- Stay within the curriculum boundary provided
- You CAN create your own examples, analogies, worked problems — these do not need to be in the database
- If the concept involves a formula, explain it intuitively before presenting it mathematically

Return ONLY valid JSON. No prose outside the JSON."""


def _build_lesson_prompt(ctx: dict) -> str:
    subject_name = ctx.get("subject_name", "")
    subject_desc = ctx.get("subject_description", "")
    topic_name = ctx.get("topic_name", "")
    topic_desc = ctx.get("topic_description", "")
    topic_diff = ctx.get("topic_difficulty", "")
    concept_name = ctx.get("concept_name", "")
    concept_explanation = ctx.get("concept_explanation", "")
    key_points = ctx.get("key_points", [])
    objectives = ctx.get("objectives", [])
    misconceptions = ctx.get("misconceptions", [])
    is_reteach = ctx.get("is_reteach", False)
    missed_points = ctx.get("missed_points", [])
    previous_lesson = ctx.get("previous_lesson", None)

    kp_text = "\n".join(f"  - {kp}" for kp in key_points) if key_points else "  (none listed)"
    obj_text = "\n".join(f"  - {o}" for o in objectives) if objectives else "  (none listed)"
    misc_text = "\n".join(
        f"  - Misconception: \"{m['misconception']}\" → Correction: {m['correction']}"
        for m in misconceptions
    ) if misconceptions else "  (none listed)"
    missed_text = "\n".join(f"  - {p}" for p in missed_points) if missed_points else "  (none)"

    reteach_instructions = ""
    prev_lesson_text = ""
    if is_reteach:
        reteach_instructions = f"""
THIS IS A RETEACHING LESSON.
The student failed a checkpoint. They specifically struggled with:
{missed_text}

Instructions for reteaching:
- Focus ONLY on the missed points above
- Use DIFFERENT examples and analogies than the original lesson
- Break difficult parts into smaller, clearer steps
- Use simpler, more direct language
- Keep the lesson shorter (3-5 blocks)
- Still make every key point clearly testable
"""
        if previous_lesson:
            prev_lesson_text = f"""
Original lesson title for reference: {previous_lesson.get('title', '')}
(Do NOT repeat the same explanations or examples from the original lesson)
"""

    block_types_doc = """
Available block types — choose freely based on what best teaches THIS concept:
- "explanation"    : Clear narrative explanation of an idea or concept
- "key_idea"       : A single most-important insight, highlighted prominently
- "analogy"        : "Think of it like..." — a relatable real-world comparison
- "example"        : A concrete real-world example
- "worked_example" : Step-by-step problem → solution with numbered steps
- "formula"        : Mathematical formula with variable definitions and when-to-use
- "comparison"     : Side-by-side comparison of two related ideas
- "step_by_step"   : Sequential numbered steps
- "misconception"  : Common mistake students make, with correction
- "application"    : Real-world application of the concept (how it's used in practice)
- "visual"         : A text-based visual/diagram description with labeled elements
- "quick_check"    : A mini interactive question with 4 options (A/B/C/D) — tests understanding mid-lesson
- "reflection"     : A thinking question for the student (no answer required)
- "key_points"     : Bulleted list of essential takeaways (include this near the end)
- "summary"        : Lesson recap paragraph (use as the VERY LAST block)

You decide which blocks to use and in what order. Choose whatever best helps a student understand this concept.
"""

    json_schema = """{
  "title": "Lesson title (concise, specific to this concept)",
  "introduction": "One sentence greeting from the AI Tutor setting up what will be taught",
  "learningGoal": "What the student will understand or be able to do after this lesson",
  "estimatedMinutes": 7,
  "blocks": [
    {
      "type": "explanation",
      "title": "Section title",
      "content": "Teaching content"
    },
    {
      "type": "key_idea",
      "title": "Key idea title",
      "content": "The single most important thing to understand"
    },
    {
      "type": "analogy",
      "title": "Think of it this way",
      "content": "Analogy text"
    },
    {
      "type": "example",
      "title": "Example title",
      "content": "Example description"
    },
    {
      "type": "worked_example",
      "title": "Let's work through one",
      "problem": "The problem statement",
      "steps": ["Step 1", "Step 2", "Step 3"],
      "answer": "The final answer / conclusion"
    },
    {
      "type": "formula",
      "title": "The formula",
      "formula": "F = ma",
      "variables": [
        {"symbol": "F", "meaning": "Force", "unit": "Newtons (N)"},
        {"symbol": "m", "meaning": "Mass", "unit": "kilograms (kg)"},
        {"symbol": "a", "meaning": "Acceleration", "unit": "m/s²"}
      ],
      "when_to_use": "Use when calculating force given mass and acceleration"
    },
    {
      "type": "comparison",
      "title": "Comparison title",
      "left": {"label": "Option A", "points": ["point 1", "point 2"]},
      "right": {"label": "Option B", "points": ["point 1", "point 2"]}
    },
    {
      "type": "step_by_step",
      "title": "How to...",
      "steps": ["First...", "Then...", "Finally..."]
    },
    {
      "type": "misconception",
      "title": "Common mistake",
      "mistake": "What students often think",
      "correction": "What is actually true"
    },
    {
      "type": "application",
      "title": "Real-world application title",
      "content": "How this concept is applied in the real world"
    },
    {
      "type": "visual",
      "title": "Visual title",
      "description": "A descriptive explanation of a diagram or visual concept",
      "elements": ["Element 1 description", "Element 2 description", "Element 3 description"]
    },
    {
      "type": "quick_check",
      "question": "A question to test understanding of what was just taught",
      "options": {"A": "option text", "B": "option text", "C": "option text", "D": "option text"},
      "answer": "A",
      "explanation": "Why A is correct and the others are not"
    },
    {
      "type": "reflection",
      "question": "A thinking question for the student"
    },
    {
      "type": "key_points",
      "title": "Key Takeaways",
      "items": ["Point 1", "Point 2", "Point 3"]
    },
    {
      "type": "summary",
      "title": "What you learned",
      "content": "Lesson recap paragraph"
    }
  ]
}"""

    return f"""You are teaching the following curriculum concept. All lesson FACTS must be grounded in the curriculum data below, but you are free to create your own examples, analogies, and worked problems.

CURRICULUM CONTEXT:
Subject: {subject_name}{' — ' + subject_desc if subject_desc else ''}
Topic: {topic_name}{' (' + topic_diff + ')' if topic_diff else ''}{chr(10) + '  ' + topic_desc if topic_desc else ''}

Concept: {concept_name}
Explanation: {concept_explanation}

Key Points (ALL of these must be covered in the lesson):
{kp_text}

Learning Objectives:
{obj_text}

Known Misconceptions (address at least one if relevant):
{misc_text}
{reteach_instructions}{prev_lesson_text}
TASK: Generate a lesson teaching exactly the concept above.
- Duration: {"3-5 minutes (focused reteaching)" if is_reteach else "5-10 minutes"}
- Teach conversationally — like a tutor talking to a student, not a textbook
- All key facts must come from the curriculum data above
- Do NOT introduce concepts from other topics
- YOU choose which block types to use and in what order — pick what genuinely helps
- Always end with a "summary" block
- Always include a "key_points" block near the end
- Include the "introduction" and "learningGoal" fields at the top level

{block_types_doc}

Return ONLY valid JSON matching this schema:
{json_schema}"""


def _validate_lesson(raw: dict) -> dict:
    assert isinstance(raw.get("title"), str) and raw["title"], "lesson needs title"
    blocks = raw.get("blocks")
    assert isinstance(blocks, list) and len(blocks) >= 2, "lesson needs at least 2 blocks"
    validated_blocks = []
    valid_types = {
        "explanation", "key_idea", "analogy", "example", "worked_example",
        "formula", "comparison", "step_by_step", "misconception",
        "application", "visual", "quick_check",
        "reflection", "key_points", "summary",
    }
    for b in blocks:
        btype = b.get("type", "")
        if btype not in valid_types:
            continue  # skip unknown block types rather than failing
        validated_blocks.append(b)
    assert len(validated_blocks) >= 2, "no valid blocks found"
    return {
        "title": str(raw["title"]),
        "introduction": str(raw.get("introduction") or ""),
        "learningGoal": str(raw.get("learningGoal") or ""),
        "estimatedMinutes": int(raw.get("estimatedMinutes") or 7),
        "blocks": validated_blocks,
    }


async def generate_lesson(ctx: dict) -> dict[str, Any]:
    """Generate a structured block-based lesson.
    
    ctx keys: subject_name, subject_description, topic_name, topic_description,
              topic_difficulty, concept_name, concept_explanation, key_points[],
              objectives[], misconceptions[], is_reteach (bool),
              missed_points[] (for reteach), previous_lesson (dict, for reteach)
    
    Returns: {success, provider, lesson} or {success:False, error}
    """
    prompt = _build_lesson_prompt(ctx)

    try:
        text, provider = await _call_with_fallback(
            prompt, system=_LESSON_SYSTEM, temperature=0.7, json_mode=True,
        )
        lesson = _validate_lesson(_parse_json(text))
        return {"success": True, "provider": provider, "lesson": lesson}
    except Exception as exc:
        logger.exception("generate_lesson failed: %s", exc)
        return {
            "success": False,
            "error": {
                "code": "AI_UNAVAILABLE",
                "message": "Your lesson couldn't be generated right now. Please try again.",
            },
        }


# ─────────────────────────────────────────────────────────────────────────────
# 3. GENERATE CHECKPOINT
# ─────────────────────────────────────────────────────────────────────────────

_CHECKPOINT_SYSTEM = """You are PeerUP's checkpoint question generator.

Rules:
- Questions MUST test ONLY content from the provided lesson
- Do NOT ask about anything not in the lesson
- Do NOT assume prior knowledge beyond the lesson
- No trick questions — wording must be clear
- Each question tests exactly ONE key point from the lesson
- correctAnswer must be exactly "A", "B", "C", or "D"
- Return ONLY valid JSON"""


def _build_checkpoint_prompt(lesson: dict, concept_name: str, subject_name: str, topic_name: str, source_label: str) -> str:
    lesson_json = json.dumps(lesson, indent=2)
    return f"""Generate exactly 3 multiple-choice checkpoint questions for this lesson.

Subject: {subject_name}
Topic: {topic_name}
Concept: {concept_name}
Source: {source_label}

THE LESSON THAT WAS TAUGHT:
{lesson_json}

REQUIREMENTS:
- Exactly 3 questions
- Each question has exactly 4 options: A, B, C, D
- correctAnswer is exactly "A", "B", "C", or "D"
- testsKeyPoint: quote the EXACT sentence or key point from the lesson this question tests
- Questions must only test content explicitly stated in the lesson above
- Mix difficulty: 1 easy, 1 medium, 1 harder

Return ONLY valid JSON:
{{
  "questions": [
    {{
      "question": "Question text?",
      "options": {{"A": "option text", "B": "option text", "C": "option text", "D": "option text"}},
      "correctAnswer": "A",
      "explanation": "Why A is correct and others are not",
      "difficulty": "easy",
      "testsKeyPoint": "exact quote from lesson"
    }}
  ],
  "passingScore": 67,
  "sourceLesson": "{source_label}"
}}"""


def _validate_checkpoint(raw: dict) -> dict:
    questions = raw.get("questions", [])
    assert isinstance(questions, list) and len(questions) == 3, "need exactly 3 questions"
    validated = []
    for q in questions:
        assert isinstance(q.get("question"), str) and q["question"], "question text required"
        options = q.get("options", {})
        assert isinstance(options, dict), "options must be dict"
        for letter in ("A", "B", "C", "D"):
            assert letter in options, f"option {letter} missing"
        assert q.get("correctAnswer") in ("A", "B", "C", "D"), "correctAnswer must be A/B/C/D"
        validated.append({
            "question": q["question"],
            "options": {k: str(v) for k, v in options.items() if k in ("A", "B", "C", "D")},
            "correctAnswer": q["correctAnswer"],
            "explanation": str(q.get("explanation") or ""),
            "difficulty": str(q.get("difficulty") or "medium"),
            "testsKeyPoint": str(q.get("testsKeyPoint") or ""),
        })
    return {
        "questions": validated,
        "passingScore": int(raw.get("passingScore") or 67),
        "sourceLesson": str(raw.get("sourceLesson") or "original lesson"),
    }


async def generate_checkpoint(
    lesson: dict,
    concept_name: str,
    subject_name: str,
    topic_name: str,
    source_label: str = "original lesson",
) -> dict[str, Any]:
    """Generate 3 MCQ questions from a saved lesson.
    
    Returns: {success, provider, checkpoint} or {success:False, error}
    """
    prompt = _build_checkpoint_prompt(lesson, concept_name, subject_name, topic_name, source_label)

    try:
        text, provider = await _call_with_fallback(
            prompt, system=_CHECKPOINT_SYSTEM, temperature=0.3, json_mode=True,
        )
        checkpoint = _validate_checkpoint(_parse_json(text))
        return {"success": True, "provider": provider, "checkpoint": checkpoint}
    except Exception as exc:
        logger.exception("generate_checkpoint failed: %s", exc)
        return {
            "success": False,
            "error": {
                "code": "AI_UNAVAILABLE",
                "message": "Checkpoint couldn't be generated right now. Please try again.",
            },
        }


# ─────────────────────────────────────────────────────────────────────────────
# 4. GENERATE RETEACHING
# ─────────────────────────────────────────────────────────────────────────────

async def generate_reteaching(ctx: dict) -> dict[str, Any]:
    """Generate a focused reteaching lesson for missed points.
    
    Same return shape as generate_lesson.
    """
    ctx["is_reteach"] = True
    return await generate_lesson(ctx)


# ─────────────────────────────────────────────────────────────────────────────
# 5. ASK CONCEPT QUESTION
# ─────────────────────────────────────────────────────────────────────────────

_ASK_SYSTEM = """You are PeerUP's curriculum-bound AI tutor.

Rules:
- Answer ONLY questions about the specific concept and lesson provided
- Do NOT introduce concepts from other lessons or topics
- Keep answers clear, concise, student-friendly (max 200 words)
- If the question is outside the concept scope, say so politely and redirect
- Never invent curriculum facts not present in the context

Answer in plain text (not JSON)."""


def _build_ask_prompt(question: str, ctx: dict) -> str:
    concept_name = ctx.get("concept_name", "")
    subject_name = ctx.get("subject_name", "")
    topic_name = ctx.get("topic_name", "")
    concept_explanation = ctx.get("concept_explanation", "")
    key_points = ctx.get("key_points", [])
    lesson_content = ctx.get("lesson_content", {})

    kp_text = "\n".join(f"- {kp}" for kp in key_points) if key_points else "(none)"
    lesson_summary = f"Lesson title: {lesson_content.get('title', '')}" if lesson_content else "(not generated yet)"

    return f"""You are helping a student who is studying this specific concept.

Subject: {subject_name}
Topic: {topic_name}
Concept: {concept_name}
Explanation: {concept_explanation}

Key Points:
{kp_text}

{lesson_summary}

Student's question: "{question}"

Answer based ONLY on the curriculum content above. Keep your answer clear and concise."""


async def ask_concept_question(question: str, ctx: dict) -> dict[str, Any]:
    """Answer a student question about a specific concept.
    
    ctx keys: concept_name, subject_name, topic_name, concept_explanation, key_points[], lesson_content
    Returns: {success, provider, answer} or {success:False, error}
    """
    prompt = _build_ask_prompt(question, ctx)

    try:
        text, provider = await _call_with_fallback(
            prompt, system=_ASK_SYSTEM, temperature=0.7, json_mode=False,
        )
        return {"success": True, "provider": provider, "answer": text.strip()}
    except Exception as exc:
        logger.exception("ask_concept_question failed: %s", exc)
        return {
            "success": False,
            "error": {
                "code": "AI_UNAVAILABLE",
                "message": "AI is temporarily unavailable. Please try again.",
            },
        }
