import { authenticatedInboxId } from './inbox.js';

export const SCOPE = 'meals:write';
export const PRODUCTION_ORIGIN = 'https://meal-tracker-cloud.nest-task-manager.workers.dev';

export async function sha256(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

function randomCode() {
    return [...crypto.getRandomValues(new Uint8Array(16))].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function handlePairing(request, env, cors) {
    const inboxId = await authenticatedInboxId(request);
    if (request.method === 'DELETE') {
        await env.DB.batch([
            env.DB.prepare('INSERT INTO mcp_accounts (inbox_id, generation) VALUES (?, 2) ON CONFLICT(inbox_id) DO UPDATE SET generation = generation + 1').bind(inboxId),
            env.DB.prepare('DELETE FROM mcp_pairing_codes WHERE inbox_id = ?').bind(inboxId)
        ]);
        return Response.json({ ok: true }, { headers: cors });
    }
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    const code = randomCode();
    await env.DB.batch([
        env.DB.prepare('DELETE FROM mcp_pairing_codes WHERE expires_at < unixepoch()'),
        env.DB.prepare('INSERT OR IGNORE INTO mcp_accounts (inbox_id) VALUES (?)').bind(inboxId),
        env.DB.prepare(`INSERT INTO mcp_pairing_codes (code_hash, inbox_id, generation, expires_at)
            SELECT ?, inbox_id, generation, unixepoch() + 600 FROM mcp_accounts WHERE inbox_id = ?
            ON CONFLICT(inbox_id) DO UPDATE SET code_hash = excluded.code_hash, generation = excluded.generation, expires_at = excluded.expires_at`).bind(await sha256(code), inboxId)
    ]);
    return Response.json({ code, expiresIn: 600 }, { headers: cors });
}

export function allowedRedirect(value) {
    try {
        const url = new URL(value);
        return url.origin === 'https://chatgpt.com' && !url.username && !url.password && !url.search && !url.hash &&
            (url.pathname === '/connector_platform_oauth_redirect' || /^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(url.pathname));
    } catch { return false; }
}

function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function page(content, status = 200, cookie) {
    return new Response(`<!doctype html><html lang="ja"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>MealLogと連携</title><style>body{font:17px system-ui;max-width:460px;margin:50px auto;padding:24px;line-height:1.7;color:#243b2a;background:#f5f8f3}input,button{box-sizing:border-box;width:100%;font:inherit;padding:14px;margin:12px 0;border-radius:8px;border:1px solid #aaa}button{background:#3c6e47;color:white}small{display:block}</style><h1>MealLogと連携</h1>${content}</html>`, {
        status, headers: {
            'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store',
            'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; frame-ancestors 'none'; base-uri 'none'",
            'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
            ...(cookie ? { 'Set-Cookie': cookie } : {})
        }
    });
}

export async function handleAuthorize(request, env) {
    const url = new URL(request.url);
    if (request.method === 'GET') {
        let auth;
        try { auth = await env.OAUTH_PROVIDER.parseAuthRequest(request); }
        catch { return page('<p>連携リクエストが無効です。ChatGPTから接続をやり直してください。</p>', 400); }
        if (!allowedRedirect(auth.redirectUri) || auth.codeChallengeMethod !== 'S256' || !auth.codeChallenge ||
            auth.scope.some(scope => scope !== SCOPE)) {
            return page('<p>この接続は許可されていません。ChatGPTから接続してください。</p>', 400);
        }
        const client = await env.OAUTH_PROVIDER.lookupClient(auth.clientId);
        const session = randomCode();
        await env.DB.batch([
            env.DB.prepare('DELETE FROM mcp_consent_sessions WHERE expires_at < unixepoch()'),
            env.DB.prepare('INSERT INTO mcp_consent_sessions VALUES (?, ?, unixepoch() + 600)').bind(await sha256(session), JSON.stringify(auth))
        ]);
        const cookie = `meallog_consent=${session}; HttpOnly; SameSite=Lax; Path=/oauth/authorize; Max-Age=600${url.protocol === 'https:' ? '; Secure' : ''}`;
        return page(`<p><b>${escapeHtml(client?.clientName || 'ChatGPT')}</b> に食事の追加を許可します。過去の食事やクラウド復旧コードは渡しません。</p><p>iPhoneのMealLogを開き、<b>設定 → ChatGPT連携 → 連携コードを発行</b>で表示されたコードを入力してください。</p><form method="post" action="/oauth/authorize"><input type="hidden" name="session" value="${session}"><label for="code">連携コード（10分間有効）</label><input id="code" name="code" required autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="40"><button type="submit" name="decision" value="allow">食事の追加を許可する</button><button type="submit" name="decision" value="deny" formnovalidate>キャンセル</button></form><small>食事はサーバーの受け箱に保存され、MealLogを開くと記録に入ります。設定からいつでも連携を解除できます。</small>`, 200, cookie);
    }
    if (request.method !== 'POST') return new Response(null, { status: 405 });
    if (request.headers.get('Origin') !== url.origin) return page('<p>接続をやり直してください。</p>', 403);
    const form = await request.formData();
    const session = form.get('session');
    const cookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)meallog_consent=([a-f0-9]{32})(?:;|$)/)?.[1];
    if (typeof session !== 'string' || !/^[a-f0-9]{32}$/.test(session) || cookie !== session) return page('<p>接続をやり直してください。</p>', 403);
    const pending = await env.DB.prepare('SELECT auth_request FROM mcp_consent_sessions WHERE session_hash = ? AND expires_at > unixepoch()').bind(await sha256(session)).first();
    if (!pending) return page('<p>有効期限が切れました。ChatGPTから接続をやり直してください。</p>', 400);
    const auth = JSON.parse(pending.auth_request);
    if (form.get('decision') === 'deny') {
        await env.DB.prepare('DELETE FROM mcp_consent_sessions WHERE session_hash = ?').bind(await sha256(session)).run();
        const redirect = new URL(auth.redirectUri);
        redirect.searchParams.set('error', 'access_denied');
        redirect.searchParams.set('iss', env.MCP_ORIGIN || PRODUCTION_ORIGIN);
        if (auth.state) redirect.searchParams.set('state', auth.state);
        return Response.redirect(redirect, 303);
    }
    const code = String(form.get('code') || '').replace(/\s/g, '').toLowerCase();
    if (form.get('decision') !== 'allow' || !/^[a-f0-9]{32}$/.test(code)) return page('<p>コードが違います。戻って入力し直してください。</p>', 400);
    // D1 DELETE RETURNING makes a pairing code single use, including concurrent submissions.
    const account = await env.DB.prepare(`DELETE FROM mcp_pairing_codes WHERE code_hash = ? AND expires_at > unixepoch()
        AND generation = (SELECT generation FROM mcp_accounts WHERE inbox_id = mcp_pairing_codes.inbox_id)
        RETURNING inbox_id, generation`).bind(await sha256(code)).first();
    if (!account) return page('<p>コードが無効または期限切れです。MealLogで発行し直し、ChatGPTから再接続してください。</p>', 400);
    await env.DB.prepare('DELETE FROM mcp_consent_sessions WHERE session_hash = ?').bind(await sha256(session)).run();
    const { redirectTo } = await env.OAUTH_PROVIDER.completeAuthorization({
        request: auth, userId: account.inbox_id, metadata: { source: 'MealLog' }, scope: [SCOPE],
        props: { inboxId: account.inbox_id, generation: account.generation }
    });
    return new Response(null, { status: 303, headers: { Location: redirectTo, 'Cache-Control': 'no-store', 'Set-Cookie': 'meallog_consent=; HttpOnly; SameSite=Lax; Path=/oauth/authorize; Max-Age=0' } });
}
