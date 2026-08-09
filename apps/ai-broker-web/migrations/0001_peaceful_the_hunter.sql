CREATE TABLE `agent_api_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`symbol` text NOT NULL,
	`request_payload` text,
	`response_signal` text,
	`response_analysis` text,
	`llm_provider` text,
	`model_used` text,
	`timestamp` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
ALTER TABLE `users` ADD `api_key` text;--> statement-breakpoint
ALTER TABLE `users` ADD `usage_count` integer DEFAULT 0;--> statement-breakpoint
CREATE UNIQUE INDEX `users_api_key_unique` ON `users` (`api_key`);
