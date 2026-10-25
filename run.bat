@echo off
rem PicApp launcher for Windows: double-click to start. Also: run.bat stop | logs | backup
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0run.ps1" %*
rem Keep the window open when double-clicked, so messages can be read
pause
