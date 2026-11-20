-- ------
-- BGA framework: Gregory Isabelli & Emmanuel Colin & BoardGameArena
-- DeepDiveFG implementation : © Flatout Games / BGA Studio
-- 
-- Database schema for Deep Dive
-- ------

CREATE TABLE IF NOT EXISTS `ocean_tile` (
  `tile_id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `depth` TINYINT UNSIGNED NOT NULL,
  `category` VARCHAR(16) NOT NULL,
  `food_color` VARCHAR(16) DEFAULT NULL,
  `points` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `is_extra` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `is_faceup` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `owner_id` INT UNSIGNED DEFAULT NULL,
  `row_index` TINYINT UNSIGNED DEFAULT NULL,
  `location` VARCHAR(16) NOT NULL DEFAULT 'ocean',
  `tile_order` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`tile_id`),
  INDEX `idx_location_depth` (`location`, `depth`),
  INDEX `idx_owner` (`owner_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 AUTO_INCREMENT=1;

CREATE TABLE IF NOT EXISTS `trapped_penguin` (
  `id` INT UNSIGNED NOT NULL AUTO_INCREMENT,
  `player_id` INT UNSIGNED NOT NULL,
  `tile_id` INT UNSIGNED NOT NULL,
  `depth` TINYINT UNSIGNED NOT NULL,
  PRIMARY KEY (`id`),
  INDEX `idx_player` (`player_id`),
  INDEX `idx_tile` (`tile_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 AUTO_INCREMENT=1;
