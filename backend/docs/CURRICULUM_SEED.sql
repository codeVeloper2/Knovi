-- Curriculum Seed Data: PeerUP Learn System
-- Physics — Newton's Laws of Motion & Energy and Work
-- Safe to run multiple times (uses ON CONFLICT DO NOTHING / ON CONFLICT DO UPDATE)

-- ─────────────────────────────────────────────────────────────────────────────
-- SUBJECTS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO subjects (name, slug, description, icon, is_active)
VALUES (
  'Physics',
  'physics',
  'The study of matter, energy, and the fundamental forces of nature.',
  '⚛️',
  true
)
ON CONFLICT (slug) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- TOPICS
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO topics (subject_id, name, slug, description, difficulty, is_active)
SELECT
  s.id,
  'Newton''s Laws of Motion',
  'newtons-laws-of-motion',
  'Explore the three fundamental laws that govern how objects move and interact with forces.',
  'intermediate',
  true
FROM subjects s WHERE s.slug = 'physics'
ON CONFLICT (subject_id, slug) DO NOTHING;

INSERT INTO topics (subject_id, name, slug, description, difficulty, is_active)
SELECT
  s.id,
  'Energy and Work',
  'energy-and-work',
  'Understand how energy is stored, transferred, and converted through work and motion.',
  'intermediate',
  true
FROM subjects s WHERE s.slug = 'physics'
ON CONFLICT (subject_id, slug) DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- LEARNING OBJECTIVES — Newton's Laws
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO learning_objectives (topic_id, title, description, order_index)
SELECT
  t.id,
  'Understand Newton''s three laws of motion',
  'Be able to state and explain all three of Newton''s laws and the principles behind them.',
  0
FROM topics t WHERE t.slug = 'newtons-laws-of-motion'
ON CONFLICT DO NOTHING;

INSERT INTO learning_objectives (topic_id, title, description, order_index)
SELECT
  t.id,
  'Apply F = ma to solve problems',
  'Use Newton''s Second Law to calculate force, mass, or acceleration in real-world scenarios.',
  1
FROM topics t WHERE t.slug = 'newtons-laws-of-motion'
ON CONFLICT DO NOTHING;

INSERT INTO learning_objectives (topic_id, title, description, order_index)
SELECT
  t.id,
  'Explain the relationship between force, mass, and acceleration',
  'Describe how changing the force or mass affects the resulting acceleration of an object.',
  2
FROM topics t WHERE t.slug = 'newtons-laws-of-motion'
ON CONFLICT DO NOTHING;

INSERT INTO learning_objectives (topic_id, title, description, order_index)
SELECT
  t.id,
  'Identify action-reaction force pairs',
  'Recognise examples of Newton''s Third Law in everyday situations and explain why forces are equal and opposite.',
  3
FROM topics t WHERE t.slug = 'newtons-laws-of-motion'
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- CONCEPTS — Newton's Laws
-- ─────────────────────────────────────────────────────────────────────────────

-- Concept 1: Newton's First Law
INSERT INTO concepts (topic_id, name, explanation, key_points)
SELECT
  t.id,
  'Newton''s First Law (Law of Inertia)',
  'Newton''s First Law states that an object will remain at rest or in uniform motion in a straight line unless acted upon by an unbalanced force.',
  '["An object at rest stays at rest unless acted upon by an unbalanced force",
    "An object in motion stays in motion unless acted upon by an unbalanced force",
    "Inertia is the tendency of an object to resist changes in its state of motion",
    "The greater the mass, the greater the inertia"]'::jsonb
FROM topics t WHERE t.slug = 'newtons-laws-of-motion'
ON CONFLICT DO NOTHING;

-- Concept 2: Newton's Second Law
INSERT INTO concepts (topic_id, name, explanation, key_points)
SELECT
  t.id,
  'Newton''s Second Law (F = ma)',
  'Newton''s Second Law states that the acceleration of an object is directly proportional to the net force acting on it and inversely proportional to its mass.',
  '["Force equals mass times acceleration (F = ma)",
    "Acceleration is directly proportional to the net force",
    "Acceleration is inversely proportional to mass",
    "Force is measured in Newtons (N)"]'::jsonb
FROM topics t WHERE t.slug = 'newtons-laws-of-motion'
ON CONFLICT DO NOTHING;

