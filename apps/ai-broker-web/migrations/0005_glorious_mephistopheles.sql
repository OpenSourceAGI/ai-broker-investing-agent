CREATE TABLE `wallet_addresses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`wallet_address` text NOT NULL,
	`chain_id` integer,
	`is_primary` integer DEFAULT false,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `wallet_addresses_wallet_address_unique` ON `wallet_addresses` (`wallet_address`);--> statement-breakpoint
CREATE TABLE `watchlist` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`symbol` text NOT NULL,
	`name` text,
	`added_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `tda_api_key`;--> statement-breakpoint
ALTER TABLE `user_settings` DROP COLUMN `tda_refresh_token`;
