@echo off
setlocal
cd /d "%~dp0"
title Kalshi Vibe Bot

echo.
echo  ============================================================
echo    Kalshi Vibe Bot  ^|  xAI-powered prediction trading 
echo  ============================================================
echo.

:: ── Resolve Python for child windows ───────────────────────────────────────────
:: New cmd windows do NOT inherit "activate.bat" from this script — use venv python.exe explicitly.
set "PYEXE="
if exist "%~dp0venv\Scripts\python.exe" (
    set "PYEXE=%~dp0venv\Scripts\python.exe"
    echo  [1/4] Using virtual environment ^(venv\Scripts\python.exe^).
) else if exist "%~dp0.venv\Scripts\python.exe" (
    set "PYEXE=%~dp0.venv\Scripts\python.exe"
    echo  [1/4] Using virtual environment ^(.venv\Scripts\python.exe^).
) else (
    echo  [1/4] No venv\Scripts\python.exe found — backend will use system Python.
    echo         Create one:  python -m venv venv  then  pip install -r backend\requirements.txt
    set "PYEXE=python"
)

:: ── Start backend ──────────────────────────────────────────────────────────────
:: START /D avoids broken quoting when the repo path contains spaces.
echo  [2/4] Starting backend  ^(http://localhost:8000^)...
if /i "%PYEXE%"=="python" (
    start "KalshiBot-Backend" /D "%~dp0backend" cmd /k python run.py
) else (
    start "KalshiBot-Backend" /D "%~dp0backend" cmd /k ""%PYEXE%" run.py"
)

:: Give uvicorn a few seconds to initialise
timeout /t 4 /nobreak >nul

:: ── Start frontend ─────────────────────────────────────────────────────────────
echo  [3/4] Starting frontend  ^(http://localhost:3000^)...
start "KalshiBot-Frontend" /D "%~dp0frontend" cmd /k npm run dev

:: Give Vite a few seconds to compile
timeout /t 7 /nobreak >nul

:: ── Open browser ──────────────────────────────────────────────────────────────
echo  [4/4] Opening browser...
start "" "http://localhost:3000"

echo.
echo  ============================================================
echo    Kalshi Vibe Bot is running!
echo.
echo    Frontend : http://localhost:3000
echo    Backend  : http://localhost:8000
echo    API docs : http://localhost:8000/docs
echo  ============================================================
echo.
echo    Run stop.bat or close the backend/frontend windows to stop.
echo.
pause
