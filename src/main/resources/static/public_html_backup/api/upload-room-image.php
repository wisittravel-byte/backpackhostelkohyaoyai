<?php
require_once __DIR__ . '/cors.php';
require_once __DIR__ . '/config.php';

header('Content-Type: application/json; charset=utf-8');

function baseUrl(): string {
  $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
  $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
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

// Only POST multipart
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') {
  json_error('Method not allowed', 405);
}
if (!isset($_FILES['file'])) {
  json_error('file is required', 400);
}

$propertyId = isset($_POST['property_id']) ? (int)$_POST['property_id'] : 0;
$roomTypeId = isset($_POST['room_type_id']) ? (int)$_POST['room_type_id'] : 0;
if ($roomTypeId <= 0) {
  json_error('room_type_id is required and must be a positive integer', 400);
}

// Validate file
$file = $_FILES['file'];
if (($file['error'] ?? UPLOAD_ERR_OK) !== UPLOAD_ERR_OK) {
  json_error('Upload error code: '.$file['error'], 400);
}

$maxBytes = 5 * 1024 * 1024; // 5MB
if (($file['size'] ?? 0) > $maxBytes) {
  json_error('File too large. Max 5MB', 413);
}

$allowedExt = ['jpg','jpeg','png','webp'];
$name = $file['name'] ?? 'image';
$ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
if (!in_array($ext, $allowedExt, true)) {
  json_error('Invalid extension. Allowed: jpg,jpeg,png,webp', 400);
}

// MIME check (best effort)
$finfo = finfo_open(FILEINFO_MIME_TYPE);
$mime = finfo_file($finfo, $file['tmp_name']);
finfo_close($finfo);
$allowedMime = ['image/jpeg','image/png','image/webp'];
if (!in_array($mime, $allowedMime, true)) {
  json_error('Invalid MIME type', 400);
}

// Build paths - simplified to match Backoffice structure
$relativeDir = "room_types/{$roomTypeId}";
$uploadRoot = rtrim($_SERVER['DOCUMENT_ROOT'] ?? '', '/') . '/assets/uploads';
if ($uploadRoot === '/assets/uploads') { // fallback when DOCUMENT_ROOT missing
  $uploadRoot = dirname(__DIR__) . '/../src/main/resources/static/public/assets/uploads';
}
$targetDir = $uploadRoot . '/' . $relativeDir;
if (!is_dir($targetDir)) {
  if (!@mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
    json_error('Cannot create upload directory', 500);
  }
}

$uniq = str_replace('.', '', uniqid('room_', true));
$filename = $uniq . '.' . $ext;
$targetPath = $targetDir . '/' . $filename;

if (!@move_uploaded_file($file['tmp_name'], $targetPath)) {
  json_error('Failed to move uploaded file', 500);
}

// Persist in DB - use file_name instead of image_path
$imageDirPath = "/assets/uploads/room_types/{$roomTypeId}/"; // store dir path with trailing slash

try {
  $pdo->beginTransaction();
  
  // First, update room_types.image_dir_path if not set
  $stmtCheckDir = $pdo->prepare('SELECT image_dir_path FROM room_types WHERE id = :rtid');
  $stmtCheckDir->execute([':rtid'=>$roomTypeId]);
  $currentDir = $stmtCheckDir->fetchColumn();
  
  if (empty($currentDir)) {
    $stmtUpdateDir = $pdo->prepare('UPDATE room_types SET image_dir_path = :dir WHERE id = :rtid');
    $stmtUpdateDir->execute([':dir'=>$imageDirPath, ':rtid'=>$roomTypeId]);
  }
  
  // Insert image record with file_name only
  $stmt = $pdo->prepare('INSERT INTO room_type_images (room_type_id, file_name, created_at) VALUES (:rtid, :fname, NOW())');
  $stmt->execute([':rtid'=>$roomTypeId, ':fname'=>$filename]);
  $id = (int)$pdo->lastInsertId();
  $pdo->commit();
} catch (Throwable $e) {
  @unlink($targetPath);
  if ($pdo->inTransaction()) { $pdo->rollBack(); }
  json_error('DB error: '.$e->getMessage(), 500);
}

echo json_encode([
  'success' => true,
  'image' => [
    'id' => $id,
    'file_name' => $filename,
    'relative_path' => $relativeDir . '/' . $filename,
    'url' => toPublicUrl($relativeDir . '/' . $filename),
  ],
]);

?>
