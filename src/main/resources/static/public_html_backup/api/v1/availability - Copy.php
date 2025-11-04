<?php
require_once __DIR__ . '/../common.php';

// Query params
$checkIn  = isset($_GET['check_in']) ? must_date($_GET['check_in'], 'check_in') : null;
$checkOut = isset($_GET['check_out']) ? must_date($_GET['check_out'], 'check_out') : null;
if (!$checkIn || !$checkOut) { json_out(['error'=>'missing_params','message'=>'check_in and check_out required'],400); exit; }
$rooms = max(1, (int)($_GET['rooms'] ?? 1));
$guests = max(1, (int)($_GET['guests'] ?? (int)($_GET['adults'] ?? 1)));
$isPrivate = isset($_GET['is_private']) ? (($_GET['is_private']==='1'||$_GET['is_private']===1)?1:0) : null;
$limit = min(50, max(1, (int)($_GET['limit'] ?? 20)));
$offset = max(0, (int)($_GET['offset'] ?? 0));
$sort = $_GET['sort'] ?? 'name_asc'; // price_asc|price_desc|name_asc

$stayDates = dates_between($checkIn, $checkOut);
if (empty($stayDates)) { json_out(['error'=>'invalid_dates','message'=>'check_out must be after check_in'],400); exit; }
$nights = count($stayDates);

// Build availability with daily inventory (A1, A2) and capacity checks
$whereIsPrivate = ($isPrivate===null) ? '' : ' AND COALESCE(rt.is_private,0) = :is_private ';

// Count eligible room types
$sqlCount = <<<SQL
WITH RECURSIVE nights AS (
    SELECT DATE(:check_in) AS d
    UNION ALL
    SELECT DATE_ADD(d, INTERVAL 1 DAY)
    FROM nights
    WHERE DATE_ADD(d, INTERVAL 1 DAY) < DATE(:check_out)
),
avail AS (
    SELECT r.room_type_id,
                 MIN(GREATEST(COALESCE(r.total_qty,0) - COALESCE(r.reserved_qty,0) - COALESCE(r.booked_qty,0), 0)) AS min_available,
                 COUNT(*) AS nights_covered
    FROM room_type_inventory_daily r
    JOIN nights n ON n.d = r.stay_date
    GROUP BY r.room_type_id
)
SELECT COUNT(*)
FROM room_types rt
JOIN avail a ON a.room_type_id = rt.id
WHERE rt.is_active = 1
    {$whereIsPrivate}
    AND a.nights_covered = :nights
    AND (
        (COALESCE(rt.is_private,0) = 1 AND (:rooms * COALESCE(rt.max_adults,0)) >= :guests AND a.min_available >= :rooms)
        OR
        (COALESCE(rt.is_private,0) = 0 AND a.min_available >= :guests)
    )
SQL;

$stmt = $pdo->prepare($sqlCount);
$stmt->bindValue(':check_in', $checkIn, PDO::PARAM_STR);
$stmt->bindValue(':check_out', $checkOut, PDO::PARAM_STR);
$stmt->bindValue(':nights', (int)$nights, PDO::PARAM_INT);
$stmt->bindValue(':rooms', (int)$rooms, PDO::PARAM_INT);
$stmt->bindValue(':guests', (int)$guests, PDO::PARAM_INT);
if ($isPrivate!==null) { $stmt->bindValue(':is_private', (int)$isPrivate, PDO::PARAM_INT); }
$stmt->execute();
$total = (int)$stmt->fetchColumn();

// Fetch eligible room types page
$sql = <<<SQL
WITH RECURSIVE nights AS (
    SELECT DATE(:check_in) AS d
    UNION ALL
    SELECT DATE_ADD(d, INTERVAL 1 DAY)
    FROM nights
    WHERE DATE_ADD(d, INTERVAL 1 DAY) < DATE(:check_out)
),
avail AS (
    SELECT r.room_type_id,
                 MIN(GREATEST(COALESCE(r.total_qty,0) - COALESCE(r.reserved_qty,0) - COALESCE(r.booked_qty,0), 0)) AS min_available,
                 COUNT(*) AS nights_covered
    FROM room_type_inventory_daily r
    JOIN nights n ON n.d = r.stay_date
    GROUP BY r.room_type_id
)
SELECT rt.id, COALESCE(rt.is_private,0) AS is_private, rt.code, rt.name_th, rt.name_en, rt.area_sqm,
             rt.base_inventory, rt.max_adults, rt.max_children, rt.image_dir_path,
             a.min_available, a.nights_covered
