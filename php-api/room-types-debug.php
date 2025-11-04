<?php
require_once __DIR__.'/cors.php';
require_once __DIR__.'/config.php';
header('Content-Type: application/json; charset=utf-8');

try{
  $schema = $pdo->query('SELECT DATABASE()')->fetchColumn();
  $counts = [];
  foreach([0,1] as $priv){
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM room_types WHERE is_active=1 AND is_private=?');
    $stmt->execute([$priv]);
    $counts['active_private_'.$priv] = (int)$stmt->fetchColumn();
  }
  // cover counts
  foreach([0,1] as $priv){
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM room_types rt JOIN room_type_images rti ON rti.room_type_id=rt.id AND rti.is_cover=1 WHERE rt.is_active=1 AND rt.is_private=?');
    $stmt->execute([$priv]);
    $counts['active_with_cover_private_'.$priv] = (int)$stmt->fetchColumn();
  }
  // missing cover counts
  foreach([0,1] as $priv){
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM room_types rt WHERE rt.is_active=1 AND rt.is_private=? AND NOT EXISTS (SELECT 1 FROM room_type_images rti WHERE rti.room_type_id=rt.id AND rti.is_cover=1)');
    $stmt->execute([$priv]);
    $counts['active_no_cover_private_'.$priv] = (int)$stmt->fetchColumn();
  }

  // sample rows: first 10 eligible with cover
  $withCover = $pdo->query("SELECT rt.id, rt.code, rt.is_private, rt.is_active, rt.name_th, rt.name_en, CONCAT(TRIM(TRAILING '/' FROM rt.image_dir_path), '/', TRIM(LEADING '/' FROM rti.file_name)) AS cover_url\n    FROM room_types rt JOIN room_type_images rti ON rti.room_type_id=rt.id AND rti.is_cover=1\n    WHERE rt.is_active=1 ORDER BY rt.id ASC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);
  // sample rows: first 10 eligible without cover
  $noCover = $pdo->query("SELECT rt.id, rt.code, rt.is_private, rt.is_active, rt.name_th, rt.name_en\n    FROM room_types rt\n    WHERE rt.is_active=1 AND NOT EXISTS (SELECT 1 FROM room_type_images rti WHERE rti.room_type_id=rt.id AND rti.is_cover=1)\n    ORDER BY rt.id ASC LIMIT 10")->fetchAll(PDO::FETCH_ASSOC);

  echo json_encode(['schema'=>$schema,'counts'=>$counts,'sample'=>['with_cover'=>$withCover,'no_cover'=>$noCover]], JSON_UNESCAPED_UNICODE);
}catch(PDOException $e){
  http_response_code(500);
  echo json_encode(['error'=>'DB error: '.$e->getMessage()]);
}
?>