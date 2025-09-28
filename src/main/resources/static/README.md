How to run the static site locally

Options

1) From VS Code Run/Tasks (recommended)
- Open this workspace in VS Code.
- Open the Command Palette -> Run Task -> choose "Start Static Server (PowerShell)" or "Start Static Server (Python)".
- If you use the PowerShell task it runs the bundled script `ps-static-server-v2.ps1` and binds to 127.0.0.1:8080 by default.

2) Run the PowerShell server interactively (helpful for debugging)
- Open PowerShell as Administrator and run the following commands:

    Set-Location "C:\Learnning coding\src\main\resources\static"
    .\ps-static-server-v2.ps1 -Port 8080

If the script reports Failed to start listener then it likely needs elevated permission or the URL is not registered. You can allow the URL as Administrator with:

    netsh http add urlacl url=http://+:8080/ user=Everyone

3) Python http.server (if you have Python installed)

    Set-Location "C:\Learnning coding\src\main\resources\static"
    python -m http.server 8080

Open the site in your browser:

http://127.0.0.1:8080/

Alternative: double-click `run-server.bat` in this folder to launch the server in a new PowerShell window.

Troubleshooting
- ERR_CONNECTION_REFUSED: server is not listening — ensure the server script is running and bound to the correct address/port.
- If using the PowerShell script, run it interactively to see the startup error (do not start it hidden). Paste the error here and I will help.


--------------------------------------
การ Deploy เพื่อใช้งานบน Internet ทางเลือกแนะนำ
1. GitHub Pages (ง่าย ไม่ต้องมีเซิร์ฟเวอร์เอง)
สิ่งที่ผมทำให้แล้ว:
สร้าง workflow ที่ deploy-pages.yml สำหรับปล่อยไฟล์ใน static อัตโนมัติ
อัปเดต README อธิบายขั้นตอน
วิธีใช้งาน:
push โค้ดขึ้น GitHub
ที่ GitHub: Settings → Pages → Build and deployment → Source เลือก GitHub Actions
เมื่อ Action รันเสร็จ เว็บไซต์จะอยู่ที่: https://<your-user>.github.io/<repo>/
2. Netlify (เชื่อม repo หรือ drag & drop)
สิ่งที่ผมทำให้แล้ว:
สร้าง netlify.toml ระบุ publish directory เป็น static
วิธีใช้งาน:
สร้างบัญชี Netlify แล้วเชื่อม repo นี้ หรือไปหน้า Deploys แล้ว drag โฟลเดอร์ static ลงไป
ไม่ต้องมี build command
ได้โดเมนแบบ *.netlify.app
3. Vercel (เชื่อม repo)
สิ่งที่ผมทำให้แล้ว:
สร้าง vercel.json เพื่อชี้เสิร์ฟไฟล์จาก static
วิธีใช้งาน:
สร้างบัญชี Vercel แล้ว Import repo นี้
กด Deploy จะได้โดเมนแบบ *.vercel.app
