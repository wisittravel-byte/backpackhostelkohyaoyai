<?php
require_once __DIR__ . '/../common.php';

// Get active tax config effective for current date
$currentDate = date('Y-m-d');

try {
        $sql = "SELECT id, service_charge_pct, vat_pct, vat_base, local_tax_amount, local_tax_unit,
                                     fee_type, fee_value, fee_base, fee_unit,
                                     effective_from, effective_to
            FROM property_tax_config 
            WHERE is_active = 1 
              AND effective_from <= :current_date 
              AND (effective_to IS NULL OR effective_to >= :current_date)
            ORDER BY effective_from DESC 
            LIMIT 1";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute([':current_date' => $currentDate]);
    $config = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$config) {
        json_out([
            'error' => 'no_active_config',
            'message' => 'No active tax configuration found for current date'
        ], 404);
        exit;
    }
    
    // Convert to appropriate types
    $result = [
        'id' => (int)$config['id'],
        'service_charge_pct' => (float)$config['service_charge_pct'],
        'vat_pct' => (float)$config['vat_pct'],
        'vat_base' => $config['vat_base'],
        'local_tax_amount' => (float)$config['local_tax_amount'],
        'local_tax_unit' => $config['local_tax_unit'],
        // Booking fee fields (canonical)
        'fee_type' => $config['fee_type'] ?? 'FIXED',
        'fee_value' => isset($config['fee_value']) ? (float)$config['fee_value'] : 0.0,
        'fee_base' => $config['fee_base'] ?? 'ROOM_ONLY',
        'fee_unit' => $config['fee_unit'] ?? 'PER_BOOKING',
        'effective_from' => $config['effective_from'],
        'effective_to' => $config['effective_to'],
    ];
    
    json_out($result);
    
} catch (PDOException $e) {
    error_log('Database error in property-tax-config: ' . $e->getMessage());
    json_out([
        'error' => 'database_error',
        'message' => 'Failed to retrieve tax configuration'
    ], 500);
}