FROM room_types rt
JOIN avail a ON a.room_type_id = rt.id
WHERE rt.is_active = 1
    {$whereIsPrivate}
    AND a.nights_covered = :nights
    AND (
        (COALESCE(rt.is_private,0) = 1 AND (:rooms * COALESCE(rt.max_adults,0)) >= :guests AND a.min_available >= :rooms)
        OR
        (COALESCE(rt.is_private,0) = 0 AND a.min_available >= :guests)
    )
ORDER BY CASE WHEN :s='name_desc' THEN (CASE WHEN rt.name_en<>'' THEN rt.name_en ELSE rt.name_th END) END DESC,
                 (CASE WHEN rt.name_en<>'' THEN rt.name_en ELSE rt.name_th END) ASC
LIMIT :limit OFFSET :offset
SQL;

$stmt = $pdo->prepare($sql);
$stmt->bindValue(':check_in', $checkIn, PDO::PARAM_STR);
$stmt->bindValue(':check_out', $checkOut, PDO::PARAM_STR);
$stmt->bindValue(':nights', (int)$nights, PDO::PARAM_INT);
$stmt->bindValue(':rooms', (int)$rooms, PDO::PARAM_INT);
$stmt->bindValue(':guests', (int)$guests, PDO::PARAM_INT);
if ($isPrivate!==null) { $stmt->bindValue(':is_private', (int)$isPrivate, PDO::PARAM_INT); }
$stmt->bindValue(':s', $sort, PDO::PARAM_STR);
$stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
$stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
$stmt->execute();
$roomTypes = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];

// Helper to load images per room type
function load_images($pdo, $rtId, $imageDir){
    $stmt = $pdo->prepare('SELECT id, file_name, is_cover, sort_order, width_px, height_px, mime_type FROM room_type_images WHERE room_type_id = :id ORDER BY is_cover DESC, sort_order ASC, id ASC');
    $stmt->execute([':id'=>(int)$rtId]);
    $rows = $stmt->fetchAll(PDO::FETCH_ASSOC) ?: [];
    $images=[]; $dir = $imageDir ? rtrim($imageDir,'/') : '';
    foreach($rows as $r){
        $file = $r['file_name'] ?? '';
        $rel = ltrim($dir? $dir.'/'.$file : $file, '/');
        $images[] = [
            'id'=>(int)$r['id'],
            'file_name'=>$file,
            'is_cover'=> (bool)($r['is_cover'] ?? 0),
            'sort_order'=> isset($r['sort_order'])?(int)$r['sort_order']:null,
            'width_px'=> isset($r['width_px'])?(int)$r['width_px']:null,
            'height_px'=> isset($r['height_px'])?(int)$r['height_px']:null,
            'mime_type'=> $r['mime_type'] ?? null,
            'url'=> $rel? toPublicUrl_common($rel) : null,
        ];
    }
    return $images;
}

