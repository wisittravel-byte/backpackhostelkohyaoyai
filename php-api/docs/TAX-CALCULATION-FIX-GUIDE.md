# Tax Calculation Fix - Implementation Guide

## 📋 สรุปการแก้ไข

### ปัญหาที่พบ:
1. ❌ `booking_tax_lines.amount_minor` และ `base_amount_minor` บันทึกเป็น float (บาท) แทนที่จะเป็น integer (สตางค์)
2. ❌ `booking_item_nights.tax_minor` คำนวณผิด — ใช้วิธีแบ่งเฉลี่ยจาก `booking_tax_lines` แทนที่จะคำนวณตรง
3. ❌ `property_tax_config.local_tax_amount` เก็บเป็น 50.00 (บาท) ไม่สอดคล้องกับตารางอื่น

### วิธีแก้:
1. ✅ Migrate `property_tax_config` ให้เก็บค่าเป็น minor units (สตางค์)
2. ✅ คำนวณ `booking_item_nights.tax_minor` ต่อคืนโดยใช้สูตร:
   - Service charge = room_charge × 10%
   - VAT = (room + service) × 7% (ถ้า vat_base = ROOM_PLUS_SERVICE)
   - Local tax = 50 THB × pax (ถ้า local_tax_unit = PER_PERSON_PER_NIGHT)
   - tax_minor = VAT + local_tax
3. ✅ Roll up: nights → items → bookings
4. ✅ Snapshot ใน `booking_tax_lines` เป็น integer minor units

---

## 🚀 ขั้นตอนการ Deploy

### **Step 1: Backup Database**

```bash
# Windows (MySQL)
mysqldump -u root -p backpack_hostel > backup_before_migration.sql

# หรือใช้ phpMyAdmin Export
```

### **Step 2: Run Migration Script**

```bash
# เข้า MySQL client
mysql -u root -p backpack_hostel

# Run migration
source c:/Learnning coding/php-api/migrations/migrate-tax-config-to-minor-units.sql
```

**หรือใช้ phpMyAdmin:**
1. เปิด phpMyAdmin
2. เลือก database `backpack_hostel`
3. คลิก tab "SQL"
4. Copy-paste เนื้อหาจาก `migrate-tax-config-to-minor-units.sql`
5. Execute

### **Step 3: Verify Migration**

```sql
-- ตรวจสอบว่า local_tax_amount เปลี่ยนเป็น minor units แล้ว
SELECT 
  local_tax_amount as local_tax_minor,
  local_tax_amount / 100 as local_tax_baht,
  fee_value as fee_minor,
  fee_value / 100 as fee_baht
FROM property_tax_config
WHERE is_active = 1;
```

**Expected:**
- `local_tax_minor` = 5000 (= 50.00 THB)
- `fee_minor` = 100000 (= 1000.00 THB)

### **Step 4: Deploy Updated Code**

```bash
# Replace bookings.php
copy "c:\Learnning coding\php-api\v1\bookings.php" "c:\xampp\htdocs\php-api\v1\bookings.php"
```

### **Step 5: Test Booking Creation**

1. เปิด browser ไปที่ `http://localhost/public/booking.html`
2. เลือกห้อง, วันที่, จำนวนคน
3. กด "จอง"
4. ไปหน้า checkout กด "จองตอนนี้"
5. ตรวจสอบ booking ที่สร้างใน database

### **Step 6: Run Validation Queries**

```bash
mysql -u root -p backpack_hostel < c:/Learnning coding/php-api/validations/verify-tax-calculations.sql
```

**หรือใช้ phpMyAdmin:**
1. Copy queries จาก `verify-tax-calculations.sql`
2. Run ทีละ section
3. ตรวจสอบว่า diff = 0 ทุก query

---

## 📊 Tax Calculation Formula

### **Per Night (booking_item_nights):**

```
Config:
- service_charge_pct = 10.00 (%)
- vat_pct = 7.00 (%)
- vat_base = ROOM_PLUS_SERVICE
- local_tax_amount = 5000 (minor) = 50.00 THB
- local_tax_unit = PER_PERSON_PER_NIGHT

Calculation:
1. room_charge = base_price_minor × quantity
2. service_charge = room_charge × 10% = room_charge × 0.10
3. vat_base = room_charge + service_charge (if ROOM_PLUS_SERVICE)
4. vat = vat_base × 7% = vat_base × 0.07
5. local_tax = 5000 × (pax_adults + pax_children) (if PER_PERSON_PER_NIGHT)
6. tax_minor = vat + local_tax
7. total_minor = room_charge + tax_minor
```

