<?php
// POST /php-api/payments/create
// Body: { booking_id, token_or_source_id, object_type: 'token'|'source', method_code? }
require_once __DIR__ . '/../common.php';
require_once __DIR__ . '/service.php';

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') { json_out(['error'=>'method_not_allowed'],405); exit; }

$raw = file_get_contents('php://input');
$body = json_decode($raw, true);
if (!is_array($body)) { json_out(['error'=>'invalid_json'],400); exit; }

// Support both legacy (omise_token) and new (token_or_source_id) formats
$bookingId = intval($body['booking_id'] ?? 0);
$tokOrSrc  = (string)($body['token_or_source_id'] ?? $body['omise_token'] ?? '');
$objType   = strtolower(trim((string)($body['object_type'] ?? '')));
if (!$objType && !empty($body['omise_token'])) { $objType = 'token'; } // legacy default
$methodCode = $body['method_code'] ?? ($objType === 'token' ? 'card' : null);
$clientIp  = $_SERVER['REMOTE_ADDR'] ?? null;

if ($bookingId <= 0 || !$tokOrSrc) {
  json_out(['error'=>'missing_params','detail'=>'booking_id, omise_token (or token_or_source_id) required'],400);
  exit;
}
if (!$objType) { $objType = 'token'; } // default to token for backward compat

try {
  // 1) Validate booking
  $stmt = $pdo->prepare('SELECT id, booking_ref, status, currency, grand_total_minor, pay_now_minor FROM bookings WHERE id = :id LIMIT 1');
  $stmt->execute([':id' => $bookingId]);
  $booking = $stmt->fetch(PDO::FETCH_ASSOC);
  if (!$booking) { json_out(['error'=>'booking_not_found'],404); exit; }
  if (in_array($booking['status'], ['CANCELLED','FAILED'], true)) {
    json_out(['error'=>'booking_not_payable','status'=>$booking['status']],400); exit;
  }

  // 2) Create payments row (PENDING)
  $ctx = [ 'method_code'=>$methodCode, 'customer_ip'=>$clientIp, 'object_type'=>$objType, 'actor_type'=>'USER', 'actor_id'=>null ];
  $created = create_pending_payment($pdo, $booking, $ctx);
  $paymentId = $created['id'];
  $idemp = $created['idempotency_key'];
  $keys = $created['keys'];

  // 3) Call Omise /charges depending on object type
  $chargeParams = [];
  if ($objType === 'token') { $chargeParams['card'] = $tokOrSrc; }
  else if ($objType === 'source') { $chargeParams['source'] = $tokOrSrc; }
  else { json_out(['error'=>'invalid_object_type'],400); exit; }

  $result = call_omise_and_update($pdo, $paymentId, $idemp, $booking, $keys, $chargeParams);

  // Optional: sync booking status (do not modify booking save logic)
  try {
    if ($result['status'] === 'SUCCESSFUL') {
      $pdo->prepare('UPDATE bookings SET status = :st WHERE id = :id')->execute([':st'=>'CONFIRMED', ':id'=>$bookingId]);
    } else if ($result['status'] === 'FAILED') {
      $pdo->prepare('UPDATE bookings SET status = :st WHERE id = :id')->execute([':st'=>'FAILED', ':id'=>$bookingId]);
    }
  } catch (Throwable $e) { /* ignore */ }

  // 4) Respond for frontend handling (3DS redirect if needed)
  json_out($result, 200);
} catch (Throwable $e) {
  json_out(['error'=>'payment_create_failed','detail'=>$e->getMessage()], 500);
}

?>
