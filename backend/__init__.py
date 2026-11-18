"""Flask application factory for the St. Francis Xavier Hospital meeting attendance system."""
import logging
from pathlib import Path

from flask import Flask, jsonify, redirect, request, send_from_directory
from werkzeug.exceptions import HTTPException
from werkzeug.middleware.proxy_fix import ProxyFix

from config import Config

from .extensions import limiter
from .firebase import init_firebase
from .utils import ApiError

FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"


def create_app():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    app = Flask(__name__, static_folder=str(FRONTEND_DIR), static_url_path="")
    app.config.from_object(Config)
    if app.config["TRUST_PROXY"]:
        app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1)

    init_firebase(app.config)
    limiter.init_app(app)

    from .routes import attendance, core, meetings, public, reports, users

    for module in (public, core, meetings, attendance, reports, users):
        app.register_blueprint(module.bp)

    # ---------- pages ----------
    @app.get("/")
    def index():
        return redirect("/login.html")

    @app.get("/admin")
    def admin_page():
        return send_from_directory(FRONTEND_DIR, "admin.html")

    @app.get("/attend/<token>")
    def attend_page(token):
        return send_from_directory(FRONTEND_DIR, "attend.html")

    # ---------- errors ----------
    @app.errorhandler(ApiError)
    def handle_api_error(err):
        return jsonify({"error": err.message}), err.status

    @app.errorhandler(429)
    def handle_rate_limit(err):
        return jsonify({"error": "Too many attempts. Please wait a minute and try again."}), 429

    @app.errorhandler(HTTPException)
    def handle_http(err):
        if request.path.startswith("/api/"):
            return jsonify({"error": err.description}), err.code
        return err

    @app.errorhandler(Exception)
    def handle_unexpected(err):
        app.logger.exception("Unhandled error")
        if request.path.startswith("/api/"):
            return jsonify({"error": "Something went wrong on the server. Please try again."}), 500
        return "Server error", 500

    @app.after_request
    def security_headers(resp):
        resp.headers["X-Content-Type-Options"] = "nosniff"
        resp.headers["X-Frame-Options"] = "DENY"
        # The QR token is part of the URL, so never leak it through the Referer header.
        resp.headers["Referrer-Policy"] = "no-referrer"
        if request.path.startswith("/api/"):
            resp.headers["Cache-Control"] = "no-store"
        return resp

    return app
