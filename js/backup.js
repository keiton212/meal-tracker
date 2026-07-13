const Backup = {
    init() {
        document.getElementById('backupSaveBtn').addEventListener('click', () => this.save());
        document.getElementById('backupRestoreInput').addEventListener('change', e => this.restore(e));
    },

    save() {
        const data = {};
        Object.values(STORAGE_KEYS).forEach(key => {
            const raw = localStorage.getItem(key);
            if (raw !== null) data[key] = JSON.parse(raw);
        });
        const payload = { app: 'MealLog', savedAt: new Date().toISOString(), data };
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
