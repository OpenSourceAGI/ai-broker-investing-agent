@echo off
setlocal
title Kalshi Vibe Bot - Stopping

echo.
echo  Stopping Kalshi Vibe Bot...
echo.

:: Kill by window title (set by start.bat)
taskkill /fi "WINDOWTITLE eq KalshiBot-Backend" /f >nul 2>&1
if %errorlevel%==0 (
    echo  [OK] Backend stopped.
) else (
    echo  [  ] Backend was not running.
)

taskkill /fi "WINDOWTITLE eq KalshiBot-Frontend" /f >nul 2>&1
if %errorlevel%==0 (
    echo  [OK] Frontend stopped.
) else (
    echo  [  ] Frontend was not running.
)

:: Also kill any processes lingering on ports 8000 and 3000
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| find ":8000 " ^| find "LISTENING"') do (
    taskkill /pid %%p /f >nul 2>&1
)
for /f "tokens=5" %%p in ('netstat -ano 2^>nul ^| find ":3000 " ^| find "LISTENING"') do (
    taskkill /pid %%p /f >nul 2>&1
)

echo.
echo  All Kalshi Vibe Bot processes stopped.
echo.
pause
