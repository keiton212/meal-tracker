// 献立（各食事スロットで何を食べるか）の編集画面。
// 変更内容は LocalStorage に保存され、ホーム画面のメニューに即座に反映される
const MealPlan = {
    selectedMeal: 'b1',
    // 固定枠の編集対象。'normal' = 通常の献立、'salmon' = 水曜（サーモンの日）用の献立
    variant: 'normal',

    init() {
        document.getElementById('mealPlanResetBtn').addEventListener('click', () => this.reset());
        document.addEventListener('screen:show', e => {
            if (e.detail.screenId === 'mealPlanScreen') {
                this.variant = 'normal';
                // 既定の戻り先は設定画面。ホームから開いた場合は呼び出し側で上書きする
                const backBtn = document.querySelector('#mealPlanScreen .btn-back');
                if (backBtn) backBtn.dataset.back = 'settingsScreen';
                this.render();
            }
        });
    },

    plan() {
        return storage.getMealPlan();
    },

    save(plan) {
        storage.setMealPlan(plan);
        this.render();
        Main.renderToday(); // ホーム画面のメニューにも即反映する
    },

    reset() {
        if (!confirm('献立を初期状態に戻しますか？（食品マスタや記録は消えません）')) return;
        storage.resetMealPlan();
        this.render();
        Main.renderToday();
    },

    // 編集中の固定枠の配列を返す（水曜用が未設定なら null）
    fixedList(slot) {
        return this.variant === 'salmon' ? (slot.salmonFixed || null) : (slot.fixed || []);
    },

    foodOptionsHtml(selectedId = '') {
        return storage.getFoods()
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, 'ja'))
            .map(f => `<option value="${f.id}" ${f.id === selectedId ? 'selected' : ''}>${f.name}</option>`)
            .join('');
    },

    // 品名・既定量・削除ボタンの1行（固定枠・選択肢どちらにも使う）
    itemRowHtml(item, index, kind, groupIndex = null) {
        const food = storage.getFoods().find(f => f.name === item.name);
        const unit = food ? food.unit : '';
        const missing = food ? '' : '<div class="food-meta plan-missing">⚠ この食品は固定食品一覧にありません</div>';
        return `
            <div class="plan-row" data-kind="${kind}" data-index="${index}" ${groupIndex != null ? `data-group="${groupIndex}"` : ''}>
                <div class="plan-row-name">
                    <div class="food-name">${item.name}</div>
                    ${missing}
                </div>
                <input type="text" inputmode="decimal" class="plan-amount" value="${item.amount}">
                <span class="unit-label">${unit}</span>
                <button class="item-del plan-del">削除</button>
            </div>`;
    },

    addRowHtml(kind, groupIndex = null) {
        return `
            <div class="plan-add" data-kind="${kind}" ${groupIndex != null ? `data-group="${groupIndex}"` : ''}>
                <select class="plan-add-food">${this.foodOptionsHtml()}</select>
                <input type="text" inputmode="decimal" class="plan-add-amount" placeholder="量">
                <button class="plan-add-btn">追加</button>
            </div>`;
    },

    render() {
        const tabs = document.getElementById('mealPlanTabs');
        tabs.innerHTML = MEAL_DEFS.map(m =>
            `<button class="meal-tab ${m.key === this.selectedMeal ? 'active' : ''}" data-meal="${m.key}">${m.short}</button>`
        ).join('');
        tabs.querySelectorAll('.meal-tab').forEach(btn => {
            btn.addEventListener('click', () => {
                this.selectedMeal = btn.dataset.meal;
                this.variant = 'normal';
                this.render();
            });
        });

        const plan = this.plan();
        const slot = plan[this.selectedMeal] || { fixed: [], choices: [] };
        const body = document.getElementById('mealPlanBody');
        const fixed = this.fixedList(slot);

        const fixedCard = `
            <div class="card">
                <div class="section-label">毎回食べるもの</div>
                <div class="plan-variant">
                    <button class="variant-btn ${this.variant === 'normal' ? 'active' : ''}" data-variant="normal">通常</button>
                    <button class="variant-btn ${this.variant === 'salmon' ? 'active' : ''}" data-variant="salmon">水曜</button>
                </div>
                ${fixed === null
                    ? `<div class="food-meta">水曜も通常と同じ献立です。</div>
                       <button class="btn-block secondary" id="planEnableSalmon">水曜だけ別の献立にする</button>`
                    : (fixed.length
                        ? fixed.map((item, i) => this.itemRowHtml(item, i, 'fixed')).join('')
                        : '<div class="empty-hint">まだありません</div>') +
                      this.addRowHtml('fixed') +
                      (this.variant === 'salmon'
                        ? '<button class="btn-block secondary" id="planDisableSalmon">水曜も通常と同じに戻す</button>'
                        : '')}
            </div>`;

        const groupCards = (slot.choices || []).map((group, gi) => `
            <div class="card">
                <div class="section-label">選択グループ ${gi + 1}</div>
                <div class="form-field"><label>見出し</label>
                    <input type="text" class="plan-group-label" data-group="${gi}" value="${group.label || ''}">
                </div>
                <label class="check-row" style="margin-top:10px;">
                    <input type="checkbox" class="plan-group-optional" data-group="${gi}" ${group.optional ? 'checked' : ''}>
                    <span>任意枠にする（選んだときだけ記録／レバーなど）</span>
                </label>
                <div class="form-field"><label>水曜の初期選択</label>
                    <select class="plan-group-salmon" data-group="${gi}">
                        <option value="">指定なし（先頭を選択）</option>
                        ${(group.options || []).map(o =>
                            `<option value="${o.name}" ${group.salmonDefault === o.name ? 'selected' : ''}>${o.name}</option>`).join('')}
                    </select>
                </div>
                <div class="section-label" style="margin-top:12px;">選択肢</div>
                ${(group.options || []).length
                    ? group.options.map((o, oi) => this.itemRowHtml(o, oi, 'option', gi)).join('')
                    : '<div class="empty-hint">まだありません</div>'}
                ${this.addRowHtml('option', gi)}
                <button class="btn-block secondary plan-group-del" data-group="${gi}">このグループを削除</button>
            </div>`).join('');

        body.innerHTML = fixedCard + groupCards +
            '<button class="btn-block secondary" id="planAddGroup">選択グループを追加</button>';

        this.bind(body);
    },

    bind(body) {
        const plan = this.plan();
        const slot = plan[this.selectedMeal];

        body.querySelectorAll('.variant-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                this.variant = btn.dataset.variant;
                this.render();
            });
        });

        const enableSalmon = document.getElementById('planEnableSalmon');
        if (enableSalmon) {
            enableSalmon.addEventListener('click', () => {
                slot.salmonFixed = JSON.parse(JSON.stringify(slot.fixed || []));
                this.save(plan);
            });
        }
        const disableSalmon = document.getElementById('planDisableSalmon');
        if (disableSalmon) {
            disableSalmon.addEventListener('click', () => {
                delete slot.salmonFixed;
                this.variant = 'normal';
                this.save(plan);
            });
        }

        // 既定量の変更
        body.querySelectorAll('.plan-amount').forEach(input => {
            input.addEventListener('change', () => {
                const row = input.closest('.plan-row');
                const amount = parseFloat(input.value);
                if (Number.isNaN(amount) || amount <= 0) { this.render(); return; }
                const target = this.targetList(slot, row.dataset.kind, row.dataset.group);
                if (!target) return;
                target[parseInt(row.dataset.index, 10)].amount = amount;
                this.save(plan);
            });
        });

        // 削除
        body.querySelectorAll('.plan-del').forEach(btn => {
            btn.addEventListener('click', () => {
                const row = btn.closest('.plan-row');
                const target = this.targetList(slot, row.dataset.kind, row.dataset.group);
                if (!target) return;
                target.splice(parseInt(row.dataset.index, 10), 1);
                this.save(plan);
            });
        });

        // 追加
        body.querySelectorAll('.plan-add-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const wrap = btn.closest('.plan-add');
                const foodId = wrap.querySelector('.plan-add-food').value;
                const food = storage.getFoods().find(f => f.id === foodId);
                if (!food) return;
                const raw = wrap.querySelector('.plan-add-amount').value.trim();
                const amount = raw ? parseFloat(raw) : food.baseAmount;
                if (Number.isNaN(amount) || amount <= 0) { alert('量を正しく入力してください。'); return; }
                const target = this.targetList(slot, wrap.dataset.kind, wrap.dataset.group);
                if (!target) return;
                target.push({ name: food.name, amount });
                this.save(plan);
            });
        });

        // グループの見出し・任意枠・水曜の初期選択
        body.querySelectorAll('.plan-group-label').forEach(input => {
            input.addEventListener('change', () => {
                slot.choices[parseInt(input.dataset.group, 10)].label = input.value.trim() || '選ぶ';
                this.save(plan);
            });
        });
        body.querySelectorAll('.plan-group-optional').forEach(input => {
            input.addEventListener('change', () => {
                slot.choices[parseInt(input.dataset.group, 10)].optional = input.checked;
                this.save(plan);
            });
        });
        body.querySelectorAll('.plan-group-salmon').forEach(select => {
            select.addEventListener('change', () => {
                const group = slot.choices[parseInt(select.dataset.group, 10)];
                if (select.value) group.salmonDefault = select.value;
                else delete group.salmonDefault;
                this.save(plan);
            });
        });
        body.querySelectorAll('.plan-group-del').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!confirm('この選択グループを削除しますか？')) return;
                slot.choices.splice(parseInt(btn.dataset.group, 10), 1);
                this.save(plan);
            });
        });

        document.getElementById('planAddGroup').addEventListener('click', () => {
            if (!slot.choices) slot.choices = [];
            slot.choices.push({ label: '1つ選ぶ', optional: false, options: [] });
            this.save(plan);
        });
    },

    // 編集対象の配列（固定枠 or 指定グループの選択肢）を返す
    targetList(slot, kind, groupIndex) {
        if (kind === 'fixed') {
            if (this.variant === 'salmon') {
                if (!slot.salmonFixed) slot.salmonFixed = [];
                return slot.salmonFixed;
            }
            if (!slot.fixed) slot.fixed = [];
            return slot.fixed;
        }
        const group = (slot.choices || [])[parseInt(groupIndex, 10)];
        if (!group) return null;
        if (!group.options) group.options = [];
        return group.options;
    }
};

document.addEventListener('DOMContentLoaded', () => MealPlan.init());
