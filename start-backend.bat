@echo off
echo ================================================
echo    Vantage Backend - Quick Start
echo ================================================
echo.

cd /d "%~dp0backend"

echo Checking Python installation...
python --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed or not in PATH
    echo Please install Python 3.11+ from https://python.org
    pause
    exit /b 1
)

echo [OK] Python found
echo.

echo Starting FastAPI backend server...
echo Backend will run on: http://localhost:8000
echo API docs available at: http://localhost:8000/docs
echo.
echo Press Ctrl+C to stop the server
echo.

uvicorn main:app --reload
