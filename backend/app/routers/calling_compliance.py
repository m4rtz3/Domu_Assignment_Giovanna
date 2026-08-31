"""
Task 7: confirm call attempts happened within permitted calling hours and not
on a holiday.

This is a deterministic rules check -- no LLM involved, same reasoning as the
outcomes dashboard (Task 2). The regional hour windows and holiday list here
are illustrative mock data for the demo, not verified legal guidance -- real
permitted-calling-hour rules vary by state/region and would need to come from
Domu's actual compliance team before this ran against real call attempts.
"""
import json
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException

from app.schemas import CallAttemptCheck, CallingCheckRequest

router = APIRouter(prefix="/api/calling-compliance", tags=["calling-compliance"])

DATA_DIR = Path(__file__).parent.parent / "data"


def _load_json(filename: str):
    return json.loads((DATA_DIR / filename).read_text(encoding="utf-8"))


def _check_attempt(attempt: dict, windows: dict, holiday_dates: dict[str, str]) -> CallAttemptCheck:
    attempted_at = datetime.fromisoformat(attempt["attempted_at"])
    region = attempt["region"]
    window = windows.get(region)

    if window is None:
        return CallAttemptCheck(
            **attempt,
            compliant=False,
            violation_reason=f"No calling-hours rule configured for region '{region}'.",
        )

    date_str = attempted_at.date().isoformat()
    if date_str in holiday_dates:
        return CallAttemptCheck(
            **attempt,
            compliant=False,
            violation_reason=f"Attempted on a holiday ({holiday_dates[date_str]}).",
        )

    if not (window["start_hour"] <= attempted_at.hour < window["end_hour"]):
        return CallAttemptCheck(
            **attempt,
            compliant=False,
            violation_reason=(
                f"Outside permitted calling hours for {window['label']} "
                f"({window['start_hour']}:00-{window['end_hour']}:00)."
            ),
        )

    return CallAttemptCheck(**attempt, compliant=True)


@router.get("", response_model=list[CallAttemptCheck])
def check_calling_compliance() -> list[CallAttemptCheck]:
    attempts = _load_json("call_attempts.json")
    windows = _load_json("calling_windows.json")
    holidays = {h["date"]: h["name"] for h in _load_json("holidays.json")}

    return [_check_attempt(a, windows, holidays) for a in attempts]


@router.get("/regions")
def list_regions() -> dict:
    """Regions this rules engine has calling-hour windows for, so the frontend
    doesn't have to hardcode the same list separately."""
    return _load_json("calling_windows.json")


@router.post("/check", response_model=CallAttemptCheck)
def check_proposed_call(payload: CallingCheckRequest) -> CallAttemptCheck:
    """Check a single proposed call time before dialing, instead of only reviewing
    past attempts -- this is the "confirm before you call" version of the table above."""
    try:
        datetime.fromisoformat(payload.attempted_at)
    except ValueError:
        raise HTTPException(status_code=400, detail="attempted_at must be a valid date/time.")

    windows = _load_json("calling_windows.json")
    holidays = {h["date"]: h["name"] for h in _load_json("holidays.json")}
    attempt = {
        "attempt_id": "manual-check",
        "client_name": payload.client_name,
        "region": payload.region,
        "attempted_at": payload.attempted_at,
    }
    return _check_attempt(attempt, windows, holidays)
