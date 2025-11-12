<?php
/**
 * Data Correction Script for Bookings
 * แก้ไขข้อมูล booking ที่มีปัญหาจากการคำนวณเก่า
 * 
 * ปัญหาที่แก้:
 * 1. bookings.adults ไม่ตรงกับ SUM(booking_items.pax_adults)
 * 2. booking_tax_lines.LOCAL_TAX quantity ใช้ pax ผิด (เดิมใช้ heuristic แทน bookings.adults)
 * 3. bookings.taxes_total_minor และ grand_total_minor คำนวณผิด
 * 
 * วิธีใช้:
 * php fix-booking-data.php [booking_id]
 * 
 * ถ้าไม่ระบุ booking_id จะแก้ทั้งหมดที่มีปัญหา
 */

require_once __DIR__ . '/../common.php';

$targetBookingId = $argv[1] ?? null;

function fixBooking($pdo, $bookingId) {
    echo "\n=== Fixing Booking ID: {$bookingId} ===\n";
    
    try {
        $pdo->beginTransaction();
        
        // 1. อัปเดต bookings.adults และ bookings.children จาก booking_items
        $sql = "UPDATE bookings b
                JOIN (
                    SELECT booking_id, 
                           SUM(pax_adults) AS total_adults, 
                           SUM(pax_children) AS total_children
                    FROM booking_items
                    WHERE booking_id = :bid
                    GROUP BY booking_id
                ) bi ON bi.booking_id = b.id
                SET b.adults = bi.total_adults,
                    b.children = bi.total_children
                WHERE b.id = :bid2";
        $stmt = $pdo->prepare($sql);
        $stmt->execute([':bid' => $bookingId, ':bid2' => $bookingId]);
        echo "✓ Updated bookings.adults and bookings.children\n";
        
        // 2. ดึงข้อมูล booking และ config
        $booking = $pdo->prepare("SELECT * FROM bookings WHERE id = :bid");
        $booking->execute([':bid' => $bookingId]);
        $b = $booking->fetch(PDO::FETCH_ASSOC);
        
        $config = $pdo->query("SELECT * FROM property_tax_config WHERE is_active = 1 LIMIT 1")->fetch(PDO::FETCH_ASSOC);
        
        if (!$b || !$config) {
            echo "✗ Booking or config not found\n";
            $pdo->rollBack();
            return false;
        }
        
        $adults = intval($b['adults']);
        $nights = intval($b['nights']);
        $localTaxUnit = strtoupper($config['local_tax_unit'] ?? 'PER_BOOKING');
        $localTaxAmount = intval($config['local_tax_amount'] ?? 0);
        
        // 3. คำนวณ LOCAL_TAX quantity ใหม่
        $newQty = 1;
        switch ($localTaxUnit) {
            case 'PER_PERSON_PER_NIGHT':
                $newQty = $adults * $nights;
                break;
            case 'PER_PERSON_PER_STAY':
                $newQty = $adults;
                break;
            case 'PER_ROOM_PER_NIGHT':
                $roomCount = $pdo->prepare("SELECT COUNT(*) FROM booking_items WHERE booking_id = :bid");
                $roomCount->execute([':bid' => $bookingId]);
                $newQty = intval($roomCount->fetchColumn()) * $nights;
                break;
            case 'PER_ROOM_PER_STAY':
                $roomCount = $pdo->prepare("SELECT COUNT(*) FROM booking_items WHERE booking_id = :bid");
                $roomCount->execute([':bid' => $bookingId]);
                $newQty = intval($roomCount->fetchColumn());
                break;
            case 'PER_BOOKING':
            default:
                $newQty = 1;
                break;
        }
        
        $newLocalTaxAmount = intval(round($localTaxAmount * $newQty));
        
        // 4. อัปเดต booking_tax_lines LOCAL_TAX
        $updateTax = $pdo->prepare("UPDATE booking_tax_lines 
                                    SET quantity = :qty, 
                                        amount_minor = :amt,
                                        updated_by = 'data_correction',
                                        updated_at = NOW()
                                    WHERE booking_id = :bid 
                                    AND tax_type = 'LOCAL_TAX'");
        $updateTax->execute([
            ':qty' => $newQty,
            ':amt' => $newLocalTaxAmount,
            ':bid' => $bookingId
        ]);
        echo "✓ Updated LOCAL_TAX: quantity={$newQty}, amount={$newLocalTaxAmount}\n";
        
        // 5. รวมยอดจาก booking_tax_lines
        $sums = $pdo->prepare("SELECT tax_type, SUM(amount_minor) AS total
                              FROM booking_tax_lines
                              WHERE booking_id = :bid
                              GROUP BY tax_type");
        $sums->execute([':bid' => $bookingId]);
        $totals = [];
        while ($r = $sums->fetch(PDO::FETCH_ASSOC)) {
            $totals[strtoupper($r['tax_type'])] = intval($r['total']);
        }
        
        $serviceCharge = $totals['SERVICE_CHARGE'] ?? 0;
        $vat = $totals['VAT'] ?? 0;
        $localTax = $totals['LOCAL_TAX'] ?? 0;
        $fee = $totals['BOOKING_FEE'] ?? 0;
        
        // 6. คำนวณยอดรวม
        $roomCharge = intval($pdo->prepare("SELECT SUM(line_subtotal_minor) FROM booking_items WHERE booking_id = :bid")
            ->execute([':bid' => $bookingId]) ? $pdo->query("SELECT SUM(line_subtotal_minor) FROM booking_items WHERE booking_id = {$bookingId}")->fetchColumn() : 0);
        
        $roomTotalMinor = $roomCharge + $serviceCharge;
        $taxesTotalMinor = $vat + $localTax; // ไม่รวม fee
        $grandTotalMinor = $roomTotalMinor + $taxesTotalMinor + $fee;
        
        // 7. อัปเดต bookings
        $updateBooking = $pdo->prepare("UPDATE bookings
                                        SET room_charge = :rc,
                                            service_charge = :sc,
                                            vat = :vat,
                                            local_tax = :lt,
                                            fee = :fee,
                                            room_total_minor = :rtm,
                                            taxes_total_minor = :ttm,
                                            grand_total_minor = :gtm,
                                            pay_now_minor = :pnm
                                        WHERE id = :bid");
        $updateBooking->execute([
            ':rc' => $roomCharge,
            ':sc' => $serviceCharge,
            ':vat' => $vat,
            ':lt' => $localTax,
            ':fee' => $fee,
            ':rtm' => $roomTotalMinor,
            ':ttm' => $taxesTotalMinor,
            ':gtm' => $grandTotalMinor,
            ':pnm' => $grandTotalMinor,
            ':bid' => $bookingId
        ]);
        
        echo "✓ Updated bookings totals:\n";
        echo "  room_total_minor: {$roomTotalMinor}\n";
        echo "  taxes_total_minor: {$taxesTotalMinor}\n";
        echo "  grand_total_minor: {$grandTotalMinor}\n";
        
        $pdo->commit();
        echo "✓ Booking {$bookingId} fixed successfully!\n";
        return true;
        
    } catch (Exception $e) {
        $pdo->rollBack();
        echo "✗ Error fixing booking {$bookingId}: " . $e->getMessage() . "\n";
        return false;
    }
}

// Main execution
if ($targetBookingId) {
    // แก้ booking เดียว
    fixBooking($pdo, intval($targetBookingId));
} else {
    // หา bookings ที่มีปัญหา (adults ไม่ตรง หรือ taxes_total รวม fee)
    echo "Scanning for problematic bookings...\n";
    
    $sql = "SELECT b.id, b.adults, b.taxes_total_minor, b.fee,
                   SUM(bi.pax_adults) AS actual_adults
            FROM bookings b
            LEFT JOIN booking_items bi ON bi.booking_id = b.id
            WHERE b.status = 'PENDING'
            GROUP BY b.id
            HAVING b.adults != actual_adults 
               OR b.taxes_total_minor >= (
                   SELECT COALESCE(SUM(amount_minor), 0) 
                   FROM booking_tax_lines 
                   WHERE booking_id = b.id 
                   AND tax_type IN ('VAT','LOCAL_TAX')
               ) + b.fee * 0.9
            LIMIT 100";
    
    $stmt = $pdo->query($sql);
    $problematic = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($problematic)) {
        echo "✓ No problematic bookings found!\n";
    } else {
        echo "Found " . count($problematic) . " problematic bookings\n";
        foreach ($problematic as $b) {
            echo "\nBooking {$b['id']}: adults={$b['adults']} (should be {$b['actual_adults']})\n";
            fixBooking($pdo, $b['id']);
        }
    }
}

echo "\n=== Done ===\n";
