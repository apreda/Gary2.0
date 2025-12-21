-- Push notification tokens table
-- Stores device tokens for sending push notifications via FCM

CREATE TABLE IF NOT EXISTS push_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_token TEXT NOT NULL UNIQUE,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for querying active tokens
CREATE INDEX IF NOT EXISTS idx_push_tokens_active ON push_tokens(active) WHERE active = true;

-- Enable Row Level Security
ALTER TABLE push_tokens ENABLE ROW LEVEL SECURITY;

-- Allow anonymous inserts (for device registration)
CREATE POLICY "Allow anonymous insert" ON push_tokens
    FOR INSERT
    WITH CHECK (true);

-- Allow updates to own token (by device_token)
CREATE POLICY "Allow update own token" ON push_tokens
    FOR UPDATE
    USING (true);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_push_tokens_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger to auto-update updated_at
DROP TRIGGER IF EXISTS trigger_push_tokens_updated_at ON push_tokens;
CREATE TRIGGER trigger_push_tokens_updated_at
    BEFORE UPDATE ON push_tokens
    FOR EACH ROW
    EXECUTE FUNCTION update_push_tokens_updated_at();

-- Upsert function for token registration
CREATE OR REPLACE FUNCTION upsert_push_token(p_device_token TEXT, p_platform TEXT)
RETURNS void AS $$
BEGIN
    INSERT INTO push_tokens (device_token, platform, active)
    VALUES (p_device_token, p_platform, true)
    ON CONFLICT (device_token)
    DO UPDATE SET active = true, updated_at = NOW();
END;
$$ LANGUAGE plpgsql;
