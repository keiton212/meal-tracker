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
        dates.forEach(d => {
            const entries = logs[d] || [];
            const sum = storage.sumLogs(entries);
            const weight = weights[d];
            const header = `${Utils.formatJP(d)} ${Math.round(sum.kcal)}kcal P${Utils.round1(sum.p)} F${Utils.round1(sum.f)} C${Utils.round1(sum.c)}` +
                (weight != null ? ` 体重${weight}kg` : '');
            lines.push(header);
            if (entries.length) {
                lines.push('　' + entries.map(e => `${e.name} ${e.amount}${e.unit}`).join(' / '));
            } else {
                lines.push('　記録なし');
            }
        });
        return lines.join('\n');
    },

    render() {
        document.getElementById('exportPreview').value = this.buildText();
    },

    async copy() {
        const text = this.buildText();
        try {
            await navigator.clipboard.writeText(text);
            alert('コピーしました。ChatGPTやClaudeに貼り付けてください。');
        } catch (err) {
            const textarea = document.getElementById('exportPreview');
            textarea.select();
            document.execCommand('copy');
            alert('コピーしました。ChatGPTやClaudeに貼り付けてください。');
        }
    }
};

document.addEventListener('DOMContentLoaded', () => ExportSummary.init());
