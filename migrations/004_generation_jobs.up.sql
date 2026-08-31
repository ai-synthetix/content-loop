-- 004_generation_jobs — async generation job tracking
SET NAMES utf8mb4;
CREATE TABLE IF NOT EXISTS `generation_job` (
  `id` CHAR(36) NOT NULL,
  `content_item_id` CHAR(36) NOT NULL,
  `owner_user_id` CHAR(36) NOT NULL,
  `status` ENUM('pending','running','succeeded','failed') NOT NULL DEFAULT 'pending',
  `step` VARCHAR(32) NOT NULL DEFAULT 'plan_topic',
  `progress` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `error` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_generation_job_item` (`content_item_id`),
  KEY `idx_generation_job_owner` (`owner_user_id`),
  KEY `idx_generation_job_status` (`status`),
  CONSTRAINT `fk_generation_job_item` FOREIGN KEY (`content_item_id`) REFERENCES `content_item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_generation_job_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
