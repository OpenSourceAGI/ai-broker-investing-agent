CREATE TABLE `polymarket_holders` (
	`id` text PRIMARY KEY NOT NULL,
	`market_id` text NOT NULL,
	`address` text NOT NULL,
	`user_name` text,
	`profile_image` text,
	`rank` integer NOT NULL,
	`outcome` text,
	`balance` real NOT NULL,
	`value` real NOT NULL,
	`updated_at` integer NOT NULL
);
