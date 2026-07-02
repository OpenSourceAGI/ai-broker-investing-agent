"""WebSocket fan-out to dashboard clients."""

from typing import List

from fastapi import WebSocket

from src.app_state import app_state


async def broadcast_update(update: dict) -> None:
    disconnected: List[WebSocket] = []
    clients = app_state.connected_clients
    for ws in clients:
        try:
            await ws.send_json(update)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        if ws in clients:
            clients.remove(ws)
