CREATE TABLE IF NOT EXISTS mcp_accounts (
    inbox_id TEXT PRIMARY KEY,
    generation INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS mcp_pairing_codes (
    code_hash TEXT PRIMARY KEY,
    inbox_id TEXT NOT NULL UNIQUE,
    generation INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mcp_consent_sessions (
    session_hash TEXT PRIMARY KEY,
    auth_request TEXT NOT NULL,
    expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS meal_requests (
    inbox_id TEXT NOT NULL,
    request_id TEXT NOT NULL,
    body_hash TEXT NOT NULL,
    result TEXT NOT NULL,
    created_at INTEGER NOT NULL DEFAULT (unixepoch()),
    PRIMARY KEY (inbox_id, request_id)
);
-- Enforce capacity inside the same transaction as insertion, including parallel calls.
CREATE TRIGGER IF NOT EXISTS inbox_capacity_guard BEFORE INSERT ON inbox_items
WHEN (SELECT COUNT(*) FROM inbox_items WHERE inbox_id = NEW.inbox_id AND created_at >= unixepoch() - 604800) >= 50
BEGIN
    SELECT RAISE(ABORT, 'inbox_full');
END;
