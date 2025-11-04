<?php
/*
SPEC (API: GET ./api/room-types.php)
Params:
    is_private {0|1} required; lang {th|en}=th; page>=1=1; pageSize in [1,50]=12;
    sort {name|created_at}=name; order {asc|desc}=asc
Rules:
    - rt.is_active=1 AND COALESCE(rt.is_private,0)=:is_private
    - ต้องมีรูปปก: JOIN room_type_images rti ON rti.room_type_id=rt.id AND rti.is_cover=1
    - display_name: CASE WHEN :lang='en' THEN rt.name_en ELSE rt.name_th END
    - cover_url: CONCAT_WS('/', NULLIF(TRIM(BOTH '/' FROM COALESCE(rt.image_dir_path,'')),''),
                                                 TRIM(BOTH '/' FROM rti.file_name))
Output JSON:
    { "meta":{"page":1,"pageSize":12,"total":0},
        "items":[{"id":1,"code":"...","display_name":"...","cover":{"url":"...","width_px":0,"height_px":0,"mime_type":"image/jpeg"}}] }
Tech:
    - PDO: ERRMODE=EXCEPTION, DEFAULT_FETCH_MODE=ASSOC, EMULATE_PREPARES=true
    - Bind :limit,:offset เป็น PDO::PARAM_INT
    - meta.total = COUNT(*) หลัง JOIN ด้วยเงื่อนไขเดียวกัน
    - Headers: Content-Type JSON UTF-8; Cache-Control public,max-age=300,stale-while-revalidate=600
    - ?debug=1 ให้แนบ _debug { total, filters, sql_short }
*/

// Copilot: implement the SPEC above end-to-end.
// Use these exact SQLs (bind :lang,:limit,:offset,:is_private):
//
// DATA (private=1 or dorm=0) uses:
// SELECT rt.id, rt.code, rt.name_th, rt.name_en,
//   CASE WHEN :lang='en' THEN rt.name_en ELSE rt.name_th END AS display_name,
//   CONCAT_WS('/', NULLIF(TRIM(BOTH '/' FROM COALESCE(rt.image_dir_path,'')),''),
//                 TRIM(BOTH '/' FROM rti.file_name)) AS cover_url,
//   rti.width_px, rti.height_px, rti.mime_type
// FROM room_types rt
// JOIN room_type_images rti ON rti.room_type_id=rt.id AND rti.is_cover=1
// WHERE rt.is_active=1 AND COALESCE(rt.is_private,0)=:is_private
// ORDER BY
//   CASE WHEN :sort='created_at' AND :order='asc'  THEN rt.created_at END ASC,
//   CASE WHEN :sort='created_at' AND :order='desc' THEN rt.created_at END DESC,
//   CASE WHEN :sort='name'       AND :order='asc'  THEN (CASE WHEN :lang='en' THEN rt.name_en ELSE rt.name_th END) END ASC,
//   CASE WHEN :sort='name'       AND :order='desc' THEN (CASE WHEN :lang='en' THEN rt.name_en ELSE rt.name_th END) END DESC,
//   rt.id ASC
// LIMIT :limit OFFSET :offset;
//
// COUNT
// SELECT COUNT(*) AS total
// FROM room_types rt
// JOIN room_type_images rti ON rti.room_type_id=rt.id AND rti.is_cover=1
// WHERE rt.is_active=1 AND COALESCE(rt.is_private,0)=:is_private;

require_once 'cors.php';
require_once 'config.php';

// --- Utilities for image URL mapping ---
function baseUrl(): string {
    // Production: Always return Backoffice domain where images are stored
    $host = $_SERVER['HTTP_HOST'] ?? 'localhost';
    
    if ($host === 'www.backpackkohyao.com' || $host === 'backpackkohyao.com') {
        return 'https://cloudhotelpms.cloudhotelhostel.com';
    }
    
    // Local development
    $scheme = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http';
    return $scheme . '://' . $host;
}
function toPublicUrl(string $relativePath): string {
    $relativePath = ltrim($relativePath, '/');
    // Check if path already starts with assets/uploads
    if (strpos($relativePath, 'assets/uploads/') === 0) {
        return baseUrl() . '/' . $relativePath;
    }
    return baseUrl() . '/assets/uploads/' . $relativePath;
}
function legacyMap(string $path): string {
    // map /web/dist/images/uploads/... -> /assets/uploads/...
    return preg_replace('#^/web/dist/images/uploads/#', '/assets/uploads/', $path);
}
function toRelativeFromAny(string $path): string {
    // Ensure we return path relative to assets/uploads
    $p = ltrim(legacyMap($path), '/');
    if (strpos($p, 'assets/uploads/') === 0) {
        $p = substr($p, strlen('assets/uploads/'));
    }
    return ltrim($p, '/');
}

