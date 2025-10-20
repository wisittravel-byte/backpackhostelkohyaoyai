<?php
// Secure PDO connection helper. Reads from environment variables.
// Avoid committing secrets to source control.

$env = function($key, $default = null) {
    $val = getenv($key);
    if ($val === false) {
        // Try .env file if present
        $dotenvPath = __DIR__ . '/.env';
        if (is_readable($dotenvPath)) {
            foreach (file($dotenvPath) as $line) {
                if (preg_match('/^\s*#/', $line) || trim($line) === '') continue;
                [$k, $v] = array_map('trim', explode('=', $line, 2) + [null, null]);
                if ($k && $v !== null && !getenv($k)) putenv("$k=$v");
            }
            $val = getenv($key);
        }
    }
    return $val !== false ? $val : $default;
};

$dbHost = $env('DB_HOST', 'localhost');
$dbPort = (int)$env('DB_PORT', '3306');
$dbName = $env('DB_NAME', 'test');
$dbUser = $env('DB_USER', 'root');
$dbPass = $env('DB_PASS', '');
$dbCharset = $env('DB_CHARSET', 'utf8mb4');

$dsn = sprintf('mysql:host=%s;port=%d;dbname=%s;charset=%s', $dbHost, $dbPort, $dbName, $dbCharset);
$options = [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES => false,
];

try {
    $pdo = new PDO($dsn, $dbUser, $dbPass, $options);
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Database connection failed', 'detail' => $e->getMessage()]);
    exit;
}
