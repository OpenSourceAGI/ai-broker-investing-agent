CREATE TABLE `polymarket_price_history` (
	`id` text PRIMARY KEY NOT NULL,
	`token_id` text NOT NULL,
	`timestamp` integer NOT NULL,
	`price` real NOT NULL,
	`interval` text NOT NULL,
	`created_at` integer NOT NULL
);