### **Example:**

```
Given:
- base_price_minor = 39000 (390.00 THB)
- quantity = 1 (1 room)
- pax_adults = 3
- pax_children = 0

Calculation:
1. room_charge = 39000 × 1 = 39000
2. service_charge = 39000 × 0.10 = 3900
3. vat_base = 39000 + 3900 = 42900
4. vat = 42900 × 0.07 = 3003
5. local_tax = 5000 × 3 = 15000
6. tax_minor = 3003 + 15000 = 18003
7. total_minor = 39000 + 18003 = 57003

Per night:
- tax_minor = 18003 (180.03 THB)
- total_minor = 57003 (570.03 THB)
```

---

## ✅ Validation Checklist

### **1. property_tax_config**
- [ ] `local_tax_amount` เป็น BIGINT และมีค่า 5000 (50 THB × 100)
- [ ] `fee_value` เป็น BIGINT และมีค่า 100000 (1000 THB × 100)

### **2. booking_tax_lines**
- [ ] `amount_minor` เป็น integer (ไม่มี decimal)
- [ ] `base_amount_minor` เป็น integer
- [ ] `rate_pct` ยังเป็น decimal (7.00, 10.00)
- [ ] scope = 'ORDER' สำหรับ PER_BOOKING taxes
- [ ] scope = 'ITEM' สำหรับ PERCENT taxes

### **3. booking_item_nights**
- [ ] `tax_minor` คำนวณถูกต้องตามสูตร (vat + local_tax)
- [ ] `total_minor` = (base_price × quantity) + tax_minor
- [ ] ไม่มี negative values

### **4. booking_items**
- [ ] `line_subtotal_minor` = SUM(booking_item_nights.base_price × quantity)
- [ ] `line_taxes_minor` = SUM(booking_item_nights.tax_minor)
- [ ] `line_total_minor` = line_subtotal + line_taxes

### **5. bookings**
- [ ] `room_charge` = SUM(booking_items.line_subtotal_minor)
- [ ] `taxes_total_minor` = SUM(booking_items.line_taxes_minor)
- [ ] `grand_total_minor` = room_total + taxes_total

---

## 🔄 Rollback (ถ้าจำเป็น)

```sql
-- Restore from backup
DROP TABLE IF EXISTS property_tax_config;
CREATE TABLE property_tax_config AS 
SELECT * FROM property_tax_config_backup_20251111;

-- หรือใช้ mysqldump restore
```

```bash
mysql -u root -p backpack_hostel < backup_before_migration.sql
```

---

## 📝 Files Changed

```
php-api/
├── migrations/
│   └── migrate-tax-config-to-minor-units.sql    ← Migration script
├── validations/
│   └── verify-tax-calculations.sql               ← Validation queries
└── v1/
    └── bookings.php                              ← Updated calculation logic
```

---

## 🎯 Testing Scenarios

### **Scenario 1: PER_PERSON_PER_NIGHT**
```
Config: local_tax_unit = PER_PERSON_PER_NIGHT, local_tax_amount = 5000
Booking: 3 adults, 1 night
Expected: local_tax = 5000 × 3 = 15000 per night
```

### **Scenario 2: PER_BOOKING**
```
Config: local_tax_unit = PER_BOOKING, local_tax_amount = 5000
Booking: 3 nights
Expected: local_tax = 5000 total (distributed: 1667 per night)
```

### **Scenario 3: ROOM_ONLY vat_base**
```
Config: vat_base = ROOM_ONLY
Booking: room_charge = 39000, service_charge = 3900
Expected: vat = 39000 × 0.07 = 2730 (no service in base)
```

### **Scenario 4: ROOM_PLUS_SERVICE vat_base**
```
Config: vat_base = ROOM_PLUS_SERVICE
Booking: room_charge = 39000, service_charge = 3900
Expected: vat = (39000 + 3900) × 0.07 = 3003
```

---

## 📞 Support

หากพบปัญหา:
1. ตรวจสอบ error log: `php-api/logs/error.log`
2. Run validation queries
3. Check database values manually

---

## ✅ Summary

การแก้ไขนี้ทำให้:
- ✅ ทุกตารางใช้ minor units (integer) สอดคล้องกัน
- ✅ คำนวณภาษีถูกต้องตามหลักการ (per-night calculation)
- ✅ Snapshot ใน booking_tax_lines เพื่อ audit
- ✅ Roll up ข้อมูลจาก nights → items → bookings อย่างถูกต้อง
- ✅ รองรับทุกรูปแบบ config (PER_BOOKING, PER_PERSON_PER_NIGHT, etc.)
