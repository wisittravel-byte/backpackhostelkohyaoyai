<?php
require_once __DIR__ . '/../common.php';

// This script can be:
// 1. Run by cron every minute to expire all HELD rows whose expires_at <= UTC_TIMESTAMP()
// 2. Called via POST with hold_id to expire a specific hold immediately (e.g., countdown reached 0)

try {
    $input = file_get_contents('php://input');
    $body = $input ? json_decode($input, true) : null;
    $specificHoldId = ($body && isset($body['hold_id'])) ? (int)$body['hold_id'] : null;

    $pdo->beginTransaction();
    
    if ($specificHoldId) {
        // Expire specific hold by ID
        $sel = $pdo->prepare("SELECT id, room_type_id, check_in_date, check_out_date, reserved_qty FROM inventory_holds WHERE id=? AND status='HELD' FOR UPDATE");
        $sel->execute([$specificHoldId]);
        $holds = $sel->fetchAll();
    } else {
        // Expire all holds that have passed expires_at (cron mode)
        $sel = $pdo->query("SELECT id, room_type_id, check_in_date, check_out_date, reserved_qty FROM inventory_holds WHERE status='HELD' AND expires_at <= UTC_TIMESTAMP() FOR UPDATE");
        $holds = $sel->fetchAll();
    }

    foreach ($holds as $h) {
        $rtid = (int)$h['room_type_id'];
        $ci = $h['check_in_date'];
        $co = $h['check_out_date'];
        $qty = (int)$h['reserved_qty'];
        // Lock rows in range, then return reserved qty (avoid negative)
        $lock = $pdo->prepare("SELECT stay_date FROM room_type_inventory_daily WHERE room_type_id=? AND stay_date>=? AND stay_date<? FOR UPDATE");
        $lock->execute([$rtid, $ci, $co]);

        $upd = $pdo->prepare("UPDATE room_type_inventory_daily SET reserved_qty = GREATEST(reserved_qty - :qty, 0) WHERE room_type_id = :rtid AND stay_date >= :ci AND stay_date < :co");
        $upd->execute([':qty'=>$qty, ':rtid'=>$rtid, ':ci'=>$ci, ':co'=>$co]);

        $upHold = $pdo->prepare("UPDATE inventory_holds SET status='EXPIRED', updated_by=:by WHERE id=:id AND status='HELD'");
        $upHold->execute([':id'=>$h['id'], ':by'=>$specificHoldId ? 'countdown_expired' : 'system']);
    }

    $pdo->commit();

    json_out(['expired_count' => count($holds), 'hold_ids' => array_column($holds, 'id')]);
} catch (Throwable $e) {
    if ($pdo && $pdo->inTransaction()) { $pdo->rollBack(); }
    json_out(['error'=>'server_error','detail'=>$e->getMessage()],500);
}
