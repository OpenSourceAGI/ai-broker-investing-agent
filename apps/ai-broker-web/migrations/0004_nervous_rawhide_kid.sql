CREATE TABLE `polymarket_debates` (
	`id` text PRIMARY KEY NOT NULL,
	`market_id` text NOT NULL,
	`question` text NOT NULL,
	`yes_arguments` text NOT NULL,
	`no_arguments` text NOT NULL,
	`yes_summary` text NOT NULL,
	`no_summary` text NOT NULL,
	`key_factors` text NOT NULL,
	`uncertainties` text NOT NULL,
	`current_yes_price` real,
	`current_no_price` real,
	`llm_provider` text,
	`model` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `polymarket_debates_market_id_unique` ON `polymarket_debates` (`market_id`);--> statement-breakpoint
CREATE TABLE `polymarket_market_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`market_id` text NOT NULL,
	`outcome` text NOT NULL,
	`price` real NOT NULL,
	`size` real NOT NULL,
	`side` text NOT NULL,
	`total_value` real NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `user_settings` ADD `tda_api_key` text;--> statement-breakpoint
ALTER TABLE `user_settings` ADD `tda_refresh_token` text;--> statement-breakpoint
ALTER TABLE `users` ADD `alpaca_key_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `alpaca_secret_key` text;--> statement-breakpoint
ALTER TABLE `users` ADD `alpaca_paper` integer DEFAULT true;