// Utility: safe int and whitelist
function as_int($v, $default, $min, $max){
    if($v===null||$v==='') return $default;
    if(!is_numeric($v)) return $default;
    $n = (int)$v;
    if($n<$min) $n=$min; if($n>$max) $n=$max; return $n;
}
function bad_request($msg){ http_response_code(400); header('Content-Type: application/json'); echo json_encode(['error'=>$msg]); exit; }

// Read and validate query params
$isPrivate = isset($_GET['is_private']) ? $_GET['is_private'] : null;
if($isPrivate===null || ($isPrivate!=='0' && $isPrivate!=='1')){ bad_request('is_private must be 0 or 1'); }
$lang = $_GET['lang'] ?? 'th';
if(!in_array($lang,['th','en'],true)) bad_request('lang must be th or en');
$page = as_int($_GET['page'] ?? 1, 1, 1, 1000000);
$pageSize = as_int($_GET['pageSize'] ?? 12, 12, 1, 50);
$sort = $_GET['sort'] ?? 'name';
if(!in_array($sort,['name','created_at'],true)) bad_request('sort must be name or created_at');
$order = $_GET['order'] ?? 'asc';
if(!in_array($order,['asc','desc'],true)) bad_request('order must be asc or desc');

// Optional debug flags to help diagnose empty results
$debug = isset($_GET['debug']) && $_GET['debug'] === '1';
$debugIncludeNoCover = $debug && isset($_GET['debug_include_no_cover']) && $_GET['debug_include_no_cover'] === '1';

$offset = ($page-1)*$pageSize;

// Display name per language
// Schema introspection (avoid 500 on missing columns)
$schema = $pdo->query('SELECT DATABASE()')->fetchColumn();
function col_exists($pdo,$schema,$table,$col){
    $stmt=$pdo->prepare('SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=? AND TABLE_NAME=? AND COLUMN_NAME=?');
    $stmt->execute([$schema,$table,$col]); return ((int)$stmt->fetchColumn())>0;
}
function table_exists($pdo,$schema,$table){
    $stmt=$pdo->prepare('SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=? AND TABLE_NAME=?');
    $stmt->execute([$schema,$table]); return ((int)$stmt->fetchColumn())>0;
}

$hasRtTable  = table_exists($pdo,$schema,'room_types');
$hasRtNameTh = col_exists($pdo,$schema,'room_types','name_th');
$hasRtNameEn = col_exists($pdo,$schema,'room_types','name_en');
$hasRtName   = col_exists($pdo,$schema,'room_types','name');
$hasRtCreatedAt = col_exists($pdo,$schema,'room_types','created_at');
$hasRtImageDir = col_exists($pdo,$schema,'room_types','image_dir_path');
$hasRtIsActive = col_exists($pdo,$schema,'room_types','is_active');
$hasRtIsPrivate = col_exists($pdo,$schema,'room_types','is_private');
$hasRtCode = col_exists($pdo,$schema,'room_types','code');

$hasRtiTable = table_exists($pdo,$schema,'room_type_images');
$hasRtiFileName = $hasRtiTable && col_exists($pdo,$schema,'room_type_images','file_name');
$hasRtiIsCover = $hasRtiTable && col_exists($pdo,$schema,'room_type_images','is_cover');
$hasRtiWidth = $hasRtiTable && col_exists($pdo,$schema,'room_type_images','width_px');
$hasRtiHeight = $hasRtiTable && col_exists($pdo,$schema,'room_type_images','height_px');
$hasRtiMime = $hasRtiTable && col_exists($pdo,$schema,'room_type_images','mime_type');

// Quick startup check when debug=1 to surface wrong schema/database issues fast
if($debug){
    $missing = [];
    if(!$hasRtTable) $missing[] = 'room_types';
    if(!$hasRtiTable) $missing[] = 'room_type_images';
    if(!empty($missing)){
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode([
            'error' => 'missing_tables',
            '_debug' => [
                'db' => $schema,
                'has_room_types' => $hasRtTable,
                'has_room_type_images' => $hasRtiTable,
                'missing' => $missing,
            ],
        ]);
        exit;
    }
}

// Display name per language
$displayExpr = ($lang==='en')
    ? ($hasRtNameEn ? 'rt.name_en' : ($hasRtName ? 'rt.name' : "'Room'"))
    : ($hasRtNameTh ? 'rt.name_th' : ($hasRtName ? 'rt.name' : "'ห้องพัก'"));

// Sort expression mapping (fallback if created_at missing)
if($sort==='created_at' && $hasRtCreatedAt){ $sortExpr = 'rt.created_at'; }
else if($sort==='created_at' && !$hasRtCreatedAt){ $sortExpr = 'rt.id'; }
else { $sortExpr = $displayExpr; }

