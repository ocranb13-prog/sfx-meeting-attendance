"""Application configuration. All secrets come from environment variables."""
import os

from dotenv import load_dotenv

load_dotenv()


class Config:
    SECRET_KEY = os.getenv("SECRET_KEY", "change-me")
    PUBLIC_BASE_URL = os.getenv("PUBLIC_BASE_URL", "http://localhost:5000").rstrip("/")
    TIMEZONE = os.getenv("APP_TIMEZONE", "Africa/Accra")

    FIREBASE_CREDENTIALS_JSON = os.getenv("FIREBASE_CREDENTIALS_JSON")
    FIREBASE_CREDENTIALS_FILE = os.getenv("FIREBASE_CREDENTIALS_FILE")

    PUBLIC_RATE_LIMIT = os.getenv("PUBLIC_RATE_LIMIT", "20 per minute")
    RATELIMIT_STORAGE_URI = os.getenv("RATELIMIT_STORAGE_URI", "memory://")
    TRUST_PROXY = os.getenv("TRUST_PROXY", "0") == "1"

    MAX_CONTENT_LENGTH = 1024 * 1024  # 1 MB request limit (logo uploads are small)
    JSON_SORT_KEYS = False
