<?php
require_once __DIR__ . '/../common.php';

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_out(['error' => 'method_not_allowed'], 405);
        exit;
    }

    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) { $body = $_POST ?: []; }

    $roomTypeId = isset($body['room_type_id']) ? (int)$body['room_type_id'] : 0;
    $mode = strtoupper(trim($body['mode'] ?? ''));
    $rooms = isset($body['rooms']) ? max(1, (int)$body['rooms']) : 1;
    $guests = isset($body['guests']) ? max(1, (int)$body['guests']) : 1;
    $reservedQty = isset($body['reserved_qty']) ? (int)$body['reserved_qty'] : 0;

    $checkIn  = isset($body['check_in']) ? must_date($body['check_in'], 'check_in') : '';
    $checkOut = isset($body['check_out']) ? must_date($body['check_out'], 'check_out') : '';

    if ($roomTypeId <= 0 || !$checkIn || !$checkOut) {
        json_out(['error' => 'invalid_params', 'message' => 'room_type_id, check_in, check_out required'], 400);
        exit;
    }

    // Prefer explicit reserved_qty when provided (>0) to avoid ambiguity across modes.
    // Fallback to legacy behavior: PRIVATE uses `rooms`, DORM uses `guests`.
    $units = ($reservedQty > 0) ? $reservedQty : (($mode === 'PRIVATE') ? $rooms : $guests);
    if ($units <= 0) { $units = 1; }

    $dates = dates_between($checkIn, $checkOut);
    if (count($dates) === 0) {
        json_out(['error' => 'invalid_dates', 'message' => 'check_out must be after check_in'], 400);
        exit;
    }

    $pdo->beginTransaction();

    // Lock all rows for the date range
    $stmt = $pdo->prepare("SELECT stay_date,total_qty,reserved_qty,booked_qty FROM room_type_inventory_daily WHERE room_type_id=? AND stay_date>=? AND stay_date<? FOR UPDATE");
    $stmt->execute([$roomTypeId, $checkIn, $checkOut]);
    $rows = $stmt->fetchAll();

    // Ensure we have a record for each day; if missing, treat as 0 available
    $byDate = [];
    foreach ($rows as $r) { $byDate[$r['stay_date']] = $r; }
    foreach ($dates as $d) {
        if (!isset($byDate[$d])) {
            // Missing inventory row -> cannot hold
            $pdo->rollBack();
            json_out(['error' => 'sold_out', 'message' => 'No inventory for one or more dates', 'date' => $d], 409);
            exit;
        }
        $r = $byDate[$d];
        $avail = (int)$r['total_qty'] - ((int)$r['reserved_qty'] + (int)$r['booked_qty']);
        if ($avail < $units) {
            $pdo->rollBack();
            json_out(['error' => 'sold_out', 'message' => 'Not enough availability', 'date' => $d, 'available' => $avail], 409);
            exit;
        }
    }

    // Insert hold row
    // Use the same timezone as application (set in common.php -> Asia/Bangkok) so it aligns with created_at/updated_at
    $expiresAt = date('Y-m-d H:i:s', time() + 15 * 60); // local app TZ
    
    // Get real IP address from various headers
    $ip = '';
    if (!empty($_SERVER['HTTP_CLIENT_IP'])) {
        $ip = $_SERVER['HTTP_CLIENT_IP'];
    } elseif (!empty($_SERVER['HTTP_X_FORWARDED_FOR'])) {
        // May contain multiple IPs, take the first one
        $ips = explode(',', $_SERVER['HTTP_X_FORWARDED_FOR']);
        $ip = trim($ips[0]);
    } elseif (!empty($_SERVER['HTTP_X_REAL_IP'])) {
        $ip = $_SERVER['HTTP_X_REAL_IP'];
    } elseif (!empty($_SERVER['REMOTE_ADDR'])) {
        $ip = $_SERVER['REMOTE_ADDR'];
    }
    
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    
    // Session ID: prioritize client-provided, then generate from fingerprint
    $sessionId = '';
    if (!empty($body['session_id'])) {
        $sessionId = substr((string)$body['session_id'], 0, 64);
    } else {
        // Generate session from fingerprint (IP + User-Agent + timestamp)
        $fingerprint = $ip . '|' . $ua . '|' . date('Ymd');
        $sessionId = substr(hash('sha256', $fingerprint), 0, 64);
    }
    
    $createdBy = 'website';

    $ins = $pdo->prepare("INSERT INTO inventory_holds
        (room_type_id, check_in_date, check_out_date, reserved_qty, status, expires_at, session_id, channel, ip_address, user_agent, created_by)
        VALUES (:rtid, :ci, :co, :qty, 'HELD', :exp, :sid, 'WEBSITE', :ip, :ua, :cb)");
    $ins->execute([
        ':rtid' => $roomTypeId,
        ':ci' => $checkIn,
        ':co' => $checkOut,
        ':qty' => $units,
        ':exp' => $expiresAt,
        ':sid' => $sessionId,
        ':ip' => $ip,
        ':ua' => $ua,
        ':cb' => $createdBy,
    ]);
    $holdId = (int)$pdo->lastInsertId();

    // Update daily reserved quantities
    $upd = $pdo->prepare("UPDATE room_type_inventory_daily
        SET reserved_qty = reserved_qty + :qty
        WHERE room_type_id = :rtid AND stay_date >= :ci AND stay_date < :co");
    $upd->execute([':qty' => $units, ':rtid' => $roomTypeId, ':ci' => $checkIn, ':co' => $checkOut]);
    
    // Verify that UPDATE affected the expected number of rows
    $updatedRows = $upd->rowCount();
    $expectedRows = count($dates);
    if ($updatedRows !== $expectedRows) {
        // Log diagnostic info for troubleshooting
        error_log("HOLD UPDATE MISMATCH: expected {$expectedRows} rows, updated {$updatedRows} rows. room_type_id={$roomTypeId}, dates=" . json_encode($dates));
        // Continue anyway (do not rollback) since the hold row is already inserted
    }

    $pdo->commit();

    // TTL in seconds based on the same timezone
    $ttl = max(0, strtotime($expiresAt) - time());
    json_out([
        'status' => 'HELD',
        'hold_id' => $holdId,
        'expires_at' => $expiresAt,
        'seconds_to_expiry' => $ttl,
        'units' => $units,
        'debug' => [
            'dates' => $dates,
            'updated_rows' => $updatedRows ?? 0,
            'expected_rows' => $expectedRows ?? count($dates),
        ],
    ]);
} catch (Throwable $e) {
    if ($pdo && $pdo->inTransaction()) { $pdo->rollBack(); }
    json_out(['error' => 'server_error', 'detail' => $e->getMessage()], 500);
}
