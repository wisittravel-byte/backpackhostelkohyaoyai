<?php
require_once __DIR__ . '/../common.php';
$rt = isset($_GET['room_type_id']) ? (int)$_GET['room_type_id'] : 0;
$rp = isset($_GET['rate_plan_id']) ? (int)$_GET['rate_plan_id'] : 0;
if(!$rt || !$rp){ json_out(['error'=>'room_type_id and rate_plan_id required'],400); exit; }
$st=$pdo->prepare('SELECT id, room_type_id, rate_plan_id, stay_date, base_currency, price_minor FROM rate_plan_prices WHERE room_type_id=:rt AND rate_plan_id=:rp ORDER BY stay_date ASC');
$st->execute([':rt'=>$rt, ':rp'=>$rp]);
json_out(['items'=>$st->fetchAll(PDO::FETCH_ASSOC)?:[]]);
