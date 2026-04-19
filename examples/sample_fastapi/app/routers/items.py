from fastapi import APIRouter, Depends, HTTPException
from ..schemas import ItemCreate, ItemResponse
from ..database import get_db

router = APIRouter(prefix="/items", tags=["items"])


@router.post("/", response_model=ItemResponse)
async def create_item(item: ItemCreate, owner_id: int, db=Depends(get_db)):
    cursor = db.execute(
        "INSERT INTO items (title, description, price, owner_id) VALUES (?, ?, ?, ?)",
        (item.title, item.description, item.price, owner_id),
    )
    db.commit()
    row = db.execute("SELECT * FROM items WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return dict(row)


@router.get("/", response_model=list[ItemResponse])
async def list_items(skip: int = 0, limit: int = 20, db=Depends(get_db)):
    rows = db.execute(
        "SELECT * FROM items ORDER BY created_at DESC LIMIT ? OFFSET ?",
        (limit, skip),
    ).fetchall()
    return [dict(r) for r in rows]
