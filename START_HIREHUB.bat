@echo off
setlocal
cd /d "%~dp0"

echo ==========================================
echo HireHub - FINAL ONE CLICK
echo ==========================================
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js is not installed or not in PATH.
  echo Install Node.js LTS, reopen this folder, and run this file again.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo ERROR: npm is not available in PATH.
  echo Reinstall Node.js LTS and run this file again.
  pause
  exit /b 1
)

if not exist "server\.env" (
  echo ERROR: server\.env is missing.
  echo Copy your working .env into the server folder first.
  echo.
  pause
  exit /b 1
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5000 " ^| findstr "LISTENING"') do (
  echo ERROR: Port 5000 is already in use by PID %%P.
  echo Close the old HireHub backend window and run this file again.
  pause
  exit /b 1
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5173 " ^| findstr "LISTENING"') do (
  echo ERROR: Port 5173 is already in use by PID %%P.
  echo Close the old HireHub frontend window and run this file again.
  pause
  exit /b 1
)

echo [1/4] Checking backend packages...
if not exist "server\node_modules\express\package.json" (
  echo Installing backend packages. This is required only on first run...
  call npm install --prefix server --no-audit --no-fund
  if errorlevel 1 goto :install_error
) else (
  echo Backend packages OK.
)

echo.
echo [2/4] Checking frontend packages...
if not exist "client\node_modules\vite\package.json" (
  echo Installing frontend packages. This is required only on first run...
  call npm install --prefix client --no-audit --no-fund
  if errorlevel 1 goto :install_error
) else (
  echo Frontend packages OK.
)

echo.
echo [3/4] Starting backend and database check...
start "HireHub API" cmd /k "cd /d ""%~dp0server"" && npm start"

echo Waiting for API...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 80;$i++){ try { $r=Invoke-RestMethod -Uri 'http://localhost:5000/api/health' -TimeoutSec 1; if($r.ok){$ok=$true; break} } catch {}; Start-Sleep -Milliseconds 750 }; if(-not $ok){exit 1}"
if errorlevel 1 goto :backend_error

echo API READY.
echo.
echo [4/4] Starting frontend...
start "HireHub Web" cmd /k "cd /d ""%~dp0client"" && npm run dev"

timeout /t 2 /nobreak >nul
start "" "http://localhost:5173"

echo.
echo ==========================================
echo HireHub is running.
echo Frontend: http://localhost:5173
echo Backend : http://localhost:5000
echo ==========================================
exit /b 0

:install_error
echo.
echo PACKAGE INSTALL FAILED.
echo Check your internet connection and the npm error above.
pause
exit /b 1

:backend_error
echo.
echo BACKEND DID NOT BECOME READY.
echo Look at the separate window named "HireHub API" for the exact database/server error.
echo Frontend was not started.
pause
exit /b 1
