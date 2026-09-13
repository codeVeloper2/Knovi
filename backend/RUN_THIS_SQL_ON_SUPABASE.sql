-- ============================================================
-- PeerUP — Complete Database Schema
-- Run this once in the Supabase SQL Editor.
-- All statements are idempotent (IF NOT EXISTS).
-- Do NOT drop existing tables.
-- ============================================================


-- ── 1. USERS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
    id                            SERIAL PRIMARY KEY,
    email                         VARCHAR(255) UNIQUE NOT NULL,
    hashed_password               VARCHAR(255),
    firebase_uid                  VARCHAR(128) UNIQUE,
    provider                      VARCHAR(20)  NOT NULL DEFAULT 'password',
    role                          VARCHAR(20)  NOT NULL DEFAULT 'student',
    email_verified                BOOLEAN      NOT NULL DEFAULT FALSE,
    verification_code             VARCHAR(255),
    code_expires_at               TIMESTAMPTZ,
    reset_code                    VARCHAR(255),
    reset_code_expires_at         TIMESTAMPTZ,
    full_name                     VARCHAR(120) NOT NULL DEFAULT '',
    photo_url                     TEXT         NOT NULL DEFAULT '',
    grade                         VARCHAR(40)  NOT NULL DEFAULT '',
    subjects_good_at              TEXT[]       NOT NULL DEFAULT '{}',
    subjects_need_help            TEXT[]       NOT NULL DEFAULT '{}',
    skill_level                   VARCHAR(40)  NOT NULL DEFAULT '',
    language                      VARCHAR(60)  NOT NULL DEFAULT '',
    bio                           TEXT         NOT NULL DEFAULT '',
    location                      VARCHAR(100) NOT NULL DEFAULT '',
    is_online                     BOOLEAN      NOT NULL DEFAULT FALSE,
    rating                        INTEGER      NOT NULL DEFAULT 0,
    review_count                  INTEGER      NOT NULL DEFAULT 0,
    session_count                 INTEGER      NOT NULL DEFAULT 0,
    xp                            INTEGER      NOT NULL DEFAULT 0,
    streak_days                   INTEGER      NOT NULL DEFAULT 0,
    last_activity_date            TIMESTAMPTZ,
    is_public                     BOOLEAN      NOT NULL DEFAULT TRUE,
    allow_direct_message          BOOLEAN      NOT NULL DEFAULT TRUE,
    agreed_to_learning_agreement  BOOLEAN      NOT NULL DEFAULT FALSE,
    agreement_accepted_at         TIMESTAMPTZ,
    profile_complete              BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at                    TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at                    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_email       ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_firebase_uid ON users(firebase_uid);


-- ── 2. CONVERSATIONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversations (
    id          BIGSERIAL PRIMARY KEY,
    user_a_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_b_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    goal        TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_conversation_pair UNIQUE (user_a_id, user_b_id)
);

CREATE INDEX IF NOT EXISTS idx_conversations_user_a ON conversations(user_a_id);
CREATE INDEX IF NOT EXISTS idx_conversations_user_b ON conversations(user_b_id);


-- ── 3. MESSAGES ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS messages (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT      NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id       BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    body            TEXT        NOT NULL,
    iv              TEXT,
    tag             TEXT,
    message_type    VARCHAR(20) NOT NULL DEFAULT 'text',
    file_url        TEXT,
    file_name       TEXT,
    file_size       BIGINT,
    read_by         BIGINT[]    NOT NULL DEFAULT '{}',
    reactions       JSONB,
    is_deleted      BOOLEAN     NOT NULL DEFAULT FALSE,
    hidden_for      BIGINT[]    NOT NULL DEFAULT '{}',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id);


