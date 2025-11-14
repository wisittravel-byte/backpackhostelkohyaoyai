-- ตรวจสอบ payment_providers
SELECT 'payment_providers' AS tbl, id, code, name, is_active FROM payment_providers;

-- ตรวจสอบ merchant_payment_accounts
SELECT 'merchant_payment_accounts' AS tbl, id, provider_id, environment, is_active, public_key 
FROM merchant_payment_accounts;
