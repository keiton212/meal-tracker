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

    // "コンビニ チーズケーキ,310,6,21,24" / "コンビニ チーズケーキ　310　6　21　24" など
    // カンマ（全角/半角）・読点・空白のどれで区切っても、末尾4つの数値をkcal,P,F,Cとして解釈する
    parseLine(line) {
        const tokens = line.trim().split(/[,、,\s]+/).filter(Boolean);
        if (tokens.length < 5) return null;
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

        const saveAsMaster = document.getElementById('saveAsMasterCheck').checked;
        let food;
        if (saveAsMaster) {
            food = storage.addFood({
                name: parsed.name,
                aliases: [],
                unit: basisUnit,
                baseAmount: isPiece ? 1 : basisAmount,
                kcal: parsed.kcal,
                p: parsed.p,
                f: parsed.f,
                c: parsed.c
            });
        }

        const ratio = isPiece ? 1 : (eatenAmount / basisAmount);
        storage.addLogEntry({
            foodId: food ? food.id : null,
            name: parsed.name,
            amount: eatenAmount,
            unit: basisUnit,
            kcal: Utils.round1(parsed.kcal * ratio),
            p: Utils.round1(parsed.p * ratio),
            f: Utils.round1(parsed.f * ratio),
            c: Utils.round1(parsed.c * ratio)
        });

        input.value = '';
        document.getElementById('saveAsMasterCheck').checked = false;
        document.getElementById('basis100g').checked = true;
        document.getElementById('basisAmountInput').value = 100;
        this.updateBasisUI();
        Main.renderToday();
        Nav.show('homeScreen');
    }
};

document.addEventListener('DOMContentLoaded', () => AddFood.init());
