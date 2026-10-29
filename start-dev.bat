@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
cd /d "%~dp0"
echo Starting Ex Libris (Vite + React + TypeScript) on http://localhost:3000 ...
npm run dev
pause
