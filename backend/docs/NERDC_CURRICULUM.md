# PeerUP Nigerian SSS Curriculum

PeerUP's first curriculum content pack targets **SSS1, SSS2 and SSS3** for:

- General Mathematics
- Physics
- Chemistry
- Biology

The subject/level structure is based on the Nigerian senior-secondary curriculum structure published by NERDC. The topic lists were cross-checked against the NERDC e-Curriculum portal and current Nigerian scheme-of-work references.

This seed is an **NERDC-aligned structured starter pack**, not a verbatim reproduction of NERDC curriculum PDFs. The database stores the learning hierarchy and learning-objective coverage; the AI generates explanations and teaching content dynamically.

## Hierarchy

`class level → subject → topic → concept → learning objective`

The Learning Room treats the objectives as the coverage contract:

- curriculum decides what must be covered;
- the AI decides how to teach it;
- learner evidence decides what needs reteaching.

## Migration

Run:

`backend/migrations/004_nerdc_curriculum.sql`

after the already-applied `002_ai_quiz_battle.sql` and `003_peer_discovery_indexes.sql` migrations.

The migration is idempotent for the seeded records and can be safely re-run against the same schema.
