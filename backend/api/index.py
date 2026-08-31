"""
Vercel entrypoint -- it looks for an ASGI `app` object in this file.
The real app lives in app/main.py; we just add `app/` to the import path
since this file sits in a sibling `api/` folder.
"""
import os
import sys

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from app.main import app  # noqa: E402  (import must come after sys.path fix)
