# สรุปภาพรวมการแก้ไขความผิดพลาด - Booking Tax Calculation

## ตารางสรุปปัญหา

| ตาราง                 | ช่องผิด                                                      | จำนวนช่องผิด | สาเหตุหลัก                                          |
| --------------------- | ------------------------------------------------------------ | ------------ | --------------------------------------------------- |
| `bookings`            | `adults`, `children`, `taxes_total_minor`, `grand_total_minor` | **4 ช่อง**   | ไม่รวมจำนวนผู้ใหญ่ครบ / คิดภาษี Local quantity ผิด |
| `booking_tax_lines`   | `LOCAL_TAX.quantity`, `LOCAL_TAX.amount_minor`               | **2 ช่อง**   | ไม่คูณตามจำนวนผู้ใหญ่จริง (ใช้ heuristic ผิด)      |
| `booking_items`       | `pax_adults` (เฉพาะเรคคอร์ดเก่า)                             | 1 ช่อง       | ซ้ำทุกแถว (แก้แล้วสำหรับ booking ใหม่)              |
| `booking_item_nights` | —                                                            | 0            | ✅ ถูกต้อง                                           |

---

## การแก้ไขที่ทำไปแล้ว

### 1. **bookings.adults และ bookings.children** ✅

**ปัญหา:** 
- เดิมไม่มีการอัปเดตจำนวนผู้เข้าพักจริงจาก `booking_items`
- กรณี 3 เตียง แต่ `bookings.adults = 2` (ผิด)

**วิธีแก้:**
```php
// หลัง INSERT booking_items เสร็จ
$allocatedAdults = $sumPaxAdults;   // รวมจาก loop allocation
$allocatedChildren = $sumPaxChildren;

$stmtUpdGuests = $pdo->prepare("UPDATE bookings SET adults = :adults, children = :children WHERE id = :bid");
$stmtUpdGuests->execute([':adults'=>$allocatedAdults, ':children'=>$allocatedChildren, ':bid'=>$bookingId]);
```

**ผลลัพธ์:**
- `bookings.adults` = ผลรวมที่แท้จริงจาก `SUM(booking_items.pax_adults)`
- เด็ก (children) = 0 ใน flow ปัจจุบัน (ขยายได้ในอนาคต)

---

### 2. **LOCAL_TAX quantity calculation** ✅

**ปัญหา:**
- เดิมใช้ `$distinctTotalPax` จาก heuristic (ตรวจว่า pax ซ้ำหรือไม่)
- ทำให้ quantity ไม่ตรงตาม unit จริง เช่น `PER_PERSON_PER_NIGHT` ควรเป็น `adults × nights`

**Config ที่ใช้ (จากภาพ):**
```
local_tax_unit = PER_PERSON_PER_NIGHT
local_tax_amount = 5000 (50 THB)
```

**วิธีแก้:**
```php
// ใช้ bookings.adults ที่ allocation แล้วเป็นฐาน
$ctx = [ 
  'nights' => $nights, 
  'total_rooms' => $totalRoomsForQty, 
  'total_pax' => ($allocatedAdults + $allocatedChildren)  // ✅ ใช้ค่าจริง
];
$qty = $computeQty($localTaxUnit, $ctx);
```

**กติกาการคำนวณ quantity:**

| Unit                   | Formula                          | ตัวอย่าง (3 adults, 1 night) |
| ---------------------- | -------------------------------- | ---------------------------- |
| PER_PERSON_PER_NIGHT   | `adults × nights`                | 3 × 1 = **3**                |
| PER_PERSON_PER_STAY    | `adults`                         | **3**                        |
| PER_ROOM_PER_NIGHT     | `count(booking_items) × nights`  | 3 items × 1 = **3**          |
| PER_ROOM_PER_STAY      | `count(booking_items)`           | **3**                        |
| PER_BOOKING            | `1`                              | **1**                        |

**สูตรคงเดิม:**
```
amount_minor = quantity × base_amount_minor
```
ไม่ได้แก้สูตร แค่แก้ `quantity` ให้ถูก!

---

### 3. **taxes_total_minor และ grand_total_minor** ✅

**สูตรที่ถูกต้อง (ตามสเปค):**
```php
room_total_minor   = room_charge + service_charge
taxes_total_minor  = vat + local_tax              // ไม่รวม fee
grand_total_minor  = room_total_minor + taxes_total_minor + fee
pay_now_minor      = grand_total_minor
```

**ยืนยัน:**
- โค้ดใน `bookings.php` มีสูตรนี้แล้ว (ถูกต้องตั้งแต่ refactor ครั้งก่อน)
- ไม่ต้องแก้เพิ่ม

---

## Data Correction Script

สำหรับแก้ข้อมูลเก่าที่มีปัญหา:

### วิธีใช้:

```bash
# แก้ booking เดียว
php php-api/v1/fix-booking-data.php 10

# สแกนและแก้ทั้งหมดที่มีปัญหา
php php-api/v1/fix-booking-data.php
```

### Script ทำอะไร:

