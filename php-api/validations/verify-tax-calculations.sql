-- ============================================================================
-- Validation Queries: Verify Tax Calculations After Fix
-- Date: 2025-11-11
-- 
-- ใช้ queries เหล่านี้เพื่อตรวจสอบว่าการคำนวณภาษีถูกต้อง:
-- 1. booking_tax_lines มีค่า amount_minor เป็น integer minor units
-- 2. booking_item_nights.tax_minor คำนวณถูกต้องตามหลักการ
-- 3. booking_items รวมค่าจาก booking_item_nights ถูกต้อง
-- 4. bookings รวมค่าจาก booking_items ถูกต้อง
-- ============================================================================

-- ============================================================================
-- 1. ตรวจสอบ property_tax_config (หลัง migrate)
-- ============================================================================
SELECT 
  'property_tax_config' as table_name,
  id,
  service_charge_pct,
  vat_pct,
  vat_base,
  local_tax_amount as local_tax_minor,
  local_tax_amount / 100 as local_tax_baht,
  local_tax_unit,
  fee_value as fee_minor,
  fee_value / 100 as fee_baht,
  fee_unit,
  is_active
FROM property_tax_config
WHERE is_active = 1;

-- ============================================================================
-- 2. ตรวจสอบ booking_tax_lines (amount_minor ต้องเป็น integer)
-- ============================================================================
SELECT 
  'booking_tax_lines' as table_name,
  id,
  booking_id,
  tax_type,
  scope,
  unit,
  quantity,
  rate_pct,
  base_amount_minor,
  amount_minor,
  amount_minor / 100 as amount_baht,
  vat_base,
  local_tax_unit
FROM booking_tax_lines
WHERE booking_id = (SELECT MAX(id) FROM bookings)
ORDER BY tax_type;

-- ============================================================================
-- 3. ตรวจสอบ booking_item_nights (tax_minor ต้องคำนวณถูกต้อง)
-- ============================================================================
-- Formula per night:
-- - room_charge = base_price × quantity
-- - service_charge = room_charge × 10%
-- - vat_base = room_charge + service_charge (if vat_base = ROOM_PLUS_SERVICE)
-- - vat = vat_base × 7%
-- - local_tax = 50 THB × pax (if PER_PERSON_PER_NIGHT)
-- - tax_minor = vat + local_tax
-- - total_minor = room_charge + tax_minor

SELECT 
  'booking_item_nights' as table_name,
  bin.id,
  bin.booking_item_id,
  bin.stay_date,
  bin.quantity,
  bin.base_price_minor,
  bin.base_price_minor / 100 as base_price_baht,
  (bin.base_price_minor * bin.quantity) as room_charge_minor,
  (bin.base_price_minor * bin.quantity) / 100 as room_charge_baht,
  bin.tax_minor,
  bin.tax_minor / 100 as tax_baht,
  bin.total_minor,
  bin.total_minor / 100 as total_baht,
  bi.pax_adults,
  bi.pax_children,
  -- Expected tax calculation:
  ROUND((bin.base_price_minor * bin.quantity) * 0.10) as exp_service_charge,
  ROUND(((bin.base_price_minor * bin.quantity) + ROUND((bin.base_price_minor * bin.quantity) * 0.10)) * 0.07) as exp_vat,
  (5000 * (bi.pax_adults + bi.pax_children)) as exp_local_tax,
  (
    ROUND(((bin.base_price_minor * bin.quantity) + ROUND((bin.base_price_minor * bin.quantity) * 0.10)) * 0.07) +
    (5000 * (bi.pax_adults + bi.pax_children))
  ) as exp_tax_minor,
  -- Difference:
  bin.tax_minor - (
    ROUND(((bin.base_price_minor * bin.quantity) + ROUND((bin.base_price_minor * bin.quantity) * 0.10)) * 0.07) +
    (5000 * (bi.pax_adults + bi.pax_children))
  ) as tax_diff
FROM booking_item_nights bin
JOIN booking_items bi ON bi.id = bin.booking_item_id
WHERE bi.booking_id = (SELECT MAX(id) FROM bookings)
ORDER BY bin.booking_item_id, bin.stay_date;

