<?php
require_once __DIR__ . '/../common.php';
$rt = isset($_GET['room_type_id']) ? (int)$_GET['room_type_id'] : 0;
if(!$rt){ json_out(['error'=>'room_type_id required'],400); exit; }
$sql = 'SELECT a.id, a.code, a.name_th, a.name_en, a.icon, a.is_active
        FROM room_type_amenities rta JOIN amenities a ON a.id = rta.amenity_id
        WHERE rta.room_type_id = :id AND a.is_active = 1 ORDER BY a.id ASC';
try{ $st=$pdo->prepare($sql); $st->execute([':id'=>$rt]); json_out(['items'=>$st->fetchAll(PDO::FETCH_ASSOC)?:[]]); }
catch(Throwable $e){ json_out(['items'=>[]]); }
