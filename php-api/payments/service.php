<?php
// Service layer for payments business logic and Omise integration
// Field mapping guidelines (payments table):
// - booking_id: from bookings.id (param)
// - provider_id: payment_providers.id (active, OMISE)
// - merchant_account_id: merchant_payment_accounts.id (active by env)
// - idempotency_key: UUIDv4 generated per request; also sent to Omise Idempotency-Key header
// - provider_charge_id: Omise charge.id (null on create; set after API/webhook)
// - amount_minor: bookings.pay_now_minor (fallback bookings.grand_total_minor) in satang
// - currency: bookings.currency or 'THB'
// - method_code: 'card' (token) or source.type (PromptPay, etc.)
// - card_brand/card_last4: from charge.card.brand / .last_digits
// - customer_ip: REMOTE_ADDR at /payments/create
// - country: from provider response if available (left null here)
// - risk_score: reserved for future fraud score (Null if none)
// - three_ds_status: inferred → 'authenticated' | 'attempted' | 'NA'
// - status: 'PENDING' → 'REQUIRES_ACTION' | 'AUTHORIZED' | 'SUCCESSFUL' | 'FAILED' | 'REFUNDED' | 'PARTIALLY_REFUNDED' | 'CANCELLED'
// - authorized_at/captured_at/refunded_at: mapped from provider times where available
// - failure_code/failure_message: from provider error
// - metadata_json: stores raw fragments (charge fields / flags) for audit
// - created_by/updated_by: 'website' for API calls, 'webhook' for webhook syncs
require_once __DIR__ . '/repository.php';
if (!function_exists('str_starts_with')) {
    function str_starts_with($haystack, $needle) { return $needle === '' || strpos($haystack, $needle) === 0; }
}

// Helpers for env flags and (optional) secret decryption
if (!function_exists('env_bool')) {
    function env_bool(string $name, bool $default=false): bool {
        $v = getenv($name);
        if ($v === false || $v === null || $v === '') return $default;
        $v = strtolower(trim((string)$v));
        return in_array($v, ['1','true','yes','y','on'], true);
    }
}
if (!function_exists('payments_decrypt_secret')) {
    function payments_decrypt_secret($ciphertext) {
        // Stub for future KMS integration; return null (forces ENV usage)
        return null;
    }
}

function payments_uuid(): string {
    // simple uuid v4-like
    $data = random_bytes(16);
    $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
    $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);
    return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
}

function map_three_ds_status_from_charge(array $charge): string {
    // Default 'NA'; try to infer from card or authorize fields
    $card = $charge['card'] ?? [];
    if (!is_array($card)) $card = [];
    // Omise returns 'security_code_check' and 'three_d_secure' flags on card
    $tds = strtolower((string)($card['three_d_secure'] ?? ''));
    $authUri = $charge['authorize_uri'] ?? null;
    $status = strtolower((string)($charge['status'] ?? ''));
    if ($status === 'successful' && ($tds === 'required' || $tds === 'optional')) return 'authenticated';
    if ($authUri && $status === 'pending') return 'attempted';
    return 'NA';
}

function map_payment_status_from_charge(array $charge): string {
    $st = strtolower((string)($charge['status'] ?? 'pending'));
    if ($st === 'failed') return 'FAILED';
    if ($st === 'successful') return 'SUCCESSFUL';
    if ($st === 'authorized') return 'AUTHORIZED';
    if ($st === 'reversed') return 'CANCELLED';
    // pending with action required (3DS)
    if ($st === 'pending') return 'REQUIRES_ACTION';
    return 'PENDING';
}

function get_omise_keys(PDO $pdo): array {
    $secret = getenv('OMISE_SECRET_KEY') ?: '';
    $pub    = getenv('OMISE_PUBLIC_KEY') ?: '';
    $webhookSecret = getenv('OMISE_WEBHOOK_SECRET') ?: '';

    // Secrets file fallback for local/dev (optional)
    if (!$secret || !$pub) {
        $candidates = [
            __DIR__ . '/../api-secrets.php',
            dirname(__DIR__) . '/api-secrets.php',
        ];
        foreach ($candidates as $file) {
            if (@is_file($file)) {
                $conf = include $file;
                if (is_array($conf)) {
                    $secret = $secret ?: ($conf['OMISE_SECRET_KEY'] ?? '');
                    $pub    = $pub    ?: ($conf['OMISE_PUBLIC_KEY'] ?? '');
                    $webhookSecret = $webhookSecret ?: ($conf['OMISE_WEBHOOK_SECRET'] ?? '');
                    break;
                }
            }
        }
    }
    $envOverride = strtolower(trim((string)(getenv('OMISE_ENV') ?: '')));
    $env = in_array($envOverride, ['test','live'], true)
        ? $envOverride
        : ((str_starts_with($secret, 'skey_test_') || str_starts_with($pub, 'pkey_test_')) ? 'test' : 'live');
    $providerId = repo_find_active_provider_id($pdo, $env) ?? 0;
    $merchant = repo_find_active_merchant_account($pdo, $providerId, $env);

    // Prefer DB keys when explicitly enabled; otherwise keep .env for dev/local
    $useDb = env_bool('PAYMENTS_USE_DB_KEYS', false);
    $dbPublic = $merchant['public_key'] ?? '';
    $dbSecretPlain = null;
    if ($useDb && !empty($merchant['secret_ciphertext'])) {
        $dbSecretPlain = payments_decrypt_secret($merchant['secret_ciphertext']);
    }

    return [
        'provider_id' => $providerId,
        'merchant_account_id' => $merchant['id'] ?? 0,
        'public_key' => ($useDb && $dbPublic) ? $dbPublic : ($pub ?: $dbPublic),
        'secret_key' => ($useDb && $dbSecretPlain) ? $dbSecretPlain : $secret,
        'webhook_secret' => $webhookSecret ?: '',
        'environment' => $env,
    ];
}

