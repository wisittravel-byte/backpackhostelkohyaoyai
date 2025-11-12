-- ========================================
-- SQL Validation Queries for Booking System
-- ตรวจสอบความถูกต้องของการคำนวณภาษี
-- ========================================

-- 1. ตรวจสอบ booking_item_nights.tax_minor
-- ต้องเป็น tax ต่อคืนต่อรายการ ไม่ใช่คูณ 3
SELECT 
    bin.id,
    bin.booking_item_id,
    bin.stay_date,
    bin.quantity,
    bin.base_price_minor,
    bin.tax_minor,
    bin.total_minor,
    bi.pax_adults,
    bi.pax_children,
    b.booking_ref
FROM booking_item_nights bin
JOIN booking_items bi ON bi.id = bin.booking_item_id
JOIN bookings b ON b.id = bi.booking_id
WHERE b.id = 4  -- ← ใส่ booking_id ที่ต้องการตรวจสอบ
ORDER BY bin.booking_item_id, bin.stay_date;

-- 2. ตรวจสอบว่า booking_items.line_taxes_minor = SUM(booking_item_nights.tax_minor)
SELECT 
    bi.id AS booking_item_id,
    bi.line_taxes_minor AS item_taxes,
    SUM(bin.tax_minor) AS sum_night_taxes,
    bi.line_taxes_minor - SUM(bin.tax_minor) AS difference
FROM booking_items bi
JOIN booking_item_nights bin ON bin.booking_item_id = bi.id
WHERE bi.booking_id = 4  -- ← ใส่ booking_id
GROUP BY bi.id
HAVING difference != 0;  -- แสดงเฉพาะที่ไม่ตรงกัน

-- 3. ตรวจสอบว่า booking_items.line_subtotal_minor = SUM(base_price × quantity)
SELECT 
    bi.id AS booking_item_id,
    bi.line_subtotal_minor AS item_subtotal,
    SUM(bin.base_price_minor * bin.quantity) AS sum_night_subtotal,
    bi.line_subtotal_minor - SUM(bin.base_price_minor * bin.quantity) AS difference
FROM booking_items bi
JOIN booking_item_nights bin ON bin.booking_item_id = bi.id
WHERE bi.booking_id = 4
GROUP BY bi.id
HAVING difference != 0;

-- 4. ตรวจสอบว่า booking_items.line_total_minor = line_subtotal + line_taxes
SELECT 
    bi.id AS booking_item_id,
    bi.line_total_minor AS item_total,
    bi.line_subtotal_minor + bi.line_taxes_minor AS calculated_total,
    bi.line_total_minor - (bi.line_subtotal_minor + bi.line_taxes_minor) AS difference
FROM booking_items bi
WHERE bi.booking_id = 4
HAVING difference != 0;

-- 5. ตรวจสอบว่า bookings.room_charge = SUM(booking_items.line_subtotal_minor)
SELECT 
    b.id AS booking_id,
    b.booking_ref,
    b.room_charge,
    SUM(bi.line_subtotal_minor) AS sum_items_subtotal,
    b.room_charge - SUM(bi.line_subtotal_minor) AS difference
FROM bookings b
JOIN booking_items bi ON bi.booking_id = b.id
WHERE b.id = 4
GROUP BY b.id
HAVING difference != 0;

-- 6. ตรวจสอบว่า bookings.taxes_total_minor = SUM(booking_items.line_taxes_minor)
SELECT 
    b.id AS booking_id,
    b.booking_ref,
    b.taxes_total_minor,
    SUM(bi.line_taxes_minor) AS sum_items_taxes,
    b.taxes_total_minor - SUM(bi.line_taxes_minor) AS difference
FROM bookings b
JOIN booking_items bi ON bi.booking_id = b.id
WHERE b.id = 4
GROUP BY b.id
HAVING difference != 0;

-- 7. ตรวจสอบว่า bookings.grand_total_minor = room_total_minor + taxes_total_minor
SELECT 
    id AS booking_id,
    booking_ref,
    room_total_minor,
    taxes_total_minor,
    grand_total_minor,
    grand_total_minor - (room_total_minor + taxes_total_minor) AS difference
