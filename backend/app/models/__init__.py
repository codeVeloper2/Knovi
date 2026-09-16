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

__all__ = [
    "User", "Conversation", "Message", "MatchRequest",
    "Course", "Lesson", "Tutorial", "VideoProgress",
    "CourseEnrollment", "SavedContent", "LearnComment",
    "EarnedBadge", "Certificate",
    # Curriculum
    "Subject", "Topic", "LearningObjective", "Concept", "Misconception",
    "LearningActivity", "Question", "Resource",
    "TopicProgress", "ResourceDownload",
]
