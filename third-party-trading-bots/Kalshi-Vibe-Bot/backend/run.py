"""
Entry point for the Kalshi Vibe Bot backend.

The trading loop starts inside the FastAPI lifespan (src/main.py).

Run from backend/: python run.py

Bot state (play/pause/stop) is controlled via the dashboard UI or POST /bot/state.
"""

if __name__ == "__main__":
    import os
    from pathlib import Path

    # Ensure cwd is backend/ (fixes relative paths in .env and matches docs) even if invoked from elsewhere.
    os.chdir(Path(__file__).resolve().parent)

    import uvicorn
    from src.config import settings

    # Avoid Unicode box-drawing characters: Windows consoles may use cp1252 by default.
    print(
        "\n"
        "Kalshi Vibe Bot\n"
        "------------------\n"
        "Open http://localhost:3000 in your browser.\n"
        "Use the Play/Pause/Stop buttons to control the bot.\n"
    )

    uvicorn.run(
        "src.main:app",
        host=settings.host,
        port=settings.port,
        log_level="info",
        reload=False,
    )
