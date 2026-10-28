"""
server.py

Flask backend for the Gemini-powered version of the inspector.

Frontend now collects a PRODUCT NAME (not a free-form task description) plus
a simple "Add reference image? Yes/No" toggle. The full inspection prompt is
built here on the server from a fixed template, with the product name
substituted in.

    POST /api/inspect
        multipart/form-data:
          product           - text, required (e.g. "washing machine")
          extra_notes       - text, optional, hidden in the current UI (see
                              README.md -> "Enabling the optional extra
                              notes field" for how to expose it again)
          mode              - "with_references" | "prompt_only", required
                              (driven by the "Add reference image?" Yes/No
                              radio buttons on the frontend)
          reference_images  - 0..5 files, only used when mode=with_references
          test_image        - exactly 1 file, required

Every run is saved to results/run_<timestamp>_<id>.json.

NOTE: the accuracy/precision/recall/F1/ROC-AUC scoring feature (and the
good_*/defect_* filename convention that fed it) has been removed from this
version. Each run's JSON still contains the full verdict + timing, just no
"metrics" block.
"""

import json
import os
import time
import uuid
from datetime import datetime, timezone

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request
from flask_cors import CORS

from image_utils import allowed_file
from inspector import inspect_with_references, inspect_prompt_only, MAX_REFERENCE_IMAGES

load_dotenv()

GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")
GEMINI_MODEL = os.environ.get("GEMINI_MODEL", "gemini-3.8-flash")
GEMINI_TIMEOUT = int(os.environ.get("GEMINI_TIMEOUT", "120"))
PORT = int(os.environ.get("PORT", "5000"))

RESULTS_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "results")
os.makedirs(RESULTS_DIR, exist_ok=True)

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 32 * 1024 * 1024  # 32 MB upload cap

# Allow the mobile app (Expo Go / installed APK, a different origin than this
# server) to call /api/inspect. Wide open ("*") is fine for a demo talking to
# a temporary ngrok URL; tighten this to a specific origin if this is ever
# exposed somewhere less throwaway.
CORS(app, resources={r"/api/*": {"origins": "*"}})

VALID_MODES = {"with_references", "prompt_only"}

# ---------------------------------------------------------------------------
# Fixed inspection prompt template.
#
# The frontend only collects a product name (e.g. "washing machine"); this
# template is filled in server-side to build the full task description that
# gets handed to inspector.py exactly the way a hand-typed task string used
# to be. `{product}` may appear as many times as you like in the template.
# ---------------------------------------------------------------------------
PRODUCT_TASK_TEMPLATE = (
    "Inspect this {product} for defects and if found, flag dents, scratches, "
    "or cracks on the panels or door; a damaged or misaligned door seal; rust "
    "on metal parts on this {product}. Ignore stickers, vents, and normal "
    "panel seams."
)


def build_task_from_product(product: str, extra_notes: str = "") -> str:
    """
    Builds the full inspection prompt text from the product name using
    PRODUCT_TASK_TEMPLATE, optionally appending user-supplied extra notes.

    extra_notes is currently always empty in normal use (the field is
    hidden in the UI), but is wired up end-to-end so it can be turned on
    later without touching this function — see README.md.
    """
    task = PRODUCT_TASK_TEMPLATE.format(product=product)
    extra_notes = (extra_notes or "").strip()
    if extra_notes:
        task += f"\n\nAdditional notes from the user: {extra_notes}"
    return task


@app.route("/")
def index():
    return render_template("index.html", max_reference_images=MAX_REFERENCE_IMAGES)

from flask import send_from_directory

@app.route("/favicon.ico")
def favicon():
    return send_from_directory(
        os.path.join(app.root_path, "static"),
        "favicon.svg",
        mimetype="image/svg+xml",
    )

