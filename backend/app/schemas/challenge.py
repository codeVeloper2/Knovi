"""Pydantic contracts for the PeerUP AI Quiz Battle API."""
from __future__ import annotations

from enum import Enum
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.schemas.base import StrictModel


class ChallengeStatus(str, Enum):
    CREATED = "created"
    PENDING = "pending"
    ACCEPTED = "accepted"
    PREPARING = "preparing"
    WAITING = "waiting"
    COUNTDOWN = "countdown"
    QUESTION_ACTIVE = "question_active"
    WAITING_FOR_OPPONENT = "waiting_for_opponent"
    QUESTION_REVEAL = "question_reveal"
    NEXT_QUESTION = "next_question"
    COMPLETED = "completed"
    DECLINED = "declined"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class ChallengeDifficulty(str, Enum):
    EASY = "easy"
    MEDIUM = "medium"
    HARD = "hard"


class ChallengeCreateRequest(StrictModel):
    opponent_id: int = Field(gt=0)
    subject_id: int = Field(gt=0)
    topic_id: int = Field(gt=0)
    concept_id: int = Field(gt=0)
    question_count: int = Field(default=5, ge=3, le=10)


class ChallengeQuestionPublic(BaseModel):
    id: int
    questionNumber: int
    objectiveId: int
    question: str
    options: dict[str, str]
    difficulty: str
    hasSubmitted: bool = False
    answer: Optional[str] = None
    isCorrect: Optional[bool] = None
    timedOut: Optional[bool] = None
    responseTimeMs: Optional[int] = None
    correctAnswer: Optional[str] = None
    explanation: Optional[str] = None
    revealAnswers: list[dict[str, Any]] = Field(default_factory=list)


class ChallengeOpponentSummary(BaseModel):
    id: int
    displayName: str
    photoURL: str = ""
    isOnline: bool = False


class ChallengeScoreSnapshot(BaseModel):
    userId: int
    score: int
    questionsRevealed: int
    accuracy: int


class ChallengeOut(BaseModel):
    id: int
    role: Literal["challenger", "opponent"]
    status: ChallengeStatus
    subjectId: int
    topicId: int
    conceptId: int
    subjectName: str
    topicName: str
    conceptName: str
    questionCount: int
    currentQuestion: int
    createdAt: str
    acceptedAt: Optional[str] = None
    startedAt: Optional[str] = None
    expiresAt: Optional[str] = None
    countdownStartedAt: Optional[str] = None
    questionStartedAt: Optional[str] = None
    questionDeadlineAt: Optional[str] = None
    ready: bool
    opponentReady: bool
    opponent: ChallengeOpponentSummary
    currentQuestionData: Optional[ChallengeQuestionPublic] = None
    scores: list[ChallengeScoreSnapshot] = Field(default_factory=list)
    waitingReason: Optional[str] = None
    preparationError: Optional[str] = None


class ChallengeListItem(BaseModel):
    id: int
    role: Literal["challenger", "opponent"]
    status: ChallengeStatus
    conceptId: int
    conceptName: str
    subjectName: str
    opponent: ChallengeOpponentSummary
    questionCount: int
    currentQuestion: int
    createdAt: str
    completedAt: Optional[str] = None


class ChallengeListOut(BaseModel):
    items: list[ChallengeListItem]
    total: int


class ChallengeActionOut(BaseModel):
    challenge: ChallengeOut
    message: str


