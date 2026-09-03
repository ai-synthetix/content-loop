-- 009_batch_round — evolution rounds for swipe batches (queue gets only winners)
-- Idempotent via INFORMATION_SCHEMA guards
SET NAMES utf8mb4;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'swipe_batch' AND COLUMN_NAME = 'round');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `swipe_batch` ADD COLUMN `round` INT NOT NULL DEFAULT 1 AFTER `status`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'swipe_batch' AND COLUMN_NAME = 'parent_id');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `swipe_batch` ADD COLUMN `parent_id` CHAR(36) NULL AFTER `round`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
