<?php
require_once 'config.php';

try {
    // Add is_private column if it doesn't exist
    $pdo->exec("ALTER TABLE room_types ADD COLUMN is_private TINYINT DEFAULT 0");
    echo "Added is_private column successfully\n";
} catch (PDOException $e) {
    if (strpos($e->getMessage(), 'Duplicate column name') !== false) {
        echo "Column is_private already exists\n";
    } else {
        echo "Error: " . $e->getMessage() . "\n";
    }
}

// Update some rows to have is_private = 1 (for testing)
try {
    $pdo->exec("UPDATE room_types SET is_private = 1 WHERE id IN (4, 5)");
    echo "Updated rooms 4,5 to be private\n";
} catch (PDOException $e) {
    echo "Update error: " . $e->getMessage() . "\n";
}

// Show current table structure
try {
    $result = $pdo->query("SELECT id, code, name, is_private FROM room_types ORDER BY id");
    echo "\nCurrent room_types data:\n";
    while ($row = $result->fetch()) {
        echo "ID: {$row['id']}, Code: {$row['code']}, Name: {$row['name']}, Private: {$row['is_private']}\n";
    }
} catch (PDOException $e) {
    echo "Select error: " . $e->getMessage() . "\n";
}
?>