class ChallengeAnswerRequest(StrictModel):
    answer: str = Field(min_length=1, max_length=1)

    @field_validator("answer")
    @classmethod
    def normalize_answer(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in {"A", "B", "C", "D"}:
            raise ValueError("answer must be one of A, B, C, or D")
        return value


class ChallengeAnswerAck(BaseModel):
    challengeId: int
    questionId: int
    status: Literal["submitted", "waiting_for_opponent"]
    message: str


class ChallengePlayerResult(BaseModel):
    userId: int
    score: int
    accuracy: int
    questionsAnswered: int
    totalQuestions: int


class ChallengeResultOut(BaseModel):
    challengeId: int
    status: ChallengeStatus
    score: int
    accuracy: int
    questionsAnswered: int
    totalQuestions: int
    weakAreas: list[dict[str, Any]]
    summary: str
    opponent: ChallengePlayerResult
    perQuestion: list[dict[str, Any]]
    completedAt: Optional[str] = None


class ChallengeReviewOut(BaseModel):
    challengeId: int
    status: ChallengeStatus
    questions: list[dict[str, Any]]
    finalScores: list[ChallengePlayerResult]


# WebSocket contracts. Client events are deliberately narrow.
class ChallengeWSReadyEvent(StrictModel):
    type: Literal["ready"]


class ChallengeWSReconnectEvent(StrictModel):
    type: Literal["reconnect"]


class ChallengeWSHeartbeatEvent(StrictModel):
    type: Literal["heartbeat"]


class ChallengeWSAnswerEvent(StrictModel):
    type: Literal["answer"]
    questionId: int = Field(gt=0)
    answer: str = Field(min_length=1, max_length=1)

    @field_validator("answer")
    @classmethod
    def normalize_answer(cls, value: str) -> str:
        value = value.strip().upper()
        if value not in {"A", "B", "C", "D"}:
            raise ValueError("answer must be one of A, B, C, or D")
        return value


class ChallengeWSServerEvent(BaseModel):
    type: str
    data: dict[str, Any] = Field(default_factory=dict)


class ChallengeBlueprintObjective(BaseModel):
    objectiveId: int
    title: str
    description: str


class ChallengeStudentEvidence(BaseModel):
    sourceSessionId: int
    objectiveIds: list[int] = Field(default_factory=list)
    weakAreas: list[str] = Field(default_factory=list)
    misconceptions: list[str] = Field(default_factory=list)
    evidence: list[str] = Field(default_factory=list)


class ChallengeBlueprint(BaseModel):
    conceptId: int
    topicId: int
    subjectId: int
    questionCount: int
    sharedObjectives: list[ChallengeBlueprintObjective]
    focusAreas: list[str]
    difficultyDistribution: dict[ChallengeDifficulty, int]
    studentContext: dict[str, ChallengeStudentEvidence]

    @model_validator(mode="after")
    def validate_distribution(self) -> "ChallengeBlueprint":
        if sum(self.difficultyDistribution.values()) != self.questionCount:
            raise ValueError("difficulty distribution must sum to question_count")
        return self


class GeneratedQuestionOption(BaseModel):
    label: Literal["A", "B", "C", "D"]
    text: str = Field(min_length=1, max_length=1200)


class GeneratedChallengeQuestion(BaseModel):
    questionNumber: int = Field(ge=1, le=10)
    objectiveId: int = Field(gt=0)
    question: str = Field(min_length=1, max_length=3000)
    options: list[GeneratedQuestionOption]
    correctAnswer: Literal["A", "B", "C", "D"]
    explanation: str = Field(min_length=1, max_length=2000)
    difficulty: ChallengeDifficulty

    @model_validator(mode="after")
    def validate_options(self) -> "GeneratedChallengeQuestion":
        labels = [item.label for item in self.options]
        if labels != ["A", "B", "C", "D"]:
            raise ValueError("options must contain exactly A, B, C, D in order")
        texts = [item.text.strip() for item in self.options]
        if len(set(t.casefold() for t in texts)) != 4:
            raise ValueError("options must be distinct")
        return self


class GeneratedQuestionSet(BaseModel):
    questions: list[GeneratedChallengeQuestion] = Field(min_length=1, max_length=10)


class AIQuestionValidationItem(BaseModel):
    questionNumber: int = Field(ge=1, le=10)
    objectiveAligned: bool
    answerDefensible: bool
    unambiguous: bool
    inScope: bool
    duplicate: bool = False
    notes: str = ""


class AIQuestionValidationSet(BaseModel):
    results: list[AIQuestionValidationItem] = Field(min_length=1, max_length=10)


class ChallengeInternalState(BaseModel):
    """Serializable internal state used by service tests/runtime; not an API contract."""
    model_config = ConfigDict(extra="forbid")

    challengeId: int
    status: ChallengeStatus
    currentQuestion: int
    questionDeadlineAt: Optional[str] = None
