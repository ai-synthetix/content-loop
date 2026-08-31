-- 002_auth_owner — users + owner_user_id per-entity isolation
SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `users` (
  `id` CHAR(36) NOT NULL,
  `email` VARCHAR(255) NOT NULL,
  `google_sub` VARCHAR(255) NOT NULL,
  `name` VARCHAR(255) NULL,
  `avatar_url` VARCHAR(2048) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_users_email` (`email`),
  UNIQUE KEY `uq_users_google_sub` (`google_sub`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- helper: add owner_user_id to each domain table if not exists
-- project
ALTER TABLE `project` ADD COLUMN `owner_user_id` CHAR(36) NULL AFTER `id`;
ALTER TABLE `project` ADD KEY `idx_project_owner` (`owner_user_id`);
ALTER TABLE `project` ADD CONSTRAINT `fk_project_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- content_item
ALTER TABLE `content_item` ADD COLUMN `owner_user_id` CHAR(36) NULL AFTER `id`;
ALTER TABLE `content_item` ADD KEY `idx_content_item_owner` (`owner_user_id`);
ALTER TABLE `content_item` ADD CONSTRAINT `fk_content_item_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- content_version
ALTER TABLE `content_version` ADD COLUMN `owner_user_id` CHAR(36) NULL AFTER `id`;
ALTER TABLE `content_version` ADD KEY `idx_content_version_owner` (`owner_user_id`);
ALTER TABLE `content_version` ADD CONSTRAINT `fk_content_version_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- channel_variant
ALTER TABLE `channel_variant` ADD COLUMN `owner_user_id` CHAR(36) NULL AFTER `id`;
ALTER TABLE `channel_variant` ADD KEY `idx_channel_variant_owner` (`owner_user_id`);
ALTER TABLE `channel_variant` ADD CONSTRAINT `fk_channel_variant_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- approval
ALTER TABLE `approval` ADD COLUMN `owner_user_id` CHAR(36) NULL AFTER `id`;
ALTER TABLE `approval` ADD KEY `idx_approval_owner` (`owner_user_id`);
ALTER TABLE `approval` ADD CONSTRAINT `fk_approval_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- publication
ALTER TABLE `publication` ADD COLUMN `owner_user_id` CHAR(36) NULL AFTER `id`;
ALTER TABLE `publication` ADD KEY `idx_publication_owner` (`owner_user_id`);
ALTER TABLE `publication` ADD CONSTRAINT `fk_publication_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- metric_snapshot
ALTER TABLE `metric_snapshot` ADD COLUMN `owner_user_id` CHAR(36) NULL AFTER `id`;
ALTER TABLE `metric_snapshot` ADD KEY `idx_metric_snapshot_owner` (`owner_user_id`);
ALTER TABLE `metric_snapshot` ADD CONSTRAINT `fk_metric_snapshot_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- reflection
ALTER TABLE `reflection` ADD COLUMN `owner_user_id` CHAR(36) NULL AFTER `id`;
ALTER TABLE `reflection` ADD KEY `idx_reflection_owner` (`owner_user_id`);
ALTER TABLE `reflection` ADD CONSTRAINT `fk_reflection_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- source
ALTER TABLE `source` ADD COLUMN `owner_user_id` CHAR(36) NULL AFTER `id`;
ALTER TABLE `source` ADD KEY `idx_source_owner` (`owner_user_id`);
ALTER TABLE `source` ADD CONSTRAINT `fk_source_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;

-- audit_event
ALTER TABLE `audit_event` ADD COLUMN `owner_user_id` CHAR(36) NULL AFTER `id`;
ALTER TABLE `audit_event` ADD KEY `idx_audit_owner` (`owner_user_id`);
ALTER TABLE `audit_event` ADD CONSTRAINT `fk_audit_owner` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