/**
 * Create a PENDING payment row and log audit.
 */
function create_pending_payment(PDO $pdo, array $booking, array $ctx): array {
    $keys = get_omise_keys($pdo);
    if (empty($keys['provider_id']) || empty($keys['merchant_account_id'])) {
        error_log('[payments] provider_id=' . ($keys['provider_id']??'NULL') . ' merchant_account_id=' . ($keys['merchant_account_id']??'NULL') . ' env=' . ($keys['environment']??'?'));
        throw new Exception('Payment provider/account not configured');
    }

    $idemp = payments_uuid();
    $data = [
        'booking_id' => intval($booking['id']),
        'provider_id' => $keys['provider_id'],
        'merchant_account_id' => $keys['merchant_account_id'],
        'idempotency_key' => $idemp,
        'provider_charge_id' => null,
        'amount_minor' => intval($booking['pay_now_minor'] ?: $booking['grand_total_minor']),
        'currency' => strtoupper($booking['currency'] ?? 'THB'),
        'method_code' => $ctx['method_code'] ?? null,
        'card_brand' => null,
        'card_last4' => null,
        'customer_ip' => $ctx['customer_ip'] ?? null,
        'country' => null,
        'risk_score' => null,
        'three_ds_status' => 'NA',
        'status' => 'PENDING',
        'authorized_at' => null,
        'captured_at' => null,
        'refunded_at' => null,
        'failure_code' => null,
        'failure_message' => null,
        'metadata_json' => [
          'booking_ref' => $booking['booking_ref'] ?? null,
          'object_type' => $ctx['object_type'] ?? null,
        ],
        'created_by' => 'website',
        'updated_by' => 'website',
    ];
    $paymentId = repo_insert_payment($pdo, $data);
    repo_insert_payment_log($pdo, [
        'payment_id' => $paymentId,
        'action' => 'CREATE_PAYMENT',
        'old_status' => null,
        'new_status' => 'PENDING',
        'actor_type' => ($ctx['actor_type'] ?? 'USER'),
        'actor_id' => $ctx['actor_id'] ?? null,
        'note' => 'create payment from checkout page',
        'created_by' => 'website',
    ]);
    return ['id' => $paymentId, 'idempotency_key' => $idemp, 'keys' => $keys];
}

/**
 * Call Omise /charges and update payment accordingly; returns array to frontend.
 */
