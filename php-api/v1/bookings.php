<?php
require_once __DIR__ . '/../common.php';

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
  json_out(['error' => 'method_not_allowed'], 405);
  exit;
}

$raw = file_get_contents('php://input');
$payload = json_decode($raw, true);
if (!is_array($payload)) {
  json_out(['error' => 'invalid_json'], 400);
  exit;
}

// Small helper: safe array getters
function ig($a, $k, $def=null){ return (is_array($a) && array_key_exists($k,$a)) ? $a[$k] : $def; }

// Basic validation
$cart   = ig($payload, 'cart', []);
$policy = ig($payload, 'policy', []);
$guForm = ig($payload, 'guest_form', []);
$requests = ig($payload, 'requests', []);
$channel = (string) ig($payload, 'channel', 'WEBSITE');
$createdBy = (string) ig($payload, 'created_by', 'website');

if (!$policy || empty($policy['agreed_terms'])) {
  json_out(['error' => 'must_agree_terms'], 400);
  exit;
}

// Resolve policy_id: prefer payload.policy_id, otherwise pick the latest active term
$policyId = ig($policy, 'policy_id');
if (!$policyId) {
  try {
    $stmt = $pdo->query("SELECT policy_id FROM booking_terms WHERE is_active = 1 ORDER BY effective_from DESC LIMIT 1");
    $pid = $stmt ? $stmt->fetchColumn() : null;
    if ($pid) { $policyId = (int)$pid; }
  } catch (Throwable $e) {
    // ignore here; will be validated below
  }
}
if (!$policyId) {
  json_out(['error' => 'missing_policy', 'detail' => 'No active booking policy found'], 400);
  exit;
}

$checkIn  = ig($cart, 'check_in_date');
$checkOut = ig($cart, 'check_out_date');
$currency = ig($cart, 'currency', 'THB');
// Nights is a generated column in DB (DATEDIFF or similar). Do NOT insert explicitly.
// Always compute server-side to avoid trusting client payload and to match DB value.
$nights = 0;
if (preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$checkIn) && preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$checkOut)) {
  try {
    $ci = new DateTime($checkIn);
    $co = new DateTime($checkOut);
    $diff = $ci->diff($co);
    $nights = max(0, (int)$diff->days);
  } catch (Throwable $e) {
    // Fallback to client-provided nights if diff fails (should rarely happen)
    $nights = intval(ig($cart, 'nights', 0));
  }
} else {
  // fallback path prior to validation below
  $nights = intval(ig($cart, 'nights', 0));
}
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$checkIn) || !preg_match('/^\d{4}-\d{2}-\d{2}$/', (string)$checkOut)) {
  json_out(['error' => 'invalid_dates'], 400);
  exit;
}

$sum = ig($cart, 'summary_minor', []);

