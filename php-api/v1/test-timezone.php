<?php
require_once __DIR__ . '/../common.php';

// Test timezone settings
$phpTimezone = date_default_timezone_get();
$phpTime = date('Y-m-d H:i:s');
$phpTimestamp = time();

// Test database timezone
try {
    $dbTimezone = $pdo->query("SELECT @@session.time_zone AS tz")->fetch()['tz'];
    $dbTime = $pdo->query("SELECT NOW() AS now")->fetch()['now'];
    $dbUtcTime = $pdo->query("SELECT UTC_TIMESTAMP() AS utc")->fetch()['utc'];
    
    // Test expires_at calculation
    $expiresAt = date('Y-m-d H:i:s', time() + 15 * 60);
    
    json_out([
        'php' => [
            'timezone' => $phpTimezone,
            'current_time' => $phpTime,
            'timestamp' => $phpTimestamp,
            'expires_at_15min' => $expiresAt,
        ],
        'database' => [
            'timezone' => $dbTimezone,
            'NOW()' => $dbTime,
            'UTC_TIMESTAMP()' => $dbUtcTime,
        ],
        'comparison' => [
            'time_difference' => strtotime($dbTime) - strtotime($phpTime) . ' seconds',
            'match' => ($phpTime === $dbTime) ? 'SAME' : 'DIFFERENT',
        ],
    ]);
} catch (Throwable $e) {
    json_out(['error' => $e->getMessage()], 500);
}
