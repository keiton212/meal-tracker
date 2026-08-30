const AUTO_BACKUP_KEY = 'meal_last_autobackup';
const AUTO_BACKUP_INTERVAL_MS = 24 * 60 * 60 * 1000;      // 1日ごと
const BACKUP_STALE_MS = 3 * 24 * 60 * 60 * 1000;          // これを超えたら警告表示

const Backup = {
    init() {
        document.getElementById('backupSaveBtn').addEventListener('click', () => this.save());
        document.getElementById('backupRestoreInput').addEventListener('change', e => this.restore(e));
        document.getElementById('recoveryRestoreBtn').addEventListener('click', () => this.openRestoreFromRecovery());
        document.getElementById('recoveryFreshBtn').addEventListener('click', () => this.dismissRecovery());

        this.requestPersistentStorage();

        // データが空で起動した場合は、自動バックアップを走らせない。
        // 空の内容で保存してしまうと、同名の正常なバックアップを上書きしかねないため
        if (storage.wasEmptyOnBoot) {
            this.showRecovery();
        } else {
            this.maybeAutoBackup();
        }
        this.renderStatus();
    },

    // ---------- バックアップの作成 ----------

    buildPayload() {
        const data = {};
        Object.values(STORAGE_KEYS).forEach(key => {
            const raw = localStorage.getItem(key);
            if (raw !== null) data[key] = JSON.parse(raw);
        });
        return { app: 'MealLog', savedAt: new Date().toISOString(), data };
    },

    // ファイル名には日付だけでなく時刻も入れる。同じ日に2回保存したときに
    // 前のファイルを上書きせず、世代が残るようにするため
    fileNameFor(savedAt) {
        const d = new Date(savedAt);
        const p = n => String(n).padStart(2, '0');
        return `meallog-backup-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}` +
            `-${p(d.getHours())}${p(d.getMinutes())}.json`;
    },

    downloadPayload(payload) {
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = this.fileNameFor(payload.savedAt);
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        localStorage.setItem(AUTO_BACKUP_KEY, String(Date.now()));
        this.renderStatus();
    },

    save() {
        this.downloadPayload(this.buildPayload());
    },

    // アプリを開いた際、前回のバックアップから一定期間経っていれば
    // タップ不要で自動的にバックアップファイルを保存する
    maybeAutoBackup() {
        const last = Number(localStorage.getItem(AUTO_BACKUP_KEY) || 0);
        if (Date.now() - last < AUTO_BACKUP_INTERVAL_MS) return;
        this.downloadPayload(this.buildPayload());
        this.showToast('💾 自動バックアップを保存しました');
    },

    // ---------- 最終バックアップの表示 ----------

    // 最後にバックアップした日時を常に見えるところに出しておく。
    // 自動バックアップが止まっていることに気づけるようにするのが目的
    renderStatus() {
        const last = Number(localStorage.getItem(AUTO_BACKUP_KEY) || 0);
        const stale = !last || (Date.now() - last > BACKUP_STALE_MS);
        let text;
        if (!last) {
            text = '⚠ まだバックアップがありません';
        } else {
            const d = new Date(last);
            const p = n => String(n).padStart(2, '0');
            const stamp = `${d.getMonth() + 1}/${d.getDate()} ${p(d.getHours())}:${p(d.getMinutes())}`;
            text = (stale ? '⚠ ' : '') + `最終バックアップ: ${stamp}`;
        }
        ['homeBackupStatus', 'backupScreenStatus'].forEach(id => {
            const el = document.getElementById(id);
            if (!el) return;
            el.textContent = text;
            el.classList.toggle('stale', stale);
        });
    },

    // ---------- 保存領域の保護 ----------

    // OSに「容量が逼迫してもこのデータは消さないでほしい」と申告する。
    // 許可されるかはブラウザ任せなので、これ単独には頼らずバックアップと併用する
    async requestPersistentStorage() {
        const el = document.getElementById('persistStatus');
        if (!navigator.storage || !navigator.storage.persist) {
            if (el) el.textContent = '保存領域の保護: この端末では申告できません';
            return;
        }
        let granted = false;
        try {
            granted = await navigator.storage.persisted() || await navigator.storage.persist();
        } catch (err) {
            if (el) el.textContent = '保存領域の保護: 確認できませんでした';
            return;
        }
        if (el) {
            el.textContent = granted
                ? '保存領域の保護: ✓ 有効（OSに削除しないよう申告済み）'
                : '保存領域の保護: 未許可（バックアップを必ず取ってください）';
        }
    },

    // ---------- データが空で起動したときの復元導線 ----------

    showRecovery() {
        document.getElementById('recoveryOverlay').hidden = false;
    },

    dismissRecovery() {
        document.getElementById('recoveryOverlay').hidden = true;
    },

    openRestoreFromRecovery() {
        this.dismissRecovery();
        Nav.show('backupScreen');
        document.getElementById('backupRestoreInput').click();
    },

    // ---------- 復元 ----------

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
    },

    showToast(text) {
        const toast = document.createElement('div');
        toast.textContent = text;
        toast.style.cssText = 'position:fixed;left:50%;bottom:calc(90px + env(safe-area-inset-bottom));transform:translateX(-50%);' +
            'background:rgba(20,20,20,.9);color:#fff;padding:10px 16px;border-radius:20px;font-size:13px;z-index:999;' +
            'box-shadow:0 4px 14px -4px rgba(0,0,0,.4);';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    }
};

document.addEventListener('DOMContentLoaded', () => Backup.init());
