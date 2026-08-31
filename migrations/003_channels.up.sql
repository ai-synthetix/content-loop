-- 003_channels — per-user channels with encrypted JSON config
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `channel` (
  `id` CHAR(36) NOT NULL,
  `owner_user_id` CHAR(36) NOT NULL,
  `project_id` CHAR(36) NULL,
  `type` ENUM('telegram','familyos','generic') NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `config_encrypted` TEXT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'active',
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_channel_owner` (`owner_user_id`),
  KEY `idx_channel_project` (`project_id`),
  KEY `idx_channel_type` (`type`),
  CONSTRAINT `fk_channel_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_channel_project` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
