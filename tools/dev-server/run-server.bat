@echo off
REM Launch the PowerShell static server in a new window (serves src/main/resources/static)
REM Bind to 127.0.0.1 to avoid URL ACL and admin requirement.
pushd "%~dp0"
start "BackpackStaticServer" powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ps-static-server-v2.ps1" -Port 8080 -Bind 127.0.0.1 -Root "%~dp0..\..\src\main\resources\static"
popd
echo Launched server (check new PowerShell window). Open http://127.0.0.1:8080/
pause
