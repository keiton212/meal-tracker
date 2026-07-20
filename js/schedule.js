const Schedule = {
    DAY_LABELS: ['日', '月', '火', '水', '木', '金', '土'],
    // 曜日別入力欄の表示順（トレーニング週の感覚に合わせて月曜はじまり）
    DAY_ORDER: [1, 2, 3, 4, 5, 6, 0],

    // 編集中の期間ID（nullなら新規追加モード）
    editingId: null,

    FIELD_IDS: [
        'periodStartInput', 'periodEndInput',
        'periodTrainKcalInput', 'periodTrainPInput', 'periodTrainFInput', 'periodTrainCInput',
        'periodRestKcalInput', 'periodRestPInput', 'periodRestFInput', 'periodRestCInput'
    ],

    init() {
        document.getElementById('addPeriodBtn').addEventListener('click', () => this.add());
        document.getElementById('cancelPeriodEditBtn').addEventListener('click', () => {
            this.cancelEdit();
            this.render();
        });
        document.querySelectorAll('#restDayToggles input').forEach(input => {
            input.addEventListener('change', () => this.saveRestDays());
        });
        this.buildWeeklyFields();
        document.getElementById('weeklyModeCheck').addEventListener('change', () => this.toggleWeeklyMode());
        document.addEventListener('screen:show', e => {
            if (e.detail.screenId === 'scheduleScreen') {
                this.cancelEdit();
                this.renderRestDays();
                this.render();
            }
        });
    },

    // 既存の期間を編集モードで開く（フォームに値を流し込む）
    startEdit(id) {
        const period = storage.getPeriods().find(p => p.id === id);
        if (!period) return;
        this.editingId = id;
        document.getElementById('periodStartInput').value = period.start;
        document.getElementById('periodEndInput').value = period.end;

        const weekly = period.targetMode === 'weekly' && Array.isArray(period.weekly);
        document.getElementById('weeklyModeCheck').checked = weekly;
        document.getElementById('trainRestFields').style.display = weekly ? 'none' : '';
        document.getElementById('weeklyFields').style.display = weekly ? '' : 'none';

        if (weekly) {
            for (let d = 0; d < 7; d++) {
                const t = period.weekly[d] || {};
                document.getElementById(`wk${d}Kcal`).value = t.kcal ?? '';
                document.getElementById(`wk${d}P`).value = t.p ?? '';
                document.getElementById(`wk${d}F`).value = t.f ?? '';
                document.getElementById(`wk${d}C`).value = t.c ?? '';
            }
        } else {
            document.getElementById('periodTrainKcalInput').value = period.trainKcal ?? '';
            document.getElementById('periodTrainPInput').value = period.trainP ?? '';
            document.getElementById('periodTrainFInput').value = period.trainF ?? '';
            document.getElementById('periodTrainCInput').value = period.trainC ?? '';
            document.getElementById('periodRestKcalInput').value = period.restKcal ?? '';
            document.getElementById('periodRestPInput').value = period.restP ?? '';
            document.getElementById('periodRestFInput').value = period.restF ?? '';
            document.getElementById('periodRestCInput').value = period.restC ?? '';
        }

        document.getElementById('periodFormLabel').textContent = '期間を編集';
        document.getElementById('addPeriodBtn').textContent = '更新する';
        document.getElementById('cancelPeriodEditBtn').style.display = '';
        document.getElementById('periodFormCard').scrollIntoView({ block: 'start' });
    },

    cancelEdit() {
        this.editingId = null;
        this.clearForm();
        document.getElementById('periodFormLabel').textContent = '新しい期間を追加';
        document.getElementById('addPeriodBtn').textContent = '追加する';
        document.getElementById('cancelPeriodEditBtn').style.display = 'none';
    },

    clearForm() {
        this.FIELD_IDS.forEach(id => document.getElementById(id).value = '');
        for (let d = 0; d < 7; d++) {
            ['Kcal', 'P', 'F', 'C'].forEach(suf => document.getElementById(`wk${d}${suf}`).value = '');
        }
    },

    // 曜日ごとのkcal/P/F/C入力欄（7曜日×4項目）を生成する
    buildWeeklyFields() {
        const wrap = document.getElementById('weeklyFields');
        wrap.innerHTML =
            '<div class="section-label" style="margin-top:12px;">曜日ごとの目標</div>' +
            this.DAY_ORDER.map(d => `
                <div class="weekly-day-row">
                    <div class="weekly-day-label">${this.DAY_LABELS[d]}</div>
                    <div class="form-field"><label>kcal</label><input type="text" inputmode="decimal" id="wk${d}Kcal"></div>
                    <div class="form-field"><label>P</label><input type="text" inputmode="decimal" id="wk${d}P"></div>
                    <div class="form-field"><label>F</label><input type="text" inputmode="decimal" id="wk${d}F"></div>
                    <div class="form-field"><label>C</label><input type="text" inputmode="decimal" id="wk${d}C"></div>
                </div>`).join('');
    },

    toggleWeeklyMode() {
        const weekly = document.getElementById('weeklyModeCheck').checked;
        document.getElementById('trainRestFields').style.display = weekly ? 'none' : '';
        document.getElementById('weeklyFields').style.display = weekly ? '' : 'none';
        if (weekly) this.prefillWeeklyFromTrainRest();
    },

    // トレ日/休み日欄に入力済みの値があれば、曜日欄の空欄へ初期値として流し込む
    // （7×4=28マスを手で埋める手間を減らすための補助。既に入力済みのマスは上書きしない）
    prefillWeeklyFromTrainRest() {
        const val = id => document.getElementById(id).value;
        const restDays = storage.getRestDays();
        this.DAY_ORDER.forEach(d => {
            const src = restDays.includes(d)
                ? { Kcal: val('periodRestKcalInput'), P: val('periodRestPInput'), F: val('periodRestFInput'), C: val('periodRestCInput') }
                : { Kcal: val('periodTrainKcalInput'), P: val('periodTrainPInput'), F: val('periodTrainFInput'), C: val('periodTrainCInput') };
            ['Kcal', 'P', 'F', 'C'].forEach(suf => {
                const input = document.getElementById(`wk${d}${suf}`);
                if (!input.value && src[suf]) input.value = src[suf];
            });
        });
    },

    renderRestDays() {
        const restDays = storage.getRestDays();
        document.querySelectorAll('#restDayToggles input').forEach(input => {
            const day = parseInt(input.value, 10);
            input.checked = restDays.includes(day);
            input.closest('.day-toggle').classList.toggle('checked', input.checked);
        });
    },

    saveRestDays() {
        const days = Array.from(document.querySelectorAll('#restDayToggles input:checked'))
            .map(input => parseInt(input.value, 10));
        document.querySelectorAll('#restDayToggles input').forEach(input => {
            input.closest('.day-toggle').classList.toggle('checked', input.checked);
        });
        storage.setRestDays(days);
        this.render();
    },

    restDaysLabel() {
        const days = storage.getRestDays().slice().sort();
        return days.length ? days.map(d => this.DAY_LABELS[d]).join('・') : 'なし';
    },

    add() {
        const start = document.getElementById('periodStartInput').value;
        const end = document.getElementById('periodEndInput').value;
        if (!start || !end) {
            alert('開始日・終了日を入力してください。');
            return;
        }
        if (start > end) {
            alert('開始日は終了日より前にしてください。');
            return;
        }

        if (document.getElementById('weeklyModeCheck').checked) {
            // 曜日ごとモード：7曜日すべてのkcal/P/F/Cが必要
            const weekly = [];
            for (let d = 0; d < 7; d++) {
                const t = {
                    kcal: parseFloat(document.getElementById(`wk${d}Kcal`).value),
                    p: parseFloat(document.getElementById(`wk${d}P`).value),
                    f: parseFloat(document.getElementById(`wk${d}F`).value),
                    c: parseFloat(document.getElementById(`wk${d}C`).value)
                };
                if ([t.kcal, t.p, t.f, t.c].some(Number.isNaN)) {
                    alert(`${this.DAY_LABELS[d]}曜日に未入力があります。7曜日すべてのkcal/P/F/Cを入力してください。`);
                    return;
                }
                weekly.push(t);
            }
            this.commit({ start, end, targetMode: 'weekly', weekly });
        } else {
            const trainKcal = parseFloat(document.getElementById('periodTrainKcalInput').value);
            const trainP = parseFloat(document.getElementById('periodTrainPInput').value);
            const trainF = parseFloat(document.getElementById('periodTrainFInput').value);
            const trainC = parseFloat(document.getElementById('periodTrainCInput').value);
            const restKcal = parseFloat(document.getElementById('periodRestKcalInput').value);
            const restP = parseFloat(document.getElementById('periodRestPInput').value);
            const restF = parseFloat(document.getElementById('periodRestFInput').value);
            const restC = parseFloat(document.getElementById('periodRestCInput').value);

            if ([trainKcal, trainP, trainF, trainC, restKcal, restP, restF, restC].some(Number.isNaN)) {
                alert('トレ日/休み日の数値項目をすべて入力してください。');
                return;
            }
            this.commit({ start, end, targetMode: 'trainRest', trainKcal, trainP, trainF, trainC, restKcal, restP, restF, restC });
        }
        this.render();
    },

    // 編集中なら更新、そうでなければ新規追加する
    commit(data) {
        if (this.editingId) storage.updatePeriod(this.editingId, data);
        else storage.addPeriod(data);
        this.cancelEdit();
        Main.renderToday(); // 進行中の期間を変更した場合はホーム画面の目標も更新する
    },

    // 同じ目標の曜日をまとめた表示（例：月火水金土：1750kcal… / 木日：1500kcal…）
    weeklySummaryHtml(p) {
        const groups = [];
        this.DAY_ORDER.forEach(d => {
            const t = p.weekly[d];
            const key = `${t.kcal}_${t.p}_${t.f}_${t.c}`;
            const g = groups.find(g => g.key === key);
            if (g) g.days.push(d); else groups.push({ key, days: [d], t });
        });
        return groups.map(g =>
            `<div class="food-meta">${g.days.map(d => this.DAY_LABELS[d]).join('')}：${g.t.kcal}kcal · P${g.t.p} F${g.t.f} C${g.t.c}</div>`
        ).join('');
    },

    render() {
        const list = document.getElementById('periodsList');
        const periods = storage.getPeriods();
        const today = Utils.todayStr();
        const restLabel = this.restDaysLabel();
        if (!periods.length) {
            list.innerHTML = '<div class="empty-hint">まだ登録がありません</div>';
            return;
        }
        list.innerHTML = periods.map(p => {
            const active = p.start <= today && today <= p.end;
            const isWeekly = p.targetMode === 'weekly' && Array.isArray(p.weekly);
            const body = isWeekly
                ? this.weeklySummaryHtml(p)
                : `<div class="food-meta">トレ日：${p.trainKcal}kcal · P${p.trainP} F${p.trainF} C${p.trainC}</div>
                   <div class="food-meta">休み日：${p.restKcal}kcal · P${p.restP} F${p.restF} C${p.restC}（${restLabel}）</div>`;
            return `
                <div class="period-item ${active ? 'active' : ''}">
                    ${active ? '<div class="period-tag">進行中</div>' : ''}
                    <div class="item-row">
                        <div>
                            <div class="food-name">${p.start} 〜 ${p.end}${isWeekly ? ' <span class="food-meta">（曜日ごと設定）</span>' : ''}</div>
                            ${body}
                        </div>
                        <div class="item-actions">
                            <button class="item-edit" data-id="${p.id}">編集</button>
                            <button class="item-del" data-id="${p.id}">削除</button>
                        </div>
                    </div>
                </div>`;
        }).join('');

        list.querySelectorAll('.item-edit').forEach(btn => {
            btn.addEventListener('click', () => this.startEdit(btn.dataset.id));
        });

        list.querySelectorAll('.item-del').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('この期間を削除しますか？')) {
                    storage.deletePeriod(btn.dataset.id);
                    if (this.editingId === btn.dataset.id) this.cancelEdit();
                    this.render();
                    Main.renderToday();
                }
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => Schedule.init());
