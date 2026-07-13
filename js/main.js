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

        const quickAddInput = document.getElementById('quickAddInput');
        quickAddInput.addEventListener('input', () => this.renderSuggestions());
        quickAddInput.addEventListener('click', () => this.renderSuggestions());
        quickAddInput.addEventListener('blur', () => {
            // 候補タップ時にblurが先に発生してしまうため、少し遅らせて消す
            setTimeout(() => { document.getElementById('quickAddSuggestions').innerHTML = ''; }, 150);
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

    // 現在カーソルがある行の、カーソル位置までの文字列を「入力中の語」とみなしてオートコンプリート候補を出す
    renderSuggestions() {
        const textarea = document.getElementById('quickAddInput');
        const container = document.getElementById('quickAddSuggestions');
        const value = textarea.value;
        const cursor = textarea.selectionStart;
        const lineStart = value.lastIndexOf('\n', cursor - 1) + 1;
        const prefix = value.slice(lineStart, cursor).trim();

        if (!prefix) {
            container.innerHTML = '';
            return;
        }

        const matches = storage.findFoodsByPrefix(prefix);
        if (!matches.length) {
            container.innerHTML = '';
            return;
        }

        container.innerHTML = matches.map(f => `<button type="button" class="suggestion-chip" data-name="${f.name}">${f.name}</button>`).join('');
        container.querySelectorAll('.suggestion-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const name = chip.dataset.name;
                const newValue = value.slice(0, lineStart) + name + value.slice(cursor);
                textarea.value = newValue;
                const newCursor = lineStart + name.length;
                textarea.focus();
                textarea.setSelectionRange(newCursor, newCursor);
                container.innerHTML = '';
            });
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
        document.getElementById('quickAddSuggestions').innerHTML = '';
        this.renderToday();

        if (unmatchedLines.length) {
            const goOpen = entries.length === 0 && unmatchedLines.length === 1
                ? confirm(`「${unmatchedLines[0]}」は固定食品に見つかりませんでした。新しい食品を記録する画面を開きますか？`)
                : (alert(`${entries.length}件追加しました。\n見つからなかった食品：${unmatchedLines.join('、')}\n固定食品でない場合は「新しい食品を記録」から登録してください。`), false);
            if (goOpen) Nav.show('addFoodScreen');
        } else if (!entries.length) {
            alert('食品が見つかりませんでした。固定食品一覧に登録済みの品名で入力してください。');
        }
    },

    // 「よく使う食品」「最近使った食品」共通のワンタップ追加リストを描画する
    renderQuickList(containerId, items) {
        const list = document.getElementById(containerId);
        if (!items.length) {
            list.innerHTML = '<div class="empty-hint">まだありません</div>';
            return;
        }
        list.innerHTML = items.map(({ food, amount }) => {
            const n = storage.calcNutrients(food, amount);
            return `
                <div class="quick-row-wrap">
                    <div class="quick-row">
                        <div class="quick-row-main" data-food-id="${food.id}">
                            <div class="food-name">${food.name}</div>
                            <div class="food-meta">${amount}${food.unit}あたり P${n.p} F${n.f} C${n.c} · ${n.kcal}kcal</div>
                        </div>
                        <button class="quick-btn" data-food-id="${food.id}" data-amount="${amount}">${amount}${food.unit}追加する</button>
                    </div>
                    <div class="quick-edit-panel" data-food-id="${food.id}" data-default-amount="${amount}" style="display:none;">
                        <input type="text" inputmode="decimal" class="quick-edit-input" placeholder="${amount}">
                        <span class="unit-label">${food.unit}</span>
                        <button class="quick-edit-confirm" data-food-id="${food.id}">追加</button>
                    </div>
                </div>`;
        }).join('');

        const addFood = (foodId, amount) => {
            const food = storage.getFoods().find(f => f.id === foodId);
            if (!food) return;
            this.addFoodLog(food, amount);
            this.renderToday();
        };

        // ボタン：表示中の量でそのまま即追加
        list.querySelectorAll('.quick-btn').forEach(btn => {
            btn.addEventListener('click', () => addFood(btn.dataset.foodId, parseFloat(btn.dataset.amount)));
        });

        // 行のテキスト部分：数量を変更できる入力欄を展開
        list.querySelectorAll('.quick-row-main').forEach(row => {
            row.addEventListener('click', () => {
                const panel = list.querySelector(`.quick-edit-panel[data-food-id="${row.dataset.foodId}"]`);
                if (!panel) return;
                const isOpen = panel.style.display !== 'none';
                list.querySelectorAll('.quick-edit-panel').forEach(p => p.style.display = 'none');
                if (!isOpen) {
                    panel.style.display = 'flex';
                    const input = panel.querySelector('.quick-edit-input');
                    input.value = ''; // 前回の値は表示せず空欄から入力できるようにする（前回値はplaceholderで薄く表示）
                    input.focus();
                }
            });
        });

        list.querySelectorAll('.quick-edit-confirm').forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = btn.closest('.quick-edit-panel');
                const inputVal = panel.querySelector('.quick-edit-input').value.trim();
                // 空欄のまま追加した場合は、表示されていた前回量（プレースホルダー）を使う
                const amount = inputVal ? parseFloat(inputVal) : parseFloat(panel.dataset.defaultAmount);
                if (Number.isNaN(amount)) return;
                addFood(btn.dataset.foodId, amount);
            });
        });
    },

    renderFavoriteFoods() {
        const favorites = storage.getFavoriteFoods().map(food => ({
            food,
            amount: storage.getLastAmountForFood(food.id) || food.baseAmount
        }));
        this.renderQuickList('favoriteFoodsList', favorites);
    },

    renderRecentFoods() {
        const recent = storage.getRecentFoods(8).map(({ food, lastAmount }) => ({
            food,
            amount: lastAmount || food.baseAmount
        }));
        this.renderQuickList('recentFoodsList', recent);
    },

    renderTodayLogList() {
        const list = document.getElementById('todayLogList');
        const entries = storage.getLogsForDate();
        if (!entries.length) {
            list.innerHTML = '<div class="empty-hint">まだ記録がありません</div>';
            return;
        }
        list.innerHTML = [...entries].reverse().map(e => `
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

        this.renderFavoriteFoods();
        this.renderRecentFoods();
        this.renderTodayLogList();
    }
};

document.addEventListener('DOMContentLoaded', () => Main.init());
