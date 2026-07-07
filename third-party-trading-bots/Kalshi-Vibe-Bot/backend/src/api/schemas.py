from typing import Literal

from pydantic import BaseModel, model_validator


class BotStateRequest(BaseModel):
    state: str


class TradingModeRequest(BaseModel):
    mode: str


class StopLossSellingRequest(BaseModel):
    enabled: bool


class AiProviderRequest(BaseModel):
    provider: Literal["gemini", "xai"]


class StrategyKnobsRequest(BaseModel):
    """Minimum edge, stop-loss drawdown fraction, AI buy-side win-prob floor, and/or max open positions (at least one required)."""

    min_edge_to_buy_pct: float | int | None = None
    stop_loss_drawdown_pct: float | None = None
    min_ai_win_prob_buy_side_pct: int | None = None
    max_open_positions: int | None = None

    @model_validator(mode="after")
    def at_least_one_field(self):
        if (
            self.min_edge_to_buy_pct is None
            and self.stop_loss_drawdown_pct is None
            and self.min_ai_win_prob_buy_side_pct is None
            and self.max_open_positions is None
        ):
            raise ValueError(
                "At least one of min_edge_to_buy_pct, stop_loss_drawdown_pct, min_ai_win_prob_buy_side_pct, "
                "or max_open_positions is required"
            )
        return self
