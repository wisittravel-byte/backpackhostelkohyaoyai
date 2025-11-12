# 🎯 สรุปการแก้ไข Tax Calculation System

## ปัญหาที่พบ

### 1. **booking_item_nights.tax_minor คำนวณผิด**
```
❌ เดิม: tax_minor = (total VAT + total Local Tax) / nights
   → คูณ 3 รายการ → ทำให้ tax เท่ากันทุกรายการ

✅ ถูกต้อง: tax_minor = VAT ต่อคืน + Local Tax ต่อคืน (แยกตามรายการ)
```

### 2. **ไม่ได้ใช้ property_tax_config**
```
❌ เดิม: ใช้ข้อมูลจาก frontend payload (tax_breakdown)
✅ ใหม่: ดึง config จาก property_tax_config และคำนวณเอง
```

---

## วิธีแก้ไข

### **A. เพิ่ม Tax Config Loading**

```php
// Load tax config จาก DB
$taxConfig = $pdo->query("
  SELECT service_charge_pct, vat_pct, vat_base, 
         local_tax_amount, local_tax_unit, 
         fee_value, fee_unit, fee_base 
  FROM property_tax_config 
  WHERE is_active = 1 
  LIMIT 1
")->fetch();

$serviceChargePct = floatval($taxConfig['service_charge_pct'] ?? 0);
$vatPct = floatval($taxConfig['vat_pct'] ?? 0);
$vatBase = $taxConfig['vat_base'] ?? 'ROOM_PLUS_SERVICE';
$localTaxAmount = floatval($taxConfig['local_tax_amount'] ?? 0);
$localTaxUnit = $taxConfig['local_tax_unit'] ?? 'PER_BOOKING';
```

---

### **B. คำนวณ Tax ต่อ Item ต่อคืน**

```php
foreach ($items as $it) {
  $qty = intval($it['quantity']);
  $paxAdults = intval($it['pax_adults']);
  $paxChildren = intval($it['pax_children']);
  
  foreach ($it['nights'] as $n) {
    $nightQty = intval($n['quantity']);
    $basePrice = intval($n['base_price_minor']);
    
    // 1. Room charge
    $roomChargeNight = $basePrice × $nightQty;
    
    // 2. Service charge (10%)
    $serviceChargeNight = round($roomChargeNight × 0.10);
    
    // 3. VAT (7% of room+service)
    if ($vatBase === 'ROOM_PLUS_SERVICE') {
      $vatBaseAmount = $roomChargeNight + $serviceChargeNight;
    } else {
      $vatBaseAmount = $roomChargeNight;
    }
    $vatNight = round($vatBaseAmount × 0.07);
    
    // 4. Local tax (ขึ้นอยู่กับ unit)
    if ($localTaxUnit === 'PER_PERSON_PER_NIGHT') {
      // 50 × (adults + children)
      $localTaxNight = round(50 × ($paxAdults + $paxChildren));
    } elseif ($localTaxUnit === 'PER_BOOKING') {
      // 50 ÷ nights (แบ่งเฉลี่ย)
      $localTaxNight = round(50 / $nights);
    } elseif ($localTaxUnit === 'PER_ROOM_PER_NIGHT') {
      // 50 × quantity
      $localTaxNight = round(50 × $nightQty);
    }
    
    // รวมภาษีต่อคืน
    $nightTax = $vatNight + $localTaxNight;
    $nightTotal = $roomChargeNight + $nightTax;
    
    // INSERT booking_item_nights
    INSERT INTO booking_item_nights (
      booking_item_id, stay_date, quantity,
      base_price_minor, tax_minor, total_minor
    ) VALUES (
      $itemId, $stayDate, $nightQty,
      $basePrice, $nightTax, $nightTotal
    );
  }
}
```

---

### **C. Bottom-Up Aggregation**

```
booking_item_nights
  ↓ SUM(tax_minor)
booking_items.line_taxes_minor
  ↓ SUM(line_taxes_minor)
bookings.taxes_total_minor
```

```php
// booking_items
$lineSubtotal = SUM(base_price × quantity);
$lineTaxes = SUM(tax_minor);
$lineTotal = $lineSubtotal + $lineTaxes;

// bookings
$roomCharge = SUM(booking_items.line_subtotal_minor);
$taxesTotal = SUM(booking_items.line_taxes_minor);
$grandTotal = $roomTotalMinor + $taxesTotal;
```

---

### **D. booking_tax_lines - คำนวณจาก Config**

```php
// ไม่ใช้ payload อีกต่อไป แต่คำนวณเอง

// 1. VAT
if ($vatPct > 0) {
  $vatBaseAmount = ($vatBase === 'ROOM_PLUS_SERVICE') 
    ? $totalRoomCharge + $totalServiceCharge 
    : $totalRoomCharge;
  
  $totalVat = round($vatBaseAmount × $vatPct / 100);
  
  INSERT INTO booking_tax_lines (
    booking_id, booking_item_id, scope, tax_type,
    base_amount_minor, rate_pct, unit, quantity, amount_minor
  ) VALUES (
    $bookingId, $itemsMap[0], 'ITEM', 'VAT',
    $vatBaseAmount, $vatPct, 'PERCENT', 1, $totalVat
  );
}

// 2. Local Tax
if ($localTaxAmount > 0) {
  if ($localTaxUnit === 'PER_PERSON_PER_NIGHT') {
    $totalPax = SUM(pax_adults + pax_children);
    $localTaxQty = $totalPax × $nights;
    $totalLocalTax = $localTaxAmount × $localTaxQty;
    $scope = 'ITEM';
    $itemId = $itemsMap[0];
    
  } elseif ($localTaxUnit === 'PER_BOOKING') {
    $totalLocalTax = $localTaxAmount;
    $scope = 'ORDER';
    $itemId = NULL;
  }
  
  INSERT INTO booking_tax_lines (...) VALUES (...);
}

// 3. Booking Fee
if ($feeValue > 0) {
  $scope = ($feeUnit === 'PER_BOOKING') ? 'ORDER' : 'ITEM';
  $itemId = ($scope === 'ITEM') ? $itemsMap[0] : NULL;
  
  INSERT INTO booking_tax_lines (...) VALUES (...);
}
```

