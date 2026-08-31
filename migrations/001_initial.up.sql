-- 001_initial.sql — Content Loop baseline (MySQL 8)
-- 9 tables: project, content_item, content_version, channel_variant, approval, publication, metric_snapshot, reflection, source, audit_event (10 incl. audit but spec says 9 + audit)
-- Uses InnoDB, utf8mb4, JSON columns, idempotency_key unique, FKs.

SET NAMES utf8mb4;

CREATE TABLE IF NOT EXISTS `project` (
  `id` CHAR(36) NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `slug` VARCHAR(255) NOT NULL,
  `channels` JSON NOT NULL,
  `languages` JSON NOT NULL,
  `policy` JSON NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_project_slug` (`slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `content_item` (
  `id` CHAR(36) NOT NULL,
  `project_id` CHAR(36) NOT NULL,
  `title` VARCHAR(500) NOT NULL DEFAULT '',
  `slug` VARCHAR(500) NOT NULL DEFAULT '',
  `status` VARCHAR(32) NOT NULL DEFAULT 'idea',
  `brief` JSON NULL,
  `locale` VARCHAR(16) NOT NULL DEFAULT 'ru',
  `scheduled_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_content_item_project` (`project_id`),
  KEY `idx_content_item_status` (`status`),
  CONSTRAINT `fk_content_item_project` FOREIGN KEY (`project_id`) REFERENCES `project`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `source` (
  `id` CHAR(36) NOT NULL,
  `url` TEXT NOT NULL,
  `title` VARCHAR(500) NULL,
  `checked_at` DATETIME(3) NULL,
  `claims_json` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `content_version` (
  `id` CHAR(36) NOT NULL,
  `content_item_id` CHAR(36) NOT NULL,
  `version_no` INT NOT NULL,
  `title` VARCHAR(500) NOT NULL,
  `excerpt` TEXT NULL,
  `body_markdown` MEDIUMTEXT NOT NULL,
  `claims` JSON NULL,
  `sources` JSON NULL,
  `prompt` TEXT NULL,
  `model` VARCHAR(255) NULL,
  `model_version` VARCHAR(255) NULL,
  `is_approved` TINYINT(1) NOT NULL DEFAULT 0,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_content_version_item_no` (`content_item_id`, `version_no`),
  CONSTRAINT `fk_content_version_item` FOREIGN KEY (`content_item_id`) REFERENCES `content_item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `channel_variant` (
  `id` CHAR(36) NOT NULL,
  `content_item_id` CHAR(36) NOT NULL,
  `content_version_id` CHAR(36) NOT NULL,
  `channel` VARCHAR(64) NOT NULL,
  `payload` JSON NOT NULL,
  `rendered_body` MEDIUMTEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_channel_variant_item` (`content_item_id`),
  KEY `idx_channel_variant_version` (`content_version_id`),
  CONSTRAINT `fk_channel_variant_item` FOREIGN KEY (`content_item_id`) REFERENCES `content_item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_channel_variant_version` FOREIGN KEY (`content_version_id`) REFERENCES `content_version`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `approval` (
  `id` CHAR(36) NOT NULL,
  `content_item_id` CHAR(36) NOT NULL,
  `version_id` CHAR(36) NULL,
  `decision` VARCHAR(32) NOT NULL,
  `comment` TEXT NULL,
  `diff` JSON NULL,
  `actor` VARCHAR(255) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_approval_item` (`content_item_id`),
  CONSTRAINT `fk_approval_item` FOREIGN KEY (`content_item_id`) REFERENCES `content_item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_approval_version` FOREIGN KEY (`version_id`) REFERENCES `content_version`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `publication` (
  `id` CHAR(36) NOT NULL,
  `content_item_id` CHAR(36) NOT NULL,
  `channel_variant_id` CHAR(36) NOT NULL,
  `adapter` VARCHAR(128) NOT NULL,
  `external_id` VARCHAR(500) NULL,
  `url` VARCHAR(2048) NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'pending',
  `idempotency_key` VARCHAR(255) NOT NULL,
  `error` TEXT NULL,
  `published_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_publication_idempotency` (`idempotency_key`),
  KEY `idx_publication_item` (`content_item_id`),
  KEY `idx_publication_variant` (`channel_variant_id`),
  CONSTRAINT `fk_publication_item` FOREIGN KEY (`content_item_id`) REFERENCES `content_item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_publication_variant` FOREIGN KEY (`channel_variant_id`) REFERENCES `channel_variant`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `metric_snapshot` (
  `id` CHAR(36) NOT NULL,
  `publication_id` CHAR(36) NOT NULL,
  `metrics` JSON NOT NULL,
  `captured_at` DATETIME(3) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_metric_snapshot_pub` (`publication_id`),
  CONSTRAINT `fk_metric_snapshot_pub` FOREIGN KEY (`publication_id`) REFERENCES `publication`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `reflection` (
  `id` CHAR(36) NOT NULL,
  `content_item_id` CHAR(36) NOT NULL,
  `observation` TEXT NOT NULL,
  `confidence` VARCHAR(16) NOT NULL,
  `possible_causes` JSON NULL,
  `next_test` TEXT NULL,
  `do_not_conclude` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_reflection_item` (`content_item_id`),
  CONSTRAINT `fk_reflection_item` FOREIGN KEY (`content_item_id`) REFERENCES `content_item`(`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `audit_event` (
  `id` CHAR(36) NOT NULL,
  `content_item_id` CHAR(36) NULL,
  `actor` VARCHAR(255) NOT NULL,
  `action` VARCHAR(128) NOT NULL,
  `payload` JSON NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_audit_item` (`content_item_id`),
  KEY `idx_audit_action` (`action`),
  CONSTRAINT `fk_audit_item` FOREIGN KEY (`content_item_id`) REFERENCES `content_item`(`id`) ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
