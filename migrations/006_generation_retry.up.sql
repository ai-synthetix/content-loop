-- 006_generation_retry — add retry_count and next_attempt_at to generation_job (idempotent)
SET NAMES utf8mb4;

-- allow 'queued' status for semaphore waiting (idempotent modify)
ALTER TABLE `generation_job` MODIFY COLUMN `status` ENUM('pending','queued','running','succeeded','failed') NOT NULL DEFAULT 'pending';

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'generation_job' AND COLUMN_NAME = 'retry_count');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `generation_job` ADD COLUMN `retry_count` INT NOT NULL DEFAULT 0', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists2 := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'generation_job' AND COLUMN_NAME = 'next_attempt_at');
SET @sql := IF(@col_exists2 = 0, 'ALTER TABLE `generation_job` ADD COLUMN `next_attempt_at` DATETIME(3) NULL', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
