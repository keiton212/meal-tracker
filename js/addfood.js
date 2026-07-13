const AddFood = {
    init() {
        document.getElementById('submitOneLineBtn').addEventListener('click', () => this.submit());
        document.querySelectorAll('input[name="foodBasis"]').forEach(el => {
            el.addEventListener('change', () => this.updateBasisUI());
        });
        this.updateBasisUI();
    },

    updateBasisUI() {
        const isPiece = document.getElementById('basisPiece').checked;
        document.getElementById('basisAmountRow').style.display = isPiece ? 'none' : 'flex';
    },

    // "コンビニ チーズケーキ,310,6,21,24" / "コンビニ チーズケーキ　310　6　21　24" /
    // "コンビニチーズケーキ310 6 21 24"（品名とカロリーの間の区切りは省略可）など。
    // 数値同士（カロリー・P・F・C）の間は区切りが必須（区別がつかないため）。
    parseLine(line) {
        const tokens = line.trim().split(/[,、,\s]+/).filter(Boolean);
        if (!tokens.length) return null;

        const isNum = t => /^\d+(\.\d+)?$/.test(t);
        let numCount = 0;
        for (let i = tokens.length - 1; i >= 0 && isNum(tokens[i]); i--) numCount++;

        // 品名とカロリーがくっついている場合（例:"コンビニチーズケーキ310"）、末尾の数値部分を切り出す
        if (numCount === 3) {
            const boundaryIdx = tokens.length - numCount - 1;
            const glued = boundaryIdx >= 0 ? tokens[boundaryIdx].match(/^(\D+?)(\d+(?:\.\d+)?)$/) : null;
            if (glued) {
                tokens.splice(boundaryIdx, 1, glued[1], glued[2]);
                numCount++;
            }
        }

        if (numCount < 4) return null;
        const nums = tokens.slice(-4).map(Number);
        if (nums.some(Number.isNaN)) return null;
        const name = tokens.slice(0, -4).join(' ');
        if (!name) return null;
        return { name, kcal: nums[0], p: nums[1], f: nums[2], c: nums[3] };
    },

    submit() {
        const input = document.getElementById('oneLineInput');
        const parsed = this.parseLine(input.value);
        if (!parsed) {
            alert('形式が正しくありません。\n品名, カロリー, P, F, C の順で入力してください（区切りはカンマ・読点・スペースいずれも可）。');
            return;
        }

        const isPiece = document.getElementById('basisPiece').checked;
        const basisAmount = 100;
        const basisUnit = isPiece ? '個' : 'g';

        // "実際に食べた量" は100gあたり選択時のみ使用。1つあたりの場合は常に1つ分を記録する
        const eatenAmount = isPiece ? 1 : (parseFloat(document.getElementById('basisAmountInput').value) || 100);

        // ここで入力した内容は常に固定食品として登録する（同名の食品があれば値を更新して重複登録を防ぐ）
        const foodData = {
            name: parsed.name,
            unit: basisUnit,
            baseAmount: isPiece ? 1 : basisAmount,
            kcal: parsed.kcal,
            p: parsed.p,
            f: parsed.f,
            c: parsed.c
        };
        const existing = storage.findFoodByName(parsed.name);
        let food;
        if (existing) {
            storage.updateFood(existing.id, foodData);
            food = { ...existing, ...foodData };
        } else {
            food = storage.addFood({ ...foodData, aliases: [] });
        }

        const ratio = isPiece ? 1 : (eatenAmount / basisAmount);
        storage.addLogEntry({
            foodId: food.id,
            name: parsed.name,
            amount: eatenAmount,
            unit: basisUnit,
            kcal: Utils.round1(parsed.kcal * ratio),
            p: Utils.round1(parsed.p * ratio),
            f: Utils.round1(parsed.f * ratio),
            c: Utils.round1(parsed.c * ratio)
        });

        input.value = '';
        document.getElementById('basis100g').checked = true;
        document.getElementById('basisAmountInput').value = 100;
        this.updateBasisUI();
        Main.renderToday();
        Nav.show('homeScreen');
    }
};

document.addEventListener('DOMContentLoaded', () => AddFood.init());
