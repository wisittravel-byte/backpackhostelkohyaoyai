<?php
require_once __DIR__ . '/../common.php';
$rt = isset($_GET['room_type_id']) ? (int)$_GET['room_type_id'] : 0;
if(!$rt){ json_out(['error'=>'room_type_id required'],400); exit; }
$st=$pdo->prepare('SELECT id, name, description_th, description_en, base_price_minor, base_currency, refundable, cancellation_policy, meal_plan FROM rate_plans WHERE room_type_id=:id ORDER BY id ASC');
$st->execute([':id'=>$rt]);
json_out(['items'=>$st->fetchAll(PDO::FETCH_ASSOC)?:[]]);
