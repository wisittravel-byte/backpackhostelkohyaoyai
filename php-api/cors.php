<?php<?php

// Basic CORS middleware. Adjust origins/methods/headers for your needs.// Simple CORS headers (tighten for production)

$allowedOrigins = [$allowedOrigins = [

    '*', // Change to specific origins for production, e.g., 'https://example.com'  'http://127.0.0.1',

];  'http://localhost',

$allowedMethods = 'GET, POST, PUT, DELETE, OPTIONS';  'http://127.0.0.1:8080',

$allowedHeaders = 'Content-Type, Authorization, X-Requested-With';  'http://127.0.0.1:8083',

$maxAge = '86400';  'http://127.0.0.1:5500',

  'http://127.0.0.1:5502',

$origin = $_SERVER['HTTP_ORIGIN'] ?? '';  // local vhost domains per project

if ($origin && (in_array('*', $allowedOrigins, true) || in_array($origin, $allowedOrigins, true))) {  'http://backpack.local.test',

    header('Access-Control-Allow-Origin: ' . ($origin && !in_array('*', $allowedOrigins, true) ? $origin : '*'));  'http://cloudhotel.local.test',

    header('Vary: Origin');  'https://backpackkohyao.com',

}  'https://www.backpackkohyao.com',

header('Access-Control-Allow-Methods: ' . $allowedMethods);  'https://wisittravel-byte.github.io'

header('Access-Control-Allow-Headers: ' . $allowedHeaders);];

header('Access-Control-Max-Age: ' . $maxAge);

header('Access-Control-Allow-Credentials: false');$origin = $_SERVER['HTTP_ORIGIN'] ?? '';

if ($origin && in_array($origin, $allowedOrigins, true)) {

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {  header("Access-Control-Allow-Origin: {$origin}");

    http_response_code(204);  header('Vary: Origin');

    exit;} else {

}  header('Access-Control-Allow-Origin: *');

}
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Accept');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') {
  http_response_code(204);
  exit;
}