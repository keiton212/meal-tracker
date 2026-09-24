CREATE TABLE IF NOT EXISTS vapid_keys (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    public_key TEXT NOT NULL,
    private_jwk TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS inbox_items (
    id TEXT PRIMARY KEY,
    inbox_id TEXT NOT NULL,
    payload TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_inbox_items_owner
    ON inbox_items (inbox_id, created_at);

CREATE TABLE IF NOT EXISTS push_subscriptions (
    inbox_id TEXT PRIMARY KEY,
    subscription TEXT NOT NULL,
    updated_at INTEGER NOT NULL
);
