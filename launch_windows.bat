@echo off
setlocal

cd /d "%~dp0"

where py >nul 2>nul
if %errorlevel%==0 (
    start "DCM Editor Server" cmd /k py -3 app.py
    goto :open_browser
)

where python >nul 2>nul
if %errorlevel%==0 (
    start "DCM Editor Server" cmd /k python app.py
    goto :open_browser
)

echo Python was not found on this PC.
echo Install Python 3 and try again.
pause
exit /b 1

:open_browser
timeout /t 2 /nobreak >nul
start "" "http://127.0.0.1:8765"
