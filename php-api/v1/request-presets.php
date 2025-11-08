<?php
require_once __DIR__ . '/../common.php';

// GET /api/v1/request-presets.php
// Return all active request presets sorted by sort_order ASC, id ASC

try {
    $sql = "SELECT id, code, label_th, label_en, requires_note, is_active, sort_order, created_at, updated_at, created_by, updated_by
            FROM request_presets
            WHERE is_active = 1
            ORDER BY sort_order ASC, id ASC";
    $stmt = $pdo->query($sql);
    $rows = $stmt ? $stmt->fetchAll(PDO::FETCH_ASSOC) : [];

    // Normalize numeric/boolean-like fields
    foreach ($rows as &$r) {
        $r['id'] = (int)$r['id'];
        $r['requires_note'] = isset($r['requires_note']) ? (int)$r['requires_note'] : 0;
        $r['is_active'] = isset($r['is_active']) ? (int)$r['is_active'] : 0;
        $r['sort_order'] = isset($r['sort_order']) ? (int)$r['sort_order'] : 0;
    }
    unset($r);

    json_out([
        'ok' => true,
        'count' => count($rows),
        'presets' => $rows,
    ]);
} catch (Throwable $e) {
    error_log('request-presets error: ' . $e->getMessage());
    json_out([
        'ok' => false,
        'error' => 'INTERNAL_ERROR',
        'message' => $e->getMessage(),
    ], 500);
}
