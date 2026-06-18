@echo off
REM ============================================================
REM  Inicia el dashboard Sepia en local.
REM  Doble clic para arrancar. Se abren dos ventanas negras:
REM   - "Sepia API"       = backend (datos)   puerto 3001
REM   - "Sepia Dashboard" = frontend (vista)  puerto 5173
REM  Deja las dos ventanas abiertas mientras uses el dashboard.
REM  Para apagar todo: cierra las dos ventanas negras.
REM ============================================================

start "Sepia API (backend 3001)" /d "D:\dash board sepia BI\sepia meli api" cmd /k "set ""PORT=3001"" && npm start"

start "Sepia Dashboard (frontend 5173)" /d "D:\dash board sepia BI\sepia-dashboard-Fronted" cmd /k "npm run dev"

REM Espera a que arranquen y abre el navegador.
timeout /t 8 /nobreak >nul
start "" http://localhost:5173/
