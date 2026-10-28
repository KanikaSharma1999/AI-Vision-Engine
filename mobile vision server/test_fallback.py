"""
Offline tests for call_gemini_with_fallback.
Fakes Gemini responses - makes NO real API calls and costs nothing.
Run with:  python test_fallback.py
"""
import os
import time

import gemini_client
from gemini_client import GeminiError

time.sleep = lambda s: None  # skip the retry waits during testing
os.environ["GEMINI_FALLBACK_MODELS"] = "model-b,model-c"

calls = []


def make_fake(behaviour):
    def fake_call_gemini(parts, system_instruction, api_key, model, timeout=120, temperature=0.1):
        calls.append(model)
        outcome = behaviour.get(model, "ok")
        if outcome == "ok":
            return '{"ok": true}', 0.5
        raise GeminiError(outcome)
    return fake_call_gemini


def run(name, behaviour, expect_model=None, expect_error=None, expect_calls=None):
    calls.clear()
    gemini_client.call_gemini = make_fake(behaviour)
    try:
        _, _, used = gemini_client.call_gemini_with_fallback(
            parts=[], system_instruction="", api_key="x", model="model-a"
        )
        passed = used == expect_model and (expect_calls is None or calls == expect_calls)
        print(f"{'PASS' if passed else 'FAIL'}  {name}: used={used}, calls={calls}")
    except GeminiError as e:
        passed = expect_error is not None and expect_error in str(e) and (expect_calls is None or calls == expect_calls)
        print(f"{'PASS' if passed else 'FAIL'}  {name}: error='{str(e)[:60]}...', calls={calls}")


BUSY = "Gemini API returned HTTP 503: high demand"

run("1. Primary works first time", {},
    expect_model="model-a", expect_calls=["model-a"])

run("2. Primary busy -> falls back", {"model-a": BUSY},
    expect_model="model-b", expect_calls=["model-a", "model-a", "model-b"])

run("3. Rate limited (429) -> falls back", {"model-a": "Gemini API returned HTTP 429: quota"},
    expect_model="model-b", expect_calls=["model-a", "model-a", "model-b"])

run("4. Unknown model (404) -> skips immediately", {"model-a": "Gemini API returned HTTP 404: not found"},
    expect_model="model-b", expect_calls=["model-a", "model-b"])

run("5. Bad API key (400) -> fails fast, no retry", {"model-a": "Gemini API returned HTTP 400: API key not valid"},
    expect_error="HTTP 400", expect_calls=["model-a"])

run("6. Everything busy -> clear final error", {"model-a": BUSY, "model-b": BUSY, "model-c": BUSY},
    expect_error="All models busy",
    expect_calls=["model-a", "model-a", "model-b", "model-b", "model-c", "model-c"])