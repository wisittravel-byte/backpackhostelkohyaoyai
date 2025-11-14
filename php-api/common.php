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

// --- Payments security helpers (lightweight, optional) ---
function env_bool(string $name, bool $default=false): bool {
    $v = getenv($name);
    if ($v === false || $v === null) return $default;
    $v = strtolower(trim((string)$v));
    return in_array($v, ['1','true','yes','y','on'], true);
}

/**
 * Decrypt a ciphertext produced with AES-256-GCM.
 * Supported formats:
 * - JSON: {"alg":"aes-256-gcm","iv":"base64","tag":"base64","ct":"base64"}
 * - Colon-delimited: ivBase64:tagBase64:ciphertextBase64
 * Key is expected in env PAYMENTS_DEK (base64-encoded 32 bytes)
 * Returns plaintext string on success, or null on failure.
 */
function payments_decrypt_secret(?string $ciphertext): ?string {
    if (!$ciphertext) return null;
    $dekB64 = getenv('PAYMENTS_DEK') ?: '';
    if (strlen($dekB64) < 44) { // base64 of 32 bytes ~ 44 chars
        return null; // not configured
    }
    $key = base64_decode($dekB64, true);
    if ($key === false || strlen($key) !== 32) return null;

    $iv = $tag = $ct = null;
    $raw = trim($ciphertext);
    // Try JSON first
    $parsed = json_decode($raw, true);
    if (is_array($parsed) && isset($parsed['ct'])) {
        $iv = base64_decode($parsed['iv'] ?? '', true);
        $tag = base64_decode($parsed['tag'] ?? '', true);
        $ct  = base64_decode($parsed['ct'] ?? '', true);
    } else {
        // Try colon-delimited
        $parts = explode(':', $raw);
        if (count($parts) === 3) {
            $iv  = base64_decode($parts[0], true);
            $tag = base64_decode($parts[1], true);
            $ct  = base64_decode($parts[2], true);
        }
    }
    if (!$iv || !$tag || !$ct) return null;
    $pt = openssl_decrypt($ct, 'aes-256-gcm', $key, OPENSSL_RAW_DATA, $iv, $tag);
    return ($pt === false) ? null : $pt;
}
