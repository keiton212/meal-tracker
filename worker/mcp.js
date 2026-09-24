import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { z } from 'zod';
import { enqueueMeals } from './inbox.js';
import { SCOPE } from './oauth.js';

const mealSchema = z.object({
    name: z.string().trim().min(1).max(120).describe('食べた品名。分量も名前に含めてよい。'),
    kcal: z.number().min(0).max(20000).describe('食べた全量のカロリー。amountで再度掛けない。'),
    p: z.number().min(0).max(2000).describe('食べた全量のたんぱく質g'),
    f: z.number().min(0).max(2000).describe('食べた全量の脂質g'),
    c: z.number().min(0).max(2000).describe('食べた全量の炭水化物g'),
    amount: z.number().min(0.01).max(10000).optional().describe('表示用の量。省略時は1。栄養値に掛けない。'),
    unit: z.string().trim().min(1).max(8).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().describe('指定がなければ省略。サーバーが日本時間の今日を決める。'),
    meal: z.enum(['b1', 'b2', 'lunch', 'snack', 'dinner']).optional().describe('指定がなければ省略。日本時間に応じて選択する。'),
    note: z.string().max(40).optional().describe('推定値なら「推定」と出典を短く記載。'),
    fiber: z.number().min(0).max(200).optional(),
    salt: z.number().min(0).max(50).optional()
}).strict();

export const mcpHandler = {
    async fetch(request, env, ctx) {
        if (!ctx.auth?.scope?.includes(SCOPE)) return new Response('insufficient_scope', { status: 403 });
        const { inboxId, generation } = ctx.props || {};
        const account = await env.DB.prepare('SELECT generation FROM mcp_accounts WHERE inbox_id = ?').bind(inboxId || '').first();
        if (!account || account.generation !== generation) return new Response('連携が解除されています。再接続してください。', { status: 401, headers: {
            'WWW-Authenticate': `Bearer resource_metadata="${new URL(request.url).origin}/.well-known/oauth-protected-resource/mcp", error="invalid_token"`
        } });
        const server = new McpServer({ name: 'MealLog', version: '1.0.0' }, {
            instructions: '食事の記録を依頼された場合のみadd_mealを使う。可能なら公式情報を優先してカロリーとPFCを調査し、推定はnoteに明記する。栄養値は食べた全量。日付・食事スロットが未指定なら省略する。受け箱への保存とiPhoneへの取込・通知の実到着を区別し、未確認の到着を断言しない。連携コードや秘密のキーを会話で要求しない。'
        });
        const securitySchemes = [{ type: 'oauth2', scopes: [SCOPE] }];
        server.registerTool('add_meal', {
            title: 'MealLogに食事を追加',
            description: 'ユーザーが食べた食事と全量のカロリー・PFCをMealLogの受け箱へ保存します。MealLogを開くと今日の記録（または指定日）に取り込まれます。通知登録済みならプッシュを送ります。過去の記録は読みません。栄養値の調査は呼び出す前に行い、推定はnoteに明記してください。同じ保存の再試行ではrequest_idを再利用し、別の食事では新しい値を使います。',
            inputSchema: { request_id: z.string().min(8).max(100).regex(/^[a-zA-Z0-9_-]+$/).describe('二重登録防止ID。UUID推奨。同じ依頼の再送では同じID。'), meals: z.array(mealSchema).min(1).max(20) },
            annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
            _meta: { securitySchemes }
        }, async ({ request_id, meals }) => {
            try {
                const result = await enqueueMeals({ meals }, env, inboxId, request_id);
                return { content: [{ type: 'text', text: JSON.stringify({ ...result, message: '受け箱に保存済み。MealLogを開くと記録に取り込まれます。pushedは通知サービスの受付結果で、端末到着の確認ではありません。' }) }], structuredContent: result };
            } catch (error) {
                return { isError: true, content: [{ type: 'text', text: error.status ? error.message : '一時的な保存エラーです。同じrequest_idで再試行してください。' }] };
            }
        });
        const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
        await server.connect(transport);
        try { return await transport.handleRequest(request); }
        finally { await server.close(); }
    }
};
