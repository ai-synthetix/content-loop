-- 007_project_context — add context TEXT NULL to project (project knowledge base markdown)
-- Idempotent via INFORMATION_SCHEMA guard
SET NAMES utf8mb4;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'project' AND COLUMN_NAME = 'context');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `project` ADD COLUMN `context` TEXT NULL AFTER `policy`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
