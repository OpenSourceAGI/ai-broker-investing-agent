CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`plan` text NOT NULL,
	`reference_id` text NOT NULL,
	`stripe_customer_id` text,
	`stripe_subscription_id` text,
	`status` text DEFAULT 'incomplete',
	`period_start` integer,
	`period_end` integer,
	`trial_start` integer,
	`trial_end` integer,
	`cancel_at_period_end` integer DEFAULT false,
	`cancel_at` integer,
	`canceled_at` integer,
	`ended_at` integer,
	`seats` integer,
	`billing_interval` text,
	`stripe_schedule_id` text
);
--> statement-breakpoint
ALTER TABLE `accounts` ADD `issuer` text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE `accounts` ADD `refresh_token_expires_at` integer;--> statement-breakpoint
UPDATE `accounts` SET `issuer` = 'local:credential' WHERE `issuer` = '' AND `provider_id` = 'credential';--> statement-breakpoint
UPDATE `accounts` SET `issuer` = 'local:siwe' WHERE `issuer` = '' AND `provider_id` = 'siwe';--> statement-breakpoint
UPDATE `accounts` SET `issuer` = 'https://accounts.google.com' WHERE `issuer` = '' AND `provider_id` = 'google';--> statement-breakpoint
UPDATE `accounts` SET `issuer` = 'local:oauth:' || `provider_id` WHERE `issuer` = '';--> statement-breakpoint
CREATE UNIQUE INDEX `accounts_issuer_account_id_idx` ON `accounts` (`issuer`,`account_id`);--> statement-breakpoint
ALTER TABLE `users` ADD `stripe_customer_id` text;--> statement-breakpoint
ALTER TABLE `users` ADD `trial_allowed` integer DEFAULT true;