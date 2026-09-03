-- 008_micro_swipe — micro-swipe layer: swipe batches, options, votes, taste profiles
-- Idempotent via INFORMATION_SCHEMA guards (same pattern as 007)
SET NAMES utf8mb4;

SET @tbl_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'swipe_batch');
SET @sql := IF(@tbl_exists = 0, "CREATE TABLE `swipe_batch` (
  `id` CHAR(36) NOT NULL,
  `project_id` CHAR(36) NOT NULL,
  `owner_user_id` CHAR(36) NOT NULL,
  `layer` VARCHAR(16) NOT NULL,
  `status` VARCHAR(16) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_swipe_batch_project` (`project_id`),
  KEY `idx_swipe_batch_owner` (`owner_user_id`),
  KEY `idx_swipe_batch_status` (`status`),
  CONSTRAINT `fk_swipe_batch_project` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_swipe_batch_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'swipe_option');
SET @sql := IF(@tbl_exists = 0, "CREATE TABLE `swipe_option` (
  `id` CHAR(36) NOT NULL,
  `batch_id` CHAR(36) NOT NULL,
  `project_id` CHAR(36) NOT NULL,
  `owner_user_id` CHAR(36) NOT NULL,
  `text` VARCHAR(500) NOT NULL,
  `score` FLOAT NOT NULL DEFAULT 0,
  `wins` INT NOT NULL DEFAULT 0,
  `losses` INT NOT NULL DEFAULT 0,
  `status` VARCHAR(16) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_swipe_option_batch` (`batch_id`),
  KEY `idx_swipe_option_project` (`project_id`),
  KEY `idx_swipe_option_owner` (`owner_user_id`),
  KEY `idx_swipe_option_score` (`score`),
  CONSTRAINT `fk_swipe_option_batch` FOREIGN KEY (`batch_id`) REFERENCES `swipe_batch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_swipe_option_project` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'swipe_vote');
SET @sql := IF(@tbl_exists = 0, "CREATE TABLE `swipe_vote` (
  `id` CHAR(36) NOT NULL,
  `batch_id` CHAR(36) NOT NULL,
  `winner_id` CHAR(36) NULL,
  `loser_id` CHAR(36) NULL,
  `option_id` CHAR(36) NULL,
  `mode` VARCHAR(8) NOT NULL,
  `decision` VARCHAR(16) NULL,
  `owner_user_id` CHAR(36) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_swipe_vote_batch` (`batch_id`),
  KEY `idx_swipe_vote_owner` (`owner_user_id`),
  CONSTRAINT `fk_swipe_vote_batch` FOREIGN KEY (`batch_id`) REFERENCES `swipe_batch`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'taste_profile');
SET @sql := IF(@tbl_exists = 0, "CREATE TABLE `taste_profile` (
  `project_id` CHAR(36) NOT NULL,
  `owner_user_id` CHAR(36) NOT NULL,
  `features` JSON NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`project_id`, `owner_user_id`),
  CONSTRAINT `fk_taste_profile_project` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci", 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
