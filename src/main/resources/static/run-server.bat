@echo off
REM Launch the PowerShell static server in a new window (serves this folder)
pushd "%~dp0"
start "BackpackStaticServer" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ps-static-server-v2.ps1" -Port 8080
popd
echo Launched server (check new PowerShell window). Open http://127.0.0.1:8080/
pause
