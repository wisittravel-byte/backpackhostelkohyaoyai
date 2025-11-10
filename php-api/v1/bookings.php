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

$checkIn  = ig($cart, 'check_in_date');
$checkOut = ig($cart, 'check_out_date');
$currency = ig($cart, 'currency', 'THB');
$nights   = intval(ig($cart, 'nights', 0));
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
      check_in_date, check_out_date, nights,
      currency,
      room_charge, service_charge, fee, vat, local_tax,
      room_total_minor, taxes_total_minor, grand_total_minor, pay_now_minor,
      terms_version, agreed_terms, channel, created_by, updated_by
    ) VALUES (
      :booking_ref, 'PENDING', :policy_id,
      :check_in, :check_out, :nights,
      :currency,
      :room_charge, :service_charge, :fee, :vat, :local_tax,
      :room_total_minor, :taxes_total_minor, :grand_total_minor, :pay_now_minor,
      :terms_version, :agreed_terms, :channel, :created_by, :updated_by
    )";
  $stmt = $pdo->prepare($sql);
  $stmt->execute([
    ':booking_ref' => $ref,
    ':policy_id'   => ig($policy, 'policy_id'),
    ':check_in'    => $checkIn,
    ':check_out'   => $checkOut,
    ':nights'      => $nights,
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

  // 3) booking_items + nights
  $itemsMap = [];
  $items = ig($cart,'items',[]);
  if (!is_array($items)) $items = [];

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
    $stmtItem->execute([
      ':booking_id' => $bookingId,
      ':room_type_id' => intval(ig($it,'room_type_id')),
      ':rate_plan_id' => intval(ig($it,'rate_plan_id')),
      ':unit_type'    => (string)ig($it,'unit_type','ROOM'),
      ':quantity'     => intval(ig($it,'quantity',1)),
      ':pax_adults'   => intval(ig($it,'pax_adults',0)),
      ':pax_children' => intval(ig($it,'pax_children',0)),
      ':line_subtotal_minor' => intval(ig($it,'line_subtotal_minor',0)),
      ':line_taxes_minor'    => intval(ig($it,'line_taxes_minor',0)),
      ':line_total_minor'    => intval(ig($it,'line_total_minor',0)),
      ':created_by'    => $createdBy,
      ':updated_by'    => $createdBy,
    ]);
    $itemId = intval($pdo->lastInsertId());
    $itemsMap[] = $itemId;

    $nightsArr = ig($it,'nights',[]);
    if (is_array($nightsArr)){
      foreach ($nightsArr as $n) {
        $stmtNight->execute([
          ':booking_item_id' => $itemId,
          ':stay_date'       => ig($n,'stay_date'),
          ':quantity'        => intval(ig($n,'quantity',1)),
          ':base_price_minor'=> intval(ig($n,'base_price_minor',0)),
          ':tax_minor'       => intval(ig($n,'tax_minor',0)),
          ':total_minor'     => intval(ig($n,'total_minor',0)),
          ':rate_source'     => (string)ig($n,'rate_source','PLAN'),
          ':created_by'      => $createdBy,
          ':updated_by'      => $createdBy,
        ]);
      }
    }
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
    $scope = strtoupper((string)ig($t,'scope','BOOKING'));
    if ($scope === 'BOOKING') $scope = 'ORDER'; // map to DB enum
    $stmtTax->execute([
      ':booking_id' => $bookingId,
      ':booking_item_id' => null,
      ':scope' => $scope,
      ':tax_type' => (string)ig($t,'tax_type','VAT'),
      ':base_amount_minor' => intval(ig($t,'base_amount_minor',0)),
      ':rate_pct' => is_null(ig($t,'rate_pct',null)) ? null : (float)$t['rate_pct'],
      ':unit' => (string)ig($t,'unit','FIXED'),
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

  // 5) booking_request
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

  // 6) guests (single-row for this phase)
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
