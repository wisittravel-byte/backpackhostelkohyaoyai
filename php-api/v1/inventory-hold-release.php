<?php
require_once __DIR__ . '/../common.php';

// Bulk-capable HOLD release/expire endpoint.
// Accepts hold_ids[] and reason, updates status and refunds daily inventory per-day with row locks.
// Idempotent: holds not in HELD are skipped.

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { json_out(['error'=>'method_not_allowed'], 405); exit; }
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) { $body = $_POST ?: []; }

    $allowedReasons = ['browser_close','countdown_expired','user_change_dates','auto_page_expired'];
    $reason = isset($body['reason']) ? (string)$body['reason'] : ($body['updated_by'] ?? 'user_change_dates');
    if (!in_array($reason, $allowedReasons, true)) { json_out(['error'=>'invalid_reason','allowed'=>$allowedReasons],400); exit; }

    // Determine target status by reason (mapping must not change)
    $target = ($reason === 'user_change_dates') ? 'RELEASED' : (($reason === 'auto_page_expired') ? 'AUTO_PAGE_EXPIRED' : 'EXPIRED');

    // Support both single and multiple ids for backward compatibility
    $holdIds = [];
    if (isset($body['hold_ids']) && is_array($body['hold_ids'])) {
        foreach ($body['hold_ids'] as $v) { $id = (int)$v; if ($id>0) $holdIds[] = $id; }
    } elseif (isset($body['hold_id'])) {
        $id=(int)$body['hold_id']; if($id>0) $holdIds[]=$id;
    }
    if (!$holdIds) { json_out(['error'=>'invalid_params','message'=>'hold_ids required'],400); exit; }

    // Pre-prepare statements
    $selHold = $pdo->prepare("SELECT * FROM inventory_holds WHERE id=? FOR UPDATE");
    $updHold = $pdo->prepare("UPDATE inventory_holds SET status=:st, updated_by=:by, updated_at=NOW() WHERE id=:id AND status='HELD'");
    $selDay  = $pdo->prepare("SELECT room_type_id FROM room_type_inventory_daily WHERE room_type_id=? AND stay_date=? FOR UPDATE");
    $insDay  = $pdo->prepare("INSERT IGNORE INTO room_type_inventory_daily (room_type_id, stay_date, total_qty, reserved_qty, booked_qty, updated_at) VALUES (?, ?, 0, 0, 0, NOW())");
    $updDay  = $pdo->prepare("UPDATE room_type_inventory_daily SET reserved_qty = GREATEST(reserved_qty - ?, 0), updated_at = NOW() WHERE room_type_id=? AND stay_date=?");

    $results = [];
    $pdo->beginTransaction();
    foreach ($holdIds as $hid) {
        $selHold->execute([$hid]);
        $h = $selHold->fetch();
        if (!$h || strtoupper($h['status']) !== 'HELD') {
            $results[] = ['id'=>$hid, 'action'=>'noop', 'note'=>'not HELD'];
            continue;
        }

        $rtid = (int)$h['room_type_id'];
        $ci = $h['check_in_date'];
        $co = $h['check_out_date'];
        $qty = (int)$h['reserved_qty'];
        $dates = dates_between($ci, $co);
        $days = 0;
        foreach ($dates as $d) {
            // Ensure a row exists, then lock and update with GREATEST
            $selDay->execute([$rtid, $d]);
            if (!$selDay->fetch()) { $insDay->execute([$rtid, $d]); $selDay->execute([$rtid, $d]); }
            $updDay->execute([$qty, $rtid, $d]);
            $days++;
        }
        // Update hold status
        $updHold->execute([':st'=>$target, ':by'=>$reason, ':id'=>$hid]);
        $results[] = ['id'=>$hid, 'action'=>'updated', 'from'=>'HELD', 'to'=>$target, 'refunded_qty'=>$qty, 'days'=>$days];
    }
    $pdo->commit();

    json_out(['ok'=>true, 'reason'=>$reason, 'updated_status'=>$target, 'results'=>$results]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo && $pdo->inTransaction()) { $pdo->rollBack(); }
    json_out(['error'=>'server_error','detail'=>$e->getMessage()],500);
}
