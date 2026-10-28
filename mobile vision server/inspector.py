"""
inspector.py

Single-call inspection pipelines for the Gemini-backed version of this tool.

Unlike the local/Ollama version, there is NO multi-stage describe/classify/
critic pipeline here — both modes make exactly one call to Gemini:

  - inspect_with_references(): task + up to MAX_REFERENCE_IMAGES known-good
    reference images + 1 test image, judged in one combined call.

  - inspect_prompt_only(): task + 1 test image, no references. To make up
    for not having a reference photo to anchor against (and without a
    separate critic stage to catch false positives), this mode uses a
    deliberately stricter, more conservative system prompt that pushes the
    model to actively look for a non-defect explanation before committing
    to "defective", and to return "uncertain" rather than guess when the
    evidence doesn't clearly support one verdict over the other.

Both modes resolve to the same strict output schema:
    verdict, finding, assessment, location, defect_percentage,
    confidence_score, reasoning
"""

import json
import re
import time

from gemini_client import call_gemini_with_fallback, GeminiError
from image_utils import load_and_encode_image, ImageLoadError

MAX_REFERENCE_IMAGES = 5

ALLOWED_VERDICTS = {"CONFORMING", "DEFECTIVE", "UNCERTAIN"}

RESPONSE_SCHEMA_INSTRUCTIONS = """
Respond with ONLY a single JSON object — no markdown code fences, no prose
before or after it. It must have exactly these fields:

{
  "verdict": "conforming" | "defective" | "uncertain",
  "finding": "one or two sentence summary of the primary observation",
  "assessment": "a comprehensive description of the physical state and any anomalies observed",
  "location": "a positional description of where any finding is, e.g. an approximate quadrant, edge, or region of the image; use \\"N/A\\" if there is no localized finding",
  "defect_percentage": a number from 0.0 to 100.0 estimating how much of the inspected surface/part is affected,
  "confidence_score": a number from 0.0 to 1.0 reflecting how confident you are in the verdict,
  "reasoning": "a step-by-step explanation of how you reached this conclusion"
}

Use "uncertain" for defect_percentage and confidence_score in a way that reflects
genuine ambiguity — a low confidence_score with an "uncertain" verdict is expected
and correct when the evidence is genuinely inconclusive; do not inflate confidence
just to force a "conforming" or "defective" verdict.
""".strip()


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

def _build_reference_mode_system_prompt(task: str, reference_count: int) -> str:
    return f"""
You are an experienced visual quality-control inspector.

You will be shown {reference_count} reference image(s) of a KNOWN-GOOD part,
followed by one TEST IMAGE that needs to be judged. The reference images
establish what "correct" / "conforming" looks like for this specific item —
use them as your ground truth baseline, not general assumptions about what
the object "should" look like in the abstract.

Inspection task set by the user: "{task}"

Compare the test image against the reference images and decide whether the
test image conforms to the same standard, focusing specifically on what the
task description asks you to check. Only flag something as "defective" if it
represents a genuine, visible deviation from the reference images that a
reasonable QC inspector would flag — not normal photographic variation
(lighting, angle, minor color temperature differences between photos).

If the comparison is genuinely ambiguous — for example, a difference exists
but you cannot tell whether it is a real defect or just a lighting/angle
artifact relative to the references — use "uncertain" rather than guessing.

{RESPONSE_SCHEMA_INSTRUCTIONS}
""".strip()


