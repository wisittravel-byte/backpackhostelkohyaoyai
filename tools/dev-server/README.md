Local Static Dev Server (tools/dev-server)

Run options

1) VS Code Task (recommended)
- Run the task: Start Static Server (PowerShell - tools)
- It launches ps-static-server-v2.ps1 and serves from src/main/resources/static via -Root.

2) Double-click
- Double-click run-server.bat in this folder.

3) Manual (PowerShell)
- Open PowerShell and run:

    powershell -NoProfile -ExecutionPolicy Bypass -File "c:\Learnning coding\tools\dev-server\ps-static-server-v2.ps1" -Port 8080 -Bind 127.0.0.1 -Root "c:\Learnning coding\src\main\resources\static"

Open the site:
- http://127.0.0.1:8080/

Troubleshooting
- If the listener fails to start when binding to all interfaces, pass -Bind 127.0.0.1 (default).
- Ensure the -Root path points to src/main/resources/static.
