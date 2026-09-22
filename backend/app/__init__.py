"""ORM models package. Importing this registers all tables on Base.metadata."""
from app.models.user import User
from app.models.chat import Conversation, Message
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
from app.models.challenge import ChallengeSession, ChallengeQuestion, ChallengeAnswer, ChallengeResult
from app.models.ai_learning import (
    AILearningSession,
    AISessionMessage,
    AISessionTeaching,
    AISessionStudyPeriod,
    AISessionQuestion,
    AISessionAnswer,
    AISessionTeachingAttempt,
    AISessionIntegrityEvent,
    AISessionSummary,
)

__all__ = [
    # Auth / social
    "User", "Conversation", "Message",
    # Legacy video learn
    "Course", "Lesson", "Tutorial", "VideoProgress",
    "CourseEnrollment", "SavedContent", "LearnComment",
    # Progress / gamification
    "EarnedBadge", "Certificate",
    # Curriculum
    "Subject", "Topic", "LearningObjective", "Concept", "Misconception",
    "LearningActivity", "Question", "Resource",
    "TopicProgress", "ResourceDownload",
    # AI Learning Sessions
    "AILearningSession", "AISessionMessage", "AISessionTeaching",
    "AISessionStudyPeriod", "AISessionQuestion", "AISessionAnswer",
    "AISessionTeachingAttempt", "AISessionIntegrityEvent", "AISessionSummary",
    # AI Quiz Battle
    "ChallengeSession", "ChallengeQuestion", "ChallengeAnswer", "ChallengeResult",
]
