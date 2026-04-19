from fastapi import APIRouter, Depends, HTTPException
from ..schemas import UserCreate, UserResponse
from ..database import get_db

router = APIRouter(prefix="/users", tags=["users"])


@router.post("/", response_model=UserResponse)
async def create_user(user: UserCreate, db=Depends(get_db)):
    cursor = db.execute(
        "INSERT INTO users (username, email, password_hash) VALUES (?, ?, ?)",
        (user.username, user.email, user.password),
    )
    db.commit()
    row = db.execute("SELECT * FROM users WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return dict(row)


@router.get("/", response_model=list[UserResponse])
async def list_users(db=Depends(get_db)):
    rows = db.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
    return [dict(r) for r in rows]