def _build_prompt_only_system_prompt(task: str) -> str:
    return f"""
You are an experienced visual quality-control inspector operating WITHOUT any
reference photo of a known-good part. You only have the task description and
the single test image below.

Inspection task set by the user: "{task}"

Because you have no reference image to compare against, you are especially
prone to false positives — flagging normal manufacturing texture, ordinary
lighting, reflections, shadows, camera compression artifacts, or benign
cosmetic variation as if they were defects. Actively guard against this:

1. Before flagging anything as a defect, explicitly consider at least one
   plausible non-defect explanation for it (lighting, reflection, shadow,
   camera angle, compression artifact, normal texture/finish for this kind
   of item). State that alternative explanation in your reasoning even if
   you ultimately reject it.
2. Only conclude "defective" if the finding clearly matches what the task
   description asks you to check for, AND you can rule out the plausible
   non-defect explanations you considered.
3. If, after considering alternatives, you genuinely cannot tell whether
   something is a real defect or an artifact of lighting/angle/compression,
   return "uncertain" instead of forcing a "conforming" or "defective" call.
   Do not default to "conforming" just to avoid ambiguity, and do not default
   to "defective" just because something looks unusual — "uncertain" exists
   specifically for this situation.
4. Be specific: cite the concrete visual detail(s) driving your verdict
   rather than a vague overall impression.

{RESPONSE_SCHEMA_INSTRUCTIONS}
""".strip()


# ---------------------------------------------------------------------------
# Response parsing / repair
# ---------------------------------------------------------------------------

_FENCE_RE = re.compile(r"^```(?:json)?\s*|\s*```$", re.IGNORECASE | re.MULTILINE)
_JSON_OBJECT_RE = re.compile(r"\{.*\}", re.DOTALL)


def _strip_markdown_fences(text: str) -> str:
    return _FENCE_RE.sub("", text).strip()


def _extract_json_object(text: str) -> str:
    """
    Best-effort extraction of a JSON object from a model response that may
    contain markdown fences and/or stray prose around the actual object,
    despite the API being asked for JSON-only output.
    """
    text = _strip_markdown_fences(text)
    try:
        json.loads(text)
        return text
    except json.JSONDecodeError:
        pass

    match = _JSON_OBJECT_RE.search(text)
    if match:
        candidate = match.group(0)
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass

    # Last resort: trim trailing commas before closing braces/brackets,
    # a common small-model malformation.
    repaired = re.sub(r",\s*([}\]])", r"\1", text)
    return repaired


def _clamp(value, lo, hi, default):
    try:
        value = float(value)
    except (TypeError, ValueError):
        return default
    return max(lo, min(hi, value))


def parse_inspection_response(raw_text: str) -> dict:
    """
    Parses and validates a raw Gemini response into the strict output
    schema, filling in safe defaults for any missing/malformed field rather
    than raising, so a slightly malformed model response still produces a
    usable (if flagged) result instead of a hard error.
    """
    candidate_text = _extract_json_object(raw_text)

    try:
        data = json.loads(candidate_text)
    except json.JSONDecodeError as e:
        raise ValueError(
            f"Could not parse a JSON object out of the model response: {e}\n"
            f"Raw response was:\n{raw_text[:2000]}"
        ) from e

    if not isinstance(data, dict):
        raise ValueError(f"Model response was valid JSON but not an object: {candidate_text[:500]}")

    verdict = str(data.get("verdict", "")).strip().lower()
    if verdict not in ALLOWED_VERDICTS:
        verdict = "uncertain"

    result = {
        "verdict": verdict,
        "finding": str(data.get("finding") or "No finding provided.").strip(),
        "assessment": str(data.get("assessment") or "No assessment provided.").strip(),
        "location": str(data.get("location") or "N/A").strip(),
        "defect_percentage": round(_clamp(data.get("defect_percentage"), 0.0, 100.0, 0.0), 2),
        "confidence_score": round(_clamp(data.get("confidence_score"), 0.0, 1.0, 0.5), 4),
        "reasoning": str(data.get("reasoning") or "No reasoning provided.").strip(),
    }
    return result


# ---------------------------------------------------------------------------
# Public pipeline functions
# ---------------------------------------------------------------------------

