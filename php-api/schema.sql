-- Backpack Hostel Kohyaoyai — Database Schema (MySQL 8, InnoDB, utf8mb4)
-- This file defines the inventory tables used by the booking hold/confirm flow.
-- Apply with a user that has appropriate privileges, e.g.:
--   mysql -u <user> -p <db_name> < schema.sql

SET NAMES utf8mb4;
SET SESSION sql_require_primary_key = 0;

-- 1) Daily inventory per room type
--    Composite PK ensures a single row per (room_type_id, stay_date)
CREATE TABLE IF NOT EXISTS `room_type_inventory_daily` (
	`room_type_id` BIGINT UNSIGNED NOT NULL,
	`stay_date`    DATE NOT NULL,
	`total_qty`    INT UNSIGNED NOT NULL DEFAULT 0,
	`reserved_qty` INT UNSIGNED NOT NULL DEFAULT 0,
	`booked_qty`   INT UNSIGNED NOT NULL DEFAULT 0,
	`updated_at`   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`room_type_id`, `stay_date`),
	KEY `idx_room_type_inventory_daily_date` (`stay_date`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2) Inventory holds (short-lived reservations before payment)
--    Holds are created with status='HELD' and expire automatically via cron.
CREATE TABLE IF NOT EXISTS `inventory_holds` (
	`id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
	`room_type_id`  BIGINT UNSIGNED NOT NULL,
	`check_in_date` DATE NOT NULL,
	`check_out_date` DATE NOT NULL,
	`reserved_qty`  INT UNSIGNED NOT NULL DEFAULT 1,
	`status`        ENUM('HELD','CONFIRMED','RELEASED','EXPIRED') NOT NULL DEFAULT 'HELD',
	`expires_at`    DATETIME NOT NULL,
	`session_id`    VARCHAR(64) DEFAULT NULL,
	`channel`       VARCHAR(32) DEFAULT 'WEBSITE',
	`ip_address`    VARCHAR(64) DEFAULT NULL,
	`user_agent`    VARCHAR(255) DEFAULT NULL,
	`booking_id`    BIGINT UNSIGNED DEFAULT NULL,
	`created_by`    VARCHAR(64) DEFAULT 'website',
	`updated_by`    VARCHAR(64) DEFAULT NULL,
	`created_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
	`updated_at`    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
	PRIMARY KEY (`id`),
	KEY `idx_holds_room_type_id` (`room_type_id`),
	KEY `idx_holds_status` (`status`),
	KEY `idx_holds_expires_at` (`expires_at`),
	KEY `idx_holds_date_range` (`check_in_date`, `check_out_date`),
	CONSTRAINT `fk_holds_room_type`
		FOREIGN KEY (`room_type_id`) REFERENCES `room_types` (`id`)
		ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Optional safety: ensure non-negative quantities at storage layer
-- (business logic still guards with GREATEST(...,0) on updates)
ALTER TABLE `room_type_inventory_daily`
	MODIFY `total_qty`    INT UNSIGNED NOT NULL DEFAULT 0,
	MODIFY `reserved_qty` INT UNSIGNED NOT NULL DEFAULT 0,
	MODIFY `booked_qty`   INT UNSIGNED NOT NULL DEFAULT 0;

