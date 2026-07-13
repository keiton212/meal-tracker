const Main = {
    init() {
        this.renderToday();
        document.getElementById('quickAddBtn').addEventListener('click', () => this.handleAdd());
        // テキストエリアなのでEnterは普通に改行させる（送信は「追加する」ボタンのみ）
        document.addEventListener('screen:show', e => {
            if (e.detail.screenId === 'homeScreen') this.renderToday();
        });
        document.getElementById('kcalNum').addEventListener('click', () => {
            document.getElementById('todayLogCard').scrollIntoView({ block: 'start' });
        });
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

    // テキスト全体から、登録済みの食品名・別名を辞書として直接検出する。
    // 区切り文字（空白・改行・カンマ・読点・区切りなし）に依存しないため誤認識が起きにくい。
    // 各マッチの直後～次のマッチまでの間にある数値をその食品の数量として扱い、数値が無ければ基準量を使う。
    extractEntries(text) {
        const foods = storage.getFoods();
        const termToFood = new Map();
        foods.forEach(food => {
            [food.name, ...(food.aliases || [])].forEach(term => {
                if (term && !termToFood.has(term)) termToFood.set(term, food);
            });
        });

        const terms = Array.from(termToFood.keys()).sort((a, b) => b.length - a.length);
        if (!terms.length) return { entries: [], unmatchedLines: [] };

        const escape = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(terms.map(escape).join('|'), 'g');

        const matches = [];
        let m;
        while ((m = pattern.exec(text)) !== null) {
            matches.push({ index: m.index, end: m.index + m[0].length, food: termToFood.get(m[0]) });
        }

        const entries = matches.map((match, i) => {
            const gapEnd = i + 1 < matches.length ? matches[i + 1].index : text.length;
            const gap = text.slice(match.end, gapEnd);
            const numMatch = gap.match(/(\d+(?:\.\d+)?)/);
            const amount = numMatch ? parseFloat(numMatch[1]) : match.food.baseAmount;
            return { food: match.food, amount };
        });

        // 食品名のマッチを1つも含まない行は「見つからなかった品目」として拾う
        const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
        const unmatchedLines = [];
        let cursor = 0;
        lines.forEach(line => {
            const lineStart = text.indexOf(line, cursor);
            const lineEnd = lineStart + line.length;
            cursor = lineEnd;
            const hasMatch = matches.some(mt => mt.index < lineEnd && mt.end > lineStart);
            if (!hasMatch) unmatchedLines.push(line);
        });

        return { entries, unmatchedLines };
    },

    handleAdd() {
        const textarea = document.getElementById('quickAddInput');
        const text = textarea.value;
        if (!text.trim()) return;

        const { entries, unmatchedLines } = this.extractEntries(text);
        entries.forEach(({ food, amount }) => this.addFoodLog(food, amount));

        textarea.value = '';
        this.renderToday();

        if (unmatchedLines.length) {
            const goOpen = entries.length === 0 && unmatchedLines.length === 1
                ? confirm(`「${unmatchedLines[0]}」は固定食品に見つかりませんでした。新しい食品を記録する画面を開きますか？`)
                : (alert(`${entries.length}件追加しました。\n見つからなかった食品：${unmatchedLines.join('、')}\n固定食品でない場合は「新しい食品を記録」から登録してください。`), false);
            if (goOpen) Nav.show('addFoodScreen');
        } else if (!entries.length) {
            alert('食品が見つかりませんでした。固定食品マスタに登録済みの品名で入力してください。');
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
                <div class="quick-row" data-food-id="${food.id}" data-amount="${amount}">
                    <div>
                        <div class="food-name">${food.name}</div>
                        <div class="food-meta">${amount}${food.unit}あたり P${n.p} F${n.f} C${n.c} · ${n.kcal}kcal</div>
                    </div>
                    <button class="quick-btn" data-food-id="${food.id}" data-amount="${amount}">${amount}${food.unit}追加する</button>
                </div>`;
        }).join('');

        const addFromRow = el => {
            const food = storage.getFoods().find(f => f.id === el.dataset.foodId);
            if (!food) return;
            this.addFoodLog(food, parseFloat(el.dataset.amount));
            this.renderToday();
        };

        // 行全体（品名・数量のテキスト部分）をタップしてもボタンと同じ動作にする
        list.querySelectorAll('.quick-row').forEach(row => {
            row.addEventListener('click', e => {
                if (e.target.closest('.quick-btn')) return; // ボタン自身のクリックは下のハンドラに任せる
                addFromRow(row);
            });
        });
        list.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', () => addFromRow(btn));
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
