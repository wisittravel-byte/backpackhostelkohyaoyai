<?php
// Simple CORS headers (tighten for production)
$allowedOrigins = [
  'http://127.0.0.1',
  'http://localhost',
  'http://localhost:8080',
  'http://127.0.0.1:8080',
  'http://127.0.0.1:8083',
  'http://127.0.0.1:5500',
  'http://127.0.0.1:5502',
  // local vhost domains per project
  'http://backpack.local.test',
  'http://cloudhotel.local.test',
  'https://backpackkohyao.com',
  'https://www.backpackkohyao.com',
  'https://wisittravel-byte.github.io'
];

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin && in_array($origin, $allowedOrigins, true)) {
  header("Access-Control-Allow-Origin: {$origin}");
  header('Vary: Origin');
} else {
  header('Access-Control-Allow-Origin: *');
}
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept, Authorization, X-Requested-With');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}