// Cover URL expr per SPEC using CONCAT_WS + TRIM BOTH
$coverUrlExpr = "CONCAT_WS('/', NULLIF(TRIM(BOTH '/' FROM COALESCE(rt.image_dir_path,'')),''), TRIM(BOTH '/' FROM rti.file_name))";

// SELECT pieces
$selWidth = $hasRtiWidth ? 'rti.width_px' : 'NULL AS width_px';
$selHeight = $hasRtiHeight ? 'rti.height_px' : 'NULL AS height_px';
$selMime = $hasRtiMime ? 'rti.mime_type' : 'NULL AS mime_type';

// JOIN clause per BUSINESS RULE: return rows even without images.
// Use LEFT JOIN and ONLY accept rti.is_cover=1 (strict cover-only, no fallback).
$join = 'LEFT JOIN room_type_images rti ON rti.room_type_id = rt.id AND rti.is_cover = 1';

// WHERE filters
$where = 'WHERE 1=1';
if($hasRtIsActive){ $where .= ' AND rt.is_active = 1'; }
if($hasRtIsPrivate){ $where .= ' AND COALESCE(rt.is_private,0) = :is_private'; }

// Safe column selections
$selCode = $hasRtCode ? 'rt.code AS code' : "NULL AS code";
$selNameTh = $hasRtNameTh ? 'rt.name_th AS name_th' : ($hasRtName ? 'rt.name AS name_th' : "NULL AS name_th");
$selNameEn = $hasRtNameEn ? 'rt.name_en AS name_en' : ($hasRtName ? 'rt.name AS name_en' : "NULL AS name_en");

// Build SQL per SPEC: LEFT JOIN (cover only) + CASE ORDER BY
$nameCase = "CASE WHEN :lang='en' THEN rt.name_en ELSE rt.name_th END";
$sql = "SELECT\n  rt.id, rt.code, rt.name_th, rt.name_en, rt.image_dir_path,\n  $nameCase AS display_name,\n  $coverUrlExpr AS cover_url,\n  rti.width_px, rti.height_px, rti.mime_type\nFROM room_types rt\n$join\nWHERE rt.is_active = 1 AND COALESCE(rt.is_private,0) = :is_private\nORDER BY\n  CASE WHEN :sort='created_at' AND :order='asc'  THEN rt.created_at END ASC,\n  CASE WHEN :sort='created_at' AND :order='desc' THEN rt.created_at END DESC,\n  CASE WHEN :sort='name'       AND :order='asc'  THEN ($nameCase) END ASC,\n  CASE WHEN :sort='name'       AND :order='desc' THEN ($nameCase) END DESC,\n  rt.id ASC\nLIMIT :limit OFFSET :offset";

// Count SQL honors available filters
// Count per SPEC: do NOT require images
$countSql = "SELECT COUNT(*) AS total\nFROM room_types rt\nWHERE rt.is_active = 1 AND COALESCE(rt.is_private,0) = :is_private";

