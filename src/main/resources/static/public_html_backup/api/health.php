<?php
// Lightweight diagnostics for Production. Safe to upload temporarily.
// It does NOT print secrets, only whether files/extensions exist and basic statuses.

header('Content-Type: application/json; charset=utf-8');

$httpHost = $_SERVER['HTTP_HOST'] ?? '';
$projectRoot = dirname(dirname(__DIR__)); // .../backpackkohyao.com
$apiDir = __DIR__;

$candidates = [
    $apiDir . '/api-secrets.php',
    $apiDir . '/secrets.php',
    $projectRoot . '/private_html/api-secrets.php',
];

$secrets = [ 'found' => false, 'path' => null, 'shape_ok' => false ];
foreach($candidates as $f){
    if(@is_file($f)){
        $secrets['found'] = true; $secrets['path'] = basename($f);
        // Try include but do NOT echo values
        try { $arr = @include $f; } catch (Throwable $e) { $arr = null; }
        if(is_array($arr)){
            $need = ['DB_HOST','DB_NAME','DB_USER','DB_PASS'];
            $secrets['shape_ok'] = (count(array_intersect($need, array_keys($arr))) === 4);
        }
        break;
    }
}

$ext = [
    'pdo' => extension_loaded('pdo'),
    'pdo_mysql' => extension_loaded('pdo_mysql'),
];

// Try creating a PDO using config.php logic to verify connection and report error type only
$db = [ 'connected' => false, 'error' => null, 'type' => null, 'source' => null ];
try{
    // config.php will return JSON on error (because we changed it), so we cannot include directly.
    // Instead, replicate minimal read path WITHOUT leaking secrets.
    $charset = 'utf8mb4';
    $host = 'localhost'; $dbname='cloudhotelpms'; $username='root'; $password='Kz13579@';
    $isProd = ($httpHost === 'www.backpackkohyao.com' || $httpHost === 'backpackkohyao.com');
    $source = 'defaults';
    if($isProd){
        foreach($candidates as $f){
            if(@is_file($f)){
                $arr = @include $f; if(is_array($arr)){
                    $host = $arr['DB_HOST'] ?? $host;
                    $dbname = $arr['DB_NAME'] ?? $dbname;
                    $username = $arr['DB_USER'] ?? $username;
                    $password = $arr['DB_PASS'] ?? $password;
                    $source = 'secrets:' . basename($f);
                    break;
                }
            }
        }
    }
    $db['source'] = $source;
    // Attempt connect only if extensions exist
    if($ext['pdo'] && $ext['pdo_mysql']){
        $dsn = "mysql:host={$host};dbname={$dbname};charset={$charset}";
        $pdo = new PDO($dsn, $username, $password, [ PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION ]);
        // Simple probe
        $db['connected'] = true;
    } else {
        $db['connected'] = false;
        $db['error'] = 'Missing PDO/PDO_MYSQL extension';
        $db['type'] = 'extensions';
    }
}catch(Throwable $e){
    $db['connected'] = false; $db['error'] = $e->getMessage(); $db['type'] = get_class($e);
}

echo json_encode([
  'ok' => true,
  'php' => PHP_VERSION,
  'sapi' => php_sapi_name(),
  'host' => $httpHost,
  'ext' => $ext,
  'secrets' => $secrets,
  'db' => $db,
  'time' => date('c'),
], JSON_UNESCAPED_SLASHES|JSON_UNESCAPED_UNICODE);

?>
