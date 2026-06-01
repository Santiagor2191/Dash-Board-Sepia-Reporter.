@echo off
REM ============================================================
REM  Actualiza "Clientes y Contabilidad" en la nube (Neon).
REM  Lee el Excel sincronizado por OneDrive en este PC y sube
REM  el resultado a la base. Pensado para Tarea Programada o
REM  doble clic manual. Deja registro en push_contabilidad.log
REM ============================================================

set "PYEXE=C:\Users\SANTIAGO\AppData\Local\Python\pythoncore-3.14-64\python.exe"
set "SCRIPT=%~dp0push_clientes_contabilidad_a_neon.py"
set "LOG=%~dp0push_contabilidad.log"

echo ============================================ >> "%LOG%"
echo %DATE% %TIME% - Iniciando actualizacion >> "%LOG%"
"%PYEXE%" "%SCRIPT%" >> "%LOG%" 2>&1
echo %DATE% %TIME% - Fin (codigo de salida %ERRORLEVEL%) >> "%LOG%"