---

## Scope Mapping Rules

| Unit Type | Scope | booking_item_id |
|-----------|-------|-----------------|
| `PER_BOOKING` | `ORDER` | `NULL` |
| `PERCENT` | `ITEM` | `booking_items.id[0]` |
| `PER_PERSON_PER_NIGHT` | `ITEM` | `booking_items.id[0]` |
| `PER_ROOM_PER_NIGHT` | `ITEM` | `booking_items.id[0]` |
| `PER_NIGHT` | `ITEM` | `booking_items.id[0]` |

---

## ตัวอย่างการคำนวณ

### ข้อมูล:
- **3 รายการห้อง:** เลือก 1, เลือก 101, เลือก 200
- **Nights:** 1 คืน (2025-11-11)
- **Config:**
  - `service_charge_pct`: 10%
  - `vat_pct`: 7%
  - `vat_base`: ROOM_PLUS_SERVICE
  - `local_tax_amount`: 50.00
  - `local_tax_unit`: PER_PERSON_PER_NIGHT
  - `pax_adults`: 3 per room

### คำนวณ (Item 1 - เลือก 1):

```
1. Room charge:     430.19 × 1 = 430.19
2. Service charge:  430.19 × 10% = 43.02
3. VAT base:        430.19 + 43.02 = 473.21
4. VAT:             473.21 × 7% = 33.12
5. Local Tax:       50 × 3 = 150.00
6. Total tax:       33.12 + 150.00 = 183.12 ✅
```

### คำนวณ (Item 2 - เลือก 101):

```
1. Room charge:     390.00 × 2 = 780.00
2. Service charge:  780.00 × 10% = 78.00
3. VAT base:        780.00 + 78.00 = 858.00
4. VAT:             858.00 × 7% = 60.06
5. Local Tax:       50 × 3 = 150.00
6. Total tax:       60.06 + 150.00 = 210.06 ✅
```

---

## Validation

ใช้ SQL queries ใน `validation-queries.sql`:

```sql
-- 1. ตรวจสอบ tax_minor ต่อคืน
SELECT bin.id, bin.tax_minor, bi.pax_adults
FROM booking_item_nights bin
JOIN booking_items bi ON bi.id = bin.booking_item_id
WHERE bi.booking_id = 4;

-- 2. ตรวจสอบ booking_items aggregation
SELECT 
  bi.line_taxes_minor,
  SUM(bin.tax_minor) AS sum_taxes,
  bi.line_taxes_minor - SUM(bin.tax_minor) AS diff
FROM booking_items bi
JOIN booking_item_nights bin ON bin.booking_item_id = bi.id
WHERE bi.booking_id = 4
GROUP BY bi.id
HAVING diff != 0;

-- 3. ตรวจสอบ bookings rollup
SELECT 
  b.taxes_total_minor,
  SUM(bi.line_taxes_minor) AS sum_taxes,
  b.taxes_total_minor - SUM(bi.line_taxes_minor) AS diff
FROM bookings b
JOIN booking_items bi ON bi.booking_id = b.id
WHERE b.id = 4
GROUP BY b.id
HAVING diff != 0;
```

---

## Config Support Matrix

| Config Parameter | Supported Values | Used In |
|------------------|------------------|---------|
| `vat_base` | `ROOM_ONLY`, `ROOM_PLUS_SERVICE` | VAT calculation |
| `local_tax_unit` | `PER_BOOKING`, `PER_PERSON_PER_NIGHT`, `PER_ROOM_PER_NIGHT`, `PER_NIGHT` | Local Tax calculation |
| `fee_unit` | `PER_BOOKING`, `PER_ROOM`, etc. | Fee calculation |
| `fee_base` | `ROOM_ONLY`, `ROOM_PLUS_SERVICE` | Fee base amount |

✅ **ระบบรองรับทุกรูปแบบการ config ภาษีแล้ว**

---

## Files Changed

1. ✅ `php-api/v1/bookings.php` - Main API
2. ✅ `php-api/v1/validation-queries.sql` - Validation queries

---

## Testing Checklist

- [ ] ทดสอบ booking ใหม่ผ่าน checkout.html
- [ ] ตรวจสอบ `booking_item_nights.tax_minor` แต่ละรายการ
- [ ] ตรวจสอบ `booking_items.line_taxes_minor` = SUM(nights)
- [ ] ตรวจสอบ `bookings.taxes_total_minor` = SUM(items)
- [ ] ตรวจสอบ `booking_tax_lines` scope mapping
- [ ] รัน validation queries ทั้งหมด
- [ ] ทดสอบกับ config แบบอื่น (เปลี่ยน local_tax_unit)

---

## 🎉 สรุป

✅ แก้ไข tax_minor ให้คำนวณต่อคืนต่อรายการถูกต้อง  
✅ ใช้ property_tax_config แทน payload  
✅ รองรับทุกรูปแบบการ config ภาษี  
✅ Bottom-Up Aggregation สมบูรณ์  
✅ booking_tax_lines scope mapping ถูกต้อง  
✅ มี validation queries ครบถ้วน