@app.route("/api/inspect", methods=["POST"])
def api_inspect():
    run_start = time.perf_counter()

    product = (request.form.get("product") or "").strip()
    extra_notes = (request.form.get("extra_notes") or "").strip()
    mode = (request.form.get("mode") or "").strip()

    if not product:
        return jsonify({"error": "Product name is required."}), 400
    if mode not in VALID_MODES:
        return jsonify({"error": f"mode must be one of {sorted(VALID_MODES)}."}), 400

    task = build_task_from_product(product, extra_notes)

    test_files = request.files.getlist("test_image")
    if not test_files or test_files[0].filename == "":
        return jsonify({"error": "One inspection image (test_image) is required."}), 400
    if len(test_files) > 1:
        return jsonify({"error": "Only a single inspection image is supported per run."}), 400

    test_file = test_files[0]
    if not allowed_file(test_file.filename):
        return jsonify({"error": f"Unsupported file type: {test_file.filename}"}), 400

    reference_files = []
    if mode == "with_references":
        reference_files = [f for f in request.files.getlist("reference_images") if f.filename]
        if len(reference_files) > MAX_REFERENCE_IMAGES:
            return jsonify({
                "error": f"At most {MAX_REFERENCE_IMAGES} reference images are allowed "
                         f"(got {len(reference_files)})."
            }), 400
        for f in reference_files:
            if not allowed_file(f.filename):
                return jsonify({"error": f"Unsupported reference file type: {f.filename}"}), 400

    if not GEMINI_API_KEY:
        return jsonify({
            "error": "GEMINI_API_KEY is not configured on the server. "
                     "Copy .env.example to .env and add your key."
        }), 500

    # --- run the appropriate single-call pipeline -------------------------
    if mode == "with_references":
        outcome = inspect_with_references(
            task=task,
            reference_sources=reference_files,
            test_source=test_file,
            api_key=GEMINI_API_KEY,
            model=GEMINI_MODEL,
            timeout=GEMINI_TIMEOUT,
        )
    else:
        outcome = inspect_prompt_only(
            task=task,
            test_source=test_file,
            api_key=GEMINI_API_KEY,
            model=GEMINI_MODEL,
            timeout=GEMINI_TIMEOUT,
        )

    result_entry = {
        "filename": test_file.filename,
        "timing": outcome["timing"],
    }

    if outcome["error"]:
        result_entry.update({
            "verdict": "error",
            "finding": None,
            "assessment": None,
            "location": None,
            "defect_percentage": None,
            "confidence_score": None,
            "reasoning": None,
            "error": outcome["error"],
        })
    else:
        result_entry.update(outcome["result"])
        result_entry["error"] = None

    timing = result_entry["timing"]
    reference_load_seconds = outcome["reference_load_seconds"]
    total_run_seconds = round(time.perf_counter() - run_start, 4)

    timing_summary = {
        "reference_load_seconds": reference_load_seconds,
        "avg_image_load_seconds": timing["image_load_seconds"],
        "avg_inference_seconds": timing["inference_seconds"],
        "avg_total_seconds": timing["total_seconds"],
        "total_inspection_seconds": timing["total_seconds"],
        "total_run_seconds": total_run_seconds,
    }

    run_id = uuid.uuid4().hex[:8]
    timestamp = datetime.now(timezone.utc).isoformat()

    run_record = {
        "run_id": run_id,
        "timestamp": timestamp,
        "product": product,
        "extra_notes": extra_notes or None,
        "task": task,
        "mode": mode,
        # "model": GEMINI_MODEL,
        #"model_requested": GEMINI_MODEL,
        #"model_used": outcome.get("model_used"),
        "reference_count": len(reference_files),
        "reference_filenames": [f.filename for f in reference_files],
        "inspection_count": 1,
        "results": [result_entry],
        "timing_summary": timing_summary,
    }

    run_filename = f"run_{datetime.now().strftime('%Y%m%dT%H%M%S')}_{run_id}.json"
    run_path = os.path.join(RESULTS_DIR, run_filename)
    with open(run_path, "w", encoding="utf-8") as f:
        json.dump(run_record, f, indent=2)

    return jsonify(run_record)


if __name__ == "__main__":
    if not GEMINI_API_KEY:
        print(
            "WARNING: GEMINI_API_KEY is not set. Copy .env.example to .env "
            "and add your key before running inspections."
        )
    app.run(host="0.0.0.0", port=PORT, debug=True)