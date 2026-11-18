"""Firebase Admin SDK setup. Credentials come from environment variables only."""
import json
import logging

import firebase_admin
from firebase_admin import credentials, firestore

log = logging.getLogger(__name__)
_db = None


def init_firebase(config):
    if firebase_admin._apps:
        return
    if config.get("FIREBASE_CREDENTIALS_JSON"):
        cred = credentials.Certificate(json.loads(config["FIREBASE_CREDENTIALS_JSON"]))
    elif config.get("FIREBASE_CREDENTIALS_FILE"):
        cred = credentials.Certificate(config["FIREBASE_CREDENTIALS_FILE"])
    else:
        raise RuntimeError(
            "Firebase credentials missing. Set FIREBASE_CREDENTIALS_FILE or FIREBASE_CREDENTIALS_JSON."
        )
    firebase_admin.initialize_app(cred)
    log.info("Firebase Admin initialised")


def get_db():
    global _db
    if _db is None:
        _db = firestore.client()
    return _db
