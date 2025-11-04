<?php
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

function baseUrl(): string {
  // Production: Always return Backoffice domain where images are stored
  $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
  
  if ($host === 'www.backpackkohyao.com' || $host === 'backpackkohyao.com') {
    return 'https://cloudhotelpms.cloudhotelhostel.com';
  }
  
  // Local development
  $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
  return $scheme . '://' . $host;
}
function toPublicUrl(string $relativePath): string {
  $relativePath = ltrim($relativePath, '/');
  // Check if path already starts with assets/uploads
  if (strpos($relativePath, 'assets/uploads/') === 0) {
    return baseUrl() . '/' . $relativePath;
  }
  return baseUrl() . '/assets/uploads/' . $relativePath;
}
function json_error(string $msg, int $code = 400){ http_response_code($code); echo json_encode(['success'=>false,'error'=>$msg]); exit; }

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

if ($method === 'GET') {
  $roomTypeId = isset($_GET['room_type_id']) ? (int)$_GET['room_type_id'] : 0;
  if ($roomTypeId <= 0) { json_error('room_type_id is required', 400); }
  try {
    // Get image_dir_path from room_types first
    $stmtDir = $pdo->prepare('SELECT image_dir_path FROM room_types WHERE id = :rtid');
    $stmtDir->execute([':rtid'=>$roomTypeId]);
    $imageDir = rtrim($stmtDir->fetchColumn() ?: '', '/');
    
    // Get all images for this room_type
    $stmt = $pdo->prepare('SELECT id, file_name, is_cover, width_px, height_px, mime_type, file_size_kb, created_at FROM room_type_images WHERE room_type_id = :rtid ORDER BY is_cover DESC, sort_order ASC, id ASC');
    $stmt->execute([':rtid'=>$roomTypeId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $items = [];
    foreach ($rows as $r) {
      $fileName = $r['file_name'] ?? '';
      if (!$fileName) continue;
      
      // Build full path
      $fullPath = $imageDir ? $imageDir . '/' . $fileName : $fileName;
      $rel = ltrim($fullPath, '/');
      
      $items[] = [
        'id' => (int)$r['id'],
        'file_name' => $fileName,
        'relative_path' => $rel,
        'url' => toPublicUrl($rel),
        'is_cover' => (bool)($r['is_cover'] ?? false),
        'width_px' => isset($r['width_px']) ? (int)$r['width_px'] : null,
        'height_px' => isset($r['height_px']) ? (int)$r['height_px'] : null,
        'mime_type' => $r['mime_type'] ?? null,
        'file_size_kb' => isset($r['file_size_kb']) ? (float)$r['file_size_kb'] : null,
        'created_at' => $r['created_at'] ?? null,
      ];
    }
    echo json_encode(['success'=>true, 'items'=>$items]);
  } catch (Throwable $e) {
    json_error('DB error: '.$e->getMessage(), 500);
  }
  exit;
}

// DELETE or POST action=delete
if ($method === 'DELETE' || ($method === 'POST' && ($_POST['action'] ?? '') === 'delete')) {
  $imageId = $method === 'DELETE' ? (int)($_GET['image_id'] ?? 0) : (int)($_POST['image_id'] ?? 0);
  if ($imageId <= 0) { json_error('image_id is required', 400); }
  try {
    $pdo->beginTransaction();
    
    // Get file_name and room_type_id
    $stmt = $pdo->prepare('SELECT rti.file_name, rti.room_type_id FROM room_type_images rti WHERE rti.id=:id FOR UPDATE');
    $stmt->execute([':id'=>$imageId]);
    $row = $stmt->fetch(PDO::FETCH_ASSOC);
    if (!$row) { $pdo->rollBack(); json_error('Image not found', 404); }
    
    $fileName = $row['file_name'];
    $roomTypeId = $row['room_type_id'];
    
    // Get image_dir_path from room_types
    $stmtDir = $pdo->prepare('SELECT image_dir_path FROM room_types WHERE id = :rtid');
    $stmtDir->execute([':rtid'=>$roomTypeId]);
    $imageDir = rtrim($stmtDir->fetchColumn() ?: '', '/');
    
    // Build full path
    $fullPath = $imageDir ? $imageDir . '/' . $fileName : $fileName;
    $rel = ltrim($fullPath, '/');

    $uploadRoot = rtrim($_SERVER['DOCUMENT_ROOT'] ?? '', '/') . '/assets/uploads';
    if ($uploadRoot === '/assets/uploads') { // fallback when DOCUMENT_ROOT missing
      $uploadRoot = dirname(__DIR__) . '/../src/main/resources/static/public/assets/uploads';
    }
    $full = realpath($uploadRoot) . DIRECTORY_SEPARATOR . str_replace(['/', '\\'], DIRECTORY_SEPARATOR, $rel);

    // Safety: ensure path is inside uploads root
    $uploadsReal = realpath($uploadRoot);
    $fullReal = realpath($full);
    if ($uploadsReal && $fullReal && strpos($fullReal, $uploadsReal) === 0) {
      @unlink($fullReal);
    }

    $pdo->prepare('DELETE FROM room_type_images WHERE id=:id')->execute([':id'=>$imageId]);
    $pdo->commit();
    echo json_encode(['success'=>true]);
  } catch (Throwable $e) {
    if ($pdo->inTransaction()) { $pdo->rollBack(); }
    json_error('DB error: '.$e->getMessage(), 500);
  }
  exit;
}

json_error('Method not allowed', 405);
?>
<?php
require_once 'cors.php';
require_once 'config.php';

// Get room type ID parameter
$roomTypeId = $_GET['room_type_id'] ?? '';
$lang = $_GET['lang'] ?? 'th';

if (!in_array($lang, ['th', 'en'])) {
    $lang = 'th';
}

if (empty($roomTypeId) || !is_numeric($roomTypeId)) {
    http_response_code(400);
    echo json_encode([
        'success' => false,
        'error' => 'Valid room_type_id parameter is required'
    ]);
    exit;
}

try {
    // Get all images for the specified room type
    $sql = "SELECT 
                id,
                room_type_id,
                file_name,
                caption_th,
                caption_en,
                sort_order,
                is_cover,
                width_px,
                height_px,
                file_size_kb,
                image_hash_md5,
                created_at,
                updated_at
            FROM room_type_images 
            WHERE room_type_id = :room_type_id
            ORDER BY sort_order ASC, id ASC";

    $stmt = $pdo->prepare($sql);
    $stmt->bindParam(':room_type_id', $roomTypeId, PDO::PARAM_INT);
    $stmt->execute();
    $images = $stmt->fetchAll();

    // Also get room type basic info
    $roomSql = "SELECT id, code, name_th, name_en, is_private FROM room_types WHERE id = :room_type_id";
    $roomStmt = $pdo->prepare($roomSql);
    $roomStmt->bindParam(':room_type_id', $roomTypeId, PDO::PARAM_INT);
    $roomStmt->execute();
    $roomInfo = $roomStmt->fetch();

    if (!$roomInfo) {
        http_response_code(404);
        echo json_encode([
            'success' => false,
            'error' => 'Room type not found'
        ]);
        exit;
    }

    // Format response
    $formattedImages = [];
    foreach ($images as $image) {
        $imageData = [
            'id' => $image['id'],
            'file_name' => $image['file_name'],
            'caption' => $lang === 'th' ? $image['caption_th'] : $image['caption_en'],
            'caption_th' => $image['caption_th'],
            'caption_en' => $image['caption_en'],
            'sort_order' => $image['sort_order'],
            'is_cover' => $image['is_cover'],
            'width_px' => $image['width_px'],
            'height_px' => $image['height_px'],
            'file_size_kb' => $image['file_size_kb'],
            'image_hash_md5' => $image['image_hash_md5'],
            'created_at' => $image['created_at'],
            'updated_at' => $image['updated_at']
        ];
        
        $formattedImages[] = $imageData;
    }

    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'success' => true,
        'language' => $lang,
        'room_type' => [
            'id' => $roomInfo['id'],
            'code' => $roomInfo['code'],
            'name' => $lang === 'th' ? $roomInfo['name_th'] : $roomInfo['name_en'],
            'name_th' => $roomInfo['name_th'],
            'name_en' => $roomInfo['name_en'],
            'is_private' => $roomInfo['is_private'],
            'type' => $roomInfo['is_private'] ? 'private' : 'dorm'
        ],
        'count' => count($formattedImages),
        'data' => $formattedImages
    ], JSON_UNESCAPED_UNICODE);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Database error: ' . $e->getMessage()
    ]);
}
?>