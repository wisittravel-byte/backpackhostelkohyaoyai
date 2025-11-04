<?php
require_once __DIR__.'/cors.php';
require_once __DIR__.'/config.php';
header('Content-Type: application/json; charset=utf-8');

// This endpoint is for diagnostics only. It aggregates room_types with image counts
// to help identify why the main API might return no items.

try {
    $limit = isset($_GET['limit']) && is_numeric($_GET['limit']) ? max(1, min(500, (int)$_GET['limit'])) : 200;

    // Aggregated status per room type
    $sqlAgg = "SELECT
        rt.id,
        rt.code,
        rt.is_active,
        rt.is_private,
        rt.image_dir_path,
        SUM(CASE WHEN rti.is_cover = 1 THEN 1 ELSE 0 END) AS cover_count,
        COUNT(rti.id) AS image_count,
        MIN(CASE WHEN rti.is_cover = 1 THEN rti.file_name END) AS cover_file_name
      FROM room_types rt
      LEFT JOIN room_type_images rti ON rti.room_type_id = rt.id
      GROUP BY rt.id, rt.code, rt.is_active, rt.is_private, rt.image_dir_path
      ORDER BY rt.id ASC
      LIMIT $limit";

    $agg = $pdo->query($sqlAgg)->fetchAll(PDO::FETCH_ASSOC);

    // High level counts
    $counts = [];
    foreach ([0,1] as $priv) {
        $stmt = $pdo->prepare('SELECT COUNT(*) FROM room_types WHERE is_private = ?');
        $stmt->execute([$priv]);
        $counts['all_private_'.$priv] = (int)$stmt->fetchColumn();

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM room_types WHERE is_active = 1 AND is_private = ?');
        $stmt->execute([$priv]);
        $counts['active_private_'.$priv] = (int)$stmt->fetchColumn();

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM room_types rt WHERE rt.is_active = 1 AND rt.is_private = ? AND EXISTS (SELECT 1 FROM room_type_images rti WHERE rti.room_type_id = rt.id AND rti.is_cover = 1)');
        $stmt->execute([$priv]);
        $counts['active_with_cover_private_'.$priv] = (int)$stmt->fetchColumn();

        $stmt = $pdo->prepare('SELECT COUNT(*) FROM room_types rt WHERE rt.is_active = 1 AND rt.is_private = ? AND NOT EXISTS (SELECT 1 FROM room_type_images rti WHERE rti.room_type_id = rt.id AND rti.is_cover = 1)');
        $stmt->execute([$priv]);
        $counts['active_no_cover_private_'.$priv] = (int)$stmt->fetchColumn();
    }

    // Example rows with cover
    $sqlWithCover = "SELECT rt.id, rt.code, rt.is_private, rt.is_active, rt.image_dir_path,
        rti.file_name, rti.is_cover,
        CONCAT(TRIM(TRAILING '/' FROM rt.image_dir_path), '/', TRIM(LEADING '/' FROM rti.file_name)) AS cover_url
      FROM room_types rt
      JOIN room_type_images rti ON rti.room_type_id = rt.id AND rti.is_cover = 1
      WHERE rt.is_active = 1
      ORDER BY rt.id ASC
      LIMIT 20";
    $withCover = $pdo->query($sqlWithCover)->fetchAll(PDO::FETCH_ASSOC);

    // Example rows without cover (active but missing cover)
    $sqlNoCover = "SELECT rt.id, rt.code, rt.is_private, rt.is_active, rt.image_dir_path
      FROM room_types rt
      WHERE rt.is_active = 1
        AND NOT EXISTS (SELECT 1 FROM room_type_images rti WHERE rti.room_type_id = rt.id AND rti.is_cover = 1)
      ORDER BY rt.id ASC
      LIMIT 20";
    $noCover = $pdo->query($sqlNoCover)->fetchAll(PDO::FETCH_ASSOC);

    echo json_encode([
        'counts' => $counts,
        'aggregate' => $agg,
        'sample' => [
            'with_cover' => $withCover,
            'no_cover' => $noCover
        ]
    ], JSON_UNESCAPED_UNICODE);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['error' => 'DB error: '.$e->getMessage()]);
}
?>