FROM bookings
WHERE id = 4
HAVING difference != 0;

-- 8. ตรวจสอบ booking_tax_lines - scope และ booking_item_id
SELECT 
    btl.id,
    btl.booking_id,
    btl.booking_item_id,
    btl.scope,
    btl.tax_type,
    btl.unit,
    btl.quantity,
    btl.amount_minor,
    btl.vat_base,
    btl.local_tax_unit,
    b.booking_ref
FROM booking_tax_lines btl
JOIN bookings b ON b.id = btl.booking_id
WHERE btl.booking_id = 4
ORDER BY btl.tax_type;

-- 9. ตรวจสอบว่า scope mapping ถูกต้อง
-- PER_BOOKING → ORDER (booking_item_id = NULL)
-- อื่น ๆ → ITEM (booking_item_id != NULL)
SELECT 
    btl.id,
    btl.tax_type,
    btl.unit,
    btl.scope,
    btl.booking_item_id,
    CASE 
        WHEN btl.unit = 'PER_BOOKING' AND btl.scope = 'ORDER' AND btl.booking_item_id IS NULL THEN '✅ OK'
        WHEN btl.unit != 'PER_BOOKING' AND btl.scope = 'ITEM' AND btl.booking_item_id IS NOT NULL THEN '✅ OK'
        ELSE '❌ ERROR'
    END AS status
FROM booking_tax_lines btl
WHERE btl.booking_id = 4;

-- 10. แสดงภาพรวมทั้งหมดของ booking
SELECT 
    b.id,
    b.booking_ref,
    b.status,
    b.nights,
    b.room_charge,
    b.service_charge,
    b.fee,
    b.vat,
    b.local_tax,
    b.room_total_minor,
    b.taxes_total_minor,
    b.grand_total_minor,
    COUNT(DISTINCT bi.id) AS num_items,
    COUNT(bin.id) AS num_nights
FROM bookings b
LEFT JOIN booking_items bi ON bi.booking_id = b.id
LEFT JOIN booking_item_nights bin ON bin.booking_item_id = bi.id
WHERE b.id = 4
GROUP BY b.id;

-- 11. คำนวณ tax breakdown แยกตาม item
SELECT 
    bi.id AS booking_item_id,
    bi.unit_type,
    bi.quantity,
    bi.pax_adults,
    bi.pax_children,
    COUNT(bin.id) AS nights,
    SUM(bin.base_price_minor * bin.quantity) AS total_room_charge,
    SUM(bin.tax_minor) AS total_taxes,
    bi.line_subtotal_minor,
    bi.line_taxes_minor,
    bi.line_total_minor
FROM booking_items bi
JOIN booking_item_nights bin ON bin.booking_item_id = bi.id
WHERE bi.booking_id = 4
GROUP BY bi.id;

-- 12. ตรวจสอบการคำนวณ tax ต่อคืนแต่ละรายการ (เทียบกับ config)
SELECT 
    bin.id,
    bin.stay_date,
    bin.quantity,
    bin.base_price_minor,
    bin.tax_minor,
    bi.pax_adults,
    bi.pax_children,
    -- คำนวณ expected tax
    ROUND(
        -- VAT: 7% × (room + service)
        ((bin.base_price_minor * bin.quantity) + ROUND((bin.base_price_minor * bin.quantity) * 0.10)) * 0.07
        +
        -- Local Tax: 50 × (adults + children)
        (50 * (bi.pax_adults + bi.pax_children))
    ) AS expected_tax,
    bin.tax_minor - ROUND(
        ((bin.base_price_minor * bin.quantity) + ROUND((bin.base_price_minor * bin.quantity) * 0.10)) * 0.07
        + (50 * (bi.pax_adults + bi.pax_children))
    ) AS difference
FROM booking_item_nights bin
JOIN booking_items bi ON bi.id = bin.booking_item_id
WHERE bi.booking_id = 4
ORDER BY bin.booking_item_id, bin.stay_date;

-- ========================================
-- สรุป: ถ้าทุก query ไม่แสดงแถว (หรือ difference = 0)
-- แสดงว่าการคำนวณถูกต้องทั้งหมด ✅
-- ========================================