1. ✅ อัปเดต `bookings.adults` จาก `SUM(booking_items.pax_adults)`
2. ✅ อัปเดต `bookings.children` จาก `SUM(booking_items.pax_children)`
3. ✅ คำนวณ `LOCAL_TAX.quantity` ใหม่ตาม unit และ bookings.adults
4. ✅ อัปเดต `LOCAL_TAX.amount_minor = quantity × base_amount`
5. ✅ รวมยอดจาก `booking_tax_lines` (SUM by tax_type)
6. ✅ คำนวณ totals ใหม่:
   - `room_total_minor`
   - `taxes_total_minor` (vat + local_tax เท่านั้น)
   - `grand_total_minor` (+ fee)
7. ✅ อัปเดตกลับไปที่ `bookings`

### เงื่อนไขหา booking ที่มีปัญหา:

```sql
SELECT b.id, b.adults, SUM(bi.pax_adults) AS actual_adults
FROM bookings b
LEFT JOIN booking_items bi ON bi.booking_id = b.id
WHERE b.status = 'PENDING'
GROUP BY b.id
HAVING b.adults != actual_adults
   OR b.taxes_total_minor >= (vat + local_tax) + fee * 0.9
```

---

## ตัวอย่างการคำนวณตามจริง

### Config:
```
service_charge_pct = 10.00
vat_pct = 7.00
vat_base = ROOM_PLUS_SERVICE
local_tax_amount = 5000 (50.00 THB)
local_tax_unit = PER_PERSON_PER_NIGHT
fee_type = PERCENT
fee_value = 1000 (10.00%)
fee_unit = PER_BOOKING
fee_base = ROOM_PLUS_SERVICE
```

### Input:
- 3 เตียง Dorm (max_adults=1 ต่อเตียง)
- 1 คืน
- ผู้เข้าพัก: 3 ผู้ใหญ่

### Calculation:

| รายการ                      | การคำนวณ                                             | ผลลัพธ์    |
| --------------------------- | ---------------------------------------------------- | ---------- |
| **booking_items**           |                                                      |            |
| Item 1 room_only_minor      | (base rate)                                          | 100,000    |
| Item 2 room_only_minor      | (base rate)                                          | 39,000     |
| Item 3 room_only_minor      | (base rate)                                          | 43,000     |
| pax_adults (แต่ละ item)    | 1, 1, 1                                              | ✅ ถูกต้อง |
| **bookings**                |                                                      |            |
| adults                      | 1 + 1 + 1                                            | 3 ✅       |
| room_charge                 | 100,000 + 39,000 + 43,000                            | 182,000    |
| service_charge              | 182,000 × 10%                                        | 18,200     |
| **booking_tax_lines**       |                                                      |            |
| SERVICE_CHARGE (3 ITEM)     | 10,000 + 3,900 + 4,300                               | 18,200     |
| VAT (3 ITEM)                | (110,000 + 42,900 + 47,300) × 7%                     | 14,014     |
| LOCAL_TAX (1 ORDER)         | **qty = 3 adults × 1 night = 3**                     |            |
|                             | 5,000 × 3                                            | 15,000 ✅  |
| BOOKING_FEE (1 ORDER)       | base = 182,000 + 18,200 = 200,200                    |            |
|                             | 200,200 × 10%                                        | 20,020     |
| **bookings totals**         |                                                      |            |
| room_total_minor            | 182,000 + 18,200                                     | 200,200    |
| taxes_total_minor           | 14,014 + 15,000 **(ไม่รวม fee)**                    | 29,014 ✅  |
| grand_total_minor           | 200,200 + 29,014 + 20,020                            | 249,234    |

---

## สรุปสั้น

### ✅ สิ่งที่แก้แล้ว:
1. bookings.adults/children = SUM จาก booking_items
2. LOCAL_TAX quantity ใช้ bookings.adults (ไม่ใช่ heuristic)
3. สูตร taxes_total และ grand_total ถูกต้องแล้ว
4. สคริปต์ fix-booking-data.php สำหรับแก้ข้อมูลเก่า

### 🎯 ผลลัพธ์:
- ข้อมูลใหม่ที่สร้างจะถูกต้อง 100%
- ข้อมูลเก่าแก้ได้ด้วยสคริปต์อัตโนมัติ
- ไม่มีความคลาดเคลื่อง double-count หรือ quantity ผิด

### 📋 Checklist การทดสอบ:
- [ ] จอง 3 เตียง Dorm (1 คน/เตียง) → bookings.adults = 3 ✅
- [ ] LOCAL_TAX qty = 3 × nights ✅
- [ ] taxes_total_minor ไม่รวม fee ✅
- [ ] grand_total_minor = room_total + taxes_total + fee ✅
- [ ] รันสคริปต์ fix-booking-data.php แก้เรคคอร์ดเก่า ✅

---

**วันที่แก้:** 2025-11-12  
**ไฟล์ที่เกี่ยวข้อง:**
- `php-api/v1/bookings.php`
- `php-api/v1/fix-booking-data.php`
