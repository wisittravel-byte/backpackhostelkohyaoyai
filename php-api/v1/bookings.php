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

  // 3) booking_items + nights (Bottom-Up Calculation)
  $itemsMap = [];
  $items = ig($cart,'items',[]);
  if (!is_array($items)) $items = [];

  // คำนวณภาษีต่อคืนจาก summary (VAT + Local Tax) แบ่งเฉลี่ยทุกคืน
  $totalVat = intval(ig($sum, 'vat', 0));
  $totalLocalTax = intval(ig($sum, 'local_tax', 0));
  $totalTaxes = $totalVat + $totalLocalTax;
  $taxPerNight = ($nights > 0) ? round($totalTaxes / $nights) : 0;

  // ตัวแปรสำหรับ rollup ไปยัง bookings
  $bookingRoomCharge = 0;
  $bookingTotalTaxes = 0;

  $stmtItem = $pdo->prepare("INSERT INTO booking_items (
      booking_id, room_type_id, rate_plan_id, unit_type, quantity, pax_adults, pax_children,
      line_subtotal_minor, line_taxes_minor, line_total_minor, created_by, updated_by
    ) VALUES (
      :booking_id, :room_type_id, :rate_plan_id, :unit_type, :quantity, :pax_adults, :pax_children,
      :line_subtotal_minor, :line_taxes_minor, :line_total_minor, :created_by, :updated_by
    )");

  $stmtNight = $pdo->prepare("INSERT INTO booking_item_nights (
      booking_item_id, stay_date, quantity, base_price_minor, tax_minor, total_minor, rate_source, created_by, updated_by
    ) VALUES (
      :booking_item_id, :stay_date, :quantity, :base_price_minor, :tax_minor, :total_minor, :rate_source, :created_by, :updated_by
    )");

  foreach ($items as $it) {
    // Normalize unit type to DB enum ('ROOM','DORM_BED')
    $unit = strtoupper((string)ig($it,'unit_type','ROOM'));
    if ($unit !== 'ROOM' && $unit !== 'DORM_BED') { $unit = ($unit === 'BED') ? 'DORM_BED' : 'ROOM'; }
    
    // คำนวณ line totals จาก booking_item_nights (Bottom-Up)
    $lineSubtotal = 0;
    $lineTaxes = 0;
    
    $nightsArr = ig($it,'nights',[]);
    if (is_array($nightsArr)){
      foreach ($nightsArr as $n) {
        $qty = intval(ig($n,'quantity',1));
        $basePrice = intval(ig($n,'base_price_minor',0));
        
        // คำนวณใหม่ตามกติกา:
        // tax_minor = ภาษีต่อคืน (VAT + Local Tax แบ่งเฉลี่ย)
        // total_minor = (base_price_minor × quantity) + tax_minor
        $nightTax = $taxPerNight;
        $nightTotal = ($basePrice * $qty) + $nightTax;
        
        // เก็บค่าสะสมสำหรับ booking_items
        $lineSubtotal += ($basePrice * $qty);
        $lineTaxes += $nightTax;
      }
    }
    
    $lineTotal = $lineSubtotal + $lineTaxes;
    
    // บันทึก booking_items ด้วยค่าที่คำนวณจาก booking_item_nights
    $stmtItem->execute([
      ':booking_id' => $bookingId,
      ':room_type_id' => intval(ig($it,'room_type_id')),
      ':rate_plan_id' => intval(ig($it,'rate_plan_id')),
      ':unit_type'    => $unit,
      ':quantity'     => intval(ig($it,'quantity',1)),
      ':pax_adults'   => intval(ig($it,'pax_adults',0)),
      ':pax_children' => intval(ig($it,'pax_children',0)),
      ':line_subtotal_minor' => $lineSubtotal,  // ← คำนวณจาก nights
      ':line_taxes_minor'    => $lineTaxes,     // ← คำนวณจาก nights
      ':line_total_minor'    => $lineTotal,     // ← คำนวณจาก nights
      ':created_by'    => $createdBy,
      ':updated_by'    => $createdBy,
    ]);
    $itemId = intval($pdo->lastInsertId());
    $itemsMap[] = $itemId;

    // บันทึก booking_item_nights
    if (is_array($nightsArr)){
      foreach ($nightsArr as $n) {
        $qty = intval(ig($n,'quantity',1));
        $basePrice = intval(ig($n,'base_price_minor',0));
        $nightTax = $taxPerNight;
        $nightTotal = ($basePrice * $qty) + $nightTax;
        
        $stmtNight->execute([
          ':booking_item_id' => $itemId,
          ':stay_date'       => ig($n,'stay_date'),
          ':quantity'        => $qty,
          ':base_price_minor'=> $basePrice,
          ':tax_minor'       => $nightTax,
          ':total_minor'     => $nightTotal,
          ':rate_source'     => (string)ig($n,'rate_source','PLAN'),
          ':created_by'      => $createdBy,
          ':updated_by'      => $createdBy,
        ]);
      }
    }
    
    // เก็บค่าสะสมสำหรับ bookings (rollup)
    $bookingRoomCharge += $lineSubtotal;
    $bookingTotalTaxes += $lineTaxes;
  }

  // 4) booking_tax_lines
  $taxLines = ig($cart,'tax_breakdown',[]);
  if (!is_array($taxLines)) $taxLines = [];
  $stmtTax = $pdo->prepare("INSERT INTO booking_tax_lines (
      booking_id, booking_item_id, scope, tax_type, base_amount_minor, rate_pct, unit, quantity, amount_minor, currency, vat_base, fee_base, local_tax_unit, created_by, updated_by
    ) VALUES (
      :booking_id, :booking_item_id, :scope, :tax_type, :base_amount_minor, :rate_pct, :unit, :quantity, :amount_minor, :currency, :vat_base, :fee_base, :local_tax_unit, :created_by, :updated_by
    )");
  foreach ($taxLines as $t) {
    // กติกาใหม่: กำหนด scope จาก unit ตาม mapping
    // - PER_BOOKING          -> ORDER (คิดต่อการจอง)
    // - PERCENT, PER_ROOM_*, PER_PERSON_*, อื่น ๆ -> ITEM (คิดในระดับรายการ)
    $unitU = strtoupper((string)ig($t,'unit','FIXED'));
    $scope = ($unitU === 'PER_BOOKING') ? 'ORDER' : 'ITEM';
    
    // กติกา booking_item_id: ORDER -> NULL, ITEM -> ใช้ booking_items.id แรก
    $taxItemId = null;
    if ($scope === 'ITEM' && count($itemsMap) > 0) {
      $taxItemId = $itemsMap[0];  // ใช้ booking_item แรก
    }
    
    $stmtTax->execute([
      ':booking_id' => $bookingId,
      ':booking_item_id' => $taxItemId,
      ':scope' => $scope,
      ':tax_type' => (string)ig($t,'tax_type','VAT'),
      ':base_amount_minor' => intval(ig($t,'base_amount_minor',0)),
      ':rate_pct' => is_null(ig($t,'rate_pct',null)) ? null : (float)$t['rate_pct'],
      ':unit' => $unitU,
      ':quantity' => intval(ig($t,'quantity',1)),
      ':amount_minor' => intval(ig($t,'amount_minor',0)),
      ':currency' => (string)ig($t,'currency',$currency),
      ':vat_base' => ig($t,'vat_base', null),
      ':fee_base' => ig($t,'fee_base', null),
      ':local_tax_unit' => ig($t,'local_tax_unit', null),
      ':created_by' => $createdBy,
      ':updated_by' => $createdBy,
    ]);
  }

  // 5) UPDATE bookings ด้วยค่าที่คำนวณจาก booking_items (Bottom-Up Aggregation)
  // คำนวณ service_charge และ fee จาก summary
  $serviceCharge = intval(ig($sum,'service_charge',0));
  $bookingFee = intval(ig($sum,'fee',0));
  
  // คำนวณยอดรวม
  $roomTotalMinor = $bookingRoomCharge + $serviceCharge + $bookingFee;
  $taxesTotalMinor = $bookingTotalTaxes;  // จาก SUM booking_items.line_taxes_minor
  $grandTotalMinor = $roomTotalMinor + $taxesTotalMinor;
  
  // แยก VAT และ Local Tax ตามสัดส่วน
  $configVat = intval(ig($sum,'vat',0));
  $configLocalTax = intval(ig($sum,'local_tax',0));
  $totalConfigTax = $configVat + $configLocalTax;
  
  if ($totalConfigTax > 0) {
    $vatRatio = $configVat / $totalConfigTax;
    $localTaxRatio = $configLocalTax / $totalConfigTax;
    $calculatedVat = round($taxesTotalMinor * $vatRatio);
    $calculatedLocalTax = round($taxesTotalMinor * $localTaxRatio);
  } else {
    $calculatedVat = 0;
    $calculatedLocalTax = 0;
  }
  
  // UPDATE bookings ด้วยค่าที่คำนวณแล้ว (ถูกต้องและสัมพันธ์กับ booking_items)
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
    ':room_charge' => $bookingRoomCharge,
    ':service_charge' => $serviceCharge,
    ':fee' => $bookingFee,
    ':vat' => $calculatedVat,
    ':local_tax' => $calculatedLocalTax,
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
      'room_charge' => intval(ig($sum,'room_charge',0)),
      'service_charge' => intval(ig($sum,'service_charge',0)),
      'fee' => intval(ig($sum,'fee',0)),
      'vat' => intval(ig($sum,'vat',0)),
      'local_tax' => intval(ig($sum,'local_tax',0)),
      'room_total_minor' => intval(ig($sum,'room_total_minor',0)),
      'taxes_total_minor' => intval(ig($sum,'taxes_total_minor',0)),
      'grand_total_minor' => intval(ig($sum,'grand_total_minor',0)),
      'pay_now_minor' => intval(ig($sum,'pay_now_minor',0)),
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
