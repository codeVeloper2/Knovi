"""Clear all study rooms and materials from database.

Run: python clear_study_rooms.py
"""
import asyncio
import selectors
import sys

from sqlalchemy import text

from app.core.database import engine


async def _clear() -> None:
    if engine is None:
        print("DATABASE_URL not configured.")
        return
    async with engine.begin() as conn:
        # Get counts before deletion
        rooms_result = await conn.execute(text("SELECT COUNT(*) FROM study_rooms"))
        rooms_count = rooms_result.scalar_one()
        
        materials_result = await conn.execute(text("SELECT COUNT(*) FROM room_materials"))
        materials_count = materials_result.scalar_one()
        
        # Delete all data
        await conn.execute(text("TRUNCATE TABLE room_materials RESTART IDENTITY CASCADE"))
        await conn.execute(text("TRUNCATE TABLE study_rooms RESTART IDENTITY CASCADE"))
        
    print(f"Cleared study rooms: {rooms_count} rows removed")
    print(f"Cleared room materials: {materials_count} rows removed")


def main() -> None:
    if sys.platform == "win32":
        asyncio.run(_clear(), loop_factory=lambda: asyncio.SelectorEventLoop(selectors.SelectSelector()))
    else:
        asyncio.run(_clear())


if __name__ == "__main__":
    main()