try{
    // Total count
    $stmtCnt = $pdo->prepare($countSql);
    // Count only filters we know
    $paramsCnt = [];
    if($hasRtIsPrivate){ $paramsCnt[':is_private']=(int)$isPrivate; }
    $stmtCnt->execute($paramsCnt);
    $total = (int)($stmtCnt->fetchColumn() ?: 0);

    // Prepare debug info early so we can return it even when total=0
    $debugInfo = null;
    if($debug){
        // short one-line SQL for quick inspection
        $sql_short = preg_replace('/\s+/', ' ', trim($sql));
        $debugInfo = [
            'schema'=>$schema,
            'filters'=>['is_active'=>($hasRtIsActive?1:null), 'is_private'=>($hasRtIsPrivate?(int)$isPrivate:null)],
            'orderBy'=>'CASE-based',
            'orderDir'=> $order,
            'limit'=>$pageSize,
            'offset'=>$offset,
            'join'=>$join,
            'where'=>$where,
            'sql_short'=>$sql_short,
            'countSql'=>$countSql,
            'total'=>$total,
            'flags'=>[
                'hasRtNameTh'=>$hasRtNameTh,
                'hasRtNameEn'=>$hasRtNameEn,
                'hasRtName'=>$hasRtName,
                'hasRtCreatedAt'=>$hasRtCreatedAt,
                'hasRtImageDir'=>$hasRtImageDir,
                'hasRtIsActive'=>$hasRtIsActive,
                'hasRtIsPrivate'=>$hasRtIsPrivate,
                'hasRtiTable'=>$hasRtiTable,
                'hasRtiFileName'=>$hasRtiFileName,
                'hasRtiIsCover'=>$hasRtiIsCover,
            ],
        ];
    }

    // Do not return 404 on empty; continue to data query and return 200 with items:[]

    // Data query
    $stmt = $pdo->prepare($sql);
    if($hasRtIsPrivate){ $stmt->bindValue(':is_private', (int)$isPrivate, PDO::PARAM_INT); }
    $stmt->bindValue(':lang', $lang, PDO::PARAM_STR);
    $stmt->bindValue(':sort', $sort, PDO::PARAM_STR);
    $stmt->bindValue(':order', $order, PDO::PARAM_STR);
    $stmt->bindValue(':limit', (int)$pageSize, PDO::PARAM_INT);
    $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
    $stmt->execute();
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC);

    // Map to DTO
    $items = [];
    foreach($rows as $r){
        // cover mapping: convert legacy path to public URL if present
        $coverUrlRaw = isset($r['cover_url']) ? $r['cover_url'] : null;
        $coverRel = null; $coverAbs = null;
        if ($coverUrlRaw) {
            // cover_url may be like "dir/file" or "/web/dist/images/uploads/..."
            $coverCandidate = '/' . ltrim((string)$coverUrlRaw, '/');
            $coverRel = toRelativeFromAny($coverCandidate);
            // if still contains no slash (unexpected), keep as-is
            $coverAbs = $coverRel ? toPublicUrl($coverRel) : null;
        }

        $item = [
            'id'=>(int)$r['id'],
            'code'=>$r['code'],
            'name_th'=>$r['name_th'] ?? null,
            'name_en'=>$r['name_en'] ?? null,
            'display_name'=>$r['display_name'] ?? null,
            'cover'=>[
                'url'=> $coverAbs,
                'width_px'=> isset($r['width_px'])? (is_null($r['width_px'])? null : (int)$r['width_px']) : null,
                'height_px'=> isset($r['height_px'])? (is_null($r['height_px'])? null : (int)$r['height_px']) : null,
                'mime_type'=> $r['mime_type'] ?? null,
            ],
        ];

        // Attach images array (backward compatible addition)
        try {
            $stmtImg = $pdo->prepare('
                SELECT rti.id, rti.file_name, rti.is_cover, rti.width_px, rti.height_px, 
                       rti.mime_type, rti.file_size_kb, rti.created_at
                FROM room_type_images rti
                WHERE rti.room_type_id = :rtid 
                ORDER BY rti.is_cover DESC, rti.sort_order ASC, rti.id ASC
            ');
            $stmtImg->execute([':rtid'=>(int)$r['id']]);
            $imgRows = $stmtImg->fetchAll(PDO::FETCH_ASSOC) ?: [];
            $images = [];
            
            // Get image_dir_path from room_types table
            $imageDir = isset($r['image_dir_path']) ? rtrim($r['image_dir_path'], '/') : '';
            
            foreach ($imgRows as $ir) {
                $fileName = $ir['file_name'] ?? '';
                if (!$fileName) continue; // skip if no filename
                
                // Build full path: image_dir_path + file_name
                $fullPath = $imageDir ? $imageDir . '/' . $fileName : $fileName;
                $rel = ltrim($fullPath, '/');
                
                $images[] = [
                    'id' => (int)$ir['id'],
                    'file_name' => $fileName,
                    'relative_path' => $rel,
                    'url' => $rel ? toPublicUrl($rel) : null,
                    'is_cover' => (bool)($ir['is_cover'] ?? false),
                    'width_px' => isset($ir['width_px']) ? (int)$ir['width_px'] : null,
                    'height_px' => isset($ir['height_px']) ? (int)$ir['height_px'] : null,
                    'mime_type' => $ir['mime_type'] ?? null,
                    'file_size_kb' => isset($ir['file_size_kb']) ? (float)$ir['file_size_kb'] : null,
                    'created_at' => $ir['created_at'] ?? null,
                ];
            }
            $item['images'] = $images;
        } catch (Throwable $e) {
            // silently ignore if table/column missing
            $item['images'] = [];
        }

        $items[] = $item;
    }

    // ETag support (weak hash of content + total + page info)
    $payloadForEtag = json_encode([$items,$total,$page,$pageSize,$sort,$order], JSON_UNESCAPED_UNICODE);
    $etag = 'W/"'.substr(hash('sha256',$payloadForEtag),0,32).'"';
    $ifNoneMatch = $_SERVER['HTTP_IF_NONE_MATCH'] ?? '';
    header('Cache-Control: public, max-age=300, stale-while-revalidate=600');
    header('ETag: '.$etag);
    header('Content-Type: application/json; charset=utf-8');
    if($ifNoneMatch === $etag){ http_response_code(304); exit; }

    $resp = [
        'meta'=>[ 'page'=>$page,'pageSize'=>$pageSize,'total'=>$total ],
        'items'=>$items,
    ];
    if($debug && $debugInfo!==null){ $resp['_debug'] = $debugInfo; }
    echo json_encode($resp, JSON_UNESCAPED_UNICODE);

}catch(PDOException $e){
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error'=>'Database error: '.$e->getMessage()]);
}
?>
