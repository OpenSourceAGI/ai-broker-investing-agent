CREATE TABLE `polymarket_trade_history` (
	`id` text PRIMARY KEY NOT NULL,
	`trader_id` text NOT NULL,
	`transaction_hash` text NOT NULL,
	`condition_id` text NOT NULL,
	`market_title` text,
	`market_slug` text,
	`event_slug` text,
	`type` text NOT NULL,
	`side` text,
	`outcome` text,
	`outcome_index` integer,
	`size` real NOT NULL,
	`usdc_size` real NOT NULL,
	`price` real,
	`trader_name` text,
	`trader_bio` text,
	`trader_profile_image` text,
	`timestamp` integer NOT NULL,
	`synced_at` integer NOT NULL,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `polymarket_trade_sync_status` (
	`trader_id` text PRIMARY KEY NOT NULL,
	`last_synced_timestamp` integer,
	`total_trades_synced` integer DEFAULT 0,
	`sync_status` text DEFAULT 'pending' NOT NULL,
	`error_message` text,
	`last_sync_attempt` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `user_settings` ADD `ui_config` text;--> statement-breakpoint
ALTER TABLE `polymarket_holders` ADD `overall_gain` real;--> statement-breakpoint
ALTER TABLE `polymarket_holders` ADD `win_rate` real;--> statement-breakpoint
ALTER TABLE `polymarket_holders` ADD `total_profit` real;--> statement-breakpoint
ALTER TABLE `polymarket_holders` ADD `total_loss` real;--> statement-breakpoint
ALTER TABLE `polymarket_holders` ADD `total_positions` integer;--> statement-breakpoint
ALTER TABLE `polymarket_markets` ADD `condition_id` text;