-- ── 4. MATCH REQUESTS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS match_requests (
    id          SERIAL PRIMARY KEY,
    sender_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    receiver_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    mode        VARCHAR(20),
    subject     VARCHAR(100),
    message     TEXT,
    status      VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_match_requests_sender   ON match_requests(sender_id);
CREATE INDEX IF NOT EXISTS idx_match_requests_receiver ON match_requests(receiver_id);


-- ── 5. STUDY ROOMS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS study_rooms (
    id              BIGSERIAL PRIMARY KEY,
    conversation_id BIGINT      REFERENCES conversations(id) ON DELETE SET NULL,
    creator_id      BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    partner_id      BIGINT      REFERENCES users(id) ON DELETE SET NULL,
    goal            TEXT,
    subject         VARCHAR(100),
    role            VARCHAR(20),
    status          VARCHAR(20) NOT NULL DEFAULT 'active',
    notes           TEXT,
    whiteboard      JSONB,
    rating          INTEGER,
    ended_at        TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_study_rooms_conv    ON study_rooms(conversation_id);
CREATE INDEX IF NOT EXISTS idx_study_rooms_creator ON study_rooms(creator_id);


-- ── 6. ROOM MATERIALS ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS room_materials (
    id          BIGSERIAL PRIMARY KEY,
    room_id     BIGINT      NOT NULL REFERENCES study_rooms(id) ON DELETE CASCADE,
    uploader_id BIGINT      NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name        VARCHAR(300) NOT NULL,
    url         TEXT        NOT NULL,
    type        VARCHAR(20) NOT NULL DEFAULT 'link',
    file_size   BIGINT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_room_materials_room ON room_materials(room_id);


-- ── 7. LEARN COURSES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learn_courses (
    id           SERIAL PRIMARY KEY,
    title        VARCHAR(300) NOT NULL,
    description  TEXT,
    subject      VARCHAR(100),
    creator_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    is_official  BOOLEAN     NOT NULL DEFAULT FALSE,
    thumbnail    TEXT,
    rating       NUMERIC(3,1) NOT NULL DEFAULT 0,
    is_published BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── 8. LEARN LESSONS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learn_lessons (
    id               SERIAL PRIMARY KEY,
    course_id        INTEGER NOT NULL REFERENCES learn_courses(id) ON DELETE CASCADE,
    title            VARCHAR(300) NOT NULL,
    description      TEXT,
    video_url        TEXT,
    duration_seconds INTEGER NOT NULL DEFAULT 0,
    "order"          INTEGER NOT NULL DEFAULT 0,
    is_free          BOOLEAN NOT NULL DEFAULT TRUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── 9. LEARN TUTORIALS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS learn_tutorials (
    id           SERIAL PRIMARY KEY,
    creator_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
    title        VARCHAR(300) NOT NULL,
    description  TEXT,
    subject      VARCHAR(100),
    video_url    TEXT,
    thumbnail    TEXT,
    duration_sec INTEGER NOT NULL DEFAULT 0,
    views        INTEGER NOT NULL DEFAULT 0,
    likes        INTEGER NOT NULL DEFAULT 0,
    status       VARCHAR(20) NOT NULL DEFAULT 'approved',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── 10. LEARN VIDEO PROGRESS ────────────────────────────────
CREATE TABLE IF NOT EXISTS learn_video_progress (
    id               SERIAL PRIMARY KEY,
    user_id          INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    lesson_id        INTEGER REFERENCES learn_lessons(id) ON DELETE CASCADE,
    tutorial_id      INTEGER REFERENCES learn_tutorials(id) ON DELETE CASCADE,
    position_seconds INTEGER NOT NULL DEFAULT 0,
    percentage       NUMERIC(5,2) NOT NULL DEFAULT 0,
    completed        BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── 11. LEARN COURSE ENROLLMENTS ────────────────────────────
CREATE TABLE IF NOT EXISTS learn_course_enrollments (
    id          SERIAL PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id   INTEGER NOT NULL REFERENCES learn_courses(id) ON DELETE CASCADE,
    enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_enrollment UNIQUE (user_id, course_id)
);


-- ── 12. LEARN SAVED ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS learn_saved (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type VARCHAR(20) NOT NULL,
    content_id   INTEGER NOT NULL,
    saved_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_saved UNIQUE (user_id, content_type, content_id)
);


-- ── 13. LEARN COMMENTS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS learn_comments (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content_type VARCHAR(20) NOT NULL,
    content_id   INTEGER NOT NULL,
    parent_id    INTEGER REFERENCES learn_comments(id) ON DELETE CASCADE,
    body         TEXT NOT NULL,
    likes        INTEGER NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- ── 14. EARNED BADGES ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS earned_badges (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    badge_id   VARCHAR(60) NOT NULL,
    earned_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_earned_badge_user_badge UNIQUE (user_id, badge_id)
);

CREATE INDEX IF NOT EXISTS idx_earned_badges_user ON earned_badges(user_id);


-- ── 15. CERTIFICATES ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS certificates (
    id           SERIAL PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id    INTEGER NOT NULL REFERENCES learn_courses(id) ON DELETE CASCADE,
    issued_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_certificate_user_course UNIQUE (user_id, course_id)
);

CREATE INDEX IF NOT EXISTS idx_certificates_user ON certificates(user_id);


-- ══════════════════════════════════════════════════════════════
-- CURRICULUM TABLES
-- ══════════════════════════════════════════════════════════════


-- ── 16. SUBJECTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subjects (
    id          SERIAL PRIMARY KEY,
    name        VARCHAR(120) UNIQUE NOT NULL,
    slug        VARCHAR(120) UNIQUE NOT NULL,
    description TEXT,
    icon        VARCHAR(120),
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Patch existing subjects table if it was created by an older schema
-- (missing created_at / updated_at columns).
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE subjects ADD COLUMN IF NOT EXISTS is_active  BOOLEAN     NOT NULL DEFAULT TRUE;

-- Back-fill NULLs that existed before the columns were added.
UPDATE subjects SET created_at = NOW() WHERE created_at IS NULL;
UPDATE subjects SET updated_at = NOW() WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_subjects_slug ON subjects(slug);


-- ── 17. TOPICS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS topics (
    id          SERIAL PRIMARY KEY,
    subject_id  INTEGER NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    slug        VARCHAR(200) NOT NULL,
    description TEXT,
    difficulty  VARCHAR(40),
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_topic_subject_slug UNIQUE (subject_id, slug)
);

-- Patch older schema missing columns
ALTER TABLE topics ADD COLUMN IF NOT EXISTS slug        VARCHAR(200) NOT NULL DEFAULT '';
ALTER TABLE topics ADD COLUMN IF NOT EXISTS is_active   BOOLEAN      NOT NULL DEFAULT TRUE;
ALTER TABLE topics ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW();
ALTER TABLE topics ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW();
UPDATE topics SET created_at = NOW() WHERE created_at IS NULL;
UPDATE topics SET updated_at = NOW() WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_topics_subject ON topics(subject_id);


-- ── 18. LEARNING OBJECTIVES ─────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_objectives (
    id          SERIAL PRIMARY KEY,
    topic_id    INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    title       VARCHAR(300) NOT NULL,
    description TEXT        NOT NULL,
    order_index INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE learning_objectives ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE learning_objectives ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE learning_objectives SET created_at = NOW() WHERE created_at IS NULL;
UPDATE learning_objectives SET updated_at = NOW() WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_learning_objectives_topic ON learning_objectives(topic_id);


-- ── 19. CONCEPTS ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS concepts (
    id          SERIAL PRIMARY KEY,
    topic_id    INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    name        VARCHAR(200) NOT NULL,
    explanation TEXT        NOT NULL,
    key_points  JSONB       NOT NULL DEFAULT '[]',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE concepts ADD COLUMN IF NOT EXISTS key_points JSONB NOT NULL DEFAULT '[]';
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE concepts ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE concepts SET created_at = NOW() WHERE created_at IS NULL;
UPDATE concepts SET updated_at = NOW() WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_concepts_topic ON concepts(topic_id);


-- ── 20. MISCONCEPTIONS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS misconceptions (
    id            SERIAL PRIMARY KEY,
    topic_id      INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    concept_id    INTEGER REFERENCES concepts(id) ON DELETE SET NULL,
    misconception TEXT    NOT NULL,
    correction    TEXT    NOT NULL,
    hint          TEXT    NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE misconceptions ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE misconceptions ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE misconceptions SET created_at = NOW() WHERE created_at IS NULL;
UPDATE misconceptions SET updated_at = NOW() WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_misconceptions_topic   ON misconceptions(topic_id);
CREATE INDEX IF NOT EXISTS idx_misconceptions_concept ON misconceptions(concept_id);


-- ── 21. LEARNING ACTIVITIES ─────────────────────────────────
-- Column is named "metadata" in the DB (mapped to activity_metadata in Python).
CREATE TABLE IF NOT EXISTS learning_activities (
    id          SERIAL PRIMARY KEY,
    topic_id    INTEGER      NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    type        VARCHAR(40)  NOT NULL,
    title       VARCHAR(300) NOT NULL,
    prompt      TEXT,
    order_index INTEGER      NOT NULL DEFAULT 0,
    metadata    JSONB,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

ALTER TABLE learning_activities ADD COLUMN IF NOT EXISTS metadata   JSONB;
ALTER TABLE learning_activities ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE learning_activities ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE learning_activities SET created_at = NOW() WHERE created_at IS NULL;
UPDATE learning_activities SET updated_at = NOW() WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_learning_activities_topic ON learning_activities(topic_id);


-- ── 22. QUESTIONS ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS questions (
    id            SERIAL PRIMARY KEY,
    topic_id      INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    activity_id   INTEGER REFERENCES learning_activities(id) ON DELETE SET NULL,
    question      TEXT        NOT NULL,
    question_type VARCHAR(40) NOT NULL,
    difficulty    VARCHAR(40) NOT NULL,
    answer        TEXT,
    explanation   TEXT,
    hint          TEXT,
    options       JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE questions ADD COLUMN IF NOT EXISTS activity_id INTEGER REFERENCES learning_activities(id) ON DELETE SET NULL;
ALTER TABLE questions ADD COLUMN IF NOT EXISTS created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE questions ADD COLUMN IF NOT EXISTS updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE questions SET created_at = NOW() WHERE created_at IS NULL;
UPDATE questions SET updated_at = NOW() WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_questions_topic    ON questions(topic_id);
CREATE INDEX IF NOT EXISTS idx_questions_activity ON questions(activity_id);


-- ── 23. RESOURCES ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resources (
    id              SERIAL PRIMARY KEY,
    topic_id        INTEGER REFERENCES topics(id) ON DELETE SET NULL,
    title           VARCHAR(300) NOT NULL,
    description     TEXT,
    type            VARCHAR(40) NOT NULL,
    url             TEXT,
    file_url        TEXT,
    thumbnail_url   TEXT,
    duration        VARCHAR(40),
    is_downloadable BOOLEAN     NOT NULL DEFAULT FALSE,
    source          VARCHAR(200),
    is_verified     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE resources ADD COLUMN IF NOT EXISTS file_url        TEXT;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS thumbnail_url   TEXT;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_downloadable BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS is_verified     BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE resources ADD COLUMN IF NOT EXISTS created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE resources ADD COLUMN IF NOT EXISTS updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW();
UPDATE resources SET created_at = NOW() WHERE created_at IS NULL;
UPDATE resources SET updated_at = NOW() WHERE updated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_resources_topic ON resources(topic_id);


-- ── 24. LEARNING SESSIONS ───────────────────────────────────
CREATE TABLE IF NOT EXISTS learning_sessions (
    id            SERIAL PRIMARY KEY,
    creator_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    partner_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_id      INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    goal          TEXT    NOT NULL,
    status        VARCHAR(20) NOT NULL DEFAULT 'pending',
    current_stage VARCHAR(20) NOT NULL DEFAULT 'learn',
    started_at    TIMESTAMPTZ,
    completed_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_learning_sessions_creator ON learning_sessions(creator_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_partner ON learning_sessions(partner_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_topic   ON learning_sessions(topic_id);
CREATE INDEX IF NOT EXISTS idx_learning_sessions_status  ON learning_sessions(status);


-- ── 25. SESSION ACTIVITY RESULTS ────────────────────────────
CREATE TABLE IF NOT EXISTS session_activity_results (
    id             SERIAL PRIMARY KEY,
    session_id     INTEGER NOT NULL REFERENCES learning_sessions(id) ON DELETE CASCADE,
    user_id        INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    activity_id    INTEGER REFERENCES learning_activities(id) ON DELETE SET NULL,
    response       TEXT,
    is_correct     BOOLEAN,
    ai_feedback    TEXT,
    hint           TEXT,
    retry          BOOLEAN NOT NULL DEFAULT FALSE,
    attempt_number INTEGER NOT NULL DEFAULT 1,
    score          NUMERIC(5,2),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_session_results_session ON session_activity_results(session_id);
CREATE INDEX IF NOT EXISTS idx_session_results_user    ON session_activity_results(user_id);


-- ── 26. TOPIC PROGRESS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS topic_progress (
    id                  SERIAL PRIMARY KEY,
    user_id             INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    topic_id            INTEGER NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
    understanding_score NUMERIC(5,2) NOT NULL DEFAULT 0,
    practice_score      NUMERIC(5,2) NOT NULL DEFAULT 0,
    sessions_completed  INTEGER      NOT NULL DEFAULT 0,
    needs_review        BOOLEAN      NOT NULL DEFAULT FALSE,
    last_studied_at     TIMESTAMPTZ,
    created_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_topic_progress_user_topic UNIQUE (user_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_topic_progress_user  ON topic_progress(user_id);
CREATE INDEX IF NOT EXISTS idx_topic_progress_topic ON topic_progress(topic_id);


-- ── 27. RESOURCE DOWNLOADS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS resource_downloads (
    id            SERIAL PRIMARY KEY,
    user_id       INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    resource_id   INTEGER NOT NULL REFERENCES resources(id) ON DELETE CASCADE,
    downloaded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_resource_downloads_user     ON resource_downloads(user_id);
CREATE INDEX IF NOT EXISTS idx_resource_downloads_resource ON resource_downloads(resource_id);


-- ══════════════════════════════════════════════════════════════
-- INITIAL SEED DATA
-- ══════════════════════════════════════════════════════════════

INSERT INTO subjects (name, slug, icon, description, is_active, created_at, updated_at)
VALUES
    ('Mathematics', 'mathematics', '📐', 'Numbers, algebra, geometry, calculus, and more.',            TRUE, NOW(), NOW()),
    ('Physics',     'physics',     '⚛️',  'Forces, motion, energy, waves, and the laws of the universe.', TRUE, NOW(), NOW()),
    ('Chemistry',   'chemistry',   '🧪', 'Elements, reactions, bonding, and the molecular world.',      TRUE, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;
