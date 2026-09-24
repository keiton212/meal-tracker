# MealLog と ChatGPT の連携

## 初回だけ

1. iPhoneのホーム画面からMealLogを開き、設定 → ChatGPT連携 →「通知をオンにする」を押す。ホーム画面にない場合はSafariで https://meal-tracker-cloud.nest-task-manager.workers.dev を開き、共有 → ホーム画面に追加。
2. パソコンのChatGPTで設定 → Security and login → Developer modeをオン。アカウントや組織設定によって利用できない場合があります。
3. Pluginsの「＋」から名前を `MealLog`、説明を「食事のカロリーとPFCをMealLogに記録」として追加。URLは下記。認証を選ぶ場合は **OAuth**。クライアントIDとシークレットは自動登録されるため手入力不要です。

   `https://meal-tracker-cloud.nest-task-manager.workers.dev/mcp`

4. MealLogの認証画面が開いたら、iPhoneの設定 → ChatGPT連携 →「連携コードを発行」で表示したコードを入力し「食事の追加を許可する」。コードは10分間・1回限りです。チャット本文やChatGPTのAPIキー欄には貼りません。
5. `add_meal` が見つかったことを確認。新しい会話のツール選択（または `@`）でMealLogを選び、「一蘭のラーメン1杯＋替玉1.5を追加して」と依頼。操作確認が出たら内容を見て許可します。
6. iPhoneのMealLogを開き、今日の記録を確認。通知は端末の許可・集中モード・通信状態に影響されます。

接続先は**コードを発行した端末の受け箱**です。PCで新しいMealLogを開いて発行するとiPhoneには届きません。機種変更後は新しい端末で再連携してください。設定の「ChatGPT連携を解除」でその受け箱へのOAuthアクセスを即時無効化できます。

## 仕組みと範囲

- Streamable HTTP `/mcp`、公式MCP SDK。ツールは `add_meal` のみ。全体をOAuth認証で保護。
- Cloudflare公式 `workers-oauth-provider` がOAuth 2.1・S256 PKCE・CIMD/DCR・リソース検証・失効/更新を担当。許可するコールバックはChatGPTの公式ホストと接続コールバックパスに限定。動的登録されたクライアント名は信頼せずHTMLエスケープする。
- 既存のランダムな受け箱キーは端末内に保持。認証には別の128-bit一時コードを使用し、D1にはハッシュのみ保存。CSRF防止Cookieとサーバー側の短期認証セッションを使用。一時コード消費はD1の原子的操作。
- アクセストークン1時間、更新トークン30日。端末の解除世代番号を各MCP要求で照合するため、古いアクセストークン・更新されたトークンとも解除後は使えない。
- `meals` は1〜20品。栄養値は**食べた全量**。amountは表示用で再乗算しない。日本時間で省略日付とスロットを決める。推定はnoteに残す。
- `request_id`（UUID推奨）で同じ依頼の再送を重複排除。別の食事には新しいIDを使う。同じIDで内容を変えると拒否。受け箱は最大50品。
- 保存済みを通知失敗で取り消さない。`pushed` はプッシュサービスの受付結果で、iPhone到着の保証ではない。アプリ起動・再表示・前面30秒ごとに受け箱を取り込み、ローカル保存後に確認済み通知を送る。取り消しボタンあり。
- 既存の暗号化バックアップはそのまま。受け箱と重複排除用の一時データはサーバーで読める形式で保存し、7日経過後の毎日の清掃で削除。7日より前にMealLogを開いて取り込むこと。OAuth管理データはKV。過去の暗号化記録をMCPから読む機能はない。
- 旧 `/v1/meals` APIは互換性のため保持。既存の `openapi.yaml` は旧GPT Actions向けで、新しいChatGPT連携では使わない。

## 開発・検証

```sh
npm install
npm run build
npm run db:migrate:local
npx wrangler dev --local --port 8787 --var MCP_ORIGIN:http://localhost:8787
# 別のターミナル
npm run test:mcp
node scripts/test-push.mjs
```

統合テストはローカルURLだけを許可し、毎回別の受け箱でOAuth・MCP・記録・認証拒否・重複排除・連携解除・既存APIを検証します。通知テストは実送信せずApple向けVAPID署名と失敗処理を検証します。

ブラウザ確認ではローカルアプリでコードを発行し、`MEALLOG_UI_PAIRING_CODE` 環境変数にそのコードを設定して統合テストを実行すると600kcalの確認用食事を受け箱に残せます。アプリで取り込み・取消を確認してください。ローカルのフロントエンドはローカルAPIへ接続します。

公開時は `wrangler whoami`、`npm run check`、テスト、`wrangler deploy --dry-run` の順で確認。既存D1を削除せず `npm run db:migrate:remote`、`npm run deploy`。`OAUTH_KV` のIDは既存名前空間を維持してください。

最終受入としてユーザーのChatGPTからの登録・実食記録と、ホーム画面に追加したiPhoneへの実通知を確認してください。PCブラウザや模擬通知検証はiPhone実到着の確認を代替しません。

公式資料（2026-09-24確認）:
- https://developers.openai.com/plugins/build/auth
- https://developers.openai.com/plugins/deploy/connect-chatgpt
- https://developers.cloudflare.com/agents/model-context-protocol/protocol/authorization/
