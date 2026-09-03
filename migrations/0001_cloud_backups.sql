CREATE TABLE IF NOT EXISTS vaults (
    vault_id TEXT PRIMARY KEY,
    encrypted_payload TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    client_updated_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS vault_snapshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vault_id TEXT NOT NULL,
    encrypted_payload TEXT NOT NULL,
    content_hash TEXT NOT NULL,
    client_updated_at INTEGER NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    UNIQUE (vault_id, content_hash)
);

CREATE INDEX IF NOT EXISTS idx_vault_snapshots_recent
    ON vault_snapshots (vault_id, created_at DESC);
