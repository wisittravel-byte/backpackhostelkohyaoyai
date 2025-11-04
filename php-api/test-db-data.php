<?php
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

try {
    // Check room_types data
    $stmt = $pdo->query('SELECT id, code, name_th, name_en, is_active, is_private, image_dir_path FROM room_types LIMIT 10');
    $roomTypes = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    // Check room_type_images data
    $stmt2 = $pdo->query('SELECT id, room_type_id, file_name, is_cover FROM room_type_images LIMIT 10');
    $images = $stmt2->fetchAll(PDO::FETCH_ASSOC);
    
    echo json_encode([
        'success' => true,
        'database' => $pdo->query('SELECT DATABASE()')->fetchColumn(),
        'room_types_count' => count($roomTypes),
        'room_types_sample' => $roomTypes,
        'images_count' => count($images),
        'images_sample' => $images,
    ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    
} catch (Throwable $e) {
    http_response_code(500);
    echo json_encode(['error' => $e->getMessage()]);
}
?>
