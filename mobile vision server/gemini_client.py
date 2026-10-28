"""
gemini_client.py

Minimal HTTP wrapper around Google's Gemini `generateContent` REST endpoint.
Deliberately uses `requests` directly instead of the `google-generativeai`
SDK so the exact request/response payload is visible and easy to debug —
mirrors how ollama_client.py talks to the local Ollama server in the
offline version of this project.
"""

import os
import random
import time

import requests

GEMINI_API_BASE = "https://generativelanguage.googleapis.com/v1beta/models"


class GeminiError(Exception):
    """Raised for any non-2xx response or malformed response body."""


def call_gemini(
    parts: list,
    system_instruction: str,
    api_key: str,
    model: str,
    timeout: int = 120,
    temperature: float = 0.1,
) -> tuple:
    """
    Sends one `generateContent` request to Gemini.

    `parts` is a list of Gemini "part" dicts, e.g.:
        {"text": "..."}
        {"inline_data": {"mime_type": "image/jpeg", "data": "<base64>"}}

    Requests JSON-mode output (`response_mime_type: application/json`) so
    the model is constrained to emit a parseable JSON object directly,
    rather than relying entirely on prompt instructions.

    Returns (raw_text, inference_seconds).
    Raises GeminiError on network failure, non-2xx status, or a response
    with no usable text content (e.g. blocked by safety filters).
    """
    if not api_key:
        raise GeminiError(
            "GEMINI_API_KEY is not set. Copy .env.example to .env and add your key "
            "from https://aistudio.google.com/apikey"
        )

    url = f"{GEMINI_API_BASE}/{model}:generateContent?key={api_key}"

    payload = {
        "system_instruction": {"parts": [{"text": system_instruction}]},
        "contents": [{"role": "user", "parts": parts}],
        "generationConfig": {
            "temperature": temperature,
            "response_mime_type": "application/json",
        },
    }

    start = time.perf_counter()
    try:
        resp = requests.post(url, json=payload, timeout=timeout)
    except requests.exceptions.Timeout as e:
        raise GeminiError(f"Gemini request timed out after {timeout}s") from e
    except requests.exceptions.RequestException as e:
        raise GeminiError(f"Could not reach Gemini API: {e}") from e
    inference_seconds = round(time.perf_counter() - start, 4)

    if resp.status_code != 200:
        try:
            detail = resp.json().get("error", {}).get("message", resp.text)
        except ValueError:
            detail = resp.text
        raise GeminiError(f"Gemini API returned HTTP {resp.status_code}: {detail}")

    try:
        body = resp.json()
    except ValueError as e:
        raise GeminiError(f"Gemini API returned non-JSON response: {e}") from e

    candidates = body.get("candidates") or []
    if not candidates:
        feedback = body.get("promptFeedback", {})
        block_reason = feedback.get("blockReason")
        if block_reason:
            raise GeminiError(f"Gemini blocked the request: {block_reason}")
        raise GeminiError("Gemini API returned no candidates.")

    candidate = candidates[0]
    finish_reason = candidate.get("finishReason")
    content_parts = candidate.get("content", {}).get("parts", [])
    text_chunks = [p.get("text", "") for p in content_parts if "text" in p]
    raw_text = "".join(text_chunks).strip()

    if not raw_text:
        raise GeminiError(
            f"Gemini returned an empty response (finishReason={finish_reason})"
        )

    return raw_text, inference_seconds
# ---------------------------------------------------------------------------
# Fallback wrapper: retry busy models, then move down the fallback chain
# ---------------------------------------------------------------------------

RETRYABLE_STATUS = ("HTTP 429", "HTTP 500", "HTTP 503", "HTTP 504")


def _model_chain(primary: str) -> list:
    """Primary model first, then GEMINI_FALLBACK_MODELS from .env, no duplicates."""
    fallbacks = os.environ.get("GEMINI_FALLBACK_MODELS", "")
    chain = [primary] + [m.strip() for m in fallbacks.split(",") if m.strip()]
    return list(dict.fromkeys(chain))


def call_gemini_with_fallback(
    parts: list,
    system_instruction: str,
    api_key: str,
    model: str,
    timeout: int = 120,
    temperature: float = 0.1,
    retries_per_model: int = 2,
) -> tuple:
    """
    Same arguments as call_gemini(). Retries busy errors (429/5xx) with
    backoff, then falls back to the next model in the chain.

    Returns (raw_text, inference_seconds, model_used).
    Non-retryable errors (bad key, bad request, safety block) are raised
    immediately so real problems aren't hidden.
    """
    chain = _model_chain(model)
    last_err = None

    for m in chain:
        for attempt in range(retries_per_model):
            try:
                raw_text, inference_seconds = call_gemini(
                    parts=parts,
                    system_instruction=system_instruction,
                    api_key=api_key,
                    model=m,
                    timeout=timeout,
                    temperature=temperature,
                )
                if m != model:
                    print(f"[gemini] {model} was busy - served by fallback {m}")
                return raw_text, inference_seconds, m

            except GeminiError as e:
                msg = str(e)
                if "HTTP 404" in msg:
                    # Model name not available to this key - skip to next model
                    print(f"[gemini] {m} not found, skipping")
                    last_err = e
                    break
                if not any(code in msg for code in RETRYABLE_STATUS):
                    raise
                last_err = e
                if attempt < retries_per_model - 1:
                    wait = 1.5 * (2 ** attempt) + random.random()
                    print(f"[gemini] {m} busy, retrying in {wait:.1f}s")
                    time.sleep(wait)

        print(f"[gemini] {m} unavailable, trying next model")

    raise GeminiError(
        f"All models busy or unavailable ({', '.join(chain)}). Last error: {last_err}"
    )