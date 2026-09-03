-- 009_batch_round down — remove evolution columns (data in new columns is disposable)
SET NAMES utf8mb4;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'swipe_batch' AND COLUMN_NAME = 'parent_id');
SET @sql := IF(@col_exists = 1, 'ALTER TABLE `swipe_batch` DROP COLUMN `parent_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'swipe_batch' AND COLUMN_NAME = 'round');
SET @sql := IF(@col_exists = 1, 'ALTER TABLE `swipe_batch` DROP COLUMN `round`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
