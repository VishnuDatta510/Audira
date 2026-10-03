"""Create or update ten clearly marked demo accounts in MongoDB.

Run: .\\.venv-bnb\\Scripts\\python.exe scripts\\seed_demo_users.py
"""
from app.services.repository import repository, password_hash


DEMO_USERS = [
    ("Aarav Sharma", "aarav.demo@bnb.local", "Demo0001"),
    ("Ananya Iyer", "ananya.demo@bnb.local", "Demo0002"),
    ("Vikram Patel", "vikram.demo@bnb.local", "Demo0003"),
    ("Priya Nair", "priya.demo@bnb.local", "Demo0004"),
    ("Rohan Mehta", "rohan.demo@bnb.local", "Demo0005"),
    ("Kavya Reddy", "kavya.demo@bnb.local", "Demo0006"),
    ("Arjun Singh", "arjun.demo@bnb.local", "Demo0007"),
    ("Meera Kapoor", "meera.demo@bnb.local", "Demo0008"),
    ("Dev Malhotra", "dev.demo@bnb.local", "Demo0009"),
    ("Ishita Bose", "ishita.demo@bnb.local", "Demo0010"),
]


def main() -> None:
    if repository.db is None:
        raise RuntimeError("MONGODB_URI is not configured in .env")
    for name, email, password in DEMO_USERS:
        repository.db.users.update_one(
            {"email": email},
            {"$set": {"name": name, "email": email, "password_hash": password_hash(password), "is_demo": True}},
            upsert=True,
        )
    print(f"Seeded {len(DEMO_USERS)} demo users into '{repository.db.name}'.")


if __name__ == "__main__":
    main()
