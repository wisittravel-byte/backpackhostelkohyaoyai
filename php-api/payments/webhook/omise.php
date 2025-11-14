<?php
// POST /php-api/payments/webhook/omise
require_once __DIR__ . '/../../common.php';
require_once __DIR__ . '/../service.php';

header('Content-Type: application/json; charset=utf-8');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') { json_out(['error'=>'method_not_allowed'],405); exit; }

$raw = file_get_contents('php://input');
$sig = $_SERVER['HTTP_X_OMISE_SIGNATURE'] ?? $_SERVER['HTTP_X_OMISE_SIGNATURE_SHA256'] ?? '';
$payload = json_decode($raw, true);
if (!is_array($payload)) { json_out(['error'=>'invalid_json'],400); exit; }

// 1) Record webhook event row immediately
$eventId = (string)($payload['id'] ?? '');
$eventType = (string)($payload['key'] ?? $payload['type'] ?? '');
$chargeId = (string)($payload['data']['id'] ?? $payload['data']['charge'] ?? '');
$sha256 = hash('sha256', $raw);

$ins = repo_upsert_webhook_event($pdo, [
  'event_id' => $eventId,
  'event_type' => $eventType,
  'charge_id' => $chargeId,
  'signature_header' => $sig,
  'payload_sha256' => $sha256,
]);

if (!$ins['is_new']) {
  repo_update_webhook_processing($pdo, $ins['id'], 'SKIPPED', 200, null);
  json_out(['ok'=>true,'skipped'=>true]);
  exit;
}

// 2) Verify signature if configured
$keys = get_omise_keys($pdo);
$whsec = $keys['webhook_secret'] ?? '';
$verified = true;
if ($whsec) {
  // Omise: HMAC-SHA256 of the raw body using webhook secret
  $calc = base64_encode(hash_hmac('sha256', $raw, $whsec, true));
  $verified = hash_equals($calc, $sig);
}
if (!$verified) {
  repo_update_webhook_processing($pdo, $ins['id'], 'SKIPPED', 400, 'invalid_signature');
  json_out(['error'=>'invalid_signature'],400);
  exit;
}

// 3) Handle charge events
try {
  $etype = strtolower($eventType);
  $data  = $payload['data'] ?? [];
  $sync  = sync_payment_from_webhook($pdo, $data);
  repo_update_webhook_processing($pdo, $ins['id'], 'VERIFIED', 200, null);
  json_out(['ok'=>true,'synced'=>$sync]);
} catch (Throwable $e) {
  repo_update_webhook_processing($pdo, $ins['id'], 'RECEIVED', 500, $e->getMessage());
  json_out(['error'=>'webhook_processing_failed','detail'=>$e->getMessage()],500);
}

?>
