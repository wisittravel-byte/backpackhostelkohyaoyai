# การตั้งค่า Apache httpd.conf สำหรับ PHP API
# คู่มือการปรับแต่งสำหรับโปรเจค Backpack Hostel

## 📋 รายการ Modules ที่จำเป็นใน httpd.conf

### 1. เปิดใช้งาน PHP Module
```apache
LoadModule php_module modules/libphp.so
# หรือใน Windows อาจเป็น
# LoadModule php8_module "C:/php/php8apache2_4.dll"
```

### 2. Modules อื่นๆ ที่จำเป็น
```apache
LoadModule rewrite_module modules/mod_rewrite.so
LoadModule headers_module modules/mod_headers.so
LoadModule dir_module modules/mod_dir.so
LoadModule mime_module modules/mod_mime.so
```

## 🔧 การตั้งค่าพื้นฐาน

### 1. กำหนดประเภทไฟล์ PHP
```apache
<IfModule mime_module>
    AddType application/x-httpd-php .php
    AddType application/x-httpd-php-source .phps
</IfModule>
```

### 2. กำหนด DirectoryIndex
```apache
<IfModule dir_module>
    DirectoryIndex index.php index.html index.htm
</IfModule>
```

### 3. PHP Configuration
```apache
# เพิ่มใน httpd.conf หรือใน <Directory> block
php_value default_charset "UTF-8"
php_value mbstring.internal_encoding "UTF-8"
php_value mbstring.http_output "UTF-8"
php_value memory_limit "256M"
php_value max_execution_time "60"
php_value post_max_size "50M"
php_value upload_max_filesize "50M"
```

## 🌐 CORS Configuration

### ใน httpd.conf (Global)
```apache
# เปิดใช้งาน Headers module
LoadModule headers_module modules/mod_headers.so

# CORS Headers
Header always set Access-Control-Allow-Origin "*"
Header always set Access-Control-Allow-Methods "GET, POST, OPTIONS"
Header always set Access-Control-Allow-Headers "Content-Type, Accept"
```

## 📁 Directory Configuration

### สำหรับ Document Root
```apache
<Directory "C:/Learnning coding">
    Options Indexes FollowSymLinks
    AllowOverride All
    Require all granted
</Directory>
```

### สำหรับ API Directory
```apache
<Directory "C:/Learnning coding/php-api">
    Options -Indexes +FollowSymLinks
    AllowOverride All
    Require all granted
    
    # PHP settings
    php_value display_errors "Off"
    php_value log_errors "On"
    php_value error_log "C:/Learnning coding/php-api/error.log"
</Directory>
```

## 🚀 การทดสอบ Configuration

### 1. ตรวจสอบ syntax
```bash
httpd -t
```

### 2. Restart Apache
```bash
httpd -k restart
# หรือใน Windows Service
net stop Apache2.4
net start Apache2.4
```

### 3. ทดสอบ API
```
http://localhost/php-api/
http://localhost/php-api/room-types.php?type=private&lang=th
```

## 📝 หมายเหตุสำคัญ

1. **เปลี่ยนพาธ**: แก้ไข `C:/Learnning coding` ให้ตรงกับตำแหน่งโปรเจคจริง
2. **PHP Version**: ตรวจสอบว่า PHP module path ถูกต้อง
3. **Permissions**: ให้สิทธิ์ Apache อ่าน/เขียนใน directory
4. **Firewall**: เปิด port 80/443 ใน Windows Firewall
5. **MySQL**: ตรวจสอบ MySQL service ทำงานอยู่

## 🔒 Security Recommendations

1. ปิด `display_errors` ใน production
2. ตั้งค่า `expose_php = Off`
3. ใช้ HTTPS ใน production
4. จำกัด CORS origins ใน production
5. เปิด log files เพื่อ monitoring