def inspect_with_references(
    task: str,
    reference_sources: list,
    test_source,
    api_key: str,
    model: str,
    timeout: int = 120,
) -> dict:
    """
    Single-call reference-mode inspection.

    reference_sources: list of image sources (FileStorage/path/bytes),
                        length 0..MAX_REFERENCE_IMAGES.
    test_source: single image source to inspect.

    Returns a dict: {"result": {...schema...} | None,
                      "error": str | None,
                      "timing": {...},
                      "reference_load_seconds": float}
    """
    if len(reference_sources) > MAX_REFERENCE_IMAGES:
        reference_sources = reference_sources[:MAX_REFERENCE_IMAGES]

    reference_load_seconds = 0.0
    parts = []

    try:
        for i, ref_source in enumerate(reference_sources, start=1):
            b64, mime, load_s = load_and_encode_image(ref_source)
            reference_load_seconds += load_s
            parts.append({"text": f"Reference image {i} of {len(reference_sources)} (known-good example):"})
            parts.append({"inline_data": {"mime_type": mime, "data": b64}})

        test_start = time.perf_counter()
        test_b64, test_mime, test_load_s = load_and_encode_image(test_source)
        image_load_seconds = round(time.perf_counter() - test_start, 4)
    except ImageLoadError as e:
        return {
            "result": None,
            "error": str(e),
            "timing": {"image_load_seconds": None, "inference_seconds": None, "total_seconds": None},
            "reference_load_seconds": round(reference_load_seconds, 4),
        }

    parts.append({"text": "This is the TEST IMAGE that needs to be judged against the reference image(s) above:"})
    parts.append({"inline_data": {"mime_type": test_mime, "data": test_b64}})

    system_prompt = _build_reference_mode_system_prompt(task, len(reference_sources))

    total_start = time.perf_counter()
    try:
        raw_text, inference_seconds, model_used = call_gemini_with_fallback(
            parts=parts,
            system_instruction=system_prompt,
            api_key=api_key,
            model=model,
            timeout=timeout,
        )
        result = parse_inspection_response(raw_text)
    except (GeminiError, ValueError) as e:
        total_seconds = round(image_load_seconds + (time.perf_counter() - total_start), 4)
        return {
            "result": None,
            "error": str(e),
            "timing": {
                "image_load_seconds": image_load_seconds,
                "inference_seconds": None,
                "total_seconds": total_seconds,
            },
            "reference_load_seconds": round(reference_load_seconds, 4),
        }

    total_seconds = round(image_load_seconds + inference_seconds, 4)

    return {
        "result": result,
        "error": None,
        "model_used": model_used,
        "timing": {
            "image_load_seconds": image_load_seconds,
            "inference_seconds": inference_seconds,
            "total_seconds": total_seconds,
        },
        "reference_load_seconds": round(reference_load_seconds, 4),
    }


def inspect_prompt_only(
    task: str,
    test_source,
    api_key: str,
    model: str,
    timeout: int = 120,
) -> dict:
    """
    Single-call prompt-only inspection (no reference images). Same return
    shape as inspect_with_references(), with reference_load_seconds always 0.
    """
    try:
        test_b64, test_mime, image_load_seconds = load_and_encode_image(test_source)
    except ImageLoadError as e:
        return {
            "result": None,
            "error": str(e),
            "timing": {"image_load_seconds": None, "inference_seconds": None, "total_seconds": None},
            "reference_load_seconds": 0.0,
        }

    parts = [
        {"text": "This is the TEST IMAGE to inspect. There are no reference images for this run:"},
        {"inline_data": {"mime_type": test_mime, "data": test_b64}},
    ]

    system_prompt = _build_prompt_only_system_prompt(task)

    try:
        raw_text, inference_seconds, model_used = call_gemini_with_fallback(
            parts=parts,
            system_instruction=system_prompt,
            api_key=api_key,
            model=model,
            timeout=timeout,
        )
        result = parse_inspection_response(raw_text)
    except (GeminiError, ValueError) as e:
        return {
            "result": None,
            "error": str(e),
            "timing": {
                "image_load_seconds": image_load_seconds,
                "inference_seconds": None,
                "total_seconds": image_load_seconds,
            },
            "reference_load_seconds": 0.0,
        }

    total_seconds = round(image_load_seconds + inference_seconds, 4)

    return {
        "result": result,
        "error": None,
        "model_used": model_used,
        "timing": {
            "image_load_seconds": image_load_seconds,
            "inference_seconds": inference_seconds,
            "total_seconds": total_seconds,
        },
        "reference_load_seconds": 0.0,
    }
