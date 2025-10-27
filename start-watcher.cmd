@echo off
REM Launch auto-commit/push watcher hidden
powershell -WindowStyle Hidden -NoProfile -ExecutionPolicy Bypass -File "%~dp0scripts\auto-commit-push.ps1" -DebounceSeconds 2
