<?php
require_once __DIR__ . '/../common.php';
$rt = isset($_GET['room_type_id']) ? (int)$_GET['room_type_id'] : 0;
if(!$rt){ json_out(['error'=>'room_type_id required'],400); exit; }
$st=$pdo->prepare('SELECT id, room_type_id, file_name, sort_order, is_cover, width_px, height_px, file_size_kb, mime_type FROM room_type_images WHERE room_type_id=:id ORDER BY is_cover DESC, sort_order ASC, id ASC');
$st->execute([':id'=>$rt]);
$rows = $st->fetchAll(PDO::FETCH_ASSOC)?:[];
// attach URL
$dirSt = $pdo->prepare('SELECT image_dir_path FROM room_types WHERE id=:id'); $dirSt->execute([':id'=>$rt]); $dir = rtrim((string)($dirSt->fetchColumn() ?: ''), '/');
foreach($rows as &$r){ $rel = ltrim($dir? $dir.'/'.$r['file_name'] : $r['file_name'], '/'); $r['url'] = $rel? toPublicUrl_common($rel):null; }
json_out(['items'=>$rows]);
