const INBOX_TOKEN_KEY = 'meal_inbox_token_v1';
const INBOX_APPLIED_KEY = 'meal_inbox_applied_v1';
const INBOX_API_BASE = 'https://meal-tracker-cloud.nest-task-manager.workers.dev';

const MEAL_LABELS = { b1: '朝①', b2: '朝②', lunch: '昼', snack: '間食', dinner: '夕' };

const Inbox = {
    pulling: false,

    init() {
        this.ensureToken();
        document.getElementById('inboxCopyKeyBtn')?.addEventListener('click', () => this.copyKey());
        document.getElementById('inboxNotifyBtn')?.addEventListener('click', () => this.enableNotifications());
        document.getElementById('inboxTestBtn')?.addEventListener('click', () => this.testConnection());
        document.getElementById('inboxCopyPromptBtn')?.addEventListener('click', () => this.copyPrompt());
        this.render();
        this.pull();
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this.pull();
        });
        navigator.serviceWorker?.addEventListener('message', event => {
            if (event.data?.type === 'inbox-push') this.pull();
        });
    },

    apiBase() {
        return ((window.MEAL_CLOUD_API_BASE || INBOX_API_BASE)).replace(/\/$/, '');
    },

    ensureToken() {
        const current = localStorage.getItem(INBOX_TOKEN_KEY);
        if (current && /^[A-Za-z0-9_-]{43}$/.test(current)) return current;
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        let binary = '';
        bytes.forEach(byte => { binary += String.fromCharCode(byte); });
        const token = btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        localStorage.setItem(INBOX_TOKEN_KEY, token);
        return token;
    },

    render() {
        const key = document.getElementById('inboxKey');
        if (key) key.textContent = this.ensureToken();
        const hint = document.getElementById('inboxNotifyHint');
        if (!hint) return;
        const standalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
        if (!('Notification' in window) || !('PushManager' in window)) {
            hint.textContent = 'このブラウザは通知に対応していません。アプリを開いたときに取り込みます。';
        } else if (!standalone) {
            hint.textContent = '通知を受け取るには、このページをホーム画面に追加して、そこから開いてください。';
        } else if (Notification.permission === 'granted') {
            hint.textContent = '通知はオンです。ChatGPTから届くと音が鳴ります。';
        } else {
            hint.textContent = '通知をオンにすると、話した直後に音で知らせます。';
        }
    },

    async copyKey() {
        try {
            await navigator.clipboard.writeText(this.ensureToken());
            this.showMessage('連携キーをコピーしました。専用GPTのAPIキー欄に貼ってください。');
        } catch {
            this.showMessage('コピーできませんでした。表示されたキーを手動で選んでコピーしてください。');
        }
    },

    async enableNotifications() {
        const hint = document.getElementById('inboxNotifyHint');
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            this.showMessage('このブラウザは通知に対応していません。');
            return;
        }
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            this.showMessage('通知が許可されませんでした。アプリを開いたときに取り込みます。');
            this.render();
            return;
        }
        try {
            const registration = await navigator.serviceWorker.ready;
            const keyResponse = await fetch(this.apiUrl('/v1/vapid-public-key'), { cache: 'no-store' });
            if (!keyResponse.ok) throw new Error('vapid');
            const { publicKey } = await keyResponse.json();
            const subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: base64UrlToBytes(publicKey)
            });
            const response = await fetch(this.apiUrl('/v1/subscription'), {
                method: 'PUT',
                headers: this.authHeaders(),
                body: JSON.stringify(subscription)
            });
            if (!response.ok) throw new Error('subscribe');
            this.showMessage('通知をオンにしました。');
        } catch (error) {
            console.error('notification setup failed', error);
            this.showMessage('通知の登録に失敗しました。通信できる状態でもう一度押してください。');
        }
        if (hint) this.render();
    },

    async testConnection() {
        try {
            const response = await fetch(this.apiUrl('/v1/pending'), {
                cache: 'no-store',
                headers: this.authHeaders()
            });
            if (!response.ok) throw new Error(String(response.status));
            const body = await response.json();
            const count = Array.isArray(body.meals) ? body.meals.length : 0;
            this.showMessage(count ? `接続できました。未取り込みが${count}件あります。` : '接続できました。');
            if (count) this.pull();
        } catch (error) {
            console.error('inbox test failed', error);
            this.showMessage('受け箱に接続できませんでした。');
        }
    },

    async copyPrompt() {
        try {
            await navigator.clipboard.writeText(this.promptText());
            this.showMessage('専用GPTに貼る指示文をコピーしました。');
        } catch {
            this.showMessage('コピーできませんでした。');
        }
    },

    promptText() {
        const base = this.apiBase();
        return [
            'あなたはMealLogへ外食を記録する係です。',
            'ユーザーが店名とメニューを言ったら、その品のカロリーとPFC（たんぱく質・脂質・炭水化物、単位はg）を調べ、add_meal を呼んで記録してください。',
            '数値は公式サイトや店の公開情報を優先します。確度が低いときは、そのことが分かる短い注記を note に入れてください。',
            '食事スロットの指定がなければ、引数 meal は省略してください。日付の指定がなければ date も省略してください。',
            '量の指定がなければ amount は 1、unit は「食」にしてください。複数品は meals 配列で一度に送ってください。',
            '固定食品マスタには登録しません。記録できたら、品名・kcal・PFCと、どの食事に入れたかを短く返してください。',
            `受け箱のURLは ${base} です。Authorization は連携時に設定したAPIキーを使ってください。`
        ].join('\n');
    },

    async pull() {
        if (this.pulling) return;
        this.pulling = true;
        try {
            const response = await fetch(this.apiUrl('/v1/pending'), {
                cache: 'no-store',
                headers: this.authHeaders()
            });
            if (!response.ok) return;
            const body = await response.json();
            const meals = Array.isArray(body.meals) ? body.meals : [];
            if (!meals.length) return;
            const applied = this.appliedIds();
            const created = [];
            const ackIds = [];
            meals.forEach(meal => {
                if (!meal?.id) return;
                ackIds.push(meal.id);
                if (applied.has(meal.id)) return;
                const entry = storage.addLogEntry({
                    foodId: null,
                    name: meal.name,
                    amount: meal.amount,
                    unit: meal.unit,
                    meal: meal.meal,
                    kcal: meal.kcal,
                    p: meal.p,
                    f: meal.f,
                    c: meal.c,
                    fiber: meal.fiber || 0,
                    salt: meal.salt || 0
                }, meal.date);
                created.push({ date: meal.date, entry });
                applied.add(meal.id);
            });
            this.saveApplied(applied);
            await this.ack(ackIds);
            if (!created.length) return;
            if (typeof Main !== 'undefined') Main.renderToday();
            const label = created.length === 1
                ? `${created[0].entry.name} を${MEAL_LABELS[created[0].entry.meal] || ''}に記録しました`
                : `${created.length}品を記録しました`;
            Utils.toast(`✓ ${label}`, '取り消す', () => {
                created.forEach(({ date, entry }) => storage.deleteLogEntry(date, entry.id));
                if (typeof Main !== 'undefined') Main.renderToday();
            });
        } catch (error) {
            console.error('inbox pull failed', error);
        } finally {
            this.pulling = false;
        }
    },

    async ack(ids) {
        if (!ids.length) return;
        await fetch(this.apiUrl('/v1/pending'), {
            method: 'DELETE',
            headers: this.authHeaders(),
            body: JSON.stringify({ ids })
        });
    },

    appliedIds() {
        try {
            const ids = JSON.parse(localStorage.getItem(INBOX_APPLIED_KEY) || '[]');
            return new Set(Array.isArray(ids) ? ids : []);
        } catch {
            return new Set();
        }
    },

    saveApplied(ids) {
        const list = [...ids].slice(-200);
        localStorage.setItem(INBOX_APPLIED_KEY, JSON.stringify(list));
    },

    authHeaders() {
        return {
            'Authorization': `Bearer ${this.ensureToken()}`,
            'Content-Type': 'application/json'
        };
    },

    apiUrl(path) {
        return `${this.apiBase()}${path}`;
    },

    showMessage(text) {
        const el = document.getElementById('inboxMessage');
        if (el) el.textContent = text;
    }
};

function base64UrlToBytes(value) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(base64);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

document.addEventListener('DOMContentLoaded', () => Inbox.init());
