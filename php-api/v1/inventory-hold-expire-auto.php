<?php
require_once __DIR__ . '/../common.php';

// Sweep job: expire HELD holds that have passed their expiry policy.
// Run via CRON every minute. This script finds candidate holds and calls the bulk expire logic with reason='auto_page_expired'.

try {
    // Find up to 500 expired holds by policy
    $q = $pdo->prepare("SELECT id FROM inventory_holds WHERE status='HELD' AND ((expires_at IS NOT NULL AND expires_at <= NOW()) OR (expires_at IS NULL AND TIMESTAMPDIFF(MINUTE, created_at, NOW()) >= 15)) LIMIT 500");
    $q->execute();
    $ids = array_map(fn($r)=> (int)$r['id'], $q->fetchAll());

    if (!$ids) {
        json_out(['ok'=>true,'expired'=>0,'note'=>'no candidates']);
        exit;
    }

    // Reuse the bulk endpoint locally by including logic in expire.php through HTTP-like call is heavy.
    // We instead duplicate the minimal loop here to avoid network and guarantee atomicity.
    $selHold = $pdo->prepare("SELECT * FROM inventory_holds WHERE id=? FOR UPDATE");
    $updHold = $pdo->prepare("UPDATE inventory_holds SET status='AUTO_PAGE_EXPIRED', updated_by='auto_page_expired', updated_at=NOW() WHERE id=:id AND status='HELD'");
    $selDay  = $pdo->prepare("SELECT room_type_id FROM room_type_inventory_daily WHERE room_type_id=? AND stay_date=? FOR UPDATE");
    $insDay  = $pdo->prepare("INSERT IGNORE INTO room_type_inventory_daily (room_type_id, stay_date, total_qty, reserved_qty, booked_qty, updated_at) VALUES (?, ?, 0, 0, 0, NOW())");
    $updDay  = $pdo->prepare("UPDATE room_type_inventory_daily SET reserved_qty = GREATEST(reserved_qty - ?, 0), updated_at = NOW() WHERE room_type_id=? AND stay_date=?");

    $affected = 0; $results = [];
    $pdo->beginTransaction();
    foreach ($ids as $hid) {
        $selHold->execute([$hid]);
        $h = $selHold->fetch();
        if (!$h || strtoupper($h['status']) !== 'HELD') { $results[]=['id'=>$hid,'action'=>'noop']; continue; }
        $rtid=(int)$h['room_type_id']; $ci=$h['check_in_date']; $co=$h['check_out_date']; $qty=(int)$h['reserved_qty'];
        $dates = dates_between($ci, $co);
        foreach ($dates as $d) {
            $selDay->execute([$rtid,$d]); if(!$selDay->fetch()){ $insDay->execute([$rtid,$d]); $selDay->execute([$rtid,$d]); }
            $updDay->execute([$qty,$rtid,$d]);
        }
        $updHold->execute([':id'=>$hid]);
        $affected++; $results[]=['id'=>$hid,'action'=>'expired'];
    }
    $pdo->commit();

    json_out(['ok'=>true,'expired'=>$affected,'results'=>$results]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo && $pdo->inTransaction()) { $pdo->rollBack(); }
    json_out(['error'=>'server_error','detail'=>$e->getMessage()],500);
}
