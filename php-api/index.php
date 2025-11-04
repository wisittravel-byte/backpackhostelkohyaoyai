<?php
require_once 'cors.php';
?>
<!DOCTYPE html>
<html lang="th">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Backpack Hostel PHP API</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; line-height: 1.6; }
        .container { max-width: 800px; margin: 0 auto; }
        .endpoint { background: #f4f4f4; padding: 15px; margin: 10px 0; border-radius: 5px; }
        .method { background: #007cba; color: white; padding: 3px 8px; border-radius: 3px; font-size: 12px; }
        .url { font-family: monospace; background: #333; color: #0f0; padding: 10px; border-radius: 3px; margin: 10px 0; }
        .params { margin: 10px 0; }
        .param { background: #e9e9e9; padding: 5px; margin: 5px 0; border-radius: 3px; }
        h1 { color: #333; border-bottom: 2px solid #007cba; padding-bottom: 10px; }
        h2 { color: #555; }
    </style>
</head>
<body>
    <div class="container">
        <h1>🏨 Backpack Hostel PHP API</h1>
        <p>API สำหรับระบบจัดการข้อมูลโฮสเทล - รองรับ MySQL 8 และ Apache</p>

        <h2>📋 Available Endpoints</h2>

        <div class="endpoint">
            <h3><span class="method">GET</span> Room Types API</h3>
            <div class="url">GET /php-api/room-types.php</div>
            <p><strong>คำอธิบาย:</strong> ดึงข้อมูลประเภทห้องพักและรูปภาพปก</p>
            
            <div class="params">
                <h4>Parameters:</h4>
                <div class="param">
                    <strong>type</strong> (optional): 
                    <ul>
                        <li><code>private</code> - ห้องพัก (is_private = 1)</li>
                        <li><code>dorm</code> - เตียง Dorm (is_private = 0)</li>
                        <li>ไม่ระบุ - แสดงทั้งหมด</li>
                    </ul>
                </div>
                <div class="param">
                    <strong>lang</strong> (optional): <code>th</code> (default) หรือ <code>en</code>
                </div>
            </div>

            <h4>ตัวอย่างการเรียกใช้:</h4>
            <div class="url">
                GET /php-api/room-types.php?type=private&lang=th<br>
                GET /php-api/room-types.php?type=dorm&lang=en<br>
                GET /php-api/room-types.php?lang=th
            </div>
        </div>

        <div class="endpoint">
            <h3><span class="method">GET</span> Room Images API</h3>
            <div class="url">GET /php-api/room-images.php</div>
            <p><strong>คำอธิบาย:</strong> ดึงรูปภาพทั้งหมดของห้องพักตาม room_type_id</p>
            
            <div class="params">
                <h4>Parameters:</h4>
                <div class="param">
                    <strong>room_type_id</strong> (required): ID ของประเภทห้องพัก
                </div>
                <div class="param">
                    <strong>lang</strong> (optional): <code>th</code> (default) หรือ <code>en</code>
                </div>
            </div>

            <h4>ตัวอย่างการเรียกใช้:</h4>
            <div class="url">
                GET /php-api/room-images.php?room_type_id=1&lang=th<br>
                GET /php-api/room-images.php?room_type_id=2&lang=en
            </div>
        </div>

        <h2>🗄️ Database Configuration</h2>
        <ul>
            <li><strong>Database:</strong> MySQL 8</li>
            <li><strong>Host:</strong> localhost</li>
            <li><strong>Database Name:</strong> backpackhostel</li>
            <li><strong>Username:</strong> root</li>
            <li><strong>Password:</strong> Kz13579@</li>
        </ul>

        <h2>📊 Database Tables</h2>
        <ul>
            <li><strong>room_types:</strong> ข้อมูลประเภทห้องพัก</li>
            <li><strong>room_type_images:</strong> รูปภาพของแต่ละประเภทห้องพัก</li>
        </ul>

        <h2>🌐 CORS Support</h2>
        <p>API รองรับ CORS สำหรับ domains ต่อไปนี้:</p>
        <ul>
            <li>localhost (ทุก port)</li>
            <li>127.0.0.1 (ทุก port)</li>
            <li>backpack.local.test</li>
            <li>cloudhotel.local.test</li>
            <li>backpackkohyao.com</li>
            <li>wisittravel-byte.github.io</li>
        </ul>

        <h2>📝 Response Format</h2>
        <p>ทุก API จะส่งคืนข้อมูลในรูปแบบ JSON พร้อม UTF-8 encoding</p>
        
        <hr>
        <p><small>Last updated: <?php echo date('Y-m-d H:i:s'); ?></small></p>
    </div>
</body>
</html>