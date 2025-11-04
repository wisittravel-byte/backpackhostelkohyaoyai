<?php
require_once __DIR__ . '/config.php';
header('Content-Type: application/json; charset=utf-8');

// Test toPublicUrl with actual image_dir_path
function baseUrl(): string {
    $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    return $scheme . '://' . $host;
}
function toPublicUrl(string $relativePath): string {
    $relativePath = ltrim($relativePath, '/');
    if (strpos($relativePath, 'assets/uploads/') === 0) {
        return baseUrl() . '/' . $relativePath;
    }
    return baseUrl() . '/assets/uploads/' . $relativePath;
}

try {
    // Get room_type with cover image
    $stmt = $pdo->query("
        SELECT rt.id, rt.code, rt.image_dir_path, rti.file_name, rti.is_cover
        FROM room_types rt
        LEFT JOIN room_type_images rti ON rti.room_type_id = rt.id AND rti.is_cover = 1
        WHERE rt.is_active = 1 AND rt.is_private = 0
        ORDER BY rt.id
        LIMIT 5
    ");
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $results = [];
    foreach ($rows as $r) {
        $imageDir = rtrim($r['image_dir_path'] ?? '', '/');
        $fileName = $r['file_name'] ?? null;
        
        $fullPath = null;
        $url = null;
        if ($imageDir && $fileName) {
            $fullPath = $imageDir . '/' . $fileName;
            $url = toPublicUrl($fullPath);
        }
        
        $results[] = [
            'id' => $r['id'],
            'code' => $r['code'],
            'image_dir_path' => $imageDir,
            'file_name' => $fileName,
            'is_cover' => $r['is_cover'],
            'full_path' => $fullPath,
            'url' => $url,
        ];
    }
    
    echo json_encode(['success' => true, 'items' => $results], JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
    
} catch (Throwable $e) {
    echo json_encode(['error' => $e->getMessage()]);
}
?>
