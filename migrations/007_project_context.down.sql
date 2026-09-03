-- 007_project_context down — remove context column if exists
SET NAMES utf8mb4;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project' AND COLUMN_NAME = 'context');
SET @sql := IF(@col_exists = 1, 'ALTER TABLE `project` DROP COLUMN `context`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