-- ============================================================================
-- 4. ตรวจสอบ booking_items (รวมจาก booking_item_nights)
-- ============================================================================
SELECT 
  'booking_items_validation' as validation,
  bi.id,
  bi.booking_id,
  bi.room_type_id,
  bi.quantity,
  bi.pax_adults,
  bi.pax_children,
  -- From booking_items:
  bi.line_subtotal_minor,
  bi.line_taxes_minor,
  bi.line_total_minor,
  -- Calculated from booking_item_nights:
  SUM(bin.base_price_minor * bin.quantity) as calc_subtotal,
  SUM(bin.tax_minor) as calc_taxes,
  SUM(bin.total_minor) as calc_total,
  -- Differences:
  bi.line_subtotal_minor - SUM(bin.base_price_minor * bin.quantity) as subtotal_diff,
  bi.line_taxes_minor - SUM(bin.tax_minor) as taxes_diff,
  bi.line_total_minor - SUM(bin.total_minor) as total_diff
FROM booking_items bi
JOIN booking_item_nights bin ON bin.booking_item_id = bi.id
WHERE bi.booking_id = (SELECT MAX(id) FROM bookings)
GROUP BY bi.id
HAVING subtotal_diff != 0 OR taxes_diff != 0 OR total_diff != 0;

-- If no rows returned → ✅ OK

-- ============================================================================
-- 5. ตรวจสอบ bookings (รวมจาก booking_items)
-- ============================================================================
SELECT 
  'bookings_validation' as validation,
  b.id,
  b.booking_ref,
  -- From bookings:
  b.room_charge,
  b.service_charge,
  b.fee,
  b.vat,
  b.local_tax,
  b.room_total_minor,
  b.taxes_total_minor,
  b.grand_total_minor,
  -- Calculated from booking_items:
  SUM(bi.line_subtotal_minor) as calc_room_charge,
  SUM(bi.line_taxes_minor) as calc_taxes_total,
  SUM(bi.line_total_minor) as calc_grand_total,
  -- Differences:
  b.room_charge - SUM(bi.line_subtotal_minor) as room_charge_diff,
  b.taxes_total_minor - SUM(bi.line_taxes_minor) as taxes_diff,
  b.grand_total_minor - SUM(bi.line_total_minor) as grand_total_diff
FROM bookings b
JOIN booking_items bi ON bi.booking_id = b.id
WHERE b.id = (SELECT MAX(id) FROM bookings)
GROUP BY b.id
HAVING room_charge_diff != 0 OR taxes_diff != 0 OR grand_total_diff != 0;

-- If no rows returned → ✅ OK

-- ============================================================================
-- 6. ตรวจสอบว่า booking_tax_lines สอดคล้องกับ booking_item_nights
-- ============================================================================
SELECT 
  'tax_lines_vs_nights' as validation,
  b.id as booking_id,
  b.booking_ref,
  -- Total tax from booking_tax_lines:
  SUM(CASE WHEN btl.tax_type IN ('VAT','LOCAL_TAX') THEN btl.amount_minor ELSE 0 END) as tax_from_lines,
  -- Total tax from booking_item_nights:
  (SELECT SUM(bin.tax_minor) 
   FROM booking_item_nights bin 
   JOIN booking_items bi ON bi.id = bin.booking_item_id 
   WHERE bi.booking_id = b.id) as tax_from_nights,
  -- Difference:
  SUM(CASE WHEN btl.tax_type IN ('VAT','LOCAL_TAX') THEN btl.amount_minor ELSE 0 END) -
  (SELECT SUM(bin.tax_minor) 
   FROM booking_item_nights bin 
   JOIN booking_items bi ON bi.id = bin.booking_item_id 
   WHERE bi.booking_id = b.id) as diff
FROM bookings b
LEFT JOIN booking_tax_lines btl ON btl.booking_id = b.id
WHERE b.id = (SELECT MAX(id) FROM bookings)
GROUP BY b.id
HAVING ABS(diff) > 10; -- Allow ±10 satang rounding difference

-- If no rows returned → ✅ OK

-- ============================================================================
-- 7. แสดงสรุปภาพรวมของ booking ล่าสุด
-- ============================================================================
SELECT 
  '=== Booking Summary ===' as section,
  b.id,
  b.booking_ref,
  b.check_in_date,
  b.check_out_date,
  b.nights,
  b.status,
  b.room_charge / 100 as room_charge_baht,
  b.service_charge / 100 as service_charge_baht,
  b.fee / 100 as fee_baht,
  b.vat / 100 as vat_baht,
  b.local_tax / 100 as local_tax_baht,
  b.taxes_total_minor / 100 as taxes_total_baht,
  b.grand_total_minor / 100 as grand_total_baht
FROM bookings b
WHERE b.id = (SELECT MAX(id) FROM bookings);

-- ============================================================================
-- ✅ หากทุก validation query ไม่ return rows (หรือ diff = 0) 
--    แสดงว่าการคำนวณถูกต้องแล้ว!
-- ============================================================================
