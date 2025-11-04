<?php
require_once __DIR__ . '/../common.php';
$rt = isset($_GET['room_type_id']) ? (int)$_GET['room_type_id'] : 0;
if(!$rt){ json_out(['error'=>'room_type_id required'],400); exit; }
$sql = 'SELECT b.id, b.code, b.item_th, b.item_en, b.active
        FROM room_bathroom_items rbi JOIN bathroom_items b ON b.id = rbi.item_id
        WHERE rbi.room_type_id = :id AND b.active = 1 ORDER BY b.id ASC';
try{ $st=$pdo->prepare($sql); $st->execute([':id'=>$rt]); json_out(['items'=>$st->fetchAll(PDO::FETCH_ASSOC)?:[]]); }
catch(Throwable $e){ json_out(['items'=>[]]); }
