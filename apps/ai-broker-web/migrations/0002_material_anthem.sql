CREATE TABLE `polymarket_markets` (
	`id` text PRIMARY KEY NOT NULL,
	`question` text NOT NULL,
	`slug` text NOT NULL,
	`description` text,
	`image` text,
	`volume_24hr` real,
	`volume_total` real,
	`active` integer DEFAULT true,
	`closed` integer DEFAULT false,
	`outcomes` text NOT NULL,
	`outcome_prices` text NOT NULL,
	`tags` text,
	`end_date` text,
	`group_item_title` text,
	`enable_order_book` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
