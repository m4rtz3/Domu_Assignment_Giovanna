"""
FastAPI app factory. Used both for local dev (`uvicorn app.main:app`) and,
indirectly, by the Vercel entrypoint in backend/api/index.py.
"""
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import CORS_ORIGINS
from app.routers import (
    calling_compliance,
    compliance_investigation,
    fix_objection_handling,
    outcomes,
    qa_review,
    script_to_agent,
    ticket,
    transcribe,
)

app = FastAPI(
    title="Domu Ops Copilot",
    description="MVP automating parts of the Technical Operations Lead workflow.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(script_to_agent.router)
app.include_router(outcomes.router)
app.include_router(qa_review.router)
app.include_router(ticket.router)
app.include_router(transcribe.router)
app.include_router(calling_compliance.router)
app.include_router(fix_objection_handling.router)
app.include_router(compliance_investigation.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
