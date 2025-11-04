# การใช้งาน Apache Alias Configuration
# สำหรับโปรเจค Backpack Hostel PHP API

## 📋 ขั้นตอนการตั้งค่า

### 1. เพิ่มบรรทัดนี้ใน httpd.conf
```apache
IncludeOptional "C:/Learnning coding/php-api/apache/httpd-backpack-alias.conf"
```

### 2. ตำแหน่งที่ควรเพิ่มใน httpd.conf
```apache
# ใกล้ท้ายไฟล์ หลังจาก Include statements อื่นๆ
Include conf/extra/httpd-default.conf
IncludeOptional conf/extra/httpd-vhosts.conf
IncludeOptional conf/extra/httpd-ssl.conf

# เพิ่มบรรทัดนี้
http://localhost/api/room-types.php?type=private&lang=th
http://localhost/api/room-images.php?room_type_id=1
```

## 🌐 URL ที่สามารถเข้าถึงได้

หลังจากตั้งค่าเรียบร้อย API จะเข้าถึงได้ผ่าน:

### API Endpoints:
- `http://localhost/backpack-api/` (หน้าแรก API)
- `http://localhost/backpack-api/room-types.php`
- `http://localhost/backpack-api/room-images.php`

### หรือใช้ alias สั้นๆ:
- `http://localhost/api/` (หน้าแรก API)
- `http://localhost/api/room-types.php`
- `http://localhost/api/room-images.php`

### Static Files:
- `http://localhost/backpack-static/index.html`
- `http://localhost/backpack-static/public/index.html`

## 📝 ตัวอย่างการเรียกใช้ API

```javascript
// ดึงข้อมูลห้องพัก Private
fetch('http://localhost/api/room-types.php?type=private&lang=th')
  .then(response => response.json())
  .then(data => console.log(data));

// ดึงข้อมูลเตียง Dorm
fetch('http://localhost/api/room-types.php?type=dorm&lang=en')
  .then(response => response.json())
  .then(data => console.log(data));

// ดึงรูปภาพของห้องพัก ID 1
fetch('http://localhost/api/room-images.php?room_type_id=1&lang=th')
  .then(response => response.json())
  .then(data => console.log(data));
```

## 🔧 การทดสอบ

### 1. ตรวจสอบ syntax
```bash
httpd -t
```

### 2. Restart Apache
```bash
net stop Apache2.4
net start Apache2.4
```

### 3. ทดสอบ endpoints
- เปิด browser ไปที่ `http://localhost/api/`
- ทดสอบ API: `http://localhost/api/room-types.php?type=private&lang=th`

## 📂 โครงสร้างไฟล์

```
C:/Learnning coding/
├── php-api/
│   ├── apache/
│   │   └── httpd-backpack-alias.conf ← ไฟล์ config ใหม่
│   ├── config.php
│   ├── cors.php
│   ├── room-types.php
│   ├── room-images.php
│   ├── index.php
│   └── .htaccess
└── src/main/resources/static/ ← Static files
```

## ⚠️ หมายเหตุสำคัญ

1. **Path**: ตรวจสอบให้แน่ใจว่า path `C:/Learnning coding` ถูกต้อง
2. **Permissions**: Apache ต้องมีสิทธิ์อ่านไฟล์ในโฟลเดอร์
3. **MySQL**: ตรวจสอบว่า MySQL service ทำงานอยู่
4. **PHP**: ตรวจสอบว่า PHP module โหลดแล้วใน Apache
5. **Logs**: ดู error logs ที่ `C:/Learnning coding/php-api/error.log`