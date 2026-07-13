const AddFood = {
    init() {
        document.getElementById('submitOneLineBtn').addEventListener('click', () => this.submit());
    },

    // "コンビニ チーズケーキ,100,g,310,6,21,24" を固定順でパース
    parseLine(line) {
        const parts = line.split(',').map(p => p.trim());
        if (parts.length !== 7) return null;
        const [name, amount, unit, kcal, p, f, c] = parts;
        const nums = [amount, kcal, p, f, c].map(Number);
        if (nums.some(Number.isNaN)) return null;
        return {
            name, unit,
            amount: nums[0], kcal: nums[1], p: nums[2], f: nums[3], c: nums[4]
        };
    },

    submit() {
        const input = document.getElementById('oneLineInput');
        const parsed = this.parseLine(input.value);
        if (!parsed) {
            alert('形式が正しくありません。\n品名,量,単位,kcal,P,F,C の順で7項目をカンマ区切りで入力してください。');
            return;
        }

        const saveAsMaster = document.getElementById('saveAsMasterCheck').checked;
        let food;
        if (saveAsMaster) {
            // 入力した量を基準量としてそのままマスタ登録する
            food = storage.addFood({
                name: parsed.name,
                aliases: [],
                unit: parsed.unit,
                baseAmount: parsed.amount,
                kcal: parsed.kcal,
                p: parsed.p,
                f: parsed.f,
                c: parsed.c
            });
        }

        storage.addLogEntry({
            foodId: food ? food.id : null,
            name: parsed.name,
            amount: parsed.amount,
            unit: parsed.unit,
            kcal: parsed.kcal,
            p: parsed.p,
            f: parsed.f,
            c: parsed.c
        });

        input.value = '';
        document.getElementById('saveAsMasterCheck').checked = false;
        Main.renderToday();
        Nav.show('homeScreen');
    }
};

document.addEventListener('DOMContentLoaded', () => AddFood.init());
