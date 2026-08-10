CREATE TABLE `nvstly_leaders` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`rank` integer,
	`rep` real,
	`trades` integer,
	`win_rate` real,
	`total_gain` real,
	`avg_return` real,
	`broker` text,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `nvstly_trades` (
	`id` text PRIMARY KEY NOT NULL,
	`trader_id` text NOT NULL,
	`symbol` text NOT NULL,
	`type` text NOT NULL,
	`price` real,
	`previous_price` real,
	`gain` real,
	`time` integer,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `stock_fundamentals` (
	`symbol` text PRIMARY KEY NOT NULL,
	`pe_ratio` real,
	`eps` real,
	`dividend_yield` real,
	`beta` real,
	`fifty_two_week_high` real,
	`fifty_two_week_low` real,
	`fifty_day_average` real,
	`two_hundred_day_average` real,
	`shares_outstanding` real,
	`book_value` real,
	`price_to_book` real,
	`trailing_pe` real,
	`forward_pe` real,
	`last_fetched` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_historical_quotes` (
	`id` text PRIMARY KEY NOT NULL,
	`symbol` text NOT NULL,
	`date` text NOT NULL,
	`open` real NOT NULL,
	`high` real NOT NULL,
	`low` real NOT NULL,
	`close` real NOT NULL,
	`volume` real,
	`adjusted_close` real,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `stock_quote_cache` (
	`symbol` text PRIMARY KEY NOT NULL,
	`price` real NOT NULL,
	`change` real,
	`change_percent` real,
	`open` real,
	`high` real,
	`low` real,
	`previous_close` real,
	`volume` real,
	`market_cap` real,
	`currency` text DEFAULT 'USD',
	`name` text,
	`exchange` text,
	`source` text NOT NULL,
	`last_fetched` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
