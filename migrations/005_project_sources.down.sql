-- 005_project_sources down — remove project_id FK/index/column (keep table)
SET @fk_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'source' AND CONSTRAINT_NAME = 'fk_source_project');
SET @sql := IF(@fk_exists > 0, 'ALTER TABLE `source` DROP FOREIGN KEY `fk_source_project`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'source' AND INDEX_NAME = 'idx_source_project');
SET @sql := IF(@idx_exists > 0, 'ALTER TABLE `source` DROP KEY `idx_source_project`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'source' AND COLUMN_NAME = 'project_id');
SET @sql := IF(@col_exists > 0, 'ALTER TABLE `source` DROP COLUMN `project_id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
