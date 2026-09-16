"""ORM models package. Importing this registers all tables on Base.metadata."""
from app.models.user import User
from app.models.chat import Conversation, Message
from app.models.match import MatchRequest
from app.models.learn import (
    Course, Lesson, Tutorial, VideoProgress,
    CourseEnrollment, SavedContent, LearnComment,
)
from app.models.progress import EarnedBadge, Certificate
from app.models.curriculum import (
    Subject, Topic, LearningObjective, Concept, Misconception,
    LearningActivity, Question, Resource,
    TopicProgress, ResourceDownload,
)
from app.models.solo_learning import (
    ConceptProgress as SoloConceptProgress, CheckpointAnswer, ExplanationAttempt,
    SyncSession, SyncWarmupAnswer, SyncQuizExchange, SyncGap,
)  # SoloConceptProgress maps to solo_concept_progress table (legacy sync system)
from app.models.concept_progress import ConceptProgress
from app.models.challenge_session import ChallengeSession

__all__ = [
    "User", "Conversation", "Message", "MatchRequest",
    "Course", "Lesson", "Tutorial", "VideoProgress",
    "CourseEnrollment", "SavedContent", "LearnComment",
    "EarnedBadge", "Certificate",
    # Curriculum
    "Subject", "Topic", "LearningObjective", "Concept", "Misconception",
    "LearningActivity", "Question", "Resource",
    "TopicProgress", "ResourceDownload",
    # Solo Learning + Sync (legacy)
    "SoloConceptProgress", "CheckpointAnswer", "ExplanationAttempt",
    "SyncSession", "SyncWarmupAnswer", "SyncQuizExchange", "SyncGap",
    # New Sequential Learning
    "ConceptProgress",
    "ChallengeSession",
]
