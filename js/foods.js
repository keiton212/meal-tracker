const Foods = {
    init() {
        document.getElementById('addFoodMasterBtn').addEventListener('click', () => this.add());
        document.addEventListener('screen:show', e => {
            if (e.detail.screenId === 'foodsScreen') this.render();
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
        list.innerHTML = foods.map(f => `
            <div class="food-item">
                <div class="item-row">
                    <div>
                        <div class="food-name">${f.name}</div>
                        <div class="food-meta">${f.baseAmount}${f.unit}あたり P${f.p} F${f.f} C${f.c} · ${f.kcal}kcal</div>
                        ${f.aliases && f.aliases.length ? `<div class="food-meta">読み: ${f.aliases.join('/')}</div>` : ''}
                    </div>
                    <button class="item-del" data-id="${f.id}">削除</button>
                </div>
            </div>`).join('');

        list.querySelectorAll('.item-del').forEach(btn => {
            btn.addEventListener('click', () => {
                if (confirm('この食品を削除しますか？（過去の記録は残ります）')) {
                    storage.deleteFood(btn.dataset.id);
                    this.render();
                }
            });
        });
    }
};

document.addEventListener('DOMContentLoaded', () => Foods.init());
