"""
One small real call through the fallback wrapper.
Run with:  python smoke_test.py
"""
import os

from dotenv import load_dotenv

load_dotenv()

from gemini_client import call_gemini_with_fallback

raw, secs, used = call_gemini_with_fallback(
    parts=[{"text": 'Return the JSON object {"status": "ok"}.'}],
    system_instruction="You return JSON only.",
    api_key=os.environ["GEMINI_API_KEY"],
    model=os.environ.get("GEMINI_MODEL", "gemini-3.6-flash"),
    timeout=60,
)
print(f"Model used: {used} | {secs}s | Reply: {raw}")