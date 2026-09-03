const CLOUD_RECOVERY_KEY = 'meal_cloud_recovery_code_v1';
const CLOUD_LAST_SYNCED_HASH_KEY = 'meal_cloud_last_synced_hash_v1';
const CLOUD_RECOVERY_SAVED_KEY = 'meal_cloud_recovery_saved_v1';
const CLOUD_POLL_INTERVAL_MS = 3000;

const CloudSync = {
    apiAvailable: false,
    syncing: false,
    observedHash: null,
    pendingTimer: null,
    lastCloudAt: 0,
    monitoringStarted: false,

    async init() {
        this.bindUi();
        this.renderRecoveryCode();
        this.renderStatus('クラウド保存を確認中…', 'pending');

        try {
            const response = await fetch(this.apiUrl('/api/health'), { cache: 'no-store' });
            this.apiAvailable = response.ok;
        } catch {
            this.apiAvailable = false;
        }

        if (!this.apiAvailable) {
            this.renderStatus('クラウド保存に接続できません（端末内には保存されています）', 'error');
            return;
        }

        if (storage.wasEmptyOnBoot && !this.getRecoveryCode()) {
            this.renderStatus('復旧コードを入力するか、新しく開始してください', 'warning');
            return;
        }

        if (!this.getRecoveryCode()) {
            this.createRecoveryCode();
            this.downloadRecoveryKit(false);
        }

        try {
            await this.reconcile();
        } catch (error) {
            console.error('initial cloud sync failed', error);
            this.renderStatus('クラウド保存の初回接続に失敗しました。自動で再試行します', 'error');
        }

        this.startMonitoring();
    },

    bindUi() {
        document.getElementById('cloudRecoverySaveBtn')?.addEventListener('click', () => this.downloadRecoveryKit());
        document.getElementById('cloudRecoveryCopyBtn')?.addEventListener('click', () => this.copyRecoveryCode());
        document.getElementById('cloudRecoveryConnectBtn')?.addEventListener('click', () => this.connectRecoveryCode());
        document.getElementById('recoveryCloudBtn')?.addEventListener('click', () => this.openRecoveryPrompt());
    },

    async reconcile() {
        const localHash = await this.currentHash();
        const lastSyncedHash = localStorage.getItem(CLOUD_LAST_SYNCED_HASH_KEY);
        const remote = await this.fetchRemote();

        if (!remote.found) {
            await this.uploadNow();
            return;
        }
        if (storage.wasEmptyOnBoot) {
            await this.applyRemote(remote);
            return;
        }
        if (remote.contentHash === localHash) {
            localStorage.setItem(CLOUD_LAST_SYNCED_HASH_KEY, localHash);
            this.lastCloudAt = Number(remote.serverUpdatedAt) * 1000;
            this.renderSynced();
            return;
        }
        if (lastSyncedHash === localHash) {
            await this.applyRemote(remote);
            return;
        }

        // 初回導入やオフライン編集との競合時は、端末側を最新版として保存する。
        // D1のvault_snapshotsには上書き前の内容も残る。
        await this.uploadNow();
    },

    async detectChanges() {
        if (!this.apiAvailable || !this.getRecoveryCode()) return;
        try {
            const hash = await this.currentHash();
            if (this.observedHash === null) this.observedHash = hash;
            if (hash === this.observedHash) return;
            this.observedHash = hash;
            this.renderStatus('変更をクラウドへ保存中…', 'pending');
            this.scheduleUpload(800);
        } catch (error) {
            console.error('cloud change detection failed', error);
        }
    },

    scheduleUpload(delay = 800) {
        if (!this.apiAvailable || !this.getRecoveryCode()) return;
        clearTimeout(this.pendingTimer);
        this.pendingTimer = setTimeout(() => this.uploadNow().catch(error => {
            console.error('cloud upload failed', error);
            this.renderStatus('クラウド保存を再試行します（端末内には保存済み）', 'error');
        }), delay);
    },

    async uploadNow() {
        if (this.syncing) return;
        this.syncing = true;
        try {
            const plaintext = this.currentPlaintext();
            const contentHash = await sha256Hex(plaintext);
            if (contentHash === localStorage.getItem(CLOUD_LAST_SYNCED_HASH_KEY)) {
                this.renderSynced();
                return;
            }
            const encryptedPayload = await this.encrypt(plaintext);
            const response = await fetch(this.apiUrl('/api/sync'), {
                method: 'PUT',
                headers: await this.authHeaders(),
                body: JSON.stringify({ encryptedPayload, contentHash, clientUpdatedAt: Date.now() })
            });
            if (!response.ok) throw new Error(`cloud save failed: ${response.status}`);
            localStorage.setItem(CLOUD_LAST_SYNCED_HASH_KEY, contentHash);
            this.observedHash = contentHash;
            this.lastCloudAt = Date.now();
            this.renderSynced();
        } finally {
            this.syncing = false;
        }
    },

    async fetchRemote() {
        const response = await fetch(this.apiUrl('/api/sync'), {
            headers: await this.authHeaders(),
            cache: 'no-store'
        });
        if (!response.ok) throw new Error(`cloud read failed: ${response.status}`);
        return response.json();
    },

    async applyRemote(remote) {
        const plaintext = await this.decrypt(remote.encryptedPayload);
        const actualHash = await sha256Hex(plaintext);
        if (actualHash !== remote.contentHash) throw new Error('cloud data integrity check failed');
        const payload = JSON.parse(plaintext);
        this.restoreData(payload.data);
        localStorage.setItem(CLOUD_LAST_SYNCED_HASH_KEY, actualHash);
        sessionStorage.setItem('meal_cloud_restored_notice', '1');
        location.reload();
    },

    restoreData(data) {
        const validKeys = new Set(Object.values(STORAGE_KEYS));
        const keys = Object.keys(data || {}).filter(key => validKeys.has(key));
        if (!keys.length) throw new Error('cloud backup contains no app data');
        keys.forEach(key => localStorage.setItem(key, JSON.stringify(data[key])));
    },

    async connectRecoveryCode() {
        const input = document.getElementById('cloudRecoveryInput');
        const message = document.getElementById('cloudRecoveryMessage');
        const code = normalizeRecoveryCode(input?.value || '');
        if (!/^[a-f0-9]{64}$/.test(code)) {
            if (message) message.textContent = '復旧コードの形式が正しくありません。';
            return;
        }

        localStorage.setItem(CLOUD_RECOVERY_KEY, code);
        localStorage.removeItem(CLOUD_LAST_SYNCED_HASH_KEY);
        if (message) message.textContent = 'クラウドのデータを確認しています…';
        try {
            const remote = await this.fetchRemote();
            if (!remote.found) throw new Error('not found');
            await this.applyRemote(remote);
        } catch (error) {
            localStorage.removeItem(CLOUD_RECOVERY_KEY);
            if (message) message.textContent = 'この復旧コードのクラウドデータが見つかりませんでした。';
        }
    },

    async startFreshVault() {
        if (!this.apiAvailable) return;
        if (!this.getRecoveryCode()) {
            this.createRecoveryCode();
            this.downloadRecoveryKit(false);
        }
        this.observedHash = await this.currentHash();
        await this.uploadNow();
        this.startMonitoring();
    },

    openRecoveryPrompt() {
        document.getElementById('recoveryOverlay').hidden = true;
        Nav.show('backupScreen');
        document.getElementById('cloudRecoveryInput')?.focus();
    },

    createRecoveryCode() {
        const bytes = crypto.getRandomValues(new Uint8Array(32));
        const code = [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('');
        localStorage.setItem(CLOUD_RECOVERY_KEY, code);
        localStorage.removeItem(CLOUD_RECOVERY_SAVED_KEY);
        this.renderRecoveryCode();
        return code;
    },

    getRecoveryCode() {
        return normalizeRecoveryCode(localStorage.getItem(CLOUD_RECOVERY_KEY) || '');
    },

    formattedRecoveryCode() {
        return (this.getRecoveryCode().match(/.{1,8}/g) || []).join(' ');
    },

    downloadRecoveryKit(confirmed = true) {
        const code = this.getRecoveryCode();
        if (!code) return;
        const text = [
            'MealLog クラウド復旧コード',
            '',
            this.formattedRecoveryCode(),
            '',
            '端末を紛失・変更したとき、このコードで食事記録を復元できます。',
            '他人には渡さず、iCloud Drive等の安全な場所に保管してください。'
        ].join('\n');
        downloadText(text, `meallog-recovery-code-${new Date().toISOString().slice(0, 10)}.txt`);
        if (confirmed) localStorage.setItem(CLOUD_RECOVERY_SAVED_KEY, '1');
        this.renderRecoveryCode();
        this.renderSynced();
    },

    async copyRecoveryCode() {
        const code = this.formattedRecoveryCode();
        if (!code) return;
        try {
            await navigator.clipboard.writeText(code);
            this.showMessage('復旧コードをコピーしました。安全な場所へ保存してください。');
        } catch {
            this.showMessage('コピーできませんでした。表示されたコードを手動で保存してください。');
        }
    },

    startMonitoring() {
        if (this.monitoringStarted) return;
        this.monitoringStarted = true;
        this.currentHash().then(hash => { this.observedHash = hash; });
        setInterval(() => this.detectChanges(), CLOUD_POLL_INTERVAL_MS);
        window.addEventListener('online', () => this.scheduleUpload(0));
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') this.scheduleUpload(0);
        });
    },

    currentPlaintext() {
        const data = {};
        Object.values(STORAGE_KEYS).forEach(key => {
            const raw = localStorage.getItem(key);
            if (raw !== null) data[key] = JSON.parse(raw);
        });
        return JSON.stringify({ app: 'MealLog', format: 1, data });
    },

    async currentHash() {
        return sha256Hex(this.currentPlaintext());
    },

    async authHeaders() {
        const authToken = await sha256Base64Url(`MealLog authentication v1\n${this.getRecoveryCode()}`);
        return { 'Authorization': `Bearer ${authToken}`, 'Content-Type': 'application/json' };
    },

    async encryptionKey() {
        const digest = await crypto.subtle.digest(
            'SHA-256',
            new TextEncoder().encode(`MealLog encryption v1\n${this.getRecoveryCode()}`)
        );
        return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
    },

    async encrypt(plaintext) {
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const ciphertext = await crypto.subtle.encrypt(
            { name: 'AES-GCM', iv },
            await this.encryptionKey(),
            new TextEncoder().encode(plaintext)
        );
        return JSON.stringify({ version: 1, iv: bytesToBase64Url(iv), ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)) });
    },

    async decrypt(encryptedPayload) {
        const envelope = JSON.parse(encryptedPayload);
        if (envelope.version !== 1) throw new Error('unsupported cloud backup');
        const plaintext = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv: base64UrlToBytes(envelope.iv) },
            await this.encryptionKey(),
            base64UrlToBytes(envelope.ciphertext)
        );
        return new TextDecoder().decode(plaintext);
    },

    apiUrl(path) {
        const base = (window.MEAL_CLOUD_API_BASE || '').replace(/\/$/, '');
        return `${base}${path}`;
    },

    renderSynced() {
        const needsRecoverySave = !localStorage.getItem(CLOUD_RECOVERY_SAVED_KEY);
        if (needsRecoverySave) {
            this.renderStatus('クラウド保存済み・復旧コードを安全な場所へ保存してください', 'warning');
        } else {
            this.renderStatus('✓ クラウドに自動保存されています', 'success');
        }
        this.renderRecoveryCode();
    },

    renderStatus(text, state = '') {
        ['homeCloudStatus', 'cloudSyncStatus'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = text;
            el.dataset.state = state;
        });
    },

    renderRecoveryCode() {
        const el = document.getElementById('cloudRecoveryCode');
        if (el) el.textContent = this.getRecoveryCode() ? this.formattedRecoveryCode() : '未作成';
        const saved = document.getElementById('cloudRecoverySaved');
        if (saved) saved.textContent = localStorage.getItem(CLOUD_RECOVERY_SAVED_KEY)
            ? '✓ この端末で復旧コードを保存済みです'
            : '⚠ 復旧コードを必ず安全な場所へ保存してください';
    },

    showMessage(text) {
        const el = document.getElementById('cloudRecoveryMessage');
        if (el) el.textContent = text;
    }
};

function normalizeRecoveryCode(value) {
    return value.toLowerCase().replace(/[^a-f0-9]/g, '');
}

async function sha256Hex(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256Base64Url(value) {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
    return bytesToBase64Url(new Uint8Array(digest));
}

function bytesToBase64Url(bytes) {
    let binary = '';
    bytes.forEach(byte => { binary += String.fromCharCode(byte); });
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToBytes(value) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(value.length / 4) * 4, '=');
    const binary = atob(base64);
    return Uint8Array.from(binary, char => char.charCodeAt(0));
}

function downloadText(text, filename) {
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
}

document.addEventListener('DOMContentLoaded', () => {
    CloudSync.init();
    if (sessionStorage.getItem('meal_cloud_restored_notice')) {
        sessionStorage.removeItem('meal_cloud_restored_notice');
        setTimeout(() => Backup.showToast('☁ クラウドから記録を復元しました'), 500);
    }
});
