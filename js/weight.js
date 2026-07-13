const Weight = {
    init() {
        document.getElementById('saveWeightBtn').addEventListener('click', () => this.save());
        document.addEventListener('screen:show', e => {
            if (e.detail.screenId === 'weightScreen') this.render();
        });
    },

    save() {
        const input = document.getElementById('weightInput');
        const kg = parseFloat(input.value);
        if (Number.isNaN(kg)) {
            alert('体重を数値で入力してください。');
            return;
        }
        storage.setWeight(Utils.todayStr(), kg);
        input.value = '';
        this.render();
    },

    render() {
        const list = document.getElementById('weightHistoryList');
        const weights = storage.getWeights();
        const dates = Object.keys(weights).sort().reverse();

        if (!dates.length) {
            list.innerHTML = '<div class="empty-hint">まだ記録がありません</div>';
            return;
        }

        list.innerHTML = dates.map(d => `
            <div class="log-row">
                <div class="food-name">${Utils.formatJP(d)}</div>
                <div>
                    <span class="log-amt">${weights[d]}kg</span>
                    <button class="log-del" data-date="${d}">×</button>
                </div>
            </div>`).join('');

        list.querySelectorAll('.log-del').forEach(btn => {
            btn.addEventListener('click', () => {
                storage.deleteWeight(btn.dataset.date);
                this.render();
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => Weight.init());
