-- ============================================================================
-- Migration: Convert property_tax_config to use minor units (satang)
-- Date: 2025-11-11
-- Author: System
-- 
-- Changes:
-- - local_tax_amount: DECIMAL(10,2) → BIGINT (×100)
-- - fee_value: DECIMAL(10,2) → BIGINT (×100)
--
-- Example: 50.00 THB → 5000 satang
-- ============================================================================

-- 1. Backup existing data
CREATE TABLE IF NOT EXISTS property_tax_config_backup_20251111 AS 
SELECT * FROM property_tax_config;

SELECT 'Backup created' as status;

-- 2. Show current data
SELECT 
  id,
  local_tax_amount as local_tax_baht_old,
  fee_value as fee_baht_old,
  local_tax_amount * 100 as local_tax_minor_new,
  fee_value * 100 as fee_minor_new
FROM property_tax_config;

-- 3. Alter columns to BIGINT UNSIGNED
ALTER TABLE property_tax_config
  MODIFY COLUMN local_tax_amount BIGINT UNSIGNED NOT NULL DEFAULT 0 
    COMMENT 'Local tax in minor units (satang), e.g., 5000 = 50.00 THB',
  MODIFY COLUMN fee_value BIGINT UNSIGNED NOT NULL DEFAULT 0 
    COMMENT 'Booking fee in minor units (satang), e.g., 100000 = 1000.00 THB';

SELECT 'Columns altered to BIGINT' as status;

-- 4. Update existing data: convert บาท → สตางค์
-- WARNING: This assumes current values are in THB (e.g., 50.00, 1000.00)
-- If values are already in minor units, SKIP this step!

UPDATE property_tax_config
SET 
  local_tax_amount = FLOOR(local_tax_amount * 100),
  fee_value = FLOOR(fee_value * 100)
WHERE local_tax_amount < 10000 OR fee_value < 10000;
-- Safety check: only update if values look like THB (< 10000)

SELECT 'Data migrated to minor units' as status;

-- 5. Verify migration
SELECT 
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
FROM property_tax_config;

SELECT 'Migration completed successfully!' as status;

-- ============================================================================
-- Rollback (if needed):
-- ============================================================================
-- DROP TABLE IF EXISTS property_tax_config;
-- CREATE TABLE property_tax_config AS 
-- SELECT * FROM property_tax_config_backup_20251111;
-- ============================================================================
