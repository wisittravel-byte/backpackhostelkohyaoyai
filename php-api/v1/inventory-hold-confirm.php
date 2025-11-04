<?php
require_once __DIR__ . '/../common.php';

try {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') { json_out(['error'=>'method_not_allowed'], 405); exit; }
    $raw = file_get_contents('php://input');
    $body = json_decode($raw, true);
    if (!is_array($body)) { $body = $_POST ?: []; }

    $holdId = isset($body['hold_id']) ? (int)$body['hold_id'] : 0;
    $bookingId = isset($body['booking_id']) ? (int)$body['booking_id'] : null;
    $who = ($body['updated_by'] ?? 'website');

    if ($holdId <= 0) { json_out(['error'=>'invalid_params','message'=>'hold_id required'],400); exit; }

    $pdo->beginTransaction();

    // Lock the hold row and ensure it's active and not expired
    $sel = $pdo->prepare("SELECT * FROM inventory_holds WHERE id = :id AND status='HELD' AND expires_at > UTC_TIMESTAMP() FOR UPDATE");
    $sel->execute([':id'=>$holdId]);
    $hold = $sel->fetch();
    if (!$hold) { $pdo->rollBack(); json_out(['error'=>'not_found_or_expired'], 410); exit; }

    $rtid = (int)$hold['room_type_id'];
    $ci = $hold['check_in_date'];
    $co = $hold['check_out_date'];
    $qty = (int)$hold['reserved_qty'];

    // Lock daily rows and apply movement reserved -> booked
    $lock = $pdo->prepare("SELECT stay_date,total_qty,reserved_qty,booked_qty FROM room_type_inventory_daily WHERE room_type_id=? AND stay_date>=? AND stay_date<? FOR UPDATE");
    $lock->execute([$rtid, $ci, $co]);

    $upd = $pdo->prepare("UPDATE room_type_inventory_daily SET reserved_qty = reserved_qty - :qty, booked_qty = booked_qty + :qty WHERE room_type_id = :rtid AND stay_date >= :ci AND stay_date < :co");
    $upd->execute([':qty'=>$qty, ':rtid'=>$rtid, ':ci'=>$ci, ':co'=>$co]);

    $upHold = $pdo->prepare("UPDATE inventory_holds SET status='CONFIRMED', booking_id=:bid, updated_by=:who WHERE id=:id AND status='HELD'");
    $upHold->execute([':bid'=>$bookingId, ':who'=>$who, ':id'=>$holdId]);

    $pdo->commit();
    json_out(['status'=>'CONFIRMED','hold_id'=>$holdId,'booking_id'=>$bookingId]);
} catch (Throwable $e) {
    if ($pdo && $pdo->inTransaction()) { $pdo->rollBack(); }
    json_out(['error'=>'server_error','detail'=>$e->getMessage()],500);
}
