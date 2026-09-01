-- 006_generation_retry down — remove retry_count and next_attempt_at
SET NAMES utf8mb4;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'generation_job' AND COLUMN_NAME = 'next_attempt_at');
SET @sql := IF(@col_exists > 0, 'ALTER TABLE `generation_job` DROP COLUMN `next_attempt_at`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists2 := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'generation_job' AND COLUMN_NAME = 'retry_count');
SET @sql := IF(@col_exists2 > 0, 'ALTER TABLE `generation_job` DROP COLUMN `retry_count`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- revert status enum (best effort, will fail if queued rows exist)
ALTER TABLE `generation_job` MODIFY COLUMN `status` ENUM('pending','running','succeeded','failed') NOT NULL DEFAULT 'pending';

