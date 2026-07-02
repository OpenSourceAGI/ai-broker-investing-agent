# Quick start

Get the bot running with **paper trading** (simulated money, real market data). Switch to **live** only when you are ready for real orders.

---

## What you need

- **Python 3.12+** — **3.12** is the most predictable; **3.13/3.14** work if you reinstall deps after cloning (`pip install -r backend/requirements.txt`) so SQLAlchemy and httpx match current pins.
- **Node.js 18+**

---

## One-time setup

Do these steps from the **Kalshi Vibe Bot** folder (the repo root—the same folder that contains `start.bat`).

### 1. Python environment

**Windows (PowerShell or Command Prompt):**

```text
cd "Kalshi Vibe Bot"
python -m venv venv
venv\Scripts\activate
pip install -r backend\requirements.txt
```

**macOS / Linux:**

```text
cd "Kalshi Vibe Bot"
python3.12 -m venv venv
source venv/bin/activate
pip install -r backend/requirements.txt
```

### 2. API keys and Kalshi key file

1. Copy the environment template to a real config file:
   - **Windows:** `copy backend\.env.template backend\.env`
   - **Mac/Linux:** `cp backend/.env.template backend/.env`

2. Open **`backend/.env`** in a text editor and fill in at least:
   - **`KALSHI_API_KEY`** — from [Kalshi API settings](https://kalshi.com/account/api)
   - **`GEMINI_API_KEY`** — from [Google AI Studio](https://aistudio.google.com/apikey) (default provider)
   - **`XAI_API_KEY`** — from [xAI Console](https://console.x.ai/) (only if you use xAI in Settings)

3. Kalshi also gives you a **private key file** when you create API access. Save it as **`backend/kalshi_private_key.pem`** (or another path and set **`KALSHI_PRIVATE_KEY_PATH`** in `.env` to match).

4. **Optional — verify Kalshi auth and parsing** (requires the key file above). From **`backend/`** with your venv activated:

   ```text
   python scripts/verify_kalshi_parsing.py
   ```

   Expect a short log: portfolio positions, one page of orders, an orderbook sample, then `OK: Kalshi live reads...`. It does not place trades.

   **Repair toolbars (live rows only):** if quantities or open P&L drift vs Kalshi after trading outside the bot, from **`backend/`** run `python scripts/refresh_open_live_positions_from_kalshi.py` (open legs) and/or `python scripts/refinalize_live_closed_pnl.py` (closed legs). Use `--force-live` when `TRADING_MODE` is still `paper`.

### 3. Frontend dependencies

```text
cd frontend
npm install
cd ..
```

If the dashboard runs on a **non-default host or port**, create `frontend/.env` with `VITE_API_BASE_URL` and `VITE_WS_URL` pointing at your backend. Optionally add **`CORS_ORIGINS`** to `backend/.env` (comma-separated origins; default is localhost:3000). Vite dev uses **port 3000**, not 5173.

For a single-machine setup, **`HOST=127.0.0.1`** in `backend/.env` avoids binding the API on all interfaces. Keep **`ENABLE_DEBUG_RAW_KALSHI=false`** unless you need the `GET /debug/raw` Kalshi debug route.

---

## Run the app

From the repo root:

1. Double‑click **`start.bat`** (Windows), **or** run it from a terminal in this folder.

That starts the backend and frontend and should open the dashboard in your browser.

- If it doesn’t open automatically, go to **http://localhost:3000**
- The API lives at **http://localhost:8000**

To stop everything, run **`stop.bat`** (or close the windows it opened).

---

## First-time checklist in the UI

1. Confirm the header shows **Paper** mode while you learn (use **Live** only when you intend real trades).
2. Set the bot to **Play** when you want it to scan and trade automatically; **Pause** or **Stop** when you want it idle.

**Live mode:** uses real money — IOC limit **buys** at ask (+ slippage); **exits** use **stop-loss only** after a short grace period: **open cash basis** (Entry column) vs dashboard **Est. Value** × quantity. Strategy defaults come from **`backend/.env`** and **`config.py`** (e.g. min edge **5**, min AI win **60%**, stop-loss **80%** drawdown); **Settings** lets you pick **Gemini or xAI**, plus those four knobs in **`tuning_state`** (applied immediately). Additional caps (max edge, max AI %, Kelly limit, sports rules) are automatic — see [README.md](README.md).

3. **Live only:** if you trade outside the bot or restart after downtime, open **Settings** and use **Reconcile with Kalshi** so open quantities, invested/fees basis, buy-order entry economics, unrealized marks, and closed P&L stay aligned with Kalshi (see README ``POST /portfolio/live/reconcile``). For a CLI-only open-leg refresh, use ``python scripts/refresh_open_live_positions_from_kalshi.py`` from ``backend/``.

---

## Need more detail?

See **[README.md](README.md)** for configuration options, troubleshooting, and how the bot behaves under the hood.
