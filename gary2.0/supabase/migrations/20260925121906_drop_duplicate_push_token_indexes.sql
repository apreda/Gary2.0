-- Keep the device_token unique constraint and its backing index. These two
-- standalone unique indexes cover the same column and add write overhead.
drop index if exists public.push_tokens_device_token_idx;
drop index if exists public.push_tokens_token_idx;
