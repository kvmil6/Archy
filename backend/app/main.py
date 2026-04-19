import logging
import uuid
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from .routers.registry import register_routers
from .config import settings

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger("archy_api")

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(f"Starting Archy API on port {settings.ARCHY_LINK_PORT}")
    yield
    logger.info("Shutting down Archy API")

app = FastAPI(
    title="Archy Core API", 
    version="0.2.0",
    description="Advanced backend for the Archy Canvas Visual Architecture application.",
    lifespan=lifespan
)

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled Exception: {exc}", exc_info=True)
    request_id = getattr(request.state, "request_id", None)
    return JSONResponse(
        status_code=500,
        content={
            "detail": "A severe backend error occurred. Please check server logs.",
            "request_id": request_id,
        },
    )


@app.middleware("http")
async def attach_request_id(request: Request, call_next):
    request_id = request.headers.get("x-request-id") or str(uuid.uuid4())
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["x-request-id"] = request_id
    return response

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_origin_regex=r"^https?://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_routers(app)

@app.get("/health", summary="Health check", include_in_schema=False)
async def health():
    return {"status": "ok", "version": app.version}

@app.get("/", summary="Health Check")
async def root():
    return {
        "service": "Archy API",
        "status": "online",
        "version": app.version
    }