function call_omise_and_update(PDO $pdo, int $paymentId, string $idempotencyKey, array $booking, array $keys, array $chargeParams): array {
    if (empty($keys['secret_key'])) throw new Exception('OMISE_SECRET_KEY not set on server');

        $payload = [
            'amount' => intval($booking['pay_now_minor'] ?: $booking['grand_total_minor']),
            'currency' => strtolower($booking['currency'] ?? 'thb'),
            'capture' => 'true',
            // Omise expects form-encoded metadata as nested keys
            'metadata[booking_id]' => intval($booking['id']),
            'metadata[payment_id]' => $paymentId,
            'metadata[booking_ref]' => ($booking['booking_ref'] ?? ''),
        ] + $chargeParams; // merge card/source

    // Prepare form-encoded body
    $body = http_build_query($payload);
    $ch = curl_init('https://api.omise.co/charges');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_USERPWD, $keys['secret_key'] . ':');
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/x-www-form-urlencoded',
        'Idempotency-Key: ' . $idempotencyKey,
    ]);
    curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $resp = curl_exec($ch);
    $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlErr = curl_error($ch);
    curl_close($ch);
    if ($resp === false) throw new Exception('Failed to connect Omise: ' . $curlErr);
    $charge = json_decode($resp, true) ?: [];

    // Determine mapping
    $newStatus = ($code >= 400 || (($charge['object'] ?? '') === 'error'))
        ? 'FAILED'
        : map_payment_status_from_charge($charge);

    $set = [
        'updated_by' => 'website',
        'status' => $newStatus,
        'provider_charge_id' => $charge['id'] ?? null,
        'method_code' => $charge['source']['type'] ?? ($charge['card'] ? 'card' : null),
        'card_brand' => $charge['card']['brand'] ?? null,
        'card_last4' => $charge['card']['last_digits'] ?? ($charge['card']['last4'] ?? null),
        'three_ds_status' => map_three_ds_status_from_charge($charge),
        'authorized_at' => isset($charge['authorized_at']) ? date('Y-m-d H:i:s', strtotime($charge['authorized_at'])) : null,
        'captured_at' => isset($charge['captured_at']) ? date('Y-m-d H:i:s', strtotime($charge['captured_at'])) : (isset($charge['created']) ? date('Y-m-d H:i:s', is_numeric($charge['created']) ? intval($charge['created']) : strtotime($charge['created'])) : null),
        'failure_code' => $charge['failure_code'] ?? null,
        'failure_message' => $charge['failure_message'] ?? ($charge['message'] ?? null),
        'metadata_json' => [
            'raw_charge_object' => array_intersect_key($charge, array_flip(['id','status','paid','card','source','failure_code','failure_message','authorize_uri'])),
            'http_code' => $code,
            'raw_response_sample' => ($code >= 400 ? substr($resp, 0, 500) : null), // debug on error
        ],
    ];
    repo_update_payment_by_id($pdo, $paymentId, $set);

    repo_insert_payment_log($pdo, [
        'payment_id' => $paymentId,
        'action' => 'UPDATE_STATUS_FROM_API',
        'old_status' => 'PENDING',
        'new_status' => $newStatus,
        'actor_type' => 'SYSTEM',
        'actor_id' => null,
        'note' => 'charge response from Omise API',
        'created_by' => 'website',
    ]);

    $respOut = [
        'ok' => ($newStatus === 'SUCCESSFUL' || $newStatus === 'AUTHORIZED' || $newStatus === 'REQUIRES_ACTION'),
        'payment_id' => $paymentId,
        'charge_id' => $charge['id'] ?? null,
        'status' => $newStatus,
        'requires_action' => ($newStatus === 'REQUIRES_ACTION'),
        'authorize_uri' => $charge['authorize_uri'] ?? null,
        'paid' => $charge['paid'] ?? false,
        'amount' => $charge['amount'] ?? $payload['amount'],
        'currency' => $charge['currency'] ?? $payload['currency'],
    ];
    if ($code >= 400 || (($charge['object'] ?? '') === 'error')) {
        $respOut['ok'] = false;
        $respOut['error'] = $charge['message'] ?? 'payment_failed';
    }
    return $respOut;
}

/**
 * Update payment from webhook charge payload
 */
function sync_payment_from_webhook(PDO $pdo, array $charge): array {
    $chargeId = $charge['id'] ?? ($charge['data']['id'] ?? null);
    if (!$chargeId) return ['ok' => false, 'reason' => 'no_charge_id'];
    $p = repo_find_payment_by_charge_id($pdo, $chargeId);
    if (!$p) return ['ok' => false, 'reason' => 'payment_not_found'];

    $status = map_payment_status_from_charge($charge);
    $set = [
        'status' => $status,
        'three_ds_status' => map_three_ds_status_from_charge($charge),
        'authorized_at' => isset($charge['authorized_at']) ? date('Y-m-d H:i:s', strtotime($charge['authorized_at'])) : null,
        'captured_at' => isset($charge['captured_at']) ? date('Y-m-d H:i:s', strtotime($charge['captured_at'])) : (isset($charge['created']) ? date('Y-m-d H:i:s', is_numeric($charge['created']) ? intval($charge['created']) : strtotime($charge['created'])) : null),
        'failure_code' => $charge['failure_code'] ?? null,
        'failure_message' => $charge['failure_message'] ?? null,
        'updated_by' => 'webhook',
        'metadata_json' => [ 'webhook_sync' => true, 'status' => $status ],
    ];
    repo_update_payment_by_id($pdo, intval($p['id']), $set);
    repo_insert_payment_log($pdo, [
        'payment_id' => intval($p['id']),
        'action' => 'UPDATE_STATUS_FROM_WEBHOOK',
        'old_status' => $p['status'] ?? null,
        'new_status' => $status,
        'actor_type' => 'SYSTEM',
        'actor_id' => null,
        'note' => 'webhook synchronization',
        'created_by' => 'webhook',
    ]);
    return ['ok' => true, 'payment_id' => intval($p['id']), 'status' => $status];
}

/** Convenience logger with the requested signature */
function logPaymentAction(PDO $pdo, int $paymentId, string $action, ?string $oldStatus, ?string $newStatus, string $actorType='SYSTEM', $actorId=null, ?string $note=null, ?string $by=null): void {
    repo_insert_payment_log($pdo, [
        'payment_id' => $paymentId,
        'action' => $action,
        'old_status' => $oldStatus,
        'new_status' => $newStatus,
        'actor_type' => $actorType,
        'actor_id' => $actorId,
        'note' => $note,
        'created_by' => $by ?? (($actorType==='WEBHOOK')?'webhook':'website'),
    ]);
}

?>
