CREATE TABLE `dukascopy_index_cache` (
	`symbol` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`country` text NOT NULL,
	`country_code` text NOT NULL,
	`price` real NOT NULL,
	`daily_change` real NOT NULL,
	`daily_change_percent` real NOT NULL,
	`volume` real DEFAULT 0,
	`monthly_change_percent` real DEFAULT 0,
	`yearly_change_percent` real DEFAULT 0,
	`chart_data` text NOT NULL,
	`last_fetched` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
