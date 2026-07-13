const Foods = {
    editingId: null,

    init() {
        document.getElementById('addFoodMasterBtn').addEventListener('click', () => this.add());
        document.addEventListener('screen:show', e => {
            if (e.detail.screenId === 'foodsScreen') {
                this.editingId = null;
                this.render();
            }
        });
    },

    add() {
        const name = document.getElementById('foodNameInput').value.trim();
        const aliasRaw = document.getElementById('foodAliasInput').value.trim();
        const unit = document.getElementById('foodUnitInput').value;
        const baseAmount = parseFloat(document.getElementById('foodBaseInput').value);
        const kcal = parseFloat(document.getElementById('foodKcalInput').value);
        const p = parseFloat(document.getElementById('foodPInput').value);
        const f = parseFloat(document.getElementById('foodFInput').value);
        const c = parseFloat(document.getElementById('foodCInput').value);

        if (!name || [baseAmount, kcal, p, f, c].some(Number.isNaN)) {
            alert('品名と数値項目をすべて入力してください。');
            return;
        }

        const aliases = aliasRaw ? aliasRaw.split(',').map(a => a.trim()).filter(Boolean) : [];
        storage.addFood({ name, aliases, unit, baseAmount, kcal, p, f, c });

        ['foodNameInput', 'foodAliasInput', 'foodKcalInput', 'foodPInput', 'foodFInput', 'foodCInput']
            .forEach(id => document.getElementById(id).value = '');
        document.getElementById('foodBaseInput').value = 100;

        this.render();
    },

    render() {
        const list = document.getElementById('foodsList');
        const foods = storage.getFoods();
        if (!foods.length) {
            list.innerHTML = '<div class="empty-hint">まだ登録がありません</div>';
            return;
        }
        list.innerHTML = foods.map(f => {
            if (f.id === this.editingId) return this.editRowHtml(f);
            return `
                <div class="food-item">
                    <div class="item-row">
                        <div class="food-item-tap" data-id="${f.id}" style="flex:1;">
                            <div class="food-name">${f.name}</div>
                            <div class="food-meta">${f.baseAmount}${f.unit}あたり P${f.p} F${f.f} C${f.c} · ${f.kcal}kcal</div>
                            ${f.aliases && f.aliases.length ? `<div class="food-meta">読み: ${f.aliases.join('/')}</div>` : ''}
                        </div>
                        <button class="item-del" data-id="${f.id}">削除</button>
                    </div>
                </div>`;
        }).join('');

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

    editRowHtml(f) {
        const aliasStr = (f.aliases || []).join(',');
        return `
            <div class="food-item">
                <div class="section-label">編集：${f.name}</div>
                <div class="form-field"><label>品名</label><input type="text" class="e-name" value="${f.name}"></div>
                <div class="form-field"><label>別名（カンマ区切り）</label><input type="text" class="e-alias" value="${aliasStr}"></div>
                <div class="form-row">
                    <div class="form-field small"><label>単位</label><input type="text" class="e-unit" value="${f.unit}"></div>
                    <div class="form-field small"><label>基準量</label><input type="number" class="e-base" value="${f.baseAmount}"></div>
                </div>
                <div class="form-row">
                    <div class="form-field"><label>kcal</label><input type="number" class="e-kcal" value="${f.kcal}"></div>
                    <div class="form-field"><label>P (g)</label><input type="number" class="e-p" value="${f.p}"></div>
                </div>
                <div class="form-row">
                    <div class="form-field"><label>F (g)</label><input type="number" class="e-f" value="${f.f}"></div>
                    <div class="form-field"><label>C (g)</label><input type="number" class="e-c" value="${f.c}"></div>
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
        const aliases = aliasRaw ? aliasRaw.split(',').map(a => a.trim()).filter(Boolean) : [];
        storage.updateFood(id, { name, aliases, unit, baseAmount, kcal, p, f, c });
        this.editingId = null;
        this.render();
    }
};

document.addEventListener('DOMContentLoaded', () => Foods.init());
