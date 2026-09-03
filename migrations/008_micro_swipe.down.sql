-- 008_micro_swipe down — drop swipe tables (children first for FKs)
-- Idempotent via INFORMATION_SCHEMA guards (same pattern as 007)
SET NAMES utf8mb4;

SET @tbl_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'swipe_vote');
SET @sql := IF(@tbl_exists = 1, 'DROP TABLE `swipe_vote`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'swipe_option');
SET @sql := IF(@tbl_exists = 1, 'DROP TABLE `swipe_option`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'swipe_batch');
SET @sql := IF(@tbl_exists = 1, 'DROP TABLE `swipe_batch`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @tbl_exists := (SELECT COUNT(*) FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'taste_profile');
SET @sql := IF(@tbl_exists = 1, 'DROP TABLE `taste_profile`', 'SELECT 1');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
