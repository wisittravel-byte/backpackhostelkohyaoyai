<?php
require_once __DIR__ . '/config.php';
require_once __DIR__ . '/cors.php';

// Set default timezone to match database (Asia/Bangkok = UTC+7)
date_default_timezone_set('Asia/Bangkok');

// --- Shared helpers for building image URLs ---
function baseUrl_common(): string {
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    if ($host === 'www.backpackkohyao.com' || $host === 'backpackkohyao.com') {
        return 'https://cloudhotelpms.cloudhotelhostel.com';
    }
    $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
    return $scheme . '://' . $host;
}
function toPublicUrl_common(string $relativePath): string {
    $relativePath = ltrim($relativePath, '/');
    if (strpos($relativePath, 'assets/uploads/') === 0) {
        return baseUrl_common() . '/' . $relativePath;
    }
    return baseUrl_common() . '/assets/uploads/' . $relativePath;
}
function legacyMap_common(string $path): string {
    return preg_replace('#^/web/dist/images/uploads/#', '/assets/uploads/', $path);
}
function toRelativeFromAny_common(string $path): string {
    $p = ltrim(legacyMap_common($path), '/');
    if (strpos($p, 'assets/uploads/') === 0) {
        $p = substr($p, strlen('assets/uploads/'));
    }
    return ltrim($p, '/');
}

function json_out($payload, int $code = 200): void {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE);
}

function must_date(string $v, string $name): string {
    if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $v)) {
        json_out(['error'=>"invalid_$name", 'message'=>"$name must be YYYY-MM-DD"], 400);
        exit;
    }
    return $v;
}

function dates_between(string $checkIn, string $checkOut): array {
    $start = new DateTime($checkIn);
    $end = new DateTime($checkOut);
    if ($end <= $start) return [];
    $dates = [];
    for ($d = clone $start; $d < $end; $d->modify('+1 day')) {
        $dates[] = $d->format('Y-m-d');
    }
    return $dates;
}
