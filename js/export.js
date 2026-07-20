const ExportSummary = {
    init() {
        document.getElementById('copyExportBtn').addEventListener('click', () => this.copy());
        document.addEventListener('screen:show', e => {
            if (e.detail.screenId === 'exportScreen') this.render();
        });
    },

    buildText() {
        const logs = storage.getLogs();
        const weights = storage.getWeights();
        const dates = [];
        for (let i = 6; i >= 0; i--) dates.push(Utils.addDays(Utils.todayStr(), -i));

        const lines = [];
        let fiberTotal = 0;
        let saltTotal = 0;
        dates.forEach(d => {
            const entries = logs[d] || [];
            const sum = storage.sumLogs(entries);
            fiberTotal += sum.fiber;
            saltTotal += sum.salt;
            const weight = weights[d];
            const header = `${Utils.formatJP(d)} ${Math.round(sum.kcal)}kcal P${Utils.round1(sum.p)} F${Utils.round1(sum.f)} C${Utils.round1(sum.c)}` +
                ` 繊維${Utils.round1(sum.fiber)}g 塩${Utils.round1(sum.salt)}g` +
                (weight != null ? ` 体重${weight}kg` : '');
            lines.push(header);
            if (entries.length) {
                // 食事スロットごとにまとめて出力（スロット未設定の古い記録は「他」）
                const known = new Set(MEAL_DEFS.map(m => m.key));
                const parts = MEAL_DEFS
                    .map(m => ({ m, items: entries.filter(e => e.meal === m.key) }))
                    .filter(g => g.items.length)
                    .map(g => `${g.m.short}: ${g.items.map(e => `${e.name} ${e.amount}${e.unit}`).join(' / ')}`);
                const others = entries.filter(e => !known.has(e.meal));
                if (others.length) parts.push(`他: ${others.map(e => `${e.name} ${e.amount}${e.unit}`).join(' / ')}`);
                parts.forEach(p => lines.push('　' + p));
            } else {
                lines.push('　記録なし');
            }
        });

        lines.push('');
        lines.push(`【直近7日 合計】食物繊維 ${Utils.round1(fiberTotal)}g（目標 ${FIBER_MIN_PER_DAY}g/日以上）・食塩相当量 ${Utils.round1(saltTotal)}g（上限 ${SALT_MAX_PER_DAY}g/日未満）`);
        const quotas = storage.getWeekQuotaStatus();
        lines.push('【今週のクオータ】' + quotas.map(q =>
            q.limit == null ? `${q.label} 自由` : `${q.label} ${q.used}/${q.limit}回${q.note ? `(${q.note})` : ''}`
        ).join('・'));
        return lines.join('\n');
    },

    render() {
        document.getElementById('exportPreview').value = this.buildText();
    },

    async copy() {
        const text = this.buildText();
        try {
            await navigator.clipboard.writeText(text);
        } catch (err) {
            const textarea = document.getElementById('exportPreview');
            textarea.select();
            document.execCommand('copy');
        }
        this.showCopiedFeedback();
    },

    // ポップアップで確認を求めず、ボタンの文言を一瞬変えるだけでコピー完了を伝える
    showCopiedFeedback() {
        const btn = document.getElementById('copyExportBtn');
        if (this._resetTimer) clearTimeout(this._resetTimer);
        const original = btn.dataset.originalLabel || btn.textContent;
        btn.dataset.originalLabel = original;
        btn.textContent = '✓ コピーしました';
        this._resetTimer = setTimeout(() => {
            btn.textContent = original;
        }, 1500);
    }
};

document.addEventListener('DOMContentLoaded', () => ExportSummary.init());
