from fastapi import APIRouter, WebSocket

from src.app_state import app_state
from src.logger import logger
from src.util.datetimes import utc_iso_z, utc_now

router = APIRouter(tags=["websocket"])


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    app_state.connected_clients.append(websocket)
    logger.info("WS client connected (total=%d)", len(app_state.connected_clients))
    try:
        await websocket.send_json({
            "type": "connection",
            "status": "connected",
            "timestamp": utc_iso_z(utc_now()),
        })
        while True:
            await websocket.receive_text()
    except Exception as e:
        logger.debug("WS closed: %s", e)
    finally:
        clients = app_state.connected_clients
        if websocket in clients:
            clients.remove(websocket)
