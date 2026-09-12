"""One-time endpoint to make a user admin by email."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_session
from app.models.user import User

router = APIRouter()


@router.post("/make-me-admin")
async def make_me_admin(session: AsyncSession = Depends(get_session)):
    """Make ezekiel.pegbit@gmail.com an admin. One-time setup endpoint."""
    email = "izymoni33@gmail.com"
    
    # Find user
    result = await session.execute(
        select(User).where(User.email == email)
    )
    user = result.scalar_one_or_none()
    
    if not user:
        raise HTTPException(status_code=404, detail=f"User {email} not found. Please sign up first.")
    
    # Update to admin
    await session.execute(
        update(User).where(User.email == email).values(role="admin")
    )
    await session.commit()
    
    return {
        "success": True,
        "message": f"User {email} is now an admin!",
        "user_id": user.id,
        "email": user.email,
        "role": "admin"
    }
