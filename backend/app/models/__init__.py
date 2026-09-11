"""ORM models package. Importing this registers all tables on Base.metadata."""
from app.models.user import User
from app.models.chat import Conversation, Message
from app.models.match import MatchRequest
from app.models.room import StudyRoom, RoomMaterial
from app.models.learn import (
    Course, Lesson, Tutorial, VideoProgress,
    CourseEnrollment, SavedContent, LearnComment,
)
from app.models.progress import EarnedBadge, Certificate

__all__ = [
    "User", "Conversation", "Message", "MatchRequest", "StudyRoom", "RoomMaterial",
    "Course", "Lesson", "Tutorial", "VideoProgress",
    "CourseEnrollment", "SavedContent", "LearnComment",
    "EarnedBadge", "Certificate",
]
