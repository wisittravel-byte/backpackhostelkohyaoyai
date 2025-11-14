-- 1) Insert/Update payment_providers (OMISE)
INSERT INTO payment_providers (code, name, website, is_active, created_at, created_by, updated_at, updated_by)
VALUES ('OMISE', 'Omise Payments', 'https://www.omise.co/th', 1, NOW(), 'system', NOW(), 'system')
ON DUPLICATE KEY UPDATE 
    name = VALUES(name), 
    website = VALUES(website), 
    is_active = VALUES(is_active), 
    updated_at = VALUES(updated_at), 
    updated_by = VALUES(updated_by);

-- 2) Insert/Update merchant_payment_accounts (env='test')
-- ⚠️ แทน pkey_test_xxx ด้วยค่าจริงจาก Omise Dashboard
INSERT INTO merchant_payment_accounts (
    provider_id, 
    environment, 
    account_reference, 
    public_key, 
    secret_ciphertext, 
    webhook_secret_ciphertext, 
    kms_key_id, 
    is_active, 
    created_at, 
    created_by, 
    updated_at, 
    updated_by
)
SELECT 
    pp.id,
    'test',
    'acct_test_default',
    'pkey_test_REPLACE_WITH_YOUR_KEY',
    NULL,
    NULL,
    'kms-key-test-01',
    1,
    NOW(),
    'system',
    NOW(),
    'system'
FROM payment_providers pp
WHERE pp.code = 'OMISE'
ON DUPLICATE KEY UPDATE 
    account_reference = VALUES(account_reference),
    public_key = VALUES(public_key),
    is_active = VALUES(is_active),
    updated_at = VALUES(updated_at),
    updated_by = VALUES(updated_by);