-- Concept 3: Newton's Third Law
INSERT INTO concepts (topic_id, name, explanation, key_points)
SELECT
  t.id,
  'Newton''s Third Law (Action-Reaction)',
  'Newton''s Third Law states that for every action force there is an equal and opposite reaction force.',
  '["For every action there is an equal and opposite reaction",
    "Forces always occur in pairs",
    "The forces act on different objects",
    "Action-reaction pairs do not cancel each other out"]'::jsonb
FROM topics t WHERE t.slug = 'newtons-laws-of-motion'
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- MISCONCEPTIONS — Newton's Second Law
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO misconceptions (topic_id, concept_id, misconception, correction, hint)
SELECT
  t.id,
  c.id,
  'Heavier objects fall faster than lighter objects',
  'All objects fall at the same rate in a vacuum regardless of mass — gravity accelerates all masses equally.',
  'Think about what F = ma means when F = mg. The mass cancels out!'
FROM topics t
JOIN concepts c ON c.topic_id = t.id AND c.name = 'Newton''s Second Law (F = ma)'
WHERE t.slug = 'newtons-laws-of-motion'
ON CONFLICT DO NOTHING;

INSERT INTO misconceptions (topic_id, concept_id, misconception, correction, hint)
SELECT
  t.id,
  c.id,
  'A larger force always gives more acceleration regardless of mass',
  'Acceleration depends on BOTH force AND mass. A large force on a very massive object can produce less acceleration than a small force on a light object.',
  'Use F = ma and think about what happens when you double the mass.'
FROM topics t
JOIN concepts c ON c.topic_id = t.id AND c.name = 'Newton''s Second Law (F = ma)'
WHERE t.slug = 'newtons-laws-of-motion'
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- LEARNING OBJECTIVES — Energy and Work
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO learning_objectives (topic_id, title, description, order_index)
SELECT
  t.id,
  'Calculate work done by a force',
  'Use W = F × d × cos(θ) to determine the work done in different scenarios.',
  0
FROM topics t WHERE t.slug = 'energy-and-work'
ON CONFLICT DO NOTHING;

INSERT INTO learning_objectives (topic_id, title, description, order_index)
SELECT
  t.id,
  'Distinguish between kinetic and potential energy',
  'Identify and calculate different forms of mechanical energy in a system.',
  1
FROM topics t WHERE t.slug = 'energy-and-work'
ON CONFLICT DO NOTHING;

INSERT INTO learning_objectives (topic_id, title, description, order_index)
SELECT
  t.id,
  'Apply the work-energy theorem',
  'Explain how net work done on an object relates to its change in kinetic energy.',
  2
FROM topics t WHERE t.slug = 'energy-and-work'
ON CONFLICT DO NOTHING;


-- ─────────────────────────────────────────────────────────────────────────────
-- CONCEPTS — Energy and Work
-- ─────────────────────────────────────────────────────────────────────────────

-- Concept 1: Work Done by a Force
INSERT INTO concepts (topic_id, name, explanation, key_points)
SELECT
  t.id,
  'Work Done by a Force',
  'Work is done when a force causes an object to move in the direction of the force. It is calculated as the product of the force, the displacement, and the cosine of the angle between them.',
  '["Work = Force × Distance × cos(θ)",
    "Work is done only when force causes displacement",
    "Work is measured in Joules (J)",
    "If force is perpendicular to motion, no work is done"]'::jsonb
FROM topics t WHERE t.slug = 'energy-and-work'
ON CONFLICT DO NOTHING;

-- Concept 2: Kinetic Energy
INSERT INTO concepts (topic_id, name, explanation, key_points)
SELECT
  t.id,
  'Kinetic Energy',
  'Kinetic energy is the energy an object possesses due to its motion. It depends on both the mass of the object and the square of its velocity.',
  '["KE = ½mv²",
    "Kinetic energy depends on both mass and velocity",
    "Doubling velocity quadruples kinetic energy",
    "Kinetic energy is always positive or zero"]'::jsonb
FROM topics t WHERE t.slug = 'energy-and-work'
ON CONFLICT DO NOTHING;

-- Concept 3: Potential Energy
INSERT INTO concepts (topic_id, name, explanation, key_points)
SELECT
  t.id,
  'Potential Energy',
  'Potential energy is stored energy that an object has due to its position or condition. Gravitational potential energy depends on height and mass, while elastic potential energy is stored in deformed objects.',
  '["Gravitational PE = mgh",
    "Potential energy is stored energy",
    "Height and mass determine gravitational PE",
    "Elastic PE is stored in stretched/compressed objects"]'::jsonb
FROM topics t WHERE t.slug = 'energy-and-work'
ON CONFLICT DO NOTHING;