// Helper to load amenities join table
function load_amenities($pdo, $rtId){
    $sql = 'SELECT a.id, a.code, a.name_th, a.name_en, a.icon_dir_path, a.is_active
            FROM room_type_amenities rta 
            JOIN amenities a ON a.id = rta.amenity_id
            WHERE rta.room_type_id = :id AND a.is_active = 1 
            ORDER BY a.id ASC';
    try{ 
        $st=$pdo->prepare($sql); 
        $st->execute([':id'=>(int)$rtId]); 
        $rows = $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
        // Add web-accessible icon URL - detect environment for correct path
        foreach($rows as &$row){
            $iconPath = $row['icon_dir_path'] ?? null;
            if (!$iconPath) { $row['icon'] = null; continue; }
            $raw = ltrim((string)$iconPath, '/');
            
            // Detect environment: is this localhost or production?
            $host = $_SERVER['HTTP_HOST'] ?? '';
            $isLocalhost = (strpos($host, 'localhost') !== false || strpos($host, '127.0.0.1') !== false);
            
            // Determine base URL
            $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
            $baseUrl = $scheme . '://' . $host;
            
            if (preg_match('#^https?://#i', $iconPath)) {
                // Already absolute URL
                $row['icon'] = $iconPath;
            } elseif (strpos($raw, 'assets/image/') === 0) {
                // Static site icons under /assets/image/amenities/...
                // Localhost: use production absolute URL; Production: use relative path
                if ($isLocalhost) {
                    $row['icon'] = 'https://www.backpackkohyao.com/' . $raw;
                } else {
                    $row['icon'] = '/' . $raw;
                }
            } elseif (strpos($raw, 'static/public/') === 0) {
                // Legacy: Map filesystem path to web root (strip 'static/')
                $row['icon'] = $baseUrl . '/' . substr($raw, strlen('static/'));
            } elseif (strpos($raw, 'public/') === 0) {
                // Root-relative path for site-bundled icons
                $row['icon'] = $baseUrl . '/' . $raw;
            } elseif (strpos($raw, 'assets/uploads/') === 0) {
                // Uploaded assets may live on CDN; use absolute URL helper
                $row['icon'] = toPublicUrl_common($raw);
            } else {
                // Fallback: treat as web-root relative
                $row['icon'] = $baseUrl . '/' . $raw;
            }
        }
        return $rows;
    }catch(Throwable $e){ 
        return []; 
    }
}
function load_bathroom_items($pdo,$rtId){
    $sql = 'SELECT b.id, b.code, b.item_th, b.item_en, b.active
            FROM room_bathroom_items rbi JOIN bathroom_items b ON b.id = rbi.item_id
            WHERE rbi.room_type_id = :id AND b.active = 1 ORDER BY b.id ASC';
    try{ $st=$pdo->prepare($sql); $st->execute([':id'=>(int)$rtId]); return $st->fetchAll(PDO::FETCH_ASSOC) ?: []; }catch(Throwable $e){ return []; }
}

// Load rate plans per room type
function load_rate_plans($pdo, $rtId){
    $st = $pdo->prepare('SELECT id, name, description_th, description_en, base_price_minor, base_currency, tax_included, refundable, cancellation_policy, meal_plan FROM rate_plans WHERE room_type_id = :id ORDER BY id ASC');
    $st->execute([':id'=>(int)$rtId]);
    return $st->fetchAll(PDO::FETCH_ASSOC) ?: [];
}

// Load overrides for a set of dates (single room_type + plan)
function load_overrides_map($pdo, $rtId, $planId, array $dates): array {
    if (empty($dates)) return [];
    $in = implode(',', array_fill(0, count($dates), '?'));
    $sql = "SELECT stay_date, price_minor, tax_included FROM rate_plan_prices WHERE room_type_id = ? AND rate_plan_id = ? AND stay_date IN ($in)";
    $params = array_merge([(int)$rtId, (int)$planId], $dates);
    $st = $pdo->prepare($sql); $st->execute($params);
    $map = [];
    while($row=$st->fetch(PDO::FETCH_ASSOC)){
        $map[$row['stay_date']] = ['price_minor'=>(int)$row['price_minor'], 'tax_included'=> (int)$row['tax_included']];
    }
    return $map;
}

