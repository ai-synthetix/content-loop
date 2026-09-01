-- 005_project_sources — add project_id to source (CHAR 36 NULL, FK to project, index)
-- Also provides CREATE TABLE IF NOT EXISTS alternative for fresh installs / idempotency.
SET NAMES utf8mb4;

-- Ensure source table exists (fresh DB alternative) — with project_id and owner_user_id columns.
CREATE TABLE IF NOT EXISTS `source` (
  `id` CHAR(36) NOT NULL,
  `project_id` CHAR(36) NULL,
  `url` TEXT NOT NULL,
  `title` VARCHAR(500) NULL,
  `checked_at` DATETIME(3) NULL,
  `claims_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `owner_user_id` CHAR(36) NULL,
  PRIMARY KEY (`id`),
  KEY `idx_source_project` (`project_id`),
  KEY `idx_source_owner` (`owner_user_id`),
  CONSTRAINT `fk_source_project` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_source_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Idempotent ALTER for existing databases (created by 001_initial + 002_auth_owner):
-- Add column project_id if not exists, then index and FK if not exists.
-- MySQL lacks IF NOT EXISTS for ADD COLUMN on older versions, so use prepared-statement guard.

SET @col_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'source' AND COLUMN_NAME = 'project_id');
SET @sql := IF(@col_exists = 0, 'ALTER TABLE `source` ADD COLUMN `project_id` CHAR(36) NULL AFTER `id`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @idx_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'source' AND INDEX_NAME = 'idx_source_project');
SET @sql := IF(@idx_exists = 0, 'ALTER TABLE `source` ADD KEY `idx_source_project` (`project_id`)', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @fk_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'source' AND CONSTRAINT_NAME = 'fk_source_project');
SET @sql := IF(@fk_exists = 0, 'ALTER TABLE `source` ADD CONSTRAINT `fk_source_project` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
