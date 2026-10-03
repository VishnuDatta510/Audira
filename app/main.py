import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.api import code_routes, interview_routes, routes
from app.core.config import browser_origins, settings
from app.services.agent import AgentUnavailable
from app.services.repository import repository

logger = logging.getLogger("bnb")


@asynccontextmanager
async def lifespan(_: FastAPI):
    if repository.db is not None:
        logger.info("MongoDB connected (database %s)", settings.mongodb_database)
    elif settings.mongodb_uri:
        logger.warning("MongoDB URI is set but the database is unreachable: %s", repository.connection_error)
    else:
        logger.warning("MONGODB_URI is empty. Accounts and interviews stay in this process and disappear when it stops.")
    yield


app = FastAPI(title="BNB AI Interview Coach", version="0.3.0", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=browser_origins(),
    allow_origin_regex=settings.cors_origin_regex or None,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)
app.include_router(routes.router)
app.include_router(code_routes.router)
app.include_router(interview_routes.router)


@app.exception_handler(AgentUnavailable)
def agent_unavailable(_: Request, exc: AgentUnavailable):
    return JSONResponse(status_code=503, content={"detail": str(exc)})


@app.get("/")
def root():
    return {"service": "BNB AI Interview Coach API", "docs": "/docs", "frontend": settings.frontend_url, "health": "/health"}


@app.get("/health")
def health():
    if repository.db is not None:
        mongodb = "connected"
    elif settings.mongodb_uri:
        mongodb = "unavailable"
    else:
        mongodb = "memory"
    ok = mongodb != "unavailable"
    return JSONResponse(status_code=200 if ok else 503, content={"ok": ok, "mongodb": mongodb})
