<?php
/**
 * Local development override for database settings.
 * Copy this file to config.local.php and edit values for your localhost.
 * Do NOT upload config.local.php to production hosting.
 */
return [
    'db' => [
        // Use 127.0.0.1 to force TCP; or 'localhost' if your stack prefers socket
        'host'    => '127.0.0.1',
        'port'    => 3306,            // Change if your MySQL runs on a different port
        'name'    => 'cloudhotelpms', // Your local DB name
        'user'    => 'root',          // Your local DB user
        'pass'    => '',              // Your local DB password (e.g., 'Kz13579@' if set)
        'charset' => 'utf8mb4',
    ],
];
