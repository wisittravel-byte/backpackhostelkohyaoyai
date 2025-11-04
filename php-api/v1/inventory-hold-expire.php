<?php
require_once __DIR__ . '/../common.php';

// This script can be:
// 1) Cron/worker every minute: expire timed-out holds in safe batches using SKIP LOCKED (no request body)
// 2) Immediate expire: POST with { hold_id } to expire one hold now (e.g., countdown hit zero or manual)

try {
    $input = file_get_contents('php://input');
    $body = $input ? json_decode($input, true) : null;
    $specificHoldId = ($body && isset($body['hold_id'])) ? (int)$body['hold_id'] : null;
    $updatedBy = ($body && isset($body['updated_by'])) ? (string)$body['updated_by'] : null;

    // Log the request for debugging
    error_log("inventory-hold-expire: hold_id=" . ($specificHoldId ?: 'CRON') . ", updated_by=" . ($updatedBy ?: 'N/A'));

    if ($specificHoldId) {
        // --- Immediate single expire (idempotent) ---
        $pdo->beginTransaction();

        $sel = $pdo->prepare("SELECT id, room_type_id, check_in_date, check_out_date, reserved_qty 
                               FROM inventory_holds 
                               WHERE id=? AND status='HELD' FOR UPDATE");
        $sel->execute([$specificHoldId]);
        $h = $sel->fetch();
        if ($h) {
            $rtid = (int)$h['room_type_id'];
            $ci = $h['check_in_date'];
            $co = $h['check_out_date'];
            $qty = (int)$h['reserved_qty'];

            // Lock daily rows and reduce reserved per day to avoid negatives and be idempotent
            $dates = dates_between($ci, $co);
            $lockStmt = $pdo->prepare("SELECT stay_date FROM room_type_inventory_daily WHERE room_type_id=? AND stay_date=? FOR UPDATE");
            $updStmt  = $pdo->prepare("UPDATE room_type_inventory_daily 
                                       SET reserved_qty = GREATEST(reserved_qty - :qty, 0), updated_at = NOW() 
                                       WHERE room_type_id = :rtid AND stay_date = :d");
            foreach ($dates as $d) {
                $lockStmt->execute([$rtid, $d]);
                $updStmt->execute([':qty'=>$qty, ':rtid'=>$rtid, ':d'=>$d]);
            }

            // Choose status: if caller did not specify, mark as EXPIRED (client-side timeout)
            $by = $updatedBy ?: 'countdown_expired';
            $upHold = $pdo->prepare("UPDATE inventory_holds 
                                     SET status='EXPIRED', updated_by=:by, updated_at=NOW() 
                                     WHERE id=:id AND status='HELD'");
            $upHold->execute([':id'=>$h['id'], ':by'=>$by]);
            error_log("Expired (single) hold {$h['id']} by {$by}");
        }

        $pdo->commit();
        json_out(['mode'=>'single','expired_count' => $h ? 1 : 0, 'hold_ids' => $h ? [(int)$h['id']] : []]);
        exit;
    }

    // --- Cron/worker mode: batch process timed-out holds until none left ---
    $totalExpired = 0; $ids = [];
    $batchSize = 100;

    // Pre-prepare statements used inside loop for performance
    $selectBatchSql = "SELECT id, room_type_id, check_in_date, check_out_date, reserved_qty 
                       FROM inventory_holds 
                       WHERE status='HELD' AND expires_at <= NOW()
                       ORDER BY expires_at ASC 
                       LIMIT {$batchSize} 
                       FOR UPDATE SKIP LOCKED"; // MySQL 8+

    do {
        $pdo->beginTransaction();
        $batch = $pdo->query($selectBatchSql)->fetchAll();
        if (!$batch) { $pdo->commit(); break; }

        foreach ($batch as $h) {
            $rtid = (int)$h['room_type_id'];
            $ci = $h['check_in_date'];
            $co = $h['check_out_date'];
            $qty = (int)$h['reserved_qty'];
            $hid = (int)$h['id'];

            // Update daily inventory per day (idempotent); lock each day before update
            $dates = dates_between($ci, $co);
            $lockStmt = $pdo->prepare("SELECT stay_date FROM room_type_inventory_daily WHERE room_type_id=? AND stay_date=? FOR UPDATE");
            $updStmt  = $pdo->prepare("UPDATE room_type_inventory_daily 
                                       SET reserved_qty = GREATEST(reserved_qty - :qty, 0), updated_at = NOW() 
                                       WHERE room_type_id = :rtid AND stay_date = :d");
            foreach ($dates as $d) {
                $lockStmt->execute([$rtid, $d]);
                $updStmt->execute([':qty'=>$qty, ':rtid'=>$rtid, ':d'=>$d]);
            }

            // Mark hold as AUTO_PAGE_EXPIRED to distinguish server-side timeout
            $upHold = $pdo->prepare("UPDATE inventory_holds 
                                     SET status='AUTO_PAGE_EXPIRED', updated_by='auto_page_exit', updated_at=NOW() 
                                     WHERE id=:id AND status='HELD'");
            $upHold->execute([':id'=>$hid]);
            $totalExpired++;
            $ids[] = $hid;
        }

        $pdo->commit();
        // Loop again in case there are more than batchSize pending; another worker can run concurrently thanks to SKIP LOCKED
    } while (true);

    json_out(['mode'=>'cron','expired_count'=>$totalExpired,'hold_ids'=>$ids]);
} catch (Throwable $e) {
    if (isset($pdo) && $pdo && $pdo->inTransaction()) { $pdo->rollBack(); }
    json_out(['error'=>'server_error','detail'=>$e->getMessage()],500);
}
