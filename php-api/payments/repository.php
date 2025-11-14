<?php
// Repository layer for payments-related persistence
require_once __DIR__ . '/../common.php';

/**
 * Find active provider id for Omise, only when there's an active merchant
 * account for the specified environment (e.g. 'test' | 'live').
 */
function repo_find_active_provider_id(PDO $pdo, string $env): ?int {
    try {
        // Join with merchant accounts to ensure we only pick a provider that
        // actually has an active merchant entry for the requested environment.
        // If your schema pins Omise to id=1, keep that condition as requested.
                $sql = "SELECT pp.id
                                FROM payment_providers pp
                                JOIN merchant_payment_accounts mpa ON pp.id = mpa.provider_id
                                WHERE pp.code = 'OMISE'
                                    AND pp.is_active = 1
                                    AND mpa.environment = :env
                                    AND mpa.is_active = 1
                                ORDER BY pp.id
                                LIMIT 1";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':env' => strtolower($env)]);
        $id = $stmt->fetchColumn();
        return $id ? intval($id) : null;
    } catch (Throwable $e) { return null; }
}

/**
 * Get active merchant account by env (test/live). Returns assoc or null.
 */
function repo_find_active_merchant_account(PDO $pdo, int $providerId, string $env): ?array {
    try {
        $stmt = $pdo->prepare("SELECT id, provider_id, environment, account_reference, public_key, secret_ciphertext, webhook_secret_ciphertext, kms_key_id, is_active FROM merchant_payment_accounts WHERE is_active = 1 AND provider_id = :pid AND environment = :env ORDER BY id DESC LIMIT 1");
        $stmt->execute([':pid' => $providerId, ':env' => $env]);
        $row = $stmt->fetch(PDO::FETCH_ASSOC);
        return $row ?: null;
    } catch (Throwable $e) { return null; }
}

/**
 * Insert a payments row (status=PENDING initially). Returns the inserted id.
 */
function repo_insert_payment(PDO $pdo, array $data): int {
    $sql = "INSERT INTO payments (
        booking_id, provider_id, merchant_account_id, idempotency_key,
        provider_charge_id, amount_minor, currency, method_code,
        card_brand, card_last4, customer_ip, country, risk_score,
        three_ds_status, status, authorized_at, captured_at, refunded_at,
        failure_code, failure_message, metadata_json, created_by, updated_by
    ) VALUES (
        :booking_id, :provider_id, :merchant_account_id, :idempotency_key,
        :provider_charge_id, :amount_minor, :currency, :method_code,
        :card_brand, :card_last4, :customer_ip, :country, :risk_score,
        :three_ds_status, :status, :authorized_at, :captured_at, :refunded_at,
        :failure_code, :failure_message, :metadata_json, :created_by, :updated_by
    )";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':booking_id' => intval($data['booking_id']),
        ':provider_id' => intval($data['provider_id']),
        ':merchant_account_id' => intval($data['merchant_account_id']),
        ':idempotency_key' => (string)$data['idempotency_key'],
        ':provider_charge_id' => $data['provider_charge_id'] ?? null,
        ':amount_minor' => intval($data['amount_minor']),
        ':currency' => strtoupper((string)($data['currency'] ?? 'THB')),
        ':method_code' => $data['method_code'] ?? null,
        ':card_brand' => $data['card_brand'] ?? null,
        ':card_last4' => $data['card_last4'] ?? null,
        ':customer_ip' => $data['customer_ip'] ?? null,
        ':country' => $data['country'] ?? null,
        ':risk_score' => isset($data['risk_score']) ? intval($data['risk_score']) : null,
        ':three_ds_status' => $data['three_ds_status'] ?? 'NA',
        ':status' => $data['status'] ?? 'PENDING',
        ':authorized_at' => $data['authorized_at'] ?? null,
        ':captured_at' => $data['captured_at'] ?? null,
        ':refunded_at' => $data['refunded_at'] ?? null,
        ':failure_code' => $data['failure_code'] ?? null,
        ':failure_message' => $data['failure_message'] ?? null,
        ':metadata_json' => isset($data['metadata_json']) ? json_encode($data['metadata_json'], JSON_UNESCAPED_UNICODE) : null,
        ':created_by' => $data['created_by'] ?? 'website',
        ':updated_by' => $data['updated_by'] ?? 'website',
    ]);
    return intval($pdo->lastInsertId());
}

