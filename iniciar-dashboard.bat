@echo off
setlocal

echo Limpiando puertos bloqueados antes de iniciar...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":3000 "') do taskkill /F /PID %%a 2>nul
for /f "tokens=5" %%a in ('netstat -aon ^| findstr ":5173 "') do taskkill /F /PID %%a 2>nul
taskkill /F /IM ngrok.exe 2>nul

set "ROOT=%~dp0"
set "API_DIR=%ROOT%sepia meli api"
set "DASH_DIR=%ROOT%sepia-dashboard-Fronted"

if not exist "%API_DIR%\package.json" (
  echo No se encontro el proyecto de la API en:
  echo %API_DIR%
  exit /b 1
)

if not exist "%DASH_DIR%\package.json" (
  echo No se encontro el proyecto del dashboard en:
  echo %DASH_DIR%
  exit /b 1
)

echo Iniciando API...
start "Sepia API" cmd /k "cd /d ""%API_DIR%"" && npm run dev"

timeout /t 2 /nobreak >nul

echo Iniciando Ngrok para autenticacion con Mercado Libre...
start "Sepia Ngrok" cmd /k "ngrok http 3000 --domain=nontransposable-veda-unintrudingly.ngrok-free.dev"

timeout /t 2 /nobreak >nul

echo Iniciando dashboard...
start "Sepia Dashboard" cmd /k "cd /d ""%DASH_DIR%"" && npm run dev"

echo.
echo Procesos lanzados.
echo API: http://localhost:3000
echo Dashboard: http://localhost:5173
echo Ngrok: https://nontransposable-veda-unintrudingly.ngrok-free.dev

endlocal
