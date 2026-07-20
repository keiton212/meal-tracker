const Foods = {
    editingId: null,
    searchQuery: '',

    init() {
        const search = document.getElementById('foodSearchInput');
        search.addEventListener('input', () => {
            this.searchQuery = search.value;
            this.render();
        });
        document.addEventListener('screen:show', e => {
            if (e.detail.screenId === 'foodsScreen') {
                this.editingId = null;
                // 既定の戻り先は設定画面。ホームのメニューから開いた場合は openEdit が上書きする
                const backBtn = document.querySelector('#foodsScreen .btn-back');
                if (backBtn) backBtn.dataset.back = 'settingsScreen';
                this.render();
            }
        });
    },

    // 他の画面（献立のメニュー行など）から、特定の食品の編集フォームを直接開く。
    // 戻るボタンの行き先も呼び出し元の画面に合わせる
    openEdit(foodId, backTo = 'settingsScreen') {
        Nav.show('foodsScreen'); // ここで screen:show が走り editingId がリセットされる
        // 検索で絞り込まれていると対象が一覧に出ないので、開く前に解除する
        this.searchQuery = '';
        document.getElementById('foodSearchInput').value = '';
        const backBtn = document.querySelector('#foodsScreen .btn-back');
        if (backBtn) backBtn.dataset.back = backTo;
        this.editingId = foodId;
        this.render();
        const form = document.querySelector(`.edit-save[data-id="${foodId}"]`);
        if (form) form.closest('.food-item').scrollIntoView({ block: 'center' });
    },

    render() {
        const list = document.getElementById('foodsList');
        const all = storage.getFoods();
        // 品名だけでなく読み（別名）でも絞り込めるようにする
        const q = Utils.normalize(this.searchQuery);
        const foods = q
            ? all.filter(f => [f.name, ...(f.aliases || [])].some(c => Utils.normalize(c).includes(q)))
            : all;
        if (!foods.length) {
            list.innerHTML = `<div class="empty-hint">${all.length ? '一致する食品がありません' : 'まだ登録がありません'}</div>`;
            return;
        }
        list.innerHTML = foods.map(f => {
            if (f.id === this.editingId) return this.editRowHtml(f);
            const extra = [];
            if (f.fiber != null && f.fiber !== 0) extra.push(`繊維${f.fiber}`);
            if (f.salt != null && f.salt !== 0) extra.push(`塩${f.salt}`);
            if (f.category) extra.push(CATEGORY_LABELS[f.category] || f.category);
            return `
                <div class="food-item">
                    <div class="item-row">
                        <button class="star-btn ${f.favorite ? 'active' : ''}" data-id="${f.id}">${f.favorite ? '★' : '☆'}</button>
                        <div class="food-item-tap" data-id="${f.id}" style="flex:1;">
                            <div class="food-name">${f.name}</div>
                            <div class="food-meta">${f.baseAmount}${f.unit}あたり P${f.p} F${f.f} C${f.c} · ${f.kcal}kcal${extra.length ? ' · ' + extra.join(' ') : ''}</div>
                            ${f.aliases && f.aliases.length ? `<div class="food-meta">読み: ${f.aliases.join('/')}</div>` : ''}
                        </div>
                        <div class="item-actions">
                            <button class="food-add" data-id="${f.id}">＋記録</button>
                            <button class="item-del" data-id="${f.id}">削除</button>
                        </div>
                    </div>
                </div>`;
        }).join('');

        // 一覧からその場で記録できるようにする（記録先は今ホーム画面で選んでいる日付・食事）
        const mealLabel = (MEAL_DEFS.find(m => m.key === Main.selectedMeal) || {}).label || '';
        document.getElementById('foodsAddHint').textContent =
            `「＋記録」の記録先：${Utils.formatJP(Main.currentDate)} の${mealLabel}（ホーム画面のタブで変更できます）`;
        list.querySelectorAll('.food-add').forEach(btn => {
            btn.addEventListener('click', () => {
                const food = storage.getFoods().find(f => f.id === btn.dataset.id);
                if (!food) return;
                const amount = storage.getLastAmountForFood(food.id) || food.baseAmount;
                const entry = Main.addFoodLog(food, amount);
                if (!entry) return;
                Main.renderToday();
                Utils.toast(`✓ ${mealLabel}に ${food.name} ${amount}${food.unit} を記録`, '取り消す', () => {
                    storage.deleteLogEntry(Main.currentDate, entry.id);
                    Main.renderToday();
                });
            });
        });

        list.querySelectorAll('.star-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                storage.toggleFavorite(btn.dataset.id);
                this.render();
            });
        });

        list.querySelectorAll('.food-item-tap').forEach(el => {
            el.addEventListener('click', () => {
                this.editingId = el.dataset.id;
                this.render();
            });
        });

        list.querySelectorAll('.item-del').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('この食品を削除しますか？（過去の記録は残ります）')) {
                    storage.deleteFood(btn.dataset.id);
                    this.render();
                }
            });
        });

        list.querySelectorAll('.edit-save').forEach(btn => {
            btn.addEventListener('click', () => this.saveEdit(btn.dataset.id));
        });
        list.querySelectorAll('.edit-cancel').forEach(btn => {
            btn.addEventListener('click', () => {
                this.editingId = null;
                this.render();
            });
        });
    },

    // 編集を保存したあと、呼び出し元がホーム画面ならそのまま戻して表示を更新する
    afterSave() {
        const backBtn = document.querySelector('#foodsScreen .btn-back');
        if (backBtn && backBtn.dataset.back === 'homeScreen') {
            backBtn.dataset.back = 'settingsScreen';
            Nav.show('homeScreen');
            Main.renderToday();
        }
    },

    editRowHtml(f) {
        const aliasStr = (f.aliases || []).join(',');
        return `
            <div class="food-item">
                <div class="section-label">編集：${f.name}</div>
                <div class="form-field"><label>品名</label><input type="text" class="e-name" value="${f.name}"></div>
                <div class="form-field"><label>別名（カンマ区切り）</label><input type="text" class="e-alias" value="${aliasStr}"></div>
                <div class="form-row">
                    <div class="form-field small"><label>単位</label><input type="text" class="e-unit" value="${f.unit}"></div>
                    <div class="form-field small"><label>基準量</label><input type="text" inputmode="decimal" class="e-base" value="${f.baseAmount}"></div>
                </div>
                <div class="form-row">
                    <div class="form-field"><label>kcal</label><input type="text" inputmode="decimal" class="e-kcal" value="${f.kcal}"></div>
                    <div class="form-field"><label>P (g)</label><input type="text" inputmode="decimal" class="e-p" value="${f.p}"></div>
                </div>
                <div class="form-row">
                    <div class="form-field"><label>F (g)</label><input type="text" inputmode="decimal" class="e-f" value="${f.f}"></div>
                    <div class="form-field"><label>C (g)</label><input type="text" inputmode="decimal" class="e-c" value="${f.c}"></div>
                </div>
                <div class="form-row">
                    <div class="form-field"><label>食物繊維 (g)</label><input type="text" inputmode="decimal" class="e-fiber" value="${f.fiber ?? ''}" placeholder="未設定"></div>
                    <div class="form-field"><label>食塩相当量 (g)</label><input type="text" inputmode="decimal" class="e-salt" value="${f.salt ?? ''}" placeholder="未設定"></div>
                </div>
                <div class="form-field"><label>カテゴリ（週次クオータ用）</label>
                    <select class="e-category">
                        <option value="">なし</option>
                        ${Object.entries(CATEGORY_LABELS).map(([key, label]) =>
                            `<option value="${key}" ${f.category === key ? 'selected' : ''}>${label}</option>`).join('')}
                    </select>
                </div>
                <div class="form-row">
                    <button class="btn-block edit-save" data-id="${f.id}" style="margin-top:10px;">保存</button>
                    <button class="btn-block secondary edit-cancel" data-id="${f.id}" style="margin-top:10px;">キャンセル</button>
                </div>
            </div>`;
    },

    saveEdit(id) {
        const item = document.querySelector(`.edit-save[data-id="${id}"]`).closest('.food-item');
        const name = item.querySelector('.e-name').value.trim();
        const aliasRaw = item.querySelector('.e-alias').value.trim();
        const unit = item.querySelector('.e-unit').value.trim();
        const baseAmount = parseFloat(item.querySelector('.e-base').value);
        const kcal = parseFloat(item.querySelector('.e-kcal').value);
        const p = parseFloat(item.querySelector('.e-p').value);
        const f = parseFloat(item.querySelector('.e-f').value);
        const c = parseFloat(item.querySelector('.e-c').value);

        if (!name || [baseAmount, kcal, p, f, c].some(Number.isNaN)) {
            alert('品名と数値項目をすべて入力してください。');
            return;
        }
        // 繊維・塩分は空欄可（空欄=未設定null。計算上は0として扱われる）
        const fiberRaw = item.querySelector('.e-fiber').value.trim();
        const saltRaw = item.querySelector('.e-salt').value.trim();
        const fiber = fiberRaw === '' ? null : (parseFloat(fiberRaw) || 0);
        const salt = saltRaw === '' ? null : (parseFloat(saltRaw) || 0);
        const category = item.querySelector('.e-category').value || null;
        const aliases = aliasRaw ? aliasRaw.split(',').map(a => a.trim()).filter(Boolean) : [];
        storage.updateFood(id, { name, aliases, unit, baseAmount, kcal, p, f, c, fiber, salt, category });
        this.editingId = null;
        this.render();
        this.afterSave();
    }
};

document.addEventListener('DOMContentLoaded', () => Foods.init());
