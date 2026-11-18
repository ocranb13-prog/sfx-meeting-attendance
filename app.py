"""Entry point.  Local:  python app.py     Production:  gunicorn app:app"""
from backend import create_app

app = create_app()

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
