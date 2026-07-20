const Main = {
    // 現在選択中の食事スロット。アプリを開いた時刻からいまの食事を自動推定し、タブで変更できる
    selectedMeal: defaultMealKey(),
    // 表示・記録の対象日。記録し忘れた日を後から埋められるよう前後に移動できる
    currentDate: Utils.todayStr(),

    init() {
        this.initDateNav();
        this.renderToday();
        document.getElementById('quickAddBtn').addEventListener('click', () => this.handleAdd());
        // テキストエリアなのでEnterは普通に改行させる（送信は「追加する」ボタンのみ）
        document.addEventListener('screen:show', e => {
            if (e.detail.screenId === 'homeScreen') this.renderToday();
        });
        // 献立を変更：いま見ている食事スロットを開いた状態で編集画面へ
        document.getElementById('editMealPlanBtn').addEventListener('click', () => {
            MealPlan.selectedMeal = this.selectedMeal;
            Nav.show('mealPlanScreen');
            const backBtn = document.querySelector('#mealPlanScreen .btn-back');
            if (backBtn) backBtn.dataset.back = 'homeScreen';
            MealPlan.render();
        });
        document.getElementById('kcalNum').addEventListener('click', () => {
            document.getElementById('todayLogCard').scrollIntoView({ block: 'start' });
        });

        const quickAddInput = document.getElementById('quickAddInput');
        // 候補選択でtextareaの値を書き換えた直後に発火するinputは、候補の再描画を無視する
        // （無視しないと同じ場所に新しい候補ボタンが再生成され、直後のtouchend/clickが誤ってそれを踏んでしまう）
        this._suppressAutocomplete = false;
        // 日本語IME（ローマ字入力など）では確定前は input が発火しないことがあるため、
        // input に加えて keyup / compositionupdate / compositionend でも候補を更新する
        ['input', 'keyup', 'compositionupdate', 'compositionend', 'click'].forEach(evt => {
            quickAddInput.addEventListener(evt, () => {
                if (this._suppressAutocomplete) {
                    this._suppressAutocomplete = false;
                    return;
                }
                this.renderSuggestions();
            });
        });
        quickAddInput.addEventListener('blur', () => {
            // 候補タップ時にblurが先に発生してしまうため、少し遅らせて消す
            setTimeout(() => { document.getElementById('quickAddSuggestions').innerHTML = ''; }, 200);
        });
    },

    // 日付の移動（未来には進めない）。記録し忘れた日を後から埋めるための機能なので、
    // 移動先の日付でも献立・目標・クオータはその日の曜日に応じて自動で切り替わる
    initDateNav() {
        document.getElementById('prevDayBtn').addEventListener('click', () => this.shiftDate(-1));
        document.getElementById('nextDayBtn').addEventListener('click', () => this.shiftDate(1));
        document.getElementById('backToTodayBtn').addEventListener('click', () => {
            this.currentDate = Utils.todayStr();
            this.renderToday();
        });
    },

    shiftDate(days) {
        const next = Utils.addDays(this.currentDate, days);
        if (next > Utils.todayStr()) return; // 未来の記録はしない
        this.currentDate = next;
        this.renderToday();
    },

    isToday() {
        return this.currentDate === Utils.todayStr();
    },

    addFoodLog(food, amount) {
        // レバーはビタミンA過剰防止のため1回30gを厳守。超える量は確認してから記録する
        if (food.category === 'liver' && amount > 30) {
            const ok = confirm(`⚠ レバーは1回30gまでのルールです（ビタミンA過剰防止）。\n${amount}${food.unit}で記録しますか？`);
            if (!ok) return false;
        }
        const nutrients = storage.calcNutrients(food, amount);
        return storage.addLogEntry({
            foodId: food.id,
            name: food.name,
            amount,
            unit: food.unit,
            meal: this.selectedMeal,
            ...nutrients
        }, this.currentDate);
    },

    // 直前に記録した内容を取り消せるトーストを出す
    showUndoToast(entries) {
        if (!entries.length) return;
        const label = entries.length === 1
            ? `${entries[0].name} を記録しました`
            : `${entries.length}品を記録しました`;
        const dateStr = this.currentDate;
        const ids = entries.map(e => e.id);
        Utils.toast(`✓ ${label}`, '取り消す', () => {
            ids.forEach(id => storage.deleteLogEntry(dateStr, id));
            this.renderToday();
        });
    },

    // 食事スロットのタブ（ホーム画面・新しい食品を記録画面の2箇所に表示）。
    // すでに記録済みのスロットには印を付け、まだ入れていない食事がひと目でわかるようにする
    renderMealTabs() {
        const logged = new Set(storage.getLogsForDate(this.currentDate).map(e => e.meal));
        ['mealTabs', 'mealTabsAdd'].forEach(containerId => {
            const container = document.getElementById(containerId);
            if (!container) return;
            container.innerHTML = MEAL_DEFS.map(m =>
                `<button class="meal-tab ${m.key === this.selectedMeal ? 'active' : ''}" data-meal="${m.key}">${m.short}<span class="meal-dot ${logged.has(m.key) ? 'done' : ''}"></span></button>`
            ).join('');
            container.querySelectorAll('.meal-tab').forEach(btn => {
                btn.addEventListener('click', () => {
                    this.selectedMeal = btn.dataset.meal;
                    this.renderMealTabs();
                    // ホーム画面ではタブに対応するメニューへ即座に切り替える
                    if (document.getElementById('mealPanel')) {
                        this.renderMealPanel();
                        this.renderRepeatLast();
                    }
                });
            });
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

        container.innerHTML =
            '<span class="suggestion-label">候補</span>' +
            matches.map(f => `<button type="button" class="suggestion-chip" data-name="${f.name}">${f.name}</button>`).join('');
        // 候補一覧は独立したオーバーレイ（position:absolute）なので、消しても
        // 他の要素（追加するボタンなど）の位置は動かない。誤タップの心配なく即座に消してよい
        container.querySelectorAll('.suggestion-chip').forEach(chip => {
            let handled = false;
            const select = () => {
                if (handled) return; // pointerdown/clickの二重発火を防ぐ
                handled = true;
                const name = chip.dataset.name;
                this._suppressAutocomplete = true;
                // setRangeTextはvalueを丸ごと入れ替えないため、IME・undo履歴の状態を壊しにくい
                if (typeof textarea.setRangeText === 'function') {
                    textarea.setRangeText(name, lineStart, cursor, 'end');
                } else {
                    textarea.value = value.slice(0, lineStart) + name + value.slice(cursor);
                    textarea.setSelectionRange(lineStart + name.length, lineStart + name.length);
                    this._suppressAutocomplete = false; // valueの直接代入はinputを発火しないため
                }
                textarea.focus();
                container.innerHTML = '';
            };
            // pointerdownの時点でpreventDefaultし、textareaからフォーカスが外れる前に確定させる
            // （clickだけに頼ると、環境によってキーボードが一旦閉じてしまうことがあるため）
            chip.addEventListener('pointerdown', e => { e.preventDefault(); select(); });
            chip.addEventListener('click', e => { e.preventDefault(); select(); });
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
        const added = entries.filter(({ food, amount }) => this.addFoodLog(food, amount));

        textarea.value = '';
        document.getElementById('quickAddSuggestions').innerHTML = '';
        this.renderToday();

        if (unmatchedLines.length) {
            const goOpen = entries.length === 0 && unmatchedLines.length === 1
                ? confirm(`「${unmatchedLines[0]}」は固定食品に見つかりませんでした。新しい食品を記録する画面を開きますか？`)
                : (alert(`${added.length}件追加しました。\n見つからなかった食品：${unmatchedLines.join('、')}\n固定食品でない場合は「新しい食品を記録」から登録してください。`), false);
            if (goOpen) Nav.show('addFoodScreen');
        } else if (!entries.length) {
            alert('食品が見つかりませんでした。固定食品一覧に登録済みの品名で入力してください。');
        }
    },

    // 量を調整する行（−/＋ステッパー付き）。固定献立・選択メニュー共通の部品
    amountRowHtml(food, amount) {
        const n = storage.calcNutrients(food, amount);
        const step = (food.unit === 'g' || food.unit === 'ml') ? 10 : 1;
        return `
            <div class="menu-item" data-food-id="${food.id}" data-step="${step}">
                <div class="menu-item-head">
                    <div class="food-name">${food.name}<button class="food-edit-btn" data-food-id="${food.id}" title="この食品のPFCを編集">✏️</button></div>
                    <div class="menu-amount">
                        <button class="step-btn" data-dir="-1">−</button>
                        <input type="text" inputmode="decimal" class="menu-amount-input" value="${amount}">
                        <span class="unit-label">${food.unit}</span>
                        <button class="step-btn" data-dir="1">＋</button>
                    </div>
                </div>
                <div class="food-meta menu-nutrients">P${n.p} F${n.f} C${n.c} · ${n.kcal}kcal</div>
            </div>`;
    },

    // 選択中の食事スロットの献立だけを表示する。
    // 白米・ブロッコリーなどの「毎回食べるもの」は固定表示、
    // 主菜・主食などは選択肢をタップして選び、それぞれ量を調整してまとめて記録する
    renderMealPanel() {
        const panel = document.getElementById('mealPanel');
        const label = document.getElementById('mealPanelLabel');
        const meal = MEAL_DEFS.find(m => m.key === this.selectedMeal);
        const preset = storage.getMealPreset(this.selectedMeal, this.currentDate);

        if (!preset || (!preset.fixed.length && !preset.choices.length)) {
            label.textContent = meal ? meal.label : 'メニュー';
            panel.innerHTML = '<div class="empty-hint">この食事のメニューが登録されていません</div>';
            return;
        }

        label.textContent = `${meal.label}${preset.hasChoices ? '（選んで記録）' : '（固定メニュー）'}`;

        const salmonHint = (storage.isSalmonDay(this.currentDate) && this.selectedMeal === 'b2')
            ? '<div class="salmon-quick-hint">🐟 サーモンの日なので卵白＋ホエイに切り替わっています</div>'
            : '';

        const fixedHtml = preset.fixed.length
            ? (preset.hasChoices ? '<div class="choice-label">毎回食べるもの</div>' : '') +
              preset.fixed.map(({ food, amount }) => this.amountRowHtml(food, amount)).join('')
            : '';

        const choicesHtml = preset.choices.map((group, gi) => `
            <div class="choice-group" data-group="${gi}" data-optional="${group.optional}">
                <div class="choice-label">${group.label}</div>
                <div class="choice-chips">
                    ${group.options.map((o, oi) => `
                        <button class="choice-chip ${oi === group.selectedIndex ? 'active' : ''}"
                                data-group="${gi}" data-option="${oi}"
                                data-food-id="${o.food.id}" data-amount="${o.amount}">${o.food.name}</button>`).join('')}
                </div>
                <div class="choice-selected">
                    ${group.selectedIndex >= 0
                        ? this.amountRowHtml(group.options[group.selectedIndex].food, group.options[group.selectedIndex].amount)
                        : '<div class="empty-hint">選ぶと記録に含まれます</div>'}
                </div>
            </div>`).join('');

        panel.innerHTML = salmonHint + fixedHtml + choicesHtml +
            '<div class="projection" id="mealProjection"></div>' +
            '<button class="btn-block" id="recordSetBtn">この内容で記録する</button>';

        this.bindAmountRows(panel);
        this.updateProjection();

        // 選択チップ：タップでその品に切り替え（任意枠はもう一度押すと選択解除）
        panel.querySelectorAll('.choice-chip').forEach(chip => {
            chip.addEventListener('click', () => {
                const group = chip.closest('.choice-group');
                const isActive = chip.classList.contains('active');
                const optional = group.dataset.optional === 'true';
                const selected = group.querySelector('.choice-selected');

                group.querySelectorAll('.choice-chip').forEach(c => c.classList.remove('active'));
                if (isActive && optional) {
                    selected.innerHTML = '<div class="empty-hint">選ぶと記録に含まれます</div>';
                    return;
                }
                chip.classList.add('active');
                const food = storage.getFoods().find(f => f.id === chip.dataset.foodId);
                if (!food) return;
                // 選択の切り替えでは他の行の入力量を保つため、このグループのDOMだけ差し替える
                selected.innerHTML = this.amountRowHtml(food, parseFloat(chip.dataset.amount));
                this.bindAmountRows(selected);
                this.updateProjection();
            });
        });

        // 固定分＋選択中の品を、表示中の量でまとめて記録する
        document.getElementById('recordSetBtn').addEventListener('click', () => {
            const foods = storage.getFoods();
            const added = [];
            panel.querySelectorAll('.menu-item').forEach(item => {
                const amount = parseFloat(item.querySelector('.menu-amount-input').value);
                const food = foods.find(f => f.id === item.dataset.foodId);
                if (!food || Number.isNaN(amount) || amount <= 0) return;
                const entry = this.addFoodLog(food, amount);
                if (entry) added.push(entry);
            });
            if (!added.length) { alert('記録する品がありません。量を確認してください。'); return; }
            this.renderToday();
            this.showUndoToast(added);
        });
    },

    // 「いまメニューに表示されている内容を記録したら1日の合計がどうなるか」を先に見せる。
    // 主菜を選び直すたびに更新されるので、超過するかどうかを選ぶ前に判断できる
    updateProjection() {
        const el = document.getElementById('mealProjection');
        if (!el) return;
        const targets = storage.getTodayTargets(this.currentDate);
        if (!targets) { el.innerHTML = ''; return; }

        const foods = storage.getFoods();
        const planned = { kcal: 0, p: 0, f: 0, c: 0 };
        document.querySelectorAll('#mealPanel .menu-item').forEach(item => {
            const amount = parseFloat(item.querySelector('.menu-amount-input').value);
            const food = foods.find(f => f.id === item.dataset.foodId);
            if (!food || Number.isNaN(amount) || amount <= 0) return;
            const n = storage.calcNutrients(food, amount);
            planned.kcal += n.kcal; planned.p += n.p; planned.f += n.f; planned.c += n.c;
        });

        const now = storage.sumLogs(storage.getLogsForDate(this.currentDate));
        const after = {
            kcal: now.kcal + planned.kcal, p: now.p + planned.p,
            f: now.f + planned.f, c: now.c + planned.c
        };
        const remainKcal = Math.round(targets.kcal - after.kcal);
        const over = remainKcal < 0;
        el.innerHTML =
            `<span class="projection-label">記録すると</span>` +
            `<span class="pill ${over ? 'over' : 'remain'}">${Math.round(after.kcal)} / ${targets.kcal}kcal（${over ? (-remainKcal) + '超過' : '残り' + remainKcal}）</span>` +
            `<span class="projection-macros">P${Utils.round1(targets.p - after.p)} F${Utils.round1(targets.f - after.f)} C${Utils.round1(targets.c - after.c)}</span>`;
    },

    // 「前回と同じ」：この食事スロットを最後に記録した日の内容をそのまま記録する
    renderRepeatLast() {
        const wrap = document.getElementById('repeatLastWrap');
        if (!wrap) return;
        const last = storage.getLastMealEntries(this.selectedMeal, this.currentDate);
        if (!last) { wrap.innerHTML = ''; return; }

        const names = last.entries.map(e => `${e.name} ${e.amount}${e.unit}`).join(' / ');
        wrap.innerHTML = `
            <button class="repeat-btn" id="repeatLastBtn">
                <span class="repeat-title">↺ ${Utils.formatJP(last.date)}と同じ内容で記録</span>
                <span class="repeat-detail">${names}</span>
            </button>`;

        document.getElementById('repeatLastBtn').addEventListener('click', () => {
            const added = last.entries.map(e => storage.addLogEntry({
                foodId: e.foodId, name: e.name, amount: e.amount, unit: e.unit,
                meal: this.selectedMeal,
                kcal: e.kcal, p: e.p, f: e.f, c: e.c, fiber: e.fiber || 0, salt: e.salt || 0
            }, this.currentDate));
            this.renderToday();
            this.showUndoToast(added);
        });
    },

    // 「よく使う食品」「最近使った食品」のワンタップ追加リスト。
    // 献立に無いものを単発で足したいとき用（量は前回記録した値を初期表示する）
    renderQuickAddList(containerId, items) {
        const list = document.getElementById(containerId);
        if (!list) return;
        if (!items.length) {
            list.innerHTML = '<div class="empty-hint">まだありません</div>';
            return;
        }
        list.innerHTML = items.map(({ food, amount }) =>
            this.amountRowHtml(food, amount) +
            `<button class="menu-add-btn" data-food-id="${food.id}">この量で記録する</button>`
        ).join('');

        this.bindAmountRows(list);
        list.querySelectorAll('.menu-add-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = list.querySelector(`.menu-item[data-food-id="${btn.dataset.foodId}"]`);
                const amount = parseFloat(item.querySelector('.menu-amount-input').value);
                const food = storage.getFoods().find(f => f.id === btn.dataset.foodId);
                if (!food || Number.isNaN(amount) || amount <= 0) return;
                const entry = this.addFoodLog(food, amount);
                if (!entry) return;
                this.renderToday();
                this.showUndoToast([entry]);
            });
        });
    },

    renderFavoriteFoods() {
        const items = storage.getFavoriteFoods().map(food => ({
            food,
            amount: storage.getLastAmountForFood(food.id) || food.baseAmount
        }));
        this.renderQuickAddList('favoriteFoodsList', items);
    },

    renderRecentFoods() {
        const items = storage.getRecentFoods(8).map(({ food, lastAmount }) => ({
            food,
            amount: lastAmount || food.baseAmount
        }));
        this.renderQuickAddList('recentFoodsList', items);
    },

    // 量の行（−/＋ステッパーと入力欄）にイベントを設定する
    bindAmountRows(root) {
        // 鉛筆ボタン：買う商品でPFCが変わることがあるため、その場から食品の編集画面へ飛べるようにする
        root.querySelectorAll('.food-edit-btn').forEach(btn => {
            btn.addEventListener('click', e => {
                e.stopPropagation();
                Foods.openEdit(btn.dataset.foodId, 'homeScreen');
            });
        });
        root.querySelectorAll('.menu-item .step-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = btn.closest('.menu-item');
                const input = item.querySelector('.menu-amount-input');
                const step = parseFloat(item.dataset.step) || 1;
                const current = parseFloat(input.value) || 0;
                input.value = Math.max(0, Utils.round1(current + step * parseInt(btn.dataset.dir, 10)));
                this.refreshMenuNutrients(item);
                this.updateProjection();
            });
        });
        root.querySelectorAll('.menu-amount-input').forEach(input => {
            input.addEventListener('input', () => {
                this.refreshMenuNutrients(input.closest('.menu-item'));
                this.updateProjection();
            });
        });
    },

    // 量の入力に合わせて、その行のPFC/kcal表示だけを更新する
    refreshMenuNutrients(item) {
        if (!item) return;
        const food = storage.getFoods().find(f => f.id === item.dataset.foodId);
        const amount = parseFloat(item.querySelector('.menu-amount-input').value);
        const target = item.querySelector('.menu-nutrients');
        if (!food || Number.isNaN(amount)) { target.textContent = ''; return; }
        const n = storage.calcNutrients(food, amount);
        target.textContent = `P${n.p} F${n.f} C${n.c} · ${n.kcal}kcal`;
    },

    renderTodayLogList() {
        const list = document.getElementById('todayLogList');
        const today = this.currentDate;
        const entries = storage.getLogsForDate(today);
        if (!entries.length) {
            list.innerHTML = '<div class="empty-hint">まだ記録がありません</div>';
            return;
        }

        // 食事スロットごとにグループ化して小計を表示。スロット未設定の古い記録は「未分類」へ
        const groups = MEAL_DEFS.map(m => ({ ...m, items: entries.filter(e => e.meal === m.key) }));
        const known = new Set(MEAL_DEFS.map(m => m.key));
        const others = entries.filter(e => !known.has(e.meal));
        if (others.length) groups.push({ key: 'other', label: '未分類', items: others });

        const rowHtml = e => {
            const step = (e.unit === 'g' || e.unit === 'ml') ? 10 : 1;
            return `
                <div class="log-row">
                    <div class="log-row-main" data-id="${e.id}">
                        <div class="food-name">${e.name}</div>
                        <div class="food-meta">${e.amount}${e.unit} · P${e.p} F${e.f} C${e.c} · ${e.kcal}kcal</div>
                    </div>
                    <button class="log-again" data-id="${e.id}" title="同じ内容をもう一度記録">＋</button>
                    <button class="log-del" data-id="${e.id}">×</button>
                </div>
                <div class="quick-edit-panel log-edit-panel" data-id="${e.id}" data-default-amount="${e.amount}" data-step="${step}" style="display:none;">
                    <button class="step-btn" data-dir="-1">−</button>
                    <input type="text" inputmode="decimal" class="quick-edit-input" placeholder="${e.amount}">
                    <button class="step-btn" data-dir="1">＋</button>
                    <span class="unit-label">${e.unit}</span>
                    <button class="quick-edit-confirm log-edit-save" data-id="${e.id}">変更</button>
                </div>`;
        };

        list.innerHTML = groups.filter(g => g.items.length).map(g => {
            const sum = storage.sumLogs(g.items);
            return `
                <div class="meal-group">
                    <div class="meal-group-head">
                        <span>${g.label}</span>
                        <span>${Math.round(sum.kcal)}kcal · P${Utils.round1(sum.p)} F${Utils.round1(sum.f)} C${Utils.round1(sum.c)}</span>
                    </div>
                    ${g.items.map(rowHtml).join('')}
                </div>`;
        }).join('');

        list.querySelectorAll('.log-del').forEach(btn => {
            btn.addEventListener('click', () => {
                storage.deleteLogEntry(today, btn.dataset.id);
                this.renderToday();
            });
        });

        // おかわりなど、記録済みの品をそのままもう一度足す
        list.querySelectorAll('.log-again').forEach(btn => {
            btn.addEventListener('click', () => {
                const src = storage.getLogsForDate(today).find(e => e.id === btn.dataset.id);
                if (!src) return;
                const { id, time, ...rest } = src;
                const entry = storage.addLogEntry(rest, today);
                this.renderToday();
                this.showUndoToast([entry]);
            });
        });

        // 行タップで量の変更パネルを開閉
        list.querySelectorAll('.log-row-main').forEach(row => {
            row.addEventListener('click', () => {
                const panel = list.querySelector(`.log-edit-panel[data-id="${row.dataset.id}"]`);
                if (!panel) return;
                const isOpen = panel.style.display !== 'none';
                list.querySelectorAll('.log-edit-panel').forEach(p => p.style.display = 'none');
                if (!isOpen) {
                    panel.style.display = 'flex';
                    const input = panel.querySelector('.quick-edit-input');
                    input.value = '';
                    input.focus();
                }
            });
        });

        list.querySelectorAll('.log-edit-panel .step-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = btn.closest('.log-edit-panel');
                const input = panel.querySelector('.quick-edit-input');
                const step = parseFloat(panel.dataset.step) || 1;
                const current = parseFloat(input.value) || parseFloat(panel.dataset.defaultAmount) || 0;
                input.value = Math.max(0, Utils.round1(current + step * parseInt(btn.dataset.dir, 10)));
            });
        });

        list.querySelectorAll('.log-edit-save').forEach(btn => {
            btn.addEventListener('click', () => {
                const panel = btn.closest('.log-edit-panel');
                const inputVal = panel.querySelector('.quick-edit-input').value.trim();
                const amount = inputVal ? parseFloat(inputVal) : parseFloat(panel.dataset.defaultAmount);
                if (Number.isNaN(amount) || amount <= 0) return;
                storage.updateLogEntryAmount(today, btn.dataset.id, amount);
                this.renderToday();
            });
        });
    },

    renderToday() {
        const today = this.currentDate;
        const isToday = this.isToday();
        document.getElementById('todayLabel').textContent = Utils.formatJP(today) + (isToday ? '' : ' の記録');
        document.getElementById('nextDayBtn').disabled = isToday;
        document.getElementById('backToTodayBtn').style.display = isToday ? 'none' : '';
        document.getElementById('homeScreen').classList.toggle('past-date', !isToday);

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
            const salmonLabel = targets.salmonDay ? '・🐟サーモンの日' : '';
            periodLabel.textContent = `${dayTypeLabel}${salmonLabel}の目標 ${targets.kcal}kcal`;
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

        // 食物繊維（下限25g）・食塩相当量（上限7g）の達成状況
        document.getElementById('fsLine').innerHTML =
            '<span>繊維/塩</span>' +
            `<span class="pill ${totals.fiber >= FIBER_MIN_PER_DAY ? 'good' : 'warn'}">繊維 ${Utils.round1(totals.fiber)} / ${FIBER_MIN_PER_DAY}g以上</span>` +
            `<span class="pill ${totals.salt < SALT_MAX_PER_DAY ? 'remain' : 'over'}">塩分 ${Utils.round1(totals.salt)} / ${SALT_MAX_PER_DAY}g未満</span>`;

        this.renderSalmonBanner(today);
        this.renderMealTabs();
        this.renderRepeatLast();
        this.renderMealPanel();
        this.renderQuota();
        this.renderFavoriteFoods();
        this.renderRecentFoods();
        this.renderTodayLogList();
    },

    renderSalmonBanner(today) {
        const banner = document.getElementById('salmonBanner');
        if (!storage.isSalmonDay(today)) {
            banner.innerHTML = '';
            return;
        }
        const salmonQuota = storage.getWeekQuotaStatus(today).find(q => q.category === 'fattyfish');
        const done = salmonQuota && salmonQuota.used >= 1;
        banner.innerHTML = `<div class="salmon-banner">🐟 今日はサーモンの日です${done ? '（サーモン記録済み ✓）' : '。サーモン・ギンダラを記録しましょう'}</div>`;
    },

    renderQuota() {
        const list = document.getElementById('quotaList');
        const quotas = storage.getWeekQuotaStatus(this.currentDate);

        // 週の後半になっても消化していない枠があれば、使い切るよう促す
        const alertEl = document.getElementById('quotaAlert');
        const daysElapsed = (new Date(this.currentDate).getDay() + 6) % 7; // 0=月
        const daysLeft = 6 - daysElapsed; // 今日を除いた残り日数
        const unmet = quotas.filter(q => q.limit != null && q.used < q.limit);
        if (daysLeft <= 2 && unmet.length) {
            alertEl.innerHTML = `<div class="quota-alert">⚠ 今週の残り${daysLeft === 0 ? 'は今日だけ' : daysLeft + '日'}：` +
                unmet.map(q => `${q.label}あと${q.limit - q.used}回`).join('・') + '</div>';
        } else {
            alertEl.innerHTML = '';
        }
        list.innerHTML = quotas.map(q => {
            let stateClass, text;
            if (q.limit == null) {
                stateClass = 'remain';
                text = '自由';
            } else {
                text = `${q.used}/${q.limit}回`;
                stateClass = q.used > q.limit ? 'over' : (q.used === q.limit ? 'good' : 'remain');
            }
            return `
                <div class="quota-row">
                    <div>
                        <span class="food-name">${q.label}</span>
                        ${q.note ? `<span class="food-meta" style="display:inline; margin-left:6px;">${q.note}</span>` : ''}
                    </div>
                    <span class="pill ${stateClass}">${text}</span>
                </div>`;
        }).join('');
    }
};

document.addEventListener('DOMContentLoaded', () => Main.init());