try {
  $pdo->beginTransaction();

  // 1) Generate booking_ref: YYYYMMDD + running 8 digits
  $today = date('Ymd');
  $prefix = $today;
  $ref = null; $attempts = 0;
  do {
    $sql = "SELECT booking_ref FROM bookings WHERE booking_ref LIKE :pfx ORDER BY booking_ref DESC LIMIT 1";
    $stmt = $pdo->prepare($sql); $stmt->execute([':pfx' => $prefix.'%']);
    $latest = $stmt->fetchColumn();
    $next = 1;
    if ($latest) { $next = intval(substr($latest, 8)) + 1; }
    $candidate = $prefix . str_pad((string)$next, 8, '0', STR_PAD_LEFT);

    // Try to reserve by inserting minimal row into a shadow temp table? Not available → depend on unique index.
    // We'll set it and attempt insert of bookings; on duplicate, loop (up to small attempts).
    $ref = $candidate;

    // Check uniqueness proactively if unique key exists
    $stmt = $pdo->prepare('SELECT COUNT(*) FROM bookings WHERE booking_ref = :r');
    $stmt->execute([':r' => $ref]);
    $exists = intval($stmt->fetchColumn()) > 0;
    if (!$exists) break;

    $attempts++;
    if ($attempts > 5) { // fallback to timestamp-based suffix to avoid blocking
      $ref = $prefix . substr(strval((int)(microtime(true)*1000)), -8);
      break;
    }
  } while (true);

  // 2) Insert into bookings (head)
  $sql = "INSERT INTO bookings (
      booking_ref, status, policy_id,
      check_in_date, check_out_date,
      currency,
      room_charge, service_charge, fee, vat, local_tax,
      room_total_minor, taxes_total_minor, grand_total_minor, pay_now_minor,
      terms_version, agreed_terms, channel, created_by, updated_by
    ) VALUES (
      :booking_ref, 'PENDING', :policy_id,
      :check_in, :check_out,
      :currency,
      :room_charge, :service_charge, :fee, :vat, :local_tax,
      :room_total_minor, :taxes_total_minor, :grand_total_minor, :pay_now_minor,
      :terms_version, :agreed_terms, :channel, :created_by, :updated_by
    )";
  $stmt = $pdo->prepare($sql);
  $stmt->execute([
    ':booking_ref' => $ref,
  ':policy_id'   => $policyId,
  ':check_in'    => $checkIn,
  ':check_out'   => $checkOut,
    ':currency'    => $currency,
    ':room_charge' => intval(ig($sum,'room_charge',0)),
    ':service_charge' => intval(ig($sum,'service_charge',0)),
    ':fee'         => intval(ig($sum,'fee',0)),
    ':vat'         => intval(ig($sum,'vat',0)),
    ':local_tax'   => intval(ig($sum,'local_tax',0)),
    ':room_total_minor' => intval(ig($sum,'room_total_minor',0)),
    ':taxes_total_minor' => intval(ig($sum,'taxes_total_minor',0)),
    ':grand_total_minor' => intval(ig($sum,'grand_total_minor',0)),
    ':pay_now_minor'     => intval(ig($sum,'pay_now_minor',0)),
    ':terms_version' => (string)ig($policy,'terms_version',''),
    ':agreed_terms'  => ig($policy,'agreed_terms') ? 1 : 0,
    ':channel'       => $channel,
    ':created_by'    => $createdBy,
    ':updated_by'    => $createdBy,
  ]);
  $bookingId = intval($pdo->lastInsertId());

  // Persist nights value if column exists and is intended to store the computed nights
  try {
    $stmtUpd = $pdo->prepare('UPDATE bookings SET nights = :n WHERE id = :id');
    $stmtUpd->execute([':n' => $nights, ':id' => $bookingId]);
  } catch (Throwable $e) {
    // non-fatal; continue (column may be absent in some environments)
  }

  // 3) Load tax config for server-side calculation
  $taxConfig = [];
  try {
    $stmt = $pdo->query("SELECT service_charge_pct, vat_pct, vat_base, local_tax_amount, local_tax_unit, fee_value, fee_unit, fee_base, fee_type FROM property_tax_config WHERE is_active = 1 LIMIT 1");
    $taxConfig = $stmt ? $stmt->fetch(PDO::FETCH_ASSOC) : [];
  } catch (Throwable $e) {
    // fallback to empty if table missing
  }
  
  $serviceChargePct = floatval(ig($taxConfig, 'service_charge_pct', 0));
  $vatPct = floatval(ig($taxConfig, 'vat_pct', 0));
  $vatBase = strtoupper((string)ig($taxConfig, 'vat_base', 'ROOM_PLUS_SERVICE'));
  $vatIncludeFee = ($vatBase === 'ROOM_PLUS_SERVICE_FEE');
  
  // ✅ After migration: local_tax_amount and fee_value are in minor units (satang)
  $localTaxAmountMinor = intval(ig($taxConfig, 'local_tax_amount', 0)); // e.g., 5000 = 50.00 THB
  $localTaxUnit = strtoupper((string)ig($taxConfig, 'local_tax_unit', 'PER_BOOKING'));
  $feeValueRaw = intval(ig($taxConfig, 'fee_value', 0)); // FIXED: minor units, PERCENT: basis points
  $feeUnit = strtoupper((string)ig($taxConfig, 'fee_unit', 'PER_BOOKING'));
  $feeBase = strtoupper((string)ig($taxConfig, 'fee_base', 'ROOM_ONLY'));
  $feeType = strtoupper((string)ig($taxConfig, 'fee_type', 'FIXED'));

  // ---------- Helpers (modular) ----------
  $roundMinor = function($v){ return intval(round($v, 0, PHP_ROUND_HALF_UP)); };
  $mapUnitToScope = function($unit){
    $u = strtoupper((string)$unit);
    if($u==='PER_BOOKING') return 'ORDER';
    // PERCENT หรือหน่วยรายห้อง/รายคน → ITEM
    return 'ITEM';
  };
  $computeQty = function($unit, $ctx){
    $u = strtoupper((string)$unit);
    $nights = intval($ctx['nights'] ?? 0);
    $totalRooms = intval($ctx['total_rooms'] ?? 0);
    $totalPax = intval($ctx['total_pax'] ?? 0);
    switch($u){
      case 'PERCENT':
      case 'PER_BOOKING': return 1;
      case 'PER_ROOM_PER_NIGHT': return $totalRooms * $nights;
      case 'PER_ROOM_PER_STAY': return $totalRooms;
      case 'PER_PERSON_PER_NIGHT': return $totalPax * $nights;
      case 'PER_PERSON_PER_STAY': return $totalPax;
      default: return 1;
    }
  };

  // 4) booking_items + nights (Bottom-Up Calculation)
  $itemsMap = [];
  $items = ig($cart,'items',[]);
  if (!is_array($items)) $items = [];

  // ตัวแปรสำหรับ rollup ไปยัง bookings (คุมเฉพาะค่าห้องรวมต่อบิลจาก nights)
  $bookingRoomCharge = 0;

  $stmtItem = $pdo->prepare("INSERT INTO booking_items (
      booking_id, room_type_id, rate_plan_id, unit_type, quantity, pax_adults, pax_children,
      line_subtotal_minor, line_charge_minor, line_total_minor, created_by, updated_by
    ) VALUES (
      :booking_id, :room_type_id, :rate_plan_id, :unit_type, :quantity, :pax_adults, :pax_children,
      :line_subtotal_minor, :line_charge_minor, :line_total_minor, :created_by, :updated_by
    )");

  $stmtNight = $pdo->prepare("INSERT INTO booking_item_nights (
      booking_item_id, stay_date, quantity, base_price_minor, charge_minor, total_minor, rate_source, created_by, updated_by
    ) VALUES (
      :booking_item_id, :stay_date, :quantity, :base_price_minor, :charge_minor, :total_minor, :rate_source, :created_by, :updated_by
    )");

  $totalRoomsForQty = 0; // ใช้รวมจำนวนห้อง/เตียงทั้งหมด
  $totalPaxForQty = 0;   // pax รวมแบบ SUM (ใช้กรณีที่แจกแจงคนต่อ item)
  $sumPaxAdults = 0; $sumPaxChildren = 0; // สำหรับตรวจรูปแบบข้อมูล
  $firstPaxAdults = null; $firstPaxChildren = null; $allItemsSamePax = true; // ใช้ตัดสินใจว่าจะ SUM หรือใช้ค่าเดียว

  // ---- Step A: Pre-fetch capacity (max_adults,max_children) for all room_type_ids to allocate pax correctly ----
  $roomTypeIds = [];
  foreach ($items as $it){
    $rtid = intval(ig($it,'room_type_id',0));
    if ($rtid>0) $roomTypeIds[$rtid] = true;
  }
  $capacityMap = [];
  if ($roomTypeIds){
    $in = implode(',', array_map('intval', array_keys($roomTypeIds)));
    try {
      $capStmt = $pdo->query("SELECT id, COALESCE(max_adults,1) AS max_adults, COALESCE(max_children,0) AS max_children FROM room_types WHERE id IN ($in)");
      while($cr = $capStmt->fetch(PDO::FETCH_ASSOC)){
        $capacityMap[intval($cr['id'])] = [ 'max_adults'=>intval($cr['max_adults']), 'max_children'=>intval($cr['max_children']) ];
      }
    } catch (Throwable $e) { /* ignore; fallback to defaults */ }
  }

  // ---- Step B: If front-end provided a global adults count (cart.adults) use it; otherwise infer from items ----
  $requestedAdults = intval(ig($cart,'adults',0));
  $requestedChildren = intval(ig($cart,'children',0)); // future use
  if ($requestedAdults <= 0){
    // infer: if items have pax_adults individually and not all identical duplicates we sum; else use first * count?
    $tmpAdults = 0;
    foreach($items as $it){ $tmpAdults += max(0,intval(ig($it,'pax_adults',0))); }
    if ($tmpAdults>0) $requestedAdults = $tmpAdults; else $requestedAdults = 0; // will allocate below
  }

  // Strategy:
  //  - For each input item representing a unit (room or bed), we allocate pax into that item up to its capacity.
  //  - If the user asked for more adults than there are explicit items, we continue allocating until exhausted.
  //  - If incoming item already has a meaningful pax_adults ( >0 and <= capacity ) we keep it and decrement remaining.
  //  - If incoming item has pax_adults >= requestedAdults repeated across all, we treat them as placeholders and reallocate 1 (for beds) or capacity chunk.

  $remainingAdults = $requestedAdults;

  // Detect pattern: all items have identical pax_adults equal to requestedAdults (classic duplication bug) → force reallocation
  $allSameDup = true; $firstPax = null; $countItems = count($items);
  foreach($items as $it){
    $pa = intval(ig($it,'pax_adults',0));
    if ($firstPax === null) $firstPax = $pa; else if ($firstPax !== $pa) { $allSameDup = false; break; }
  }
  if (!($firstPax !== null && $firstPax === $requestedAdults && $allSameDup && $countItems>1)) {
    // not the pathological duplicate case → keep existing where valid and subtract
    foreach($items as $idx=>$it){
      $rtid = intval(ig($it,'room_type_id',0));
      $cap = $capacityMap[$rtid] ?? ['max_adults'=>1,'max_children'=>0];
      $given = intval(ig($it,'pax_adults',0));
      if ($given>0 && $given <= $cap['max_adults'] && $remainingAdults>0){
        $alloc = min($given, $remainingAdults);
        $items[$idx]['__alloc_adults'] = $alloc;
        $remainingAdults -= $alloc;
      }
    }
  }
  // Allocate remaining adults greedily by capacity order
  if ($remainingAdults>0){
    foreach($items as $idx=>$it){
      if ($remainingAdults<=0) break;
      if (isset($items[$idx]['__alloc_adults'])) continue; // already set
      $rtid = intval(ig($it,'room_type_id',0));
      $cap = $capacityMap[$rtid] ?? ['max_adults'=>1,'max_children'=>0];
      $take = min($cap['max_adults'], $remainingAdults);
      $items[$idx]['__alloc_adults'] = $take;
      $remainingAdults -= $take;
    }
  }
  // Any leftover (shouldn't happen) → ignore or attach to first
  if ($remainingAdults>0 && $items){
    $items[0]['__alloc_adults'] = ($items[0]['__alloc_adults'] ?? 0) + $remainingAdults;
    $remainingAdults = 0;
  }

  foreach ($items as $it) {
    // Normalize unit type to DB enum ('ROOM','DORM_BED')
    $unit = strtoupper((string)ig($it,'unit_type','ROOM'));
    if ($unit !== 'ROOM' && $unit !== 'DORM_BED') { $unit = ($unit === 'BED') ? 'DORM_BED' : 'ROOM'; }
    
    $qty = intval(ig($it,'quantity',1));
  // Use allocated adults; fallback to original (bounded by capacity 1) if not allocated
  $rtCap = $capacityMap[intval(ig($it,'room_type_id',0))] ?? ['max_adults'=>1,'max_children'=>0];
  $paxAdults = intval($it['__alloc_adults'] ?? ig($it,'pax_adults',0));
  if ($paxAdults > $rtCap['max_adults']) $paxAdults = $rtCap['max_adults'];
  if ($paxAdults < 0) $paxAdults = 0;
  // For current flow children not provided → force 0 (extensible later)
  $paxChildren = 0;
    
    // คำนวณ line_subtotal จาก base_price (ยังไม่รวมภาษี)
    $lineSubtotal = 0;
    
    $nightsArr = ig($it,'nights',[]);
    if (is_array($nightsArr)){
      foreach ($nightsArr as $n) {
        $nightQty = intval(ig($n,'quantity',1));
        $basePrice = intval(ig($n,'base_price_minor',0));
        $lineSubtotal += ($basePrice * $nightQty);
      }
    }
    
  // taxes ต่อ item = SC + VAT (ห้ามรวม local/fee)
  $lineTaxes = 0;
  $lineSC = 0;  // ใช้เก็บ SC รวมของ item นี้ (จากคืน)
  $lineVAT = 0; // ใช้เก็บ VAT รวมของ item นี้ (จากคืน)
    $lineTotal = $lineSubtotal;
    
    // บันทึก booking_items ด้วยค่าที่คำนวณจาก booking_item_nights
    $stmtItem->execute([
      ':booking_id' => $bookingId,
      ':room_type_id' => intval(ig($it,'room_type_id')),
      ':rate_plan_id' => intval(ig($it,'rate_plan_id')),
      ':unit_type'    => $unit,
      ':quantity'     => intval(ig($it,'quantity',1)),
  ':pax_adults'   => $paxAdults,
  ':pax_children' => $paxChildren,
      ':line_subtotal_minor' => $lineSubtotal,  // ← คำนวณจาก nights
      ':line_charge_minor'   => $lineTaxes,     // ← SC+VAT เท่านั้น
      ':line_total_minor'    => $lineTotal,     // ← คำนวณจาก nights
      ':created_by'    => $createdBy,
      ':updated_by'    => $createdBy,
    ]);
    $itemId = intval($pdo->lastInsertId());
  $itemsMap[] = $itemId;

  // เก็บยอดสะสมและตัวเลขสำหรับคำนวณภาษี/ค่าธรรมเนียม
  $totalRoomsForQty += $qty; // ใช้จำนวน quantity ตรง ๆ
  $totalPaxForQty += ($paxAdults + $paxChildren); // แบบรวมทุก item (อาจจะซ้ำถ้า front-end ใส่ pax ทั้งหมดทุก item)
  $sumPaxAdults += $paxAdults; $sumPaxChildren += $paxChildren;
  if ($firstPaxAdults === null) { $firstPaxAdults = $paxAdults; $firstPaxChildren = $paxChildren; }
  else if ($firstPaxAdults !== $paxAdults || $firstPaxChildren !== $paxChildren) { $allItemsSamePax = false; }

    // บันทึก booking_item_nights พร้อมคำนวณ tax_minor ต่อคืน
    if (is_array($nightsArr)){
      foreach ($nightsArr as $n) {
        $nightQty = intval(ig($n,'quantity',1));
        $basePrice = intval(ig($n,'base_price_minor',0));
        
        // ========== คำนวณภาษีต่อคืนตามหลักการ ==========
        
        // 1. Room charge for this night (minor units)
        $roomChargeNight = $basePrice * $nightQty;
        
  // 2. Service charge ต่อคืน (คิดจากค่าห้อง)
  $serviceChargeNight = intval(round($roomChargeNight * $serviceChargePct / 100));
        
        // 3. VAT base (ขึ้นอยู่กับ vat_base config)
        $vatBaseAmountNight = 0;
        if ($vatBase === 'ROOM_PLUS_SERVICE') {
          $vatBaseAmountNight = $roomChargeNight + $serviceChargeNight;
        } else { // ROOM_ONLY
          $vatBaseAmountNight = $roomChargeNight;
        }
        
  // 4. VAT ต่อคืน
  $vatNight = intval(round($vatBaseAmountNight * $vatPct / 100));
        
        // 5. รวมเฉพาะภาษีระดับ ITEM เท่านั้น
        $taxMinorNight = $serviceChargeNight + $vatNight;
        
        // 6. Total amount per night (room + SC + VAT)
        $totalMinorNight = $roomChargeNight + $taxMinorNight;
        
        // INSERT ด้วยค่าที่คำนวณแล้ว
        $stmtNight->execute([
          ':booking_item_id' => $itemId,
          ':stay_date'       => ig($n,'stay_date'),
          ':quantity'        => $nightQty,
          ':base_price_minor'=> $basePrice,
          ':charge_minor'    => $taxMinorNight,
          ':total_minor'     => $totalMinorNight,
          ':rate_source'     => (string)ig($n,'rate_source','PLAN'),
          ':created_by'      => $createdBy,
          ':updated_by'      => $createdBy,
        ]);
        
        // เก็บค่าสะสมสำหรับ booking_items (SC+VAT เท่านั้น)
        $lineSC += $serviceChargeNight;
        $lineVAT += $vatNight;
        $lineTaxes += $taxMinorNight;
      }
    }
    
    // Update booking_items ด้วยค่าที่คำนวณจาก nights
    $lineTotal = $lineSubtotal + $lineTaxes;
    $sqlUpdateItem = "
      UPDATE booking_items
      SET line_charge_minor = :charges,
          line_total_minor = :total,
          updated_at = NOW()
      WHERE id = :item_id
    ";
    $pdo->prepare($sqlUpdateItem)->execute([
      ':charges' => $lineTaxes,
      ':total' => $lineTotal,
      ':item_id' => $itemId
    ]);
    
  // เก็บค่าสะสมสำหรับ bookings (room only จาก nights)
  $bookingRoomCharge += $lineSubtotal;
  }

  // หลังจบ loop ของ booking_items ทั้งหมด: สรุปผู้เข้าพักจริงแล้วจึงอัปเดตลง bookings
  // แก้ bug: เดิมอัปเดตภายใน loop ทำให้ค่าทับด้วยผลรวมก่อนหน้ารายการสุดท้าย → adults ขาดไป 1
  $allocatedAdults = $sumPaxAdults;        // รวมจริงทั้งหมดหลัง loop
  $allocatedChildren = $sumPaxChildren;    // ปัจจุบัน = 0 ใน flow นี้
  try {
    $stmtUpdGuests = $pdo->prepare("UPDATE bookings SET adults = :adults, children = :children WHERE id = :bid");
    $stmtUpdGuests->execute([':adults'=>$allocatedAdults, ':children'=>$allocatedChildren, ':bid'=>$bookingId]);
  } catch (Throwable $e) {
    // Column อาจยังไม่ถูกเพิ่มในบาง environment → ignore gracefully
  }

  // 4) booking_tax_lines - คำนวณใหม่ตามสเปคและบันทึกแบบ idempotent
  // ลบแถวเดิมของ booking นี้ก่อน
  try{ $pdo->prepare('DELETE FROM booking_tax_lines WHERE booking_id = :bid')->execute([':bid'=>$bookingId]); }catch(Throwable $e){ }

  $stmtTax = $pdo->prepare("INSERT INTO booking_tax_lines (
      booking_id, booking_item_id, scope, tax_type, base_amount_minor, rate_pct, unit, quantity, amount_minor, currency, vat_base, fee_base, local_tax_unit, created_by, updated_by
    ) VALUES (
      :booking_id, :booking_item_id, :scope, :tax_type, :base_amount_minor, :rate_pct, :unit, :quantity, :amount_minor, :currency, :vat_base, :fee_base, :local_tax_unit, :created_by, :updated_by
    )");

  // คำนวณ room_only ต่อ item จากค่าที่เราเพิ่งบันทึก
  // เรามี line_subtotal (room_only) ใน iteration ข้างบนแล้ว แต่เพื่อความชัดเจน อ่านจาก DB อีกครั้ง
  $itemRows = [];
  if (!empty($itemsMap)){
    $in = implode(',', array_fill(0, count($itemsMap), '?'));
    $st = $pdo->prepare("SELECT id, line_subtotal_minor, quantity FROM booking_items WHERE id IN ($in)");
    $st->execute($itemsMap);
    while($row = $st->fetch(PDO::FETCH_ASSOC)){
      $itemRows[] = [
        'id' => (int)$row['id'],
        'room_only_minor' => (int)$row['line_subtotal_minor'],
        'quantity' => (int)$row['quantity'],
      ];
    }
  }

  // สะสมยอดรวมฐานสำหรับบริการอื่น ๆ
  $totalRoomCharge = 0; // room_only รวม
  foreach($itemRows as $r){ $totalRoomCharge += $r['room_only_minor']; }

  // SERVICE_CHARGE → แถวต่อ ITEM
  $totalServiceCharge = 0;
  if($serviceChargePct > 0){
    foreach($itemRows as $r){
      $base = (int)$r['room_only_minor'];
      $amt  = $roundMinor($base * $serviceChargePct / 100);
      $totalServiceCharge += $amt;
      $stmtTax->execute([
        ':booking_id' => $bookingId,
        ':booking_item_id' => $r['id'],
        ':scope' => 'ITEM',
        ':tax_type' => 'SERVICE_CHARGE',
        ':base_amount_minor' => $base,
        ':rate_pct' => $serviceChargePct,
        ':unit' => 'PERCENT',
        ':quantity' => 1,
        ':amount_minor' => $amt,
        ':currency' => $currency,
        ':vat_base' => null,
        ':fee_base' => 'ROOM_ONLY',
        ':local_tax_unit' => null,
        ':created_by' => $createdBy,
        ':updated_by' => $createdBy,
      ]);
    }
  }

  // (ย้ายการคำนวณ VAT ไปหลังส่วน BOOKING_FEE เพื่อรองรับ vat_base = ROOM_PLUS_SERVICE_FEE)

  // ---------- LOCAL_TAX quantity calculation ----------
  // ใช้ bookings.adults ที่ allocation แล้วเป็นฐาน (ไม่ใช่ heuristic แบบเก่า)
  // เพื่อให้ตรงตามกติกา: PER_PERSON_PER_NIGHT = adults * nights, PER_PERSON_PER_STAY = adults
  $totalLocalTax = 0;
  if($localTaxAmountMinor > 0){
    $ctx = [ 'nights'=>$nights, 'total_rooms'=>$totalRoomsForQty, 'total_pax'=>($allocatedAdults + $allocatedChildren) ];
    $qty = $computeQty($localTaxUnit, $ctx);
    $totalLocalTax = $roundMinor($localTaxAmountMinor * $qty);
    $stmtTax->execute([
      ':booking_id' => $bookingId,
      ':booking_item_id' => null,
      ':scope' => 'ORDER',
      ':tax_type' => 'LOCAL_TAX',
      ':base_amount_minor' => (int)$localTaxAmountMinor,
      ':rate_pct' => null,
      ':unit' => $localTaxUnit,
      ':quantity' => (int)$qty,
      ':amount_minor' => (int)$totalLocalTax,
      ':currency' => $currency,
      ':vat_base' => null,
      ':fee_base' => null,
      ':local_tax_unit' => $localTaxUnit,
      ':created_by' => $createdBy,
      ':updated_by' => $createdBy,
    ]);
  }

  // BOOKING_FEE
  $totalFee = 0;
  if($feeType === 'FIXED'){
    if($feeValueRaw > 0){
      $ctx = [ 'nights'=>$nights, 'total_rooms'=>$totalRoomsForQty, 'total_pax'=>$totalPaxForQty ];
      $qty = $computeQty($feeUnit, $ctx);
      // ตาม expectation หลัก ๆ จะใช้ PER_BOOKING → qty=1 แถวเดียวระดับบิล
      $totalFee = $roundMinor($feeValueRaw * $qty);
      $stmtTax->execute([
        ':booking_id' => $bookingId,
        ':booking_item_id' => ($feeUnit==='PER_BOOKING'? null : null), // เก็บรวมระดับบิล
        ':scope' => ($feeUnit==='PER_BOOKING'? 'ORDER':'ORDER'),
        ':tax_type' => 'BOOKING_FEE',
        ':base_amount_minor' => (int)$feeValueRaw,
        ':rate_pct' => null,
        ':unit' => $feeUnit,
        ':quantity' => (int)$qty,
        ':amount_minor' => (int)$totalFee,
        ':currency' => $currency,
        ':vat_base' => null,
        ':fee_base' => $feeBase,
        ':local_tax_unit' => null,
        ':created_by' => $createdBy,
        ':updated_by' => $createdBy,
      ]);
    }
  } else { // PERCENT → รองรับทั้ง ORDER และ ITEM ตาม fee_unit
    if($feeValueRaw > 0){
      $feePct = $feeValueRaw / 100.0; // value in basis points → percent with 2 decimals
      if (strtoupper($feeUnit) === 'PER_BOOKING') {
        // สรุปฐานรวมทั้งบิล แล้วคิดเป็นหนึ่งแถวระดับ ORDER
        $baseSum = 0;
        foreach($itemRows as $r){
          $roomOnly = (int)$r['room_only_minor'];
          $scAmt    = $roundMinor($roomOnly * $serviceChargePct / 100);
          $baseSum += ($feeBase==='ROOM_PLUS_SERVICE') ? ($roomOnly + $scAmt) : $roomOnly;
        }
        $amt = $roundMinor($baseSum * ($feePct/100));
        $totalFee += $amt;
        $stmtTax->execute([
          ':booking_id' => $bookingId,
          ':booking_item_id' => null,
          ':scope' => 'ORDER',
          ':tax_type' => 'BOOKING_FEE',
          ':base_amount_minor' => $baseSum,
          ':rate_pct' => $feePct,
          ':unit' => 'PERCENT',
          ':quantity' => 1,
          ':amount_minor' => $amt,
          ':currency' => $currency,
          ':vat_base' => null,
          ':fee_base' => $feeBase,
          ':local_tax_unit' => null,
          ':created_by' => $createdBy,
          ':updated_by' => $createdBy,
        ]);
      } else {
        // ค่าเปอร์เซ็นต์คิดแยกต่อ ITEM ตามฐานที่กำหนด
        foreach($itemRows as $r){
          $roomOnly = (int)$r['room_only_minor'];
          $scAmt    = $roundMinor($roomOnly * $serviceChargePct / 100);
          $baseAmt  = ($feeBase==='ROOM_PLUS_SERVICE') ? ($roomOnly + $scAmt) : $roomOnly;
          $amt      = $roundMinor($baseAmt * ($feePct/100));
          $totalFee += $amt;
          $stmtTax->execute([
            ':booking_id' => $bookingId,
            ':booking_item_id' => $r['id'],
            ':scope' => 'ITEM',
            ':tax_type' => 'BOOKING_FEE',
            ':base_amount_minor' => $baseAmt,
            ':rate_pct' => $feePct, // เก็บเป็นเปอร์เซ็นต์ เช่น 2.5000
            ':unit' => 'PERCENT',
            ':quantity' => 1,
            ':amount_minor' => $amt,
            ':currency' => $currency,
            ':vat_base' => null,
            ':fee_base' => $feeBase,
            ':local_tax_unit' => null,
            ':created_by' => $createdBy,
            ':updated_by' => $createdBy,
          ]);
        }
      }
    }
  }

  // VAT → แถวต่อ ITEM (ฐานขึ้นกับ vat_base)
  $totalVat = 0;
  if($vatPct > 0){
    // เดิมเคยบวก FEE เข้า ITEM base เมื่อ vat_base = ROOM_PLUS_SERVICE_FEE
    // ตามสเปคใหม่: ห้ามบวก FEE เข้าฐาน VAT ระดับ ITEM ให้คิด VAT บน FEE แยกเป็นระดับ ORDER แถวเดียว
    $feeAllocations = [];
    if (false && $vatIncludeFee && $feeType === 'FIXED' && strtoupper($feeUnit) === 'PER_BOOKING' && $totalFee > 0) {
      $remaining = $totalFee;
      $count = count($itemRows);
      foreach($itemRows as $idx => $r){
        $share = ($totalRoomCharge > 0) ? ($r['room_only_minor'] / $totalRoomCharge) : (1.0 / max(1,$count));
        $alloc = $roundMinor($totalFee * $share);
        if ($idx === $count-1) { $alloc = $remaining; }
        $feeAllocations[$r['id']] = $alloc;
        $remaining -= $alloc;
      }
    }
    foreach($itemRows as $r){
      $roomOnly = (int)$r['room_only_minor'];
      $scAmt    = $roundMinor($roomOnly * $serviceChargePct / 100);
      // ไม่รวมส่วนของ FEE ในฐาน VAT ระดับ ITEM อีกต่อไป
      $feePart  = 0;
      if ($vatBase === 'ROOM_ONLY') {
        $baseAmt = $roomOnly;
      } elseif ($vatBase === 'ROOM_PLUS_SERVICE' || $vatBase === 'ROOM_PLUS_SERVICE_FEE') {
        $baseAmt = $roomOnly + $scAmt; // ไม่บวก FEE แล้ว แม้ vat_base จะเป็น ROOM_PLUS_SERVICE_FEE
      } else {
        // fallback to ROOM_ONLY
        $baseAmt = $roomOnly;
      }
      $vatAmt = $roundMinor($baseAmt * $vatPct / 100);
      $totalVat += $vatAmt;
      $stmtTax->execute([
        ':booking_id' => $bookingId,
        ':booking_item_id' => $r['id'],
        ':scope' => 'ITEM',
        ':tax_type' => 'VAT',
        ':base_amount_minor' => $baseAmt,
        ':rate_pct' => $vatPct,
        ':unit' => 'PERCENT',
        ':quantity' => 1,
        ':amount_minor' => $vatAmt,
        ':currency' => $currency,
        ':vat_base' => $vatBase,
        ':fee_base' => null,
        ':local_tax_unit' => null,
        ':created_by' => $createdBy,
        ':updated_by' => $createdBy,
      ]);
    }
    // เพิ่ม VAT บน FEE ระดับ ORDER (แถวเดียว) เมื่อ vat_base = ROOM_PLUS_SERVICE_FEE
    if ($vatIncludeFee && $totalFee > 0) {
      $vatOnFee = $roundMinor($totalFee * $vatPct / 100);
      $totalVat += $vatOnFee;
      $stmtTax->execute([
        ':booking_id' => $bookingId,
        ':booking_item_id' => null,
        ':scope' => 'ORDER',
        ':tax_type' => 'VAT',
        ':base_amount_minor' => (int)$totalFee,
        ':rate_pct' => $vatPct,
        ':unit' => 'PERCENT',
        ':quantity' => 1,
        ':amount_minor' => $vatOnFee,
        ':currency' => $currency,
        ':vat_base' => 'FEE_ONLY',
        ':fee_base' => $feeBase,
        ':local_tax_unit' => null,
        ':created_by' => $createdBy,
        ':updated_by' => $createdBy,
      ]);
    }
  }

  // 5) Cross-check กับ booking_tax_lines แล้วคงค่าให้เท่ากันเสมอ
  try {
    $chk = $pdo->prepare("SELECT tax_type, COALESCE(SUM(amount_minor),0) AS amt FROM booking_tax_lines WHERE booking_id = :bid GROUP BY tax_type");
    $chk->execute([':bid'=>$bookingId]);
    $byType = [];
    while($r = $chk->fetch(PDO::FETCH_ASSOC)){
      $byType[strtoupper($r['tax_type'])] = (int)$r['amt'];
    }
    // ถ้ามีค่าในตาราง tax_lines ให้ใช้เป็นจริง เพื่อหลีกเลี่ยงความคลาดเคลื่อนจากการปัดเศษรายคืน
    if(isset($byType['SERVICE_CHARGE'])) $totalServiceCharge = $byType['SERVICE_CHARGE'];
    if(isset($byType['VAT']))            $totalVat         = $byType['VAT'];
    if(isset($byType['LOCAL_TAX']))      $totalLocalTax    = $byType['LOCAL_TAX'];
    if(isset($byType['BOOKING_FEE']))    $totalFee         = $byType['BOOKING_FEE'];
  } catch (Throwable $e) {
    // หาก query ล้มเหลว ให้ใช้ค่าที่คำนวณไว้ก่อนหน้า
  }

  // 6) UPDATE bookings ด้วยค่าที่คำนวณจาก config (Bottom-Up Aggregation)
  // ค่าต่าง ๆ ที่คำนวณข้างบนแล้ว:
  // - $totalRoomCharge = $bookingRoomCharge
  // - $totalServiceCharge = service_charge_pct × room_charge
  // - $totalFee = fee_value
  // - $totalVat = vat_pct × vat_base
  // - $totalLocalTax = local_tax_amount × quantity
  
  // ตามสเปคใหม่:
  // - room_total_minor = room_charge + service_charge (ไม่รวม VAT/LOCAL_TAX/FEE)
  // - taxes_total_minor = vat + local_tax (ไม่รวม fee)
  // - grand_total_minor = room_total_minor + taxes_total_minor + fee
  $roomTotalMinor = ($totalRoomCharge ?? 0) + ($totalServiceCharge ?? 0);
  $taxesTotalMinor = ($totalVat ?? 0) + ($totalLocalTax ?? 0);
  $grandTotalMinor = $roomTotalMinor + $taxesTotalMinor + ($totalFee ?? 0);
  
  // หมายเหตุ: ไม่ต้องคำนวณสัดส่วนเพิ่มเติม เพราะเราถือค่าจาก tax lines ตรง ๆ
  
  // ✅ booking_item_nights และ booking_items ได้คำนวณและบันทึกถูกต้องแล้วตอน INSERT
  // ไม่ต้อง UPDATE อีก เพราะคำนวณตรง ๆ จาก config แล้ว

  $sqlUpdateBooking = "UPDATE bookings SET
    room_charge = :room_charge,
    service_charge = :service_charge,
    fee = :fee,
    vat = :vat,
    local_tax = :local_tax,
    room_total_minor = :room_total_minor,
    taxes_total_minor = :taxes_total_minor,
    grand_total_minor = :grand_total_minor,
    pay_now_minor = :pay_now_minor
  WHERE id = :booking_id";
  
  $stmtUpdateBooking = $pdo->prepare($sqlUpdateBooking);
  $stmtUpdateBooking->execute([
    ':booking_id' => $bookingId,
    ':room_charge' => ($totalRoomCharge ?? 0),
    ':service_charge' => ($totalServiceCharge ?? 0),
    ':fee' => ($totalFee ?? 0),
    ':vat' => ($totalVat ?? 0),
    ':local_tax' => ($totalLocalTax ?? 0),
    ':room_total_minor' => $roomTotalMinor,
    ':taxes_total_minor' => $taxesTotalMinor,
    ':grand_total_minor' => $grandTotalMinor,
    ':pay_now_minor' => $grandTotalMinor,
  ]);

  // 6) booking_request
  if (is_array($requests)){
    $stmtReq = $pdo->prepare("INSERT INTO booking_request (booking_id, preset_id, preset_code, note, selected, created_by, updated_by) VALUES (:booking_id,:preset_id,:preset_code,:note,:selected,:created_by,:updated_by)");
    foreach ($requests as $r){
      if (empty($r['preset_id']) && empty($r['preset_code'])) continue;
      $stmtReq->execute([
        ':booking_id' => $bookingId,
        ':preset_id'  => ig($r,'preset_id', null),
        ':preset_code'=> (string)ig($r,'preset_code',''),
        ':note'       => (string)ig($r,'note',''),
        ':selected'   => ig($r,'selected',1) ? 1 : 0,
        ':created_by' => $createdBy,
        ':updated_by' => $createdBy,
      ]);
    }
  }

  // 7) guests (single-row for this phase)
  if (is_array($guForm)){
    // Normalize guest fields
    $isGuest = intval(ig($guForm,'is_guest',1));
    $guestTitle = $isGuest ? ig($guForm,'title', null) : ig($guForm,'guest_title', null);
    $guestFirst = $isGuest ? ig($guForm,'booker_first_name', null) : ig($guForm,'guest_first_name', null);
    $guestLast  = $isGuest ? ig($guForm,'booker_last_name', null)  : ig($guForm,'guest_last_name', null);
    $guestCc = $isGuest ? ig($guForm,'phone_country_code', null) : ig($guForm,'guest_phone_country_code', null);
    $guestPh = $isGuest ? ig($guForm,'phone_number', null) : ig($guForm,'guest_phone_number', null);

    $stmtGuest = $pdo->prepare("INSERT INTO guests (
      booking_ref, title, booker_first_name, booker_last_name, email, phone_country_code, phone_number,
      is_guest, guest_title, guest_first_name, guest_last_name, guest_phone_country_code, guest_phone_number,
      created_by, updated_by
    ) VALUES (
      :booking_ref, :title, :booker_first_name, :booker_last_name, :email, :phone_country_code, :phone_number,
      :is_guest, :guest_title, :guest_first_name, :guest_last_name, :guest_phone_country_code, :guest_phone_number,
      :created_by, :updated_by
    )");

    $stmtGuest->execute([
      ':booking_ref' => $ref,
      ':title' => (string)ig($guForm,'title',''),
      ':booker_first_name' => (string)ig($guForm,'booker_first_name',''),
      ':booker_last_name'  => (string)ig($guForm,'booker_last_name',''),
      ':email' => (string)ig($guForm,'email',''),
      ':phone_country_code' => (string)ig($guForm,'phone_country_code',''),
      ':phone_number' => (string)ig($guForm,'phone_number',''),
      ':is_guest' => $isGuest,
      ':guest_title' => (string)$guestTitle,
      ':guest_first_name' => (string)$guestFirst,
      ':guest_last_name'  => (string)$guestLast,
      ':guest_phone_country_code' => (string)$guestCc,
      ':guest_phone_number' => (string)$guestPh,
      ':created_by' => $createdBy,
      ':updated_by' => $createdBy,
    ]);
  }

  $pdo->commit();

  json_out([
    'ok' => true,
    'booking' => [
      'id' => $bookingId,
      'booking_ref' => $ref,
      'status' => 'PENDING',
      'check_in_date' => $checkIn,
      'check_out_date' => $checkOut,
      'nights' => $nights,
      'currency' => $currency,
      'room_charge' => ($totalRoomCharge ?? 0),
      'service_charge' => ($totalServiceCharge ?? 0),
      'fee' => ($totalFee ?? 0),
      'vat' => ($totalVat ?? 0),
      'local_tax' => ($totalLocalTax ?? 0),
      'room_total_minor' => $roomTotalMinor,
      'taxes_total_minor' => $taxesTotalMinor,
      'grand_total_minor' => $grandTotalMinor,
      'pay_now_minor' => $grandTotalMinor,
      'policy_id' => ig($policy,'policy_id'),
      'terms_version' => ig($policy,'terms_version'),
      'agreed_terms' => (bool)ig($policy,'agreed_terms',false),
      'channel' => $channel,
      'created_by' => $createdBy,
    ],
    'next_actions' => [ 'payment_intent_supported' => false ]
  ], 201);
} catch (Throwable $e) {
  if ($pdo->inTransaction()) { $pdo->rollBack(); }
  error_log('create booking failed: '.$e->getMessage());
  json_out(['error' => 'create_failed', 'detail' => $e->getMessage()], 500);
}
