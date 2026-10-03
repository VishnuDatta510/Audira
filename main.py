import os

import uvicorn


if __name__ == "__main__":
    # Hosts set PORT and need every interface. Local `uv run main.py` keeps reload on localhost.
    hosted = "PORT" in os.environ
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0" if hosted else "127.0.0.1",
        port=int(os.environ.get("PORT", "8000")),
        reload=not hosted,
    )
