-- rollback 002_auth_owner
ALTER TABLE `audit_event` DROP FOREIGN KEY `fk_audit_owner`;
ALTER TABLE `audit_event` DROP KEY `idx_audit_owner`;
ALTER TABLE `audit_event` DROP COLUMN `owner_user_id`;

ALTER TABLE `source` DROP FOREIGN KEY `fk_source_owner`;
ALTER TABLE `source` DROP KEY `idx_source_owner`;
ALTER TABLE `source` DROP COLUMN `owner_user_id`;

ALTER TABLE `reflection` DROP FOREIGN KEY `fk_reflection_owner`;
ALTER TABLE `reflection` DROP KEY `idx_reflection_owner`;
ALTER TABLE `reflection` DROP COLUMN `owner_user_id`;

ALTER TABLE `metric_snapshot` DROP FOREIGN KEY `fk_metric_snapshot_owner`;
ALTER TABLE `metric_snapshot` DROP KEY `idx_metric_snapshot_owner`;
ALTER TABLE `metric_snapshot` DROP COLUMN `owner_user_id`;

ALTER TABLE `publication` DROP FOREIGN KEY `fk_publication_owner`;
ALTER TABLE `publication` DROP KEY `idx_publication_owner`;
ALTER TABLE `publication` DROP COLUMN `owner_user_id`;

ALTER TABLE `approval` DROP FOREIGN KEY `fk_approval_owner`;
ALTER TABLE `approval` DROP KEY `idx_approval_owner`;
ALTER TABLE `approval` DROP COLUMN `owner_user_id`;

ALTER TABLE `channel_variant` DROP FOREIGN KEY `fk_channel_variant_owner`;
ALTER TABLE `channel_variant` DROP KEY `idx_channel_variant_owner`;
ALTER TABLE `channel_variant` DROP COLUMN `owner_user_id`;

ALTER TABLE `content_version` DROP FOREIGN KEY `fk_content_version_owner`;
ALTER TABLE `content_version` DROP KEY `idx_content_version_owner`;
ALTER TABLE `content_version` DROP COLUMN `owner_user_id`;

ALTER TABLE `content_item` DROP FOREIGN KEY `fk_content_item_owner`;
ALTER TABLE `content_item` DROP KEY `idx_content_item_owner`;
ALTER TABLE `content_item` DROP COLUMN `owner_user_id`;

ALTER TABLE `project` DROP FOREIGN KEY `fk_project_owner`;
ALTER TABLE `project` DROP KEY `idx_project_owner`;
ALTER TABLE `project` DROP COLUMN `owner_user_id`;

DROP TABLE IF EXISTS `users`;
