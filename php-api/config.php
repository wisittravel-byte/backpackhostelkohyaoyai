<?php
// Database configuration with robust environment support.
// Resolution order (first match wins):
// 1) Secrets file (recommended for production), e.g. private_html/api-secrets.php returns array
// 2) Environment variables: DB_HOST, DB_NAME, DB_USER, DB_PASS
// 3) Local defaults (for development only)

$charset = 'utf8mb4';

// Local defaults
$host = 'localhost';
$dbname = 'cloudhotelpms';
$username = 'root';
$password = 'Kz13579@';

$httpHost = $_SERVER['HTTP_HOST'] ?? '';
$isProd = ($httpHost === 'www.backpackkohyao.com' || $httpHost === 'backpackkohyao.com');

// 1) Secrets file lookup (safe path outside public_html is preferred)
// Load secrets ONLY on production hosts to avoid breaking local dev when a secrets file exists locally.
$projectRoot = dirname(dirname(__DIR__)); // .../backpackkohyao.com
$usedSource = 'defaults';
if ($isProd) {
    $candidates = [
        __DIR__ . '/api-secrets.php',                   // public_html/api/api-secrets.php (most likely)
        __DIR__ . '/secrets.php',                       // public_html/api/secrets.php (alternative)
        $projectRoot . '/private_html/api-secrets.php', // private_html/api-secrets.php (preferred but may not exist)
    ];
    foreach ($candidates as $file) {
        if ($file && @is_file($file)) {
            $conf = include $file;
            if (is_array($conf)) {
                $host     = $conf['DB_HOST'] ?? $host;
                $dbname   = $conf['DB_NAME'] ?? $dbname;
                $username = $conf['DB_USER'] ?? $username;
                $password = $conf['DB_PASS'] ?? $password;
                $usedSource = 'secrets:' . basename($file);
                break;
            }
        }
    }
}

// 2) Environment variables (only if not already overridden by secrets)
if ($usedSource === 'defaults') {
    $envHost = getenv('DB_HOST');
    $envName = getenv('DB_NAME');
    $envUser = getenv('DB_USER');
    $envPass = getenv('DB_PASS');
    if ($envHost && $envName && $envUser && $envPass) {
        $host = $envHost; $dbname = $envName; $username = $envUser; $password = $envPass;
        $usedSource = 'env';
    }
}

try {
    $dsn = "mysql:host={$host};dbname={$dbname};charset={$charset}";
    $pdo = new PDO($dsn, $username, $password, [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
        PDO::ATTR_EMULATE_PREPARES => true, // allow binding LIMIT/OFFSET
    ]);
} catch (Throwable $e) {
    http_response_code(500);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode([
        'error' => 'Database connection failed',
        'detail' => $e->getMessage(),
        'type' => get_class($e),
        'env' => $isProd ? 'prod' : 'dev',
        'source' => $usedSource,
        'db_host' => $host,
        'db_name' => $dbname,
        'php' => PHP_VERSION,
        'ext' => [
            'pdo' => extension_loaded('pdo'),
            'pdo_mysql' => extension_loaded('pdo_mysql'),
        ],
    ]);
    exit;
}
?>