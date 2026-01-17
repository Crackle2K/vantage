@echo off
echo ===============================
echo Starting Vantage Application
echo ===============================
echo.

:: Store the root directory
set ROOT_DIR=%~dp0

:: Start the backend in a new window
echo Starting Backend (FastAPI)...
start "Vantage Backend" cmd /k "cd /d %ROOT_DIR%backend && python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000"

:: Wait a moment for the backend to start
timeout /t 3 /nobreak > nul

:: Start the frontend in a new window
echo Starting Frontend (Vite)...
start "Vantage Frontend" cmd /k "cd /d %ROOT_DIR%frontend && npm run dev"

echo.
echo ===============================
echo Both servers are starting!
echo ===============================
echo.
echo Backend: http://localhost:8000
echo Frontend: http://localhost:5173
echo API Docs: http://localhost:8000/docs
echo.
echo Close this window or press any key to continue...
pause > nul
