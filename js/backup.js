const AUTO_BACKUP_KEY = 'meal_last_autobackup';
const AUTO_BACKUP_INTERVAL_MS = 3 * 24 * 60 * 60 * 1000; // 3日ごと

const Backup = {
    init() {
        document.getElementById('backupSaveBtn').addEventListener('click', () => this.save());
        document.getElementById('backupRestoreInput').addEventListener('change', e => this.restore(e));
        this.maybeAutoBackup();
    },

    buildPayload() {
        const data = {};
        Object.values(STORAGE_KEYS).forEach(key => {
            const raw = localStorage.getItem(key);
            if (raw !== null) data[key] = JSON.parse(raw);
        });
        return { app: 'MealLog', savedAt: new Date().toISOString(), data };
    },

    downloadPayload(payload) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const dateStr = payload.savedAt.slice(0, 10);
        a.href = url;
        a.download = `meallog-backup-${dateStr}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
    },

    save() {
        this.downloadPayload(this.buildPayload());
    },

    // アプリを開いた際、前回の自動バックアップから一定期間経っていれば
    // タップ不要で自動的にバックアップファイルを保存する
    maybeAutoBackup() {
        const last = Number(localStorage.getItem(AUTO_BACKUP_KEY) || 0);
        const now = Date.now();
        if (now - last < AUTO_BACKUP_INTERVAL_MS) return;
        this.downloadPayload(this.buildPayload());
        localStorage.setItem(AUTO_BACKUP_KEY, String(now));
        this.showAutoBackupToast();
    },

    showAutoBackupToast() {
        const toast = document.createElement('div');
        toast.textContent = '💾 自動バックアップを保存しました';
        toast.style.cssText = 'position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom));transform:translateX(-50%);' +
            'background:rgba(20,20,20,.9);color:#fff;padding:10px 16px;border-radius:20px;font-size:13px;z-index:999;' +
            'box-shadow:0 4px 14px -4px rgba(0,0,0,.4);';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    restore(e) {
        const file = e.target.files[0];
        const msg = document.getElementById('backupRestoreMsg');
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const payload = JSON.parse(reader.result);
                const data = payload.data || payload;
                const validKeys = new Set(Object.values(STORAGE_KEYS));
                const keysToRestore = Object.keys(data).filter(k => validKeys.has(k));
                if (!keysToRestore.length) throw new Error('no valid keys');
                keysToRestore.forEach(key => {
                    localStorage.setItem(key, JSON.stringify(data[key]));
                });
                msg.textContent = '✓ 復元しました。アプリを再読み込みします…';
                setTimeout(() => location.reload(), 1000);
            } catch (err) {
                msg.textContent = '⚠ 復元に失敗しました。正しいバックアップファイルか確認してください。';
            } finally {
                e.target.value = '';
            }
        };
        reader.readAsText(file);
    }
};

document.addEventListener('DOMContentLoaded', () => Backup.init());
