"""Seed curriculum data (subjects) on app startup."""
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncEngine


async def seed_curriculum_data(engine: AsyncEngine) -> None:
    """Insert initial curriculum subjects if they don't exist."""
    async with engine.begin() as conn:
        # Check if subjects already exist
        result = await conn.execute(text("SELECT COUNT(*) FROM subjects"))
        count = result.scalar()
        
        if count > 0:
            # Already seeded
            return
        
        # Insert 3 seed subjects
        await conn.execute(text("""
            INSERT INTO subjects (name, description, icon, color_code, order_index, created_at, updated_at)
            VALUES 
                ('Mathematics', 'Study of numbers, quantities, shapes, and patterns', '🔢', '#3B82F6', 1, NOW(), NOW()),
                ('Physics', 'Study of matter, energy, motion, and force', '⚛️', '#8B5CF6', 2, NOW(), NOW()),
                ('Chemistry', 'Study of substances, their properties, and reactions', '🧪', '#10B981', 3, NOW(), NOW())
            ON CONFLICT DO NOTHING
        """))
