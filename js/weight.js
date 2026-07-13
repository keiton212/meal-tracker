const Weight = {
    editingDate: null,

    init() {
        document.getElementById('saveWeightBtn').addEventListener('click', () => this.save());
        document.addEventListener('screen:show', e => {
            if (e.detail.screenId === 'weightScreen') {
                this.editingDate = null;
                this.render();
            }
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

        list.innerHTML = dates.map(d => {
            if (d === this.editingDate) return this.editRowHtml(d, weights[d]);
            return `
            <div class="log-row">
                <div class="food-name weight-tap" data-date="${d}">${Utils.formatJP(d)}</div>
                <div>
                    <span class="log-amt weight-tap" data-date="${d}">${weights[d]}kg</span>
                    <button class="log-del" data-date="${d}">×</button>
                </div>
            </div>`;
        }).join('');

        list.querySelectorAll('.weight-tap').forEach(el => {
            el.addEventListener('click', () => {
                this.editingDate = el.dataset.date;
                this.render();
            });
        });

        list.querySelectorAll('.log-del').forEach(btn => {
            btn.addEventListener('click', () => {
                storage.deleteWeight(btn.dataset.date);
                this.render();
            });
        });

        list.querySelectorAll('.edit-save').forEach(btn => {
            btn.addEventListener('click', () => this.saveEdit(btn.dataset.date));
        });
        list.querySelectorAll('.edit-cancel').forEach(btn => {
            btn.addEventListener('click', () => {
                this.editingDate = null;
                this.render();
            });
        });
    },

    editRowHtml(d, kg) {
        return `
            <div class="log-row" style="flex-direction:column;align-items:stretch;gap:8px;">
                <div class="section-label">編集：${Utils.formatJP(d)}</div>
                <div class="field-row">
                    <input type="number" class="e-weight" step="0.1" value="${kg}">
                    <span class="unit-label">kg</span>
                </div>
                <div class="form-row">
                    <button class="btn-block edit-save" data-date="${d}">保存</button>
                    <button class="btn-block secondary edit-cancel" data-date="${d}">キャンセル</button>
                </div>
            </div>`;
    },

    saveEdit(date) {
        const item = document.querySelector(`.edit-save[data-date="${date}"]`).closest('.log-row');
        const kg = parseFloat(item.querySelector('.e-weight').value);
        if (Number.isNaN(kg)) {
            alert('体重を数値で入力してください。');
            return;
        }
        storage.setWeight(date, kg);
        this.editingDate = null;
        this.render();
    }
};

document.addEventListener('DOMContentLoaded', () => Weight.init());
