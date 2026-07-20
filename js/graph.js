const Graph = {
    chart: null,

    init() {
        this.loadChartLibrary();
        document.addEventListener('screen:show', e => {
            if (e.detail.screenId === 'graphScreen') this.render();
        });
    },

    loadChartLibrary() {
        if (!window.Chart) {
            const script = document.createElement('script');
            script.src = 'https://cdn.jsdelivr.net/npm/chart.js';
            script.onload = () => { if (document.getElementById('graphScreen').classList.contains('active')) this.render(); };
            document.head.appendChild(script);
        }
    },

    // 体重は日々±1kg近く揺れるため、直近n日の平均線を重ねて増減の傾向を読めるようにする。
    // その日を含む過去n日のうち、記録がある日だけで平均を出す（記録が無い日はnullでスキップ）
    movingAverage(weights, dateStr, n) {
        const vals = [];
        for (let i = 0; i < n; i++) {
            const v = weights[Utils.addDays(dateStr, -i)];
            if (v != null) vals.push(v);
        }
        if (!vals.length) return null;
        return Utils.round1(vals.reduce((a, b) => a + b, 0) / vals.length);
    },

    lastNDates(n) {
        const dates = [];
        for (let i = n - 1; i >= 0; i--) dates.push(Utils.addDays(Utils.todayStr(), -i));
        return dates;
    },

    render() {
        this.renderTrendChart();
        this.renderPfcAvg();
        this.renderFiberSaltChart();
        this.renderStatGrid();
    },

    renderFiberSaltChart() {
        const canvas = document.getElementById('fiberSaltChart');
        if (!canvas || !window.Chart) return;

        const dates = this.lastNDates(7);
        const logs = storage.getLogs();
        const fiberData = dates.map(d => Utils.round1(storage.sumLogs(logs[d] || []).fiber));
        const saltData = dates.map(d => Utils.round1(storage.sumLogs(logs[d] || []).salt));
        const labels = dates.map(d => d.slice(5).replace('-', '/'));

        if (this.fsChart) this.fsChart.destroy();
        this.fsChart = new Chart(canvas.getContext('2d'), {
            data: {
                labels,
                datasets: [
                    { type: 'bar', label: '食物繊維(g)', data: fiberData, backgroundColor: 'rgba(60,110,71,.6)' },
                    { type: 'bar', label: '食塩相当量(g)', data: saltData, backgroundColor: 'rgba(164,55,44,.55)' }
                ]
            },
            options: {
                responsive: true,
                scales: { y: { beginAtZero: true, title: { display: true, text: 'g' } } }
            }
        });
    },

    renderTrendChart() {
        const canvas = document.getElementById('trendChart');
        if (!canvas || !window.Chart) return;

        const dates = this.lastNDates(14);
        const logs = storage.getLogs();
        const weights = storage.getWeights();

        const kcalData = dates.map(d => storage.sumLogs(logs[d] || []).kcal);
        const weightData = dates.map(d => weights[d] ?? null);
        const weightAvgData = dates.map(d => this.movingAverage(weights, d, 7));
        const labels = dates.map(d => d.slice(5).replace('-', '/'));

        if (this.chart) this.chart.destroy();
        this.chart = new Chart(canvas.getContext('2d'), {
            data: {
                labels,
                datasets: [
                    {
                        type: 'line', label: '摂取kcal', data: kcalData,
                        borderColor: '#3c6e47', backgroundColor: 'rgba(60,110,71,.1)',
                        yAxisID: 'y', tension: .3
                    },
                    {
                        type: 'line', label: '体重(kg)', data: weightData,
                        borderColor: '#c2cad4', borderDash: [4, 3], spanGaps: true,
                        pointRadius: 2, yAxisID: 'y1', tension: .3
                    },
                    {
                        type: 'line', label: '体重7日平均', data: weightAvgData,
                        borderColor: '#5b6b7f', borderWidth: 2, spanGaps: true,
                        pointRadius: 0, yAxisID: 'y1', tension: .3
                    }
                ]
            },
            options: {
                responsive: true,
                scales: {
                    y: { position: 'left', min: 1500, max: 3000, title: { display: true, text: 'kcal' } },
                    y1: { position: 'right', title: { display: true, text: 'kg' }, grid: { drawOnChartArea: false } }
                }
            }
        });
    },

    renderPfcAvg() {
        const dates = this.lastNDates(7);
        const logs = storage.getLogs();
        const totals = { p: 0, f: 0, c: 0 };
        const goalTotals = { p: 0, f: 0, c: 0 };
        let daysWithData = 0;
        let daysWithGoal = 0;

        dates.forEach(d => {
            const entries = logs[d] || [];
            if (entries.length) {
                daysWithData++;
                const sum = storage.sumLogs(entries);
                totals.p += sum.p; totals.f += sum.f; totals.c += sum.c;
            }
            const targets = storage.getTodayTargets(d);
            if (targets) {
                daysWithGoal++;
                goalTotals.p += targets.p; goalTotals.f += targets.f; goalTotals.c += targets.c;
            }
        });

        const div = daysWithData || 1;
        const avg = { p: totals.p / div, f: totals.f / div, c: totals.c / div };
        const goalDiv = daysWithGoal || 1;
        const avgGoal = { p: goalTotals.p / goalDiv, f: goalTotals.f / goalDiv, c: goalTotals.c / goalDiv };

        const container = document.getElementById('pfcAvgBars');
        if (!daysWithGoal) {
            container.innerHTML = '<div class="empty-hint">スケジュールが未設定です</div>';
            return;
        }

        const rows = [
            { label: 'P', val: avg.p, goal: avgGoal.p },
            { label: 'F', val: avg.f, goal: avgGoal.f },
            { label: 'C', val: avg.c, goal: avgGoal.c }
        ];
        container.innerHTML = rows.map(r => {
            const pct = Math.min(100, Math.round((r.val / r.goal) * 100));
            const over = r.val > r.goal;
            return `
                <div class="macro-bar-row">
                    <div class="macro-label">${r.label}</div>
                    <div class="bar-track"><div class="bar-fill ${over ? 'over' : ''}" style="width:${pct}%"></div></div>
                    <div class="macro-val">${Utils.round1(r.val)}/${Utils.round1(r.goal)}g</div>
                </div>`;
        }).join('');
    },

    renderStatGrid() {
        const dates = this.lastNDates(7);
        const logs = storage.getLogs();
        const weights = storage.getWeights();

        let kcalSum = 0, kcalDays = 0;
        dates.forEach(d => {
            const entries = logs[d] || [];
            if (entries.length) { kcalSum += storage.sumLogs(entries).kcal; kcalDays++; }
        });
        const avgKcal = kcalDays ? Math.round(kcalSum / kcalDays) : 0;

        const weightVals = dates.map(d => weights[d]).filter(v => v != null);
        const avgWeight = weightVals.length ? Utils.round1(weightVals.reduce((a, b) => a + b, 0) / weightVals.length) : null;

        document.getElementById('statGrid').innerHTML = `
            <div class="stat-tile"><div class="lbl">平均kcal/日（7日）</div><div class="val">${avgKcal}</div></div>
            <div class="stat-tile"><div class="lbl">体重平均（7日）</div><div class="val">${avgWeight != null ? avgWeight + 'kg' : '—'}</div></div>
        `;
    }
};

document.addEventListener('DOMContentLoaded', () => Graph.init());
