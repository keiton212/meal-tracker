const Schedule = {
    FIELD_IDS: [
        'periodStartInput', 'periodEndInput',
        'periodTrainKcalInput', 'periodTrainPInput', 'periodTrainFInput', 'periodTrainCInput',
        'periodRestKcalInput', 'periodRestPInput', 'periodRestFInput', 'periodRestCInput'
    ],

    init() {
        document.getElementById('addPeriodBtn').addEventListener('click', () => this.add());
        document.addEventListener('screen:show', e => {
            if (e.detail.screenId === 'scheduleScreen') this.render();
        });
    },

    add() {
        const start = document.getElementById('periodStartInput').value;
        const end = document.getElementById('periodEndInput').value;
        const trainKcal = parseFloat(document.getElementById('periodTrainKcalInput').value);
        const trainP = parseFloat(document.getElementById('periodTrainPInput').value);
        const trainF = parseFloat(document.getElementById('periodTrainFInput').value);
        const trainC = parseFloat(document.getElementById('periodTrainCInput').value);
        const restKcal = parseFloat(document.getElementById('periodRestKcalInput').value);
        const restP = parseFloat(document.getElementById('periodRestPInput').value);
        const restF = parseFloat(document.getElementById('periodRestFInput').value);
        const restC = parseFloat(document.getElementById('periodRestCInput').value);

        if (!start || !end || [trainKcal, trainP, trainF, trainC, restKcal, restP, restF, restC].some(Number.isNaN)) {
            alert('開始日・終了日・トレ日/休み日の数値項目をすべて入力してください。');
            return;
        }
        if (start > end) {
            alert('開始日は終了日より前にしてください。');
            return;
        }

        storage.addPeriod({ start, end, trainKcal, trainP, trainF, trainC, restKcal, restP, restF, restC });
        this.FIELD_IDS.forEach(id => document.getElementById(id).value = '');
        this.render();
    },

    render() {
        const list = document.getElementById('periodsList');
        const periods = storage.getPeriods();
        const today = Utils.todayStr();
        if (!periods.length) {
            list.innerHTML = '<div class="empty-hint">まだ登録がありません</div>';
            return;
        }
        list.innerHTML = periods.map(p => {
            const active = p.start <= today && today <= p.end;
            return `
                <div class="period-item ${active ? 'active' : ''}">
                    ${active ? '<div class="period-tag">進行中</div>' : ''}
                    <div class="item-row">
                        <div>
                            <div class="food-name">${p.start} 〜 ${p.end}</div>
                            <div class="food-meta">トレ日：${p.trainKcal}kcal · P${p.trainP} F${p.trainF} C${p.trainC}</div>
                            <div class="food-meta">休み日：${p.restKcal}kcal · P${p.restP} F${p.restF} C${p.restC}（日・木）</div>
                        </div>
                        <button class="item-del" data-id="${p.id}">削除</button>
                    </div>
                </div>`;
        }).join('');

        list.querySelectorAll('.item-del').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('この期間を削除しますか？')) {
                    storage.deletePeriod(btn.dataset.id);
                    this.render();
                }
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => Schedule.init());
