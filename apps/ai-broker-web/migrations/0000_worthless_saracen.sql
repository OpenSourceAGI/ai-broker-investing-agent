CREATE TABLE `accounts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`account_id` text NOT NULL,
	`provider_id` text NOT NULL,
	`access_token` text,
	`refresh_token` text,
	`id_token` text,
	`expires_at` integer,
	`access_token_expires_at` integer,
	`scope` text,
	`password` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `polymarket_categories` (
	`tag` text PRIMARY KEY NOT NULL,
	`pnl` real,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `polymarket_leaders` (
	`trader` text PRIMARY KEY NOT NULL,
	`overall_gain` real,
	`win_rate` real,
	`active_positions` integer,
	`total_positions` integer,
	`current_value` real,
	`win_amount` real,
	`loss_amount` real,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `polymarket_positions` (
	`id` text PRIMARY KEY NOT NULL,
	`trader_id` text NOT NULL,
	`market_id` text,
	`market_title` text,
	`cash_pnl` real,
	`realized_pnl` real,
	`tags` text,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `portfolios` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`total_equity` real DEFAULT 100000,
	`cash` real DEFAULT 100000,
	`stocks` real DEFAULT 0,
	`prediction_markets` real DEFAULT 0,
	`margin` real DEFAULT 0,
	`daily_pnl` real DEFAULT 0,
	`daily_pnl_percent` real DEFAULT 0,
	`win_rate` real DEFAULT 0,
	`open_positions` integer DEFAULT 0,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `portfolios_user_id_unique` ON `portfolios` (`user_id`);--> statement-breakpoint
CREATE TABLE `positions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`asset` text NOT NULL,
	`type` text NOT NULL,
	`entry_price` real NOT NULL,
	`current_price` real NOT NULL,
	`size` real NOT NULL,
	`unrealized_pnl` real DEFAULT 0,
	`unrealized_pnl_percent` real DEFAULT 0,
	`strategy` text,
	`opened_by` text,
	`opened_at` integer NOT NULL,
	`closed_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`expires_at` integer NOT NULL,
	`token` text NOT NULL,
	`ip_address` text,
	`user_agent` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `sessions_token_unique` ON `sessions` (`token`);--> statement-breakpoint
CREATE TABLE `signals` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`asset` text NOT NULL,
	`type` text NOT NULL,
	`combined_score` real NOT NULL,
	`score_label` text NOT NULL,
	`fundamentals_score` real,
	`vix_score` real,
	`technical_score` real,
	`sentiment_score` real,
	`strategy` text,
	`timeframe` text,
	`suggested_action` text,
	`suggested_size` text,
	`metadata` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `strategies` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`type` text NOT NULL,
	`status` text DEFAULT 'paused' NOT NULL,
	`risk_level` text DEFAULT 'medium' NOT NULL,
	`today_pnl` real DEFAULT 0,
	`last_7days_pnl` real DEFAULT 0,
	`last_30days_pnl` real DEFAULT 0,
	`win_rate` real DEFAULT 0,
	`active_markets` integer DEFAULT 0,
	`trades_today` integer DEFAULT 0,
	`config` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `trades` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`asset` text NOT NULL,
	`type` text NOT NULL,
	`action` text NOT NULL,
	`price` real NOT NULL,
	`size` real NOT NULL,
	`pnl` real,
	`strategy` text,
	`copied_from` text,
	`timestamp` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`groq_api_key` text,
	`openai_api_key` text,
	`anthropic_api_key` text,
	`xai_api_key` text,
	`google_api_key` text,
	`togetherai_api_key` text,
	`perplexity_api_key` text,
	`cloudflare_api_key` text,
	`alpaca_api_key` text,
	`alpaca_api_secret` text,
	`alpaca_base_url` text,
	`webull_username` text,
	`webull_password` text,
	`robinhood_username` text,
	`robinhood_password` text,
	`ibkr_username` text,
	`ibkr_password` text,
	`alpha_vantage_api_key` text,
	`finnhub_api_key` text,
	`polygon_api_key` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_settings_user_id_unique` ON `user_settings` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`email_verified` integer DEFAULT false,
	`image` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `users_email_unique` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `verifications` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expires_at` integer NOT NULL,
	`created_at` integer,
	`updated_at` integer
);
--> statement-breakpoint
CREATE TABLE `zulu_currency_stats` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` integer NOT NULL,
	`currency_name` text,
	`total_count` integer,
	`win_count` integer,
	`win_percent` real,
	`total_buy_count` integer,
	`total_sell_count` integer,
	`pips` real,
	`created_at` integer
);
--> statement-breakpoint
CREATE TABLE `zulu_traders` (
	`provider_id` integer PRIMARY KEY NOT NULL,
	`name` text,
	`strategy_desc` text,
	`country_code` text,
	`country_name` text,
	`broker_name` text,
	`balance` real,
	`equity` real,
	`followers` integer,
	`live_followers` integer,
	`roi_annualized` real,
	`roi_profit` real,
	`zulu_rank` integer,
	`best_trade` real,
	`worst_trade` real,
	`profitable_trades` integer,
	`losing_trades` integer,
	`avg_drawdown` real,
	`max_drawdown` real,
	`max_drawdown_percent` real,
	`leverage` real,
	`is_ea` integer,
	`currencies` text,
	`weeks` integer,
	`demo` integer,
	`avg_trade_seconds` integer,
	`avg_pnl_per_trade` real,
	`win_rate` real,
	`total_trades` integer,
	`page_visits` integer,
	`included_in_watchlist` integer,
	`registration_date` integer,
	`last_open_trade_date` integer,
	`updated_at` integer
);
