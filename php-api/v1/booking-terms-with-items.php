<?php
require_once __DIR__ . '/../common.php';

// Endpoint: GET /api/v1/booking-terms-with-items.php?lang=th|en
// Returns latest active booking_terms and all booking_term_items sorted by sort_order ASC

try {
    $lang = strtolower(trim($_GET['lang'] ?? 'th'));
    if ($lang !== 'en') { $lang = 'th'; }

    // Get latest active term (assumes only one active, but orders by effective_from desc)
    $sqlTerm = "SELECT 
      t.policy_id, t.version, t.title_th, t.title_en, t.status, t.is_active,
      t.effective_from, t.created_at, t.created_by, t.updated_at, t.updated_by
    FROM booking_terms t
    WHERE t.is_active = 1
    ORDER BY t.effective_from DESC
    LIMIT 1";

    $term = null;
    $stmt = $pdo->query($sqlTerm);
    if ($stmt) {
        $term = $stmt->fetch(PDO::FETCH_ASSOC);
    }

    if (!$term) {
        json_out([ 'ok' => false, 'lang' => $lang, 'error' => 'NO_ACTIVE_TERM' ], 200);
        exit;
    }

    // Fetch items for this policy
    $sqlItems = "SELECT 
      i.item_id, i.policy_id, i.category, i.title_th, i.title_en,
      i.content_th, i.content_en, i.sort_order, i.show_on_checkout
    FROM booking_term_items i
    WHERE i.policy_id = :pid
    ORDER BY i.sort_order ASC";

    $stmt2 = $pdo->prepare($sqlItems);
    $stmt2->execute([':pid' => $term['policy_id']]);
    $items = $stmt2->fetchAll(PDO::FETCH_ASSOC) ?: [];

    // Normalize numeric fields
    foreach ($items as &$it) {
        $it['item_id'] = (int)($it['item_id'] ?? 0);
        $it['policy_id'] = (int)($it['policy_id'] ?? 0);
        $it['sort_order'] = isset($it['sort_order']) ? (int)$it['sort_order'] : null;
        if (isset($it['show_on_checkout'])) $it['show_on_checkout'] = (int)$it['show_on_checkout'];
    }
    unset($it);

    $out = [
        'ok' => true,
        'lang' => $lang,
        'term' => [
            'policy_id' => (int)$term['policy_id'],
            'version' => $term['version'],
            'title_th' => $term['title_th'],
            'title_en' => $term['title_en'],
            'status' => $term['status'],
            'is_active' => (int)$term['is_active'],
            'effective_from' => $term['effective_from'],
            'created_at' => $term['created_at'],
            'created_by' => $term['created_by'],
            'updated_at' => $term['updated_at'],
            'updated_by' => $term['updated_by'],
        ],
        'items' => $items,
    ];

    json_out($out, 200);
} catch (Throwable $e) {
    error_log('booking-terms-with-items error: ' . $e->getMessage());
    json_out([ 'ok' => false, 'error' => 'SERVER_ERROR', 'message' => $e->getMessage() ], 500);
}
