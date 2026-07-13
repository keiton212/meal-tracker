const Main = {
    init() {
        this.renderToday();
        document.getElementById('quickAddBtn').addEventListener('click', () => this.handleAdd());
        document.getElementById('quickAddInput').addEventListener('keydown', e => {
            // Enterで確定、Shift+Enterで改行（複数行入力用）
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.handleAdd();
            }
        });
        document.addEventListener('screen:show', e => {
            if (e.detail.screenId === 'homeScreen') this.renderToday();
        });
    },

    // 1行を「品名 + 数量（省略可）」として解釈する。
    // 区切りはカンマ（全角/半角）・読点・空白のどれでもよく、無くてもよい（例:"鶏むね肉100g"）。
    // 数量が書かれていない場合（例:"おにぎり"だけ）は amount: null を返し、呼び出し側で食品マスタの基準量を使う。
    parseLine(line) {
        const trimmed = line.trim();
        if (!trimmed) return null;

        const SEP = '[,、,\\s]*';
        const UNIT = '(?:g|グラム|個|杯|枚|本|玉|食|ml|cc)?';
        const m = trimmed.match(new RegExp(`^(.+?)${SEP}([\\d]+(?:\\.\\d+)?)${SEP}${UNIT}${SEP}$`));
        if (m) {
            const name = m[1].replace(/[,、,\s]+$/, '').trim();
            if (!name) return null;
            return { name, amount: parseFloat(m[2]) };
        }

        // 数量が見つからない場合は品名のみとみなす（数量は後で食品マスタの基準量を使う）
        const name = trimmed.replace(/[,、,\s]+$/, '').trim();
        return name ? { name, amount: null } : null;
    },

    addFoodLog(food, amount) {
        const nutrients = storage.calcNutrients(food, amount);
        storage.addLogEntry({
            foodId: food.id,
            name: food.name,
            amount,
            unit: food.unit,
            ...nutrients
        });
    },

    handleAdd() {
        const textarea = document.getElementById('quickAddInput');
        const lines = textarea.value.split('\n').map(l => l.trim()).filter(Boolean);
        if (!lines.length) return;

        const notFound = [];
        let addedCount = 0;
        for (const line of lines) {
            const parsed = this.parseLine(line);
            if (!parsed) continue;
            const food = storage.findFoodByName(parsed.name);
            if (!food) {
                notFound.push(parsed.name);
                continue;
            }
            const amount = parsed.amount != null ? parsed.amount : food.baseAmount;
            this.addFoodLog(food, amount);
            addedCount++;
        }

        textarea.value = '';
        this.renderToday();

        if (notFound.length) {
            const goOpen = lines.length === 1 && addedCount === 0
                ? confirm(`「${notFound[0]}」は固定食品に見つかりませんでした。新しい食品を記録する画面を開きますか？`)
                : (alert(`${addedCount}件追加しました。\n見つからなかった食品：${notFound.join('、')}\n固定食品でない場合は「新しい食品を記録」から登録してください。`), false);
            if (goOpen) Nav.show('addFoodScreen');
        }
    },

    renderRecentFoods() {
        const list = document.getElementById('recentFoodsList');
        const recent = storage.getRecentFoods(8);
        if (!recent.length) {
            list.innerHTML = '<div class="empty-hint">まだ記録がありません</div>';
            return;
        }
        list.innerHTML = recent.map(({ food, lastAmount }) => {
            const amount = lastAmount || food.baseAmount;
            const n = storage.calcNutrients(food, amount);
            return `
                <div class="quick-row">
                    <div>
                        <div class="food-name">${food.name}</div>
                        <div class="food-meta">${amount}${food.unit}あたり P${n.p} F${n.f} C${n.c} · ${n.kcal}kcal</div>
                    </div>
                    <button class="quick-btn" data-food-id="${food.id}" data-amount="${amount}">${amount}${food.unit}追加する</button>
                </div>`;
        }).join('');

        list.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const food = storage.getFoods().find(f => f.id === btn.dataset.foodId);
                if (!food) return;
                this.addFoodLog(food, parseFloat(btn.dataset.amount));
                this.renderToday();
            });
        });
    },

    renderTodayLogList() {
        const list = document.getElementById('todayLogList');
        const entries = storage.getLogsForDate();
        if (!entries.length) {
            list.innerHTML = '<div class="empty-hint">まだ記録がありません</div>';
            return;
        }
        list.innerHTML = entries.map(e => `
            <div class="log-row">
                <div>
                    <div class="food-name">${e.name}</div>
                    <div class="food-meta">${e.amount}${e.unit} · P${e.p} F${e.f} C${e.c} · ${e.kcal}kcal</div>
                </div>
                <button class="log-del" data-id="${e.id}">×</button>
            </div>`).join('');

        list.querySelectorAll('.log-del').forEach(btn => {
            btn.addEventListener('click', () => {
                storage.deleteLogEntry(Utils.todayStr(), btn.dataset.id);
                this.renderToday();
            });
        });
    },

    renderToday() {
        const today = Utils.todayStr();
        document.getElementById('todayLabel').textContent = Utils.formatJP(today);

        const targets = storage.getTodayTargets(today);
        const periodLabel = document.getElementById('periodLabel');
        const entries = storage.getLogsForDate(today);
        const totals = storage.sumLogs(entries);

        document.getElementById('kcalNum').textContent = Math.round(totals.kcal);

        const pfcLine = document.getElementById('pfcLine');
        if (!targets) {
            periodLabel.textContent = 'スケジュール未設定（設定 > 増減量スケジュール）';
            document.getElementById('kcalGoal').textContent = '';
            pfcLine.innerHTML = '';
        } else {
            const dayTypeLabel = targets.dayType === 'rest' ? '休み日' : 'トレ日';
            periodLabel.textContent = `${dayTypeLabel}の目標 ${targets.kcal}kcal`;
            const remainKcal = Math.round(targets.kcal - totals.kcal);
            document.getElementById('kcalGoal').textContent =
                remainKcal >= 0 ? `残り ${remainKcal}kcal` : `${-remainKcal}kcal 超過`;

            const macros = [
                { key: 'p', label: 'P', goal: targets.p, val: totals.p },
                { key: 'f', label: 'F', goal: targets.f, val: totals.f },
                { key: 'c', label: 'C', goal: targets.c, val: totals.c }
            ];
            pfcLine.innerHTML = '<span>PFC</span>' + macros.map(m => {
                const diff = Utils.round1(m.goal - m.val);
                const over = diff < 0;
                return `<span class="pill ${over ? 'over' : 'remain'}">${m.label} ${over ? '超過' + (-diff) : '残り' + diff}g</span>`;
            }).join('');
        }

        this.renderRecentFoods();
        this.renderTodayLogList();
    }
};

document.addEventListener('DOMContentLoaded', () => Main.init());
