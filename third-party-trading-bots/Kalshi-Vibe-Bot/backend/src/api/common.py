from sqlalchemy.orm import Session

from src.database.models import BotState


def ensure_bot_state(db: Session) -> BotState:
    row = db.query(BotState).filter(BotState.id == 1).first()
    if not row:
        row = BotState(id=1, state="stop")
        db.add(row)
        db.commit()
    return row
