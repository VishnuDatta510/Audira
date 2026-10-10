"""Create or update ten clearly marked demo accounts in MongoDB.

Run: .\\.venv\\Scripts\\python.exe scripts\\seed_demo_users.py
"""
from app.services.auth import hash_password
from app.services.repository import repository


DEMO_USERS = [
    ("Aarav Sharma", "aarav.demo@audira.local", "Demo0001"),
    ("Ananya Iyer", "ananya.demo@audira.local", "Demo0002"),
    ("Vikram Patel", "vikram.demo@audira.local", "Demo0003"),
    ("Priya Nair", "priya.demo@audira.local", "Demo0004"),
    ("Rohan Mehta", "rohan.demo@audira.local", "Demo0005"),
    ("Kavya Reddy", "kavya.demo@audira.local", "Demo0006"),
    ("Arjun Singh", "arjun.demo@audira.local", "Demo0007"),
    ("Meera Kapoor", "meera.demo@audira.local", "Demo0008"),
    ("Dev Malhotra", "dev.demo@audira.local", "Demo0009"),
    ("Ishita Bose", "ishita.demo@audira.local", "Demo0010"),
]


def main() -> None:
    if repository.db is None:
        raise RuntimeError("MONGODB_URI is not configured in .env")
    for name, email, password in DEMO_USERS:
        repository.db.users.update_one(
            {"email": email},
            {"$set": {"name": name, "email": email, "password_hash": hash_password(password), "is_demo": True}},
            upsert=True,
        )
    print(f"Seeded {len(DEMO_USERS)} demo users into '{repository.db.name}'.")


if __name__ == "__main__":
    main()
