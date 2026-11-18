"""Create (or promote) the first Super Admin.

Run from the project root:   python scripts/create_super_admin.py
Public registration is disabled, so this is how the very first account is made.
"""
import getpass
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from firebase_admin import auth as fb_auth  # noqa: E402
from firebase_admin import firestore  # noqa: E402

from backend.firebase import get_db, init_firebase  # noqa: E402
from backend.auth import ALL_PERMS  # noqa: E402
from config import Config  # noqa: E402


def main():
    init_firebase({
        "FIREBASE_CREDENTIALS_JSON": Config.FIREBASE_CREDENTIALS_JSON,
        "FIREBASE_CREDENTIALS_FILE": Config.FIREBASE_CREDENTIALS_FILE,
    })
    email = input("Super Admin email: ").strip().lower()
    name = input("Full name: ").strip()
    try:
        user = fb_auth.get_user_by_email(email)
        print("Existing Firebase user found - promoting to Super Admin.")
    except fb_auth.UserNotFoundError:
        password = getpass.getpass("Password (min 8 characters): ")
        if len(password) < 8:
            sys.exit("Password too short.")
        user = fb_auth.create_user(email=email, password=password, display_name=name)
        print("Firebase user created.")

    get_db().collection("users").document(user.uid).set({
        "email": email, "name": name or user.display_name or email, "role": "super_admin",
        "permissions": ALL_PERMS, "active": True,
        "createdAt": firestore.SERVER_TIMESTAMP, "updatedAt": firestore.SERVER_TIMESTAMP,
    }, merge=True)
    print(f"Done. {email} can now sign in at /login.html as Super Admin.")


if __name__ == "__main__":
    main()
