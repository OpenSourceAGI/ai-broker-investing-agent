-- Restore an age column on the quote cache.
--
-- `stock_quote_cache` rows carried no timestamp, so `getCachedQuote` had no way
-- to apply the `cacheTTL` its callers pass and every cached quote was served
-- indefinitely. Existing rows get NULL, which the service treats as expired, so
-- each symbol is refetched once and then cached with a real timestamp.
ALTER TABLE `stock_quote_cache` ADD `updated_at` integer;
