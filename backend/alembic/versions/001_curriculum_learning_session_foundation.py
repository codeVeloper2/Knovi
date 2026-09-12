"""Curriculum and learning session foundation

Revision ID: 001_curriculum
Revises:
Create Date: 2026-09-12 00:00:00.000000
"""
from __future__ import annotations
import datetime
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "001_curriculum"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Add role column to existing users table
    op.add_column("users", sa.Column(
        "role", sa.String(length=20), nullable=False, server_default="student"
    ))

    # 2. subjects
    op.create_table(
        "subjects",
        sa.Column("id",          sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("name",        sa.String(120), nullable=False),
        sa.Column("slug",        sa.String(120), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("icon",        sa.String(120), nullable=True),
        sa.Column("is_active",   sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at",  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint("name", name="uq_subjects_name"),
        sa.UniqueConstraint("slug", name="uq_subjects_slug"),
    )
    op.create_index("idx_subjects_slug", "subjects", ["slug"])

    # 3. topics
    op.create_table(
        "topics",
        sa.Column("id",          sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("subject_id",  sa.Integer(), nullable=False),
        sa.Column("name",        sa.String(200), nullable=False),
        sa.Column("slug",        sa.String(200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("difficulty",  sa.String(40), nullable=True),
        sa.Column("is_active",   sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at",  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["subject_id"], ["subjects.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("subject_id", "slug", name="uq_topic_subject_slug"),
    )
    op.create_index("idx_topics_subject_id", "topics", ["subject_id"])

    # 4. learning_objectives
    op.create_table(
        "learning_objectives",
        sa.Column("id",          sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("topic_id",    sa.Integer(), nullable=False),
        sa.Column("title",       sa.String(300), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at",  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_learning_objectives_topic_id", "learning_objectives", ["topic_id"])

    # 5. concepts
    op.create_table(
        "concepts",
        sa.Column("id",          sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("topic_id",    sa.Integer(), nullable=False),
        sa.Column("name",        sa.String(200), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("key_points",  postgresql.JSONB(astext_type=sa.Text()), nullable=False, server_default="[]"),
        sa.Column("created_at",  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_concepts_topic_id", "concepts", ["topic_id"])

    # 6. misconceptions
    op.create_table(
        "misconceptions",
        sa.Column("id",            sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("topic_id",      sa.Integer(), nullable=False),
        sa.Column("concept_id",    sa.Integer(), nullable=True),
        sa.Column("misconception", sa.Text(), nullable=False),
        sa.Column("correction",    sa.Text(), nullable=False),
        sa.Column("hint",          sa.Text(), nullable=False),
        sa.Column("created_at",    sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",    sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["topic_id"],   ["topics.id"],   ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["concept_id"], ["concepts.id"], ondelete="SET NULL"),
    )
    op.create_index("idx_misconceptions_topic_id",   "misconceptions", ["topic_id"])
    op.create_index("idx_misconceptions_concept_id", "misconceptions", ["concept_id"])

    # 7. learning_activities
    op.create_table(
        "learning_activities",
        sa.Column("id",          sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("topic_id",    sa.Integer(), nullable=False),
        sa.Column("type",        sa.String(40), nullable=False),
        sa.Column("title",       sa.String(300), nullable=False),
        sa.Column("prompt",      sa.Text(), nullable=True),
        sa.Column("order_index", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("metadata",    postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at",  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",  sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_learning_activities_topic_id", "learning_activities", ["topic_id"])

    # 8. questions
    op.create_table(
        "questions",
        sa.Column("id",            sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("topic_id",      sa.Integer(), nullable=False),
        sa.Column("activity_id",   sa.Integer(), nullable=True),
        sa.Column("question",      sa.Text(), nullable=False),
        sa.Column("question_type", sa.String(40), nullable=False),
        sa.Column("difficulty",    sa.String(40), nullable=False),
        sa.Column("answer",        sa.Text(), nullable=True),
        sa.Column("explanation",   sa.Text(), nullable=True),
        sa.Column("hint",          sa.Text(), nullable=True),
        sa.Column("options",       postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at",    sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",    sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["topic_id"],    ["topics.id"],              ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["activity_id"], ["learning_activities.id"], ondelete="SET NULL"),
    )
    op.create_index("idx_questions_topic_id",    "questions", ["topic_id"])
    op.create_index("idx_questions_activity_id", "questions", ["activity_id"])

    # 9. resources
    op.create_table(
        "resources",
        sa.Column("id",              sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("topic_id",        sa.Integer(), nullable=True),
        sa.Column("title",           sa.String(300), nullable=False),
        sa.Column("description",     sa.Text(), nullable=True),
        sa.Column("type",            sa.String(40), nullable=False),
        sa.Column("url",             sa.Text(), nullable=True),
        sa.Column("file_url",        sa.Text(), nullable=True),
        sa.Column("thumbnail_url",   sa.Text(), nullable=True),
        sa.Column("duration",        sa.String(40), nullable=True),
        sa.Column("is_downloadable", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("source",          sa.String(200), nullable=True),
        sa.Column("is_verified",     sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("created_by",      sa.Integer(), nullable=True),
        sa.Column("created_at",      sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",      sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["topic_id"],   ["topics.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by"], ["users.id"],  ondelete="SET NULL"),
    )
    op.create_index("idx_resources_topic_id",   "resources", ["topic_id"])
    op.create_index("idx_resources_created_by", "resources", ["created_by"])

    # 10. learning_sessions
    op.create_table(
        "learning_sessions",
        sa.Column("id",            sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("creator_id",    sa.Integer(), nullable=False),
        sa.Column("partner_id",    sa.Integer(), nullable=False),
        sa.Column("topic_id",      sa.Integer(), nullable=False),
        sa.Column("goal",          sa.Text(), nullable=False),
        sa.Column("status",        sa.String(20), nullable=False, server_default="pending"),
        sa.Column("current_stage", sa.String(20), nullable=False, server_default="learn"),
        sa.Column("started_at",    sa.DateTime(timezone=True), nullable=True),
        sa.Column("completed_at",  sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at",    sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",    sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["creator_id"], ["users.id"],  ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["partner_id"], ["users.id"],  ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"],   ["topics.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_learning_sessions_creator", "learning_sessions", ["creator_id"])
    op.create_index("idx_learning_sessions_partner", "learning_sessions", ["partner_id"])
    op.create_index("idx_learning_sessions_topic",   "learning_sessions", ["topic_id"])
    op.create_index("idx_learning_sessions_status",  "learning_sessions", ["status"])

    # 11. session_activity_results
    op.create_table(
        "session_activity_results",
        sa.Column("id",             sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("session_id",     sa.Integer(), nullable=False),
        sa.Column("user_id",        sa.Integer(), nullable=False),
        sa.Column("activity_id",    sa.Integer(), nullable=False),
        sa.Column("response",       sa.Text(), nullable=True),
        sa.Column("is_correct",     sa.Boolean(), nullable=True),
        sa.Column("ai_feedback",    sa.Text(), nullable=True),
        sa.Column("hint",           sa.Text(), nullable=True),
        sa.Column("retry",          sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("attempt_number", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("score",          sa.Integer(), nullable=True),
        sa.Column("created_at",     sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",     sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["session_id"],  ["learning_sessions.id"],   ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"],     ["users.id"],               ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["activity_id"], ["learning_activities.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_sar_session_id",  "session_activity_results", ["session_id"])
    op.create_index("idx_sar_user_id",     "session_activity_results", ["user_id"])
    op.create_index("idx_sar_activity_id", "session_activity_results", ["activity_id"])

    # 12. topic_progress
    op.create_table(
        "topic_progress",
        sa.Column("id",                  sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id",             sa.Integer(), nullable=False),
        sa.Column("topic_id",            sa.Integer(), nullable=False),
        sa.Column("understanding_score", sa.Integer(), nullable=True),
        sa.Column("practice_score",      sa.Integer(), nullable=True),
        sa.Column("sessions_completed",  sa.Integer(), nullable=False, server_default="0"),
        sa.Column("needs_review",        sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("last_studied_at",     sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at",          sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at",          sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"],  ["users.id"],  ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["topic_id"], ["topics.id"], ondelete="CASCADE"),
        sa.UniqueConstraint("user_id", "topic_id", name="uq_topic_progress_user_topic"),
    )
    op.create_index("idx_topic_progress_user_id",  "topic_progress", ["user_id"])
    op.create_index("idx_topic_progress_topic_id", "topic_progress", ["topic_id"])

    # 13. resource_downloads
    op.create_table(
        "resource_downloads",
        sa.Column("id",            sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("user_id",       sa.Integer(), nullable=False),
        sa.Column("resource_id",   sa.Integer(), nullable=False),
        sa.Column("downloaded_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.ForeignKeyConstraint(["user_id"],     ["users.id"],     ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["resource_id"], ["resources.id"], ondelete="CASCADE"),
    )
    op.create_index("idx_resource_downloads_user",     "resource_downloads", ["user_id"])
    op.create_index("idx_resource_downloads_resource", "resource_downloads", ["resource_id"])

    # 14. Seed: initial subjects
    now = datetime.datetime.now(datetime.timezone.utc)
    subjects_table = sa.table(
        "subjects",
        sa.column("name",        sa.String),
        sa.column("slug",        sa.String),
        sa.column("description", sa.Text),
        sa.column("is_active",   sa.Boolean),
        sa.column("created_at",  sa.DateTime),
        sa.column("updated_at",  sa.DateTime),
    )
    op.bulk_insert(subjects_table, [
        {"name": "Mathematics", "slug": "mathematics",
         "description": "Numbers, algebra, geometry, calculus and beyond.",
         "is_active": True, "created_at": now, "updated_at": now},
        {"name": "Physics",     "slug": "physics",
         "description": "The fundamental laws governing the physical universe.",
         "is_active": True, "created_at": now, "updated_at": now},
        {"name": "Chemistry",   "slug": "chemistry",
         "description": "The science of matter, reactions and molecular structure.",
         "is_active": True, "created_at": now, "updated_at": now},
    ])


def downgrade() -> None:
    # Drop in reverse dependency order
    op.drop_table("resource_downloads")
    op.drop_table("topic_progress")
    op.drop_table("session_activity_results")
    op.drop_table("learning_sessions")
    op.drop_table("resources")
    op.drop_table("questions")
    op.drop_table("learning_activities")
    op.drop_table("misconceptions")
    op.drop_table("concepts")
    op.drop_table("learning_objectives")
    op.drop_table("topics")
    op.drop_table("subjects")
    op.drop_column("users", "role")
