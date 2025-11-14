<?php
/**
 * Omise Payment Charge API
 * รับ omise_token จาก frontend และสร้าง charge ผ่าน Omise API
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(204);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['ok' => false, 'error' => 'Method not allowed']);
    exit;
}

// โหลด dependencies
require_once __DIR__ . '/../common.php';
require_once __DIR__ . '/../config.php';
require_once __DIR__ . '/../payments/service.php';

// ⚠️ TODO: ใส่ Omise Secret Key ตรงนี้ (เก็บไว้ฝั่ง server เท่านั้น — ห้ามใส่ใน client)
// วิธีที่ดีที่สุด: เก็บใน environment variable หรือ config file ที่ไม่ commit ขึ้น git
$OMISE_SECRET_KEY = getenv('OMISE_SECRET_KEY') ?: 'skey_test_65p5n4uvi43fxki42al'; // ⬅️ แทนที่ตรงนี้

// อ่าน payload
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Invalid JSON']);
    exit;
}

$bookingId = $data['booking_id'] ?? null;
$omiseToken = $data['omise_token'] ?? null;
$amount = (int)($data['amount'] ?? 0);

if (!$bookingId || !$omiseToken || $amount <= 0) {
    http_response_code(400);
    echo json_encode(['ok' => false, 'error' => 'Missing required fields: booking_id, omise_token, amount']);
    exit;
}

// ดึงข้อมูล booking จาก database เพื่อ validate amount
try {
    // Use global $pdo from config.php
    // $pdo is defined by require_once config.php in common.php
    
    $stmt = $pdo->prepare('
        SELECT id, booking_ref, grand_total_minor, pay_now_minor, status, currency
        FROM bookings
        WHERE id = :booking_id
        LIMIT 1
    ');
    $stmt->execute(['booking_id' => $bookingId]);
    $booking = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$booking) {
        http_response_code(404);
        echo json_encode(['ok' => false, 'error' => 'Booking not found']);
        exit;
    }
    
    // Validate amount (ตรวจสอบว่าตรงกับ booking)
    $expectedAmount = (int)($booking['pay_now_minor'] ?: $booking['grand_total_minor']);
    if ($amount !== $expectedAmount) {
        http_response_code(400);
        echo json_encode([
            'ok' => false,
            'error' => 'Amount mismatch',
            'expected' => $expectedAmount,
            'received' => $amount
        ]);
        exit;
    }
    
} catch (Exception $e) {
    error_log('Database error in charge.php: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['ok' => false, 'error' => 'Database error']);
    exit;
}

// สร้าง charge ผ่าน Omise API
try {
    $chargeData = [
        'amount' => $amount,
        'currency' => strtolower($booking['currency'] ?: 'thb'),
        'card' => $omiseToken,
        'description' => 'Booking ' . $booking['booking_ref'] . ' (ID: ' . $bookingId . ')',
        'metadata' => [
            'booking_id' => $bookingId,
            'booking_ref' => $booking['booking_ref']
        ]
    ];
    
    $ch = curl_init('https://api.omise.co/charges');
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_USERPWD, $OMISE_SECRET_KEY . ':');
    curl_setopt($ch, CURLOPT_POSTFIELDS, http_build_query($chargeData));
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Content-Type: application/x-www-form-urlencoded'
    ]);
    
    $response = curl_exec($ch);
    $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    
    if (!$response) {
        throw new Exception('Failed to connect to Omise API');
    }
    
    $charge = json_decode($response, true);
    
    if ($httpCode >= 400 || !empty($charge['object']) && $charge['object'] === 'error') {
        $errorMsg = $charge['message'] ?? 'Omise API error';
        error_log('Omise charge failed: ' . $errorMsg . ' | Response: ' . $response);
        http_response_code($httpCode);
        echo json_encode([
            'ok' => false,
            'error' => $errorMsg,
            'omise_response' => $charge
        ]);
        exit;
    }
    
    // บันทึกข้อมูลลง payments/audit logs (Backward-compat: ใช้ flow เดิมที่รับ token แล้วยิง charge)
    try {
        $booking['id'] = $bookingId;
        $created = create_pending_payment($pdo, $booking, [
            'method_code' => 'card',
            'customer_ip' => ($_SERVER['REMOTE_ADDR'] ?? null),
            'object_type' => 'token',
            'actor_type'  => 'USER',
        ]);
        $paymentId = $created['id'];
        $idemp = $created['idempotency_key'];
        $keys = $created['keys'];
        // We already created a charge above (legacy). Map and update row.
        $newStatus = ($charge['paid'] ?? false) ? 'SUCCESSFUL' : (($charge['status'] ?? '') === 'pending' ? 'REQUIRES_ACTION' : (($charge['status'] ?? '') === 'failed' ? 'FAILED' : 'PENDING'));
        repo_update_payment_by_id($pdo, $paymentId, [
            'provider_charge_id' => $charge['id'] ?? null,
            'status' => $newStatus,
            'method_code' => 'card',
            'card_brand' => $charge['card']['brand'] ?? null,
            'card_last4' => $charge['card']['last_digits'] ?? ($charge['card']['last4'] ?? null),
            'three_ds_status' => map_three_ds_status_from_charge($charge),
            'captured_at' => isset($charge['captured_at']) ? date('Y-m-d H:i:s', strtotime($charge['captured_at'])) : (isset($charge['created']) ? date('Y-m-d H:i:s', is_numeric($charge['created']) ? intval($charge['created']) : strtotime($charge['created'])) : null),
            'failure_code' => $charge['failure_code'] ?? null,
            'failure_message' => $charge['failure_message'] ?? null,
            'updated_by' => 'website',
            'metadata_json' => [ 'legacy_charge_endpoint' => true ]
        ]);
        repo_insert_payment_log($pdo, [
            'payment_id' => $paymentId,
            'action' => 'UPDATE_STATUS_FROM_API',
            'old_status' => 'PENDING',
            'new_status' => $newStatus,
            'actor_type' => 'SYSTEM',
            'note' => 'legacy v1/charge.php',
            'created_by' => 'website'
        ]);
    } catch (Throwable $e) {
        error_log('payments write failed: ' . $e->getMessage());
    }
    
    // ตัวอย่าง: อัปเดต booking status เป็น CONFIRMED หลังชำระสำเร็จ
    if (!empty($charge['paid']) && $charge['paid'] === true) {
        $pdo->prepare('UPDATE bookings SET status = :status WHERE id = :id')
            ->execute(['status' => 'CONFIRMED', 'id' => $bookingId]);
    }
    
    // Return success
    http_response_code(200);
    echo json_encode([
        'ok' => true,
        'charge_id' => $charge['id'] ?? null,
        'paid' => $charge['paid'] ?? false,
        'amount' => $charge['amount'] ?? $amount,
        'currency' => $charge['currency'] ?? 'thb',
        'booking_id' => $bookingId
    ]);
    
} catch (Exception $e) {
    error_log('Charge creation error: ' . $e->getMessage());
    http_response_code(500);
    echo json_encode([
        'ok' => false,
        'error' => 'Payment processing failed: ' . $e->getMessage()
    ]);
}