/** Update payments core fields by id */
function repo_update_payment_by_id(PDO $pdo, int $id, array $set): void {
    $cols = [];
    $params = [':id' => $id];
    foreach ($set as $k => $v) {
        $cols[] = "`$k` = :$k";
        $params[":$k"] = ($k === 'metadata_json' && is_array($v)) ? json_encode($v, JSON_UNESCAPED_UNICODE) : $v;
    }
    if (!$cols) return;
    $sql = "UPDATE payments SET ".implode(', ', $cols).", updated_at = CURRENT_TIMESTAMP WHERE id = :id";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
}

/** Find payment by provider_charge_id */
function repo_find_payment_by_charge_id(PDO $pdo, string $chargeId): ?array {
    $stmt = $pdo->prepare("SELECT * FROM payments WHERE provider_charge_id = :c LIMIT 1");
    $stmt->execute([':c' => $chargeId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    return $row ?: null;
}

/** Insert an audit log row */
function repo_insert_payment_log(PDO $pdo, array $data): void {
    $sql = "INSERT INTO payment_audit_logs (
      payment_id, action, old_status, new_status, actor_type, actor_id, note, created_by, updated_by
    ) VALUES (
      :payment_id, :action, :old_status, :new_status, :actor_type, :actor_id, :note, :created_by, :updated_by
    )";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([
        ':payment_id' => intval($data['payment_id']),
        ':action' => (string)$data['action'],
        ':old_status' => $data['old_status'] ?? null,
        ':new_status' => $data['new_status'] ?? null,
        ':actor_type' => $data['actor_type'] ?? 'SYSTEM',
        ':actor_id' => isset($data['actor_id']) ? intval($data['actor_id']) : null,
        ':note' => $data['note'] ?? null,
        ':created_by' => $data['created_by'] ?? null,
        ':updated_by' => $data['updated_by'] ?? null,
    ]);
}

/** Upsert webhook event; returns id and whether it's new */
function repo_upsert_webhook_event(PDO $pdo, array $e): array {
    // Try insert; if duplicate, mark as skipped later
    $sql = "INSERT INTO payment_webhook_events (
      provider, event_id, event_type, charge_id, signature_header, payload_sha256,
      received_at, processed_at, processing_status, http_status_sent, attempts_count,
      error_message, created_by, updated_by
    ) VALUES (
      :provider, :event_id, :event_type, :charge_id, :signature_header, :payload_sha256,
      :received_at, NULL, 'RECEIVED', NULL, 0,
      NULL, 'webhook', 'webhook'
    )";
    try {
        $stmt = $pdo->prepare($sql);
        $stmt->execute([
            ':provider' => 'OMISE',
            ':event_id' => $e['event_id'],
            ':event_type' => $e['event_type'] ?? null,
            ':charge_id' => $e['charge_id'] ?? null,
            ':signature_header' => $e['signature_header'] ?? null,
            ':payload_sha256' => $e['payload_sha256'] ?? null,
            ':received_at' => date('Y-m-d H:i:s'),
        ]);
        return ['id' => intval($pdo->lastInsertId()), 'is_new' => true];
    } catch (Throwable $ex) {
        // duplicate? fetch existing
        $stmt = $pdo->prepare("SELECT id FROM payment_webhook_events WHERE provider='OMISE' AND event_id = :eid LIMIT 1");
        $stmt->execute([':eid' => $e['event_id']]);
        $id = $stmt->fetchColumn();
        return ['id' => $id ? intval($id) : 0, 'is_new' => false];
    }
}

function repo_update_webhook_processing(PDO $pdo, int $id, string $status, ?int $httpStatus, ?string $err = null): void {
    $stmt = $pdo->prepare("UPDATE payment_webhook_events SET processing_status = :st, processed_at = CURRENT_TIMESTAMP, http_status_sent = :hc, error_message = :err WHERE id = :id");
    $stmt->execute([':st' => $status, ':hc' => $httpStatus, ':err' => $err, ':id' => $id]);
}

?>