$items = [];
foreach ($roomTypes as $rt) {
    $rtId = (int)$rt['id'];
    $ratePlans = load_rate_plans($pdo, $rtId);

    $plansOut = [];
    $cheapest = null; // for sorting
    foreach ($ratePlans as $rp) {
        $overMap = load_overrides_map($pdo, $rtId, (int)$rp['id'], $stayDates);
        $datesOut = [];
        foreach ($stayDates as $d){
            if (isset($overMap[$d])) {
                $datesOut[] = [ 'stay_date'=>$d, 'price_minor'=>(int)$overMap[$d]['price_minor'], 'tax_included'=>(int)$overMap[$d]['tax_included'], 'source'=>'override' ];
            } else {
                $datesOut[] = [ 'stay_date'=>$d, 'price_minor'=>(int)$rp['base_price_minor'], 'tax_included'=>(int)($rp['tax_included'] ?? 0), 'source'=>'base' ];
            }
        }
        $min = min(array_column($datesOut,'price_minor'));
        $max = max(array_column($datesOut,'price_minor'));
        $plansOut[] = [
            'id'=>(int)$rp['id'],
            'name'=>$rp['name'],
            'description_th'=>$rp['description_th'] ?? null,
            'description_en'=>$rp['description_en'] ?? null,
            'base_price_minor'=>(int)$rp['base_price_minor'],
            'base_currency'=>$rp['base_currency'] ?? 'THB',
            'tax_included'=>(int)($rp['tax_included'] ?? 0),
            'refundable'=> (int)($rp['refundable'] ?? 0),
            'cancellation_policy'=>$rp['cancellation_policy'] ?? null,
            'meal_plan'=>$rp['meal_plan'] ?? null,
            'pricing'=>[
                'nights'=>$nights,
                'dates'=>$datesOut,
                'min_price_minor'=>$min,
                'max_price_minor'=>$max,
            ],
        ];
        $cheapest = $cheapest===null? $min : min($cheapest,$min);
    }

    // Sort key for price
    $sortKey = $cheapest ?? PHP_INT_MAX;

    $images = load_images($pdo, $rtId, $rt['image_dir_path'] ?? '');
    $amenities = load_amenities($pdo, $rtId);
    $bathroom = load_bathroom_items($pdo, $rtId);

    // Compute units required and capacity flag for UX messaging (non-breaking extra fields)
    $isPriv = (int)($rt['is_private'] ?? 0);
    $maxAdults = isset($rt['max_adults']) ? (int)$rt['max_adults'] : 0;
    $unitsRequired = ($isPriv === 1) ? (int)$rooms : (int)$guests; // Private: rooms; Dorm: guests
    $capacityOk = ($isPriv === 1) ? (($rooms * $maxAdults) >= $guests) : true;
    $minAvailable = isset($rt['min_available']) ? (int)$rt['min_available'] : null;

    $items[] = [
        'sort_price_minor'=>$sortKey,
        'room_type'=>[
            'id'=>$rtId,
            'is_private'=>(int)$rt['is_private'],
            'code'=>$rt['code'] ?? null,
            'name_th'=>$rt['name_th'] ?? null,
            'name_en'=>$rt['name_en'] ?? null,
            'area_sqm'=> isset($rt['area_sqm'])? (float)$rt['area_sqm'] : null,
            'base_inventory'=> isset($rt['base_inventory'])? (int)$rt['base_inventory'] : null,
            'max_adults'=> isset($rt['max_adults'])? (int)$rt['max_adults'] : null,
            'max_children'=> isset($rt['max_children'])? (int)$rt['max_children'] : null,
            'image_dir_path'=>$rt['image_dir_path'] ?? null,
        ],
        'images'=>$images,
        'amenities'=>$amenities,
        'bathroom_items'=>$bathroom,
        'rate_plans'=>$plansOut,
        'availability'=>[
            'min_available'=>$minAvailable,
            'units_required'=>$unitsRequired,
            'capacity_ok'=>$capacityOk,
            'nights'=>$nights,
        ],
    ];
}

// Sort if price_asc/desc
if ($sort==='price_asc') { usort($items, fn($a,$b)=>($a['sort_price_minor']<=>$b['sort_price_minor'])); }
if ($sort==='price_desc') { usort($items, fn($a,$b)=>($b['sort_price_minor']<=>$a['sort_price_minor'])); }

// Strip helper key
foreach($items as &$it){ unset($it['sort_price_minor']); }

json_out([
    'meta'=>[
        'check_in'=>$checkIn,
        'check_out'=>$checkOut,
        'nights'=>$nights,
        'rooms'=>$rooms,
        'guests'=>$guests,
        'is_private'=>$isPrivate,
        'total'=>$total,
        'limit'=>$limit,
        'offset'=>$offset,
        'sort'=>$sort,
    ],
    'items'=>$items,
]);
