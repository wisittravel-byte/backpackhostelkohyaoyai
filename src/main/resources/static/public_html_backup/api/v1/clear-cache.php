<?php
// Clear PHP opcode cache to ensure latest code is loaded
if (function_exists('opcache_reset')) {
    opcache_reset();
    echo "✅ OPcache cleared\n";
} else {
    echo "⚠️ OPcache not enabled\n";
}

if (function_exists('apcu_clear_cache')) {
    apcu_clear_cache();
    echo "✅ APCu cleared\n";
}

echo "✅ Cache clear script completed\n";
echo "Last modified: " . date('Y-m-d H:i:s', filemtime(__DIR__ . '/inventory-hold-create.php')) . "\n";
?>
