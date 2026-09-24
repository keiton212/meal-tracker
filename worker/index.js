import { handleInbox } from './inbox.js';

const MAX_ENCRYPTED_PAYLOAD_BYTES = 900_000;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const cors = corsHeaders(request, env, url.origin);

        if (request.method === 'OPTIONS' && (url.pathname.startsWith('/api/') || url.pathname.startsWith('/v1/'))) {
            return new Response(null, { status: 204, headers: cors });
        }

        if (url.pathname === '/api/health' && request.method === 'GET') {
            return json({ ok: true }, 200, cors);
        }

        if (url.pathname.startsWith('/v1/')) {
            try {
                return await handleInbox(request, env, url, cors);
            } catch (error) {
                if (isHttpError(error)) return json({ error: error.message }, error.status, cors);
                console.error('inbox failed', error);
                return json({ error: 'internal_error' }, 500, cors);
            }
        }

        if (url.pathname === '/api/sync') {
            try {
                const vaultId = await authenticatedVaultId(request);
                if (request.method === 'GET') return await getLatest(env.DB, vaultId, cors);
                if (request.method === 'PUT') return await saveSnapshot(request, env.DB, vaultId, cors);
                return json({ error: 'method_not_allowed' }, 405, cors);
            } catch (error) {
                if (error instanceof HttpError) return json({ error: error.message }, error.status, cors);
                console.error('cloud sync failed', error);
                return json({ error: 'internal_error' }, 500, cors);
            }
        }

        return env.ASSETS.fetch(request);
    }
};

async function getLatest(db, vaultId, headers) {
    const row = await db.prepare(
        `SELECT encrypted_payload AS encryptedPayload,
                content_hash AS contentHash,
                client_updated_at AS clientUpdatedAt,
                updated_at AS serverUpdatedAt
         FROM vaults WHERE vault_id = ?`
    ).bind(vaultId).first();

    if (!row) return json({ found: false }, 200, headers);
    return json({ found: true, ...row }, 200, headers);
}

async function saveSnapshot(request, db, vaultId, headers) {
    const body = await readJson(request);
    const encryptedPayload = body.encryptedPayload;
    const contentHash = body.contentHash;
    const clientUpdatedAt = Number(body.clientUpdatedAt);

    if (typeof encryptedPayload !== 'string' || byteLength(encryptedPayload) > MAX_ENCRYPTED_PAYLOAD_BYTES) {
        throw new HttpError(413, 'payload_too_large');
    }
    if (!/^[a-f0-9]{64}$/.test(contentHash || '')) throw new HttpError(400, 'invalid_content_hash');
    if (!Number.isSafeInteger(clientUpdatedAt) || clientUpdatedAt <= 0) throw new HttpError(400, 'invalid_timestamp');

    let envelope;
    try {
        envelope = JSON.parse(encryptedPayload);
    } catch {
        throw new HttpError(400, 'invalid_encrypted_payload');
    }
    if (envelope?.version !== 1 || typeof envelope.iv !== 'string' || typeof envelope.ciphertext !== 'string') {
        throw new HttpError(400, 'invalid_encrypted_payload');
    }

    await db.batch([
        db.prepare(
            `INSERT OR IGNORE INTO vault_snapshots
                (vault_id, encrypted_payload, content_hash, client_updated_at)
             VALUES (?, ?, ?, ?)`
        ).bind(vaultId, encryptedPayload, contentHash, clientUpdatedAt),
        db.prepare(
            `INSERT INTO vaults
                (vault_id, encrypted_payload, content_hash, client_updated_at, updated_at)
             VALUES (?, ?, ?, ?, unixepoch())
             ON CONFLICT(vault_id) DO UPDATE SET
                encrypted_payload = excluded.encrypted_payload,
                content_hash = excluded.content_hash,
                client_updated_at = excluded.client_updated_at,
                updated_at = unixepoch()`
        ).bind(vaultId, encryptedPayload, contentHash, clientUpdatedAt)
    ]);

    return json({ ok: true, contentHash }, 200, headers);
}

async function authenticatedVaultId(request) {
    const authorization = request.headers.get('Authorization') || '';
    if (!authorization.startsWith('Bearer ')) throw new HttpError(401, 'unauthorized');
    const token = authorization.slice(7);
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) throw new HttpError(401, 'unauthorized');
    return sha256Hex(`MealLog vault id v1\n${token}`);
}

function corsHeaders(request, env, ownOrigin) {
    const origin = request.headers.get('Origin');
    const allowed = new Set((env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim()).filter(Boolean));
    allowed.add(ownOrigin);
    const headers = {
        'Access-Control-Allow-Methods': 'GET, PUT, POST, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        'Cache-Control': 'no-store',
        'Vary': 'Origin',
        'X-Content-Type-Options': 'nosniff'
    };
    if (origin && allowed.has(origin)) headers['Access-Control-Allow-Origin'] = origin;
    return headers;
}

async function readJson(request) {
    try {
        return await request.json();
    } catch {
        throw new HttpError(400, 'invalid_json');
    }
}

function json(body, status, extraHeaders) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...extraHeaders, 'Content-Type': 'application/json; charset=utf-8' }
    });
}

function byteLength(value) {
    return new TextEncoder().encode(value).byteLength;
}

async function sha256Hex(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

function isHttpError(error) {
    return error instanceof HttpError || (Number.isInteger(error?.status) && error.status >= 400 && error.status < 600);
}

class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
