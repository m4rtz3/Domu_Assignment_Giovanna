"""Pydantic request/response models shared across routers."""
from pydantic import BaseModel, Field


# ---- Task 1: Script -> structured agent ----------------------------------

class ScriptToAgentRequest(BaseModel):
    client_name: str = Field(..., min_length=1, max_length=200)
    raw_script: str = Field(..., min_length=10, max_length=8000)


class CallFlowBranch(BaseModel):
    condition: str  # what the customer says/does that triggers this branch
    response: str  # what the agent should do in that case


class CallFlowStep(BaseModel):
    step: str
    purpose: str
    example_line: str
    branches: list[CallFlowBranch] = []  # conditional paths out of this step, if any


class ScriptToAgentResponse(BaseModel):
    client_name: str
    call_flow: list[CallFlowStep]
    agent_system_prompt: str
    degraded: bool = False  # true if this is the rule-based fallback, not real LLM output
    mock: bool = False  # true if this is canned demo data (LLM_MOCK_MODE=true), not a failure


# ---- Audio -> transcript (feeds into Script -> structured agent) ---------

class TranscriptionResponse(BaseModel):
    transcript: str


# ---- Task 2: Cross-client outcomes dashboard ------------------------------

class ClientOutcomes(BaseModel):
    client_id: str
    client_name: str
    total_calls: int
    answered: int
    payment_secured: int
    failed: int
    answer_rate: float
    conversion_rate: float  # payment_secured / answered
    failure_rate: float
    # extra detail shown when a row is expanded in the dashboard; None on the totals row
    # where a single value wouldn't mean much (e.g. no one "top" failure reason overall)
    avg_handle_time_seconds: float | None = None
    top_failure_reason: str | None = None
    calls_by_day: dict[str, int] | None = None


class OutcomesSummaryResponse(BaseModel):
    clients: list[ClientOutcomes]
    totals: ClientOutcomes


# ---- Task 3: QA review of flagged calls -----------------------------------

class FlaggedCall(BaseModel):
    call_id: str
    client_name: str
    transcript_snippet: str
    flag_reason: str


class QACategorizationResponse(BaseModel):
    call_id: str
    category: str  # wrong_outcome | incorrect_statement | dropped_early | unclear
    confidence: str  # low | medium | high
    reasoning: str
    degraded: bool = False
    mock: bool = False


# ---- Task 4: diagnose poor objection handling + fix the agent prompt ------

class ObjectionIssue(BaseModel):
    issue_id: str
    client_name: str
    current_prompt: str
    problem_description: str


class FixObjectionHandlingRequest(BaseModel):
    client_name: str = Field(..., min_length=1, max_length=200)
    current_prompt: str = Field(..., min_length=10, max_length=6000)
    problem_description: str = Field(..., min_length=5, max_length=3000)


class FixObjectionHandlingResponse(BaseModel):
    diagnosis: str
    what_changed: list[str]
    updated_prompt: str
    degraded: bool = False
    mock: bool = False


# ---- Task 7: calling windows / holiday compliance check -------------------

class CallingCheckRequest(BaseModel):
    client_name: str = Field(..., min_length=1, max_length=200)
    region: str = Field(..., min_length=2, max_length=10)
    attempted_at: str  # local ISO datetime for that region, e.g. "2026-09-01T14:30"


class CallAttemptCheck(BaseModel):
    attempt_id: str
    client_name: str
    region: str
    attempted_at: str
    compliant: bool
    violation_reason: str | None = None


# ---- Task 6: compliance concern investigation ------------------------------

class ComplianceConcern(BaseModel):
    concern_id: str
    client_name: str
    transcript_snippet: str
    concern_description: str


class ComplianceInvestigationRequest(BaseModel):
    client_name: str = Field(..., min_length=1, max_length=200)
    transcript_snippet: str = Field(..., min_length=10, max_length=6000)
    concern_description: str = Field(..., min_length=5, max_length=3000)


class ComplianceInvestigationResponse(BaseModel):
    risk_flags: list[str]
    summary: str
    recommended_next_steps: list[str]
    draft_internal_note: str
    degraded: bool = False
    mock: bool = False


# ---- Task 5: Client request -> engineering ticket -------------------------

class TicketRequest(BaseModel):
    client_name: str = Field(..., min_length=1, max_length=200)
    request_text: str = Field(..., min_length=5, max_length=4000)
    additional_details: str = Field("", max_length=3000)  # optional context from the Ops Lead


class EngineeringTicket(BaseModel):
    title: str
    priority: str  # low | medium | high
    client_name: str
    description: str
    acceptance_criteria: list[str]
    technical_notes: str
    degraded: bool = False
    mock: bool = False
