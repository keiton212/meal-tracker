const Schedule = {
    init() {
        document.getElementById('addPeriodBtn').addEventListener('click', () => this.add());
        document.addEventListener('screen:show', e => {
            if (e.detail.screenId === 'scheduleScreen') this.render();
        });
    },

    add() {
        const start = document.getElementById('periodStartInput').value;
        const end = document.getElementById('periodEndInput').value;
        const kcal = parseFloat(document.getElementById('periodKcalInput').value);
        const p = parseFloat(document.getElementById('periodPInput').value);
        const f = parseFloat(document.getElementById('periodFInput').value);
        const c = parseFloat(document.getElementById('periodCInput').value);

        if (!start || !end || [kcal, p, f, c].some(Number.isNaN)) {
            alert('開始日・終了日・数値項目をすべて入力してください。');
            return;
        }
        if (start > end) {
            alert('開始日は終了日より前にしてください。');
            return;
        }

        storage.addPeriod({ start, end, kcal, p, f, c });

        ['periodStartInput', 'periodEndInput', 'periodKcalInput', 'periodPInput', 'periodFInput', 'periodCInput']
            .forEach(id => document.getElementById(id).value = '');

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
                            <div class="food-meta">${p.kcal}kcal · P${p.p} F${p.f} C${p.c}</div>
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
