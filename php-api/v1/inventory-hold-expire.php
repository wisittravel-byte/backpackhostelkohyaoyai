<?php
require_once __DIR__ . '/../common.php';

// Bulk-capable expire endpoint; also retains backwards-compatible single and cron modes.

try {
    $input = file_get_contents('php://input');
    $body = $input ? json_decode($input, true) : null;

    // 1) BULK MODE: { hold_ids: [], reason }
    if ($body && isset($body['hold_ids']) && is_array($body['hold_ids'])) {
        $allowedReasons = ['browser_close','countdown_expired','user_change_dates','auto_page_expired'];
        $reason = isset($body['reason']) ? (string)$body['reason'] : 'countdown_expired';
        if (!in_array($reason, $allowedReasons, true)) { json_out(['error'=>'invalid_reason','allowed'=>$allowedReasons],400); exit; }
        $target = ($reason === 'user_change_dates') ? 'RELEASED' : (($reason === 'auto_page_expired') ? 'AUTO_PAGE_EXPIRED' : 'EXPIRED');

        $holdIds = [];
        foreach ($body['hold_ids'] as $v) { $id=(int)$v; if($id>0) $holdIds[]=$id; }
        if (!$holdIds) { json_out(['error'=>'invalid_params','message'=>'hold_ids required'],400); exit; }

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
            if (!$h || strtoupper($h['status']) !== 'HELD') { $results[]=['id'=>$hid,'action'=>'noop','note'=>'not HELD']; continue; }
            $rtid=(int)$h['room_type_id']; $ci=$h['check_in_date']; $co=$h['check_out_date']; $qty=(int)$h['reserved_qty'];
            $dates = dates_between($ci, $co); $days=0;
            foreach ($dates as $d) {
                $selDay->execute([$rtid,$d]); if(!$selDay->fetch()){ $insDay->execute([$rtid,$d]); $selDay->execute([$rtid,$d]); }
                $updDay->execute([$qty,$rtid,$d]); $days++;
            }
            $updHold->execute([':st'=>$target, ':by'=>$reason, ':id'=>$hid]);
            $results[] = ['id'=>$hid,'action'=>'updated','from'=>'HELD','to'=>$target,'refunded_qty'=>$qty,'days'=>$days];
        }
        $pdo->commit();
        json_out(['ok'=>true,'reason'=>$reason,'updated_status'=>$target,'results'=>$results]);
        exit;
    }

    // 2) Backward-compatible single expire: { hold_id, updated_by? }
    $specificHoldId = ($body && isset($body['hold_id'])) ? (int)$body['hold_id'] : null;
    $updatedBy = ($body && isset($body['updated_by'])) ? (string)$body['updated_by'] : null;

    if ($specificHoldId) {
        $pdo->beginTransaction();
        $sel = $pdo->prepare("SELECT id, room_type_id, check_in_date, check_out_date, reserved_qty, status FROM inventory_holds WHERE id=? FOR UPDATE");
        $sel->execute([$specificHoldId]);
        $h = $sel->fetch();
        if ($h && strtoupper($h['status']) === 'HELD') {
            $rtid = (int)$h['room_type_id']; $ci = $h['check_in_date']; $co = $h['check_out_date']; $qty = (int)$h['reserved_qty'];
            $dates = dates_between($ci, $co);
            $selDay  = $pdo->prepare("SELECT room_type_id FROM room_type_inventory_daily WHERE room_type_id=? AND stay_date=? FOR UPDATE");
            $insDay  = $pdo->prepare("INSERT IGNORE INTO room_type_inventory_daily (room_type_id, stay_date, total_qty, reserved_qty, booked_qty, updated_at) VALUES (?, ?, 0, 0, 0, NOW())");
            $updDay  = $pdo->prepare("UPDATE room_type_inventory_daily SET reserved_qty = GREATEST(reserved_qty - ?, 0), updated_at = NOW() WHERE room_type_id=? AND stay_date=?");
            foreach ($dates as $d) { $selDay->execute([$rtid,$d]); if(!$selDay->fetch()){ $insDay->execute([$rtid,$d]); $selDay->execute([$rtid,$d]); } $updDay->execute([$qty,$rtid,$d]); }
            $by = $updatedBy ?: 'countdown_expired';
            $upHold = $pdo->prepare("UPDATE inventory_holds SET status='EXPIRED', updated_by=:by, updated_at=NOW() WHERE id=:id AND status='HELD'");
            $upHold->execute([':id'=>$h['id'], ':by'=>$by]);
        }
        $pdo->commit();
        json_out(['mode'=>'single','expired_count' => ($h && strtoupper($h['status'])==='HELD') ? 1 : 0, 'hold_ids' => ($h ? [(int)$h['id']] : [])]);
        exit;
    }

    // 3) Cron/worker batch using SKIP LOCKED (unchanged behavior)
    $totalExpired = 0; $ids = [];
    $batchSize = 100;
    $selectBatchSql = "SELECT id, room_type_id, check_in_date, check_out_date, reserved_qty FROM inventory_holds WHERE status='HELD' AND expires_at <= NOW() ORDER BY expires_at ASC LIMIT {$batchSize} FOR UPDATE SKIP LOCKED";
    do {
        $pdo->beginTransaction();
        $batch = $pdo->query($selectBatchSql)->fetchAll();
        if (!$batch) { $pdo->commit(); break; }
        $selDay  = $pdo->prepare("SELECT room_type_id FROM room_type_inventory_daily WHERE room_type_id=? AND stay_date=? FOR UPDATE");
        $insDay  = $pdo->prepare("INSERT IGNORE INTO room_type_inventory_daily (room_type_id, stay_date, total_qty, reserved_qty, booked_qty, updated_at) VALUES (?, ?, 0, 0, 0, NOW())");
        $updDay  = $pdo->prepare("UPDATE room_type_inventory_daily SET reserved_qty = GREATEST(reserved_qty - ?, 0), updated_at = NOW() WHERE room_type_id=? AND stay_date=?");
        foreach ($batch as $h) {
            $rtid=(int)$h['room_type_id']; $ci=$h['check_in_date']; $co=$h['check_out_date']; $qty=(int)$h['reserved_qty']; $hid=(int)$h['id'];
            $dates = dates_between($ci, $co);
            foreach ($dates as $d) { $selDay->execute([$rtid,$d]); if(!$selDay->fetch()){ $insDay->execute([$rtid,$d]); $selDay->execute([$rtid,$d]); } $updDay->execute([$qty,$rtid,$d]); }
            $upHold = $pdo->prepare("UPDATE inventory_holds SET status='AUTO_PAGE_EXPIRED', updated_by='auto_page_expired', updated_at=NOW() WHERE id=:id AND status='HELD'");
            $upHold->execute([':id'=>$hid]);
            $totalExpired++; $ids[]=$hid;
        }
        $pdo->commit();
    } while (true);
    json_out(['mode'=>'cron','expired_count'=>$totalExpired,'hold_ids'=>$ids]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo && $pdo->inTransaction()) { $pdo->rollBack(); }
    json_out(['error'=>'server_error','detail'=>$e->getMessage()],500);
}
