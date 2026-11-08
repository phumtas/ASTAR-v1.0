

@echo off
title A* - the homework destroyer
cd /d "%~dp0"

echo ====================================================
echo   Starting A* - the homework destroyer...
echo ====================================================

:: Check if Node.js is available to run the local API proxy server
where node >nul 2>nul
if %errorlevel% equ 0 (
    echo Starting preview server on http://localhost:3000 ...
    :: Wait a moment and launch browser to localhost:3000
    start "" http://localhost:3000
    node server.js
) else (
    echo Node.js not detected. Opening Index.html directly in browser...
    start "" "Index.html"
)

