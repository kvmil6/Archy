from fastapi import FastAPI
from .routers import items, users

app = FastAPI(title="Sample FastAPI App", version="0.1.0")

app.include_router(items.router)
app.include_router(users.router)


@app.get("/health")
async def health():
    return {"status": "ok"}
