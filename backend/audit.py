"""Audit logging. Timestamps are Firestore server timestamps (trusted, not from the browser)."""
import logging

from firebase_admin import firestore
from flask import g, has_request_context

from .firebase import get_db

log = logging.getLogger(__name__)


def log_action(action, entity, entity_id="", details=None, user=None):
    try:
        if user is None and has_request_context() and hasattr(g, "user"):
            user = g.user
        user = user or {}
        get_db().collection("auditLogs").add(
            {
                "action": action,
                "entity": entity,
                "entityId": entity_id,
                "details": details or {},
                "userId": user.get("uid", ""),
                "userName": user.get("name", ""),
                "userEmail": user.get("email", ""),
                "timestamp": firestore.SERVER_TIMESTAMP,
            }
        )
    except Exception:  # never let logging break the main action, but record the failure
        log.exception("Failed to write audit log for %s", action)
