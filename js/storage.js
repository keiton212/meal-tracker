const STORAGE_KEYS = {
    FOODS: 'meal_foods',
    PERIODS: 'meal_periods',
    LOGS: 'meal_logs',
    WEIGHTS: 'meal_weights'
};

// 週の休みトレ日（gym-trackerのメニュー設定と同じ：日曜・木曜が休み）
const REST_DAYS_OF_WEEK = [0, 4];

const SEED_FOODS = [
    { id: 'f1', name: '鶏胸肉・皮なし', aliases: ['鶏むね肉', 'とりむね肉', '鶏胸肉', 'とり胸', 'トリムネ肉'], unit: 'g', baseAmount: 100, kcal: 108, p: 23.3, f: 1.5, c: 0 },
    { id: 'f2', name: '白米', aliases: ['ごはん', 'ご飯'], unit: 'g', baseAmount: 100, kcal: 156, p: 2.5, f: 0.3, c: 35.6 },
    { id: 'f4', name: '卵', aliases: ['たまご', 'タマゴ'], unit: '個', baseAmount: 1, kcal: 76, p: 6.2, f: 5.2, c: 0.2 },
    { id: 'f5', name: 'ブロッコリー', aliases: [], unit: 'g', baseAmount: 100, kcal: 33, p: 4.3, f: 0.5, c: 5.2 },
    { id: 'f6', name: 'バナナ', aliases: [], unit: 'g', baseAmount: 100, kcal: 93, p: 1.1, f: 0.2, c: 22.5 },
    { id: 'f7', name: '森永 高たんぱく牛乳', aliases: ['高たんぱく牛乳'], unit: 'ml', baseAmount: 200, kcal: 104, p: 10.3, f: 0.3, c: 15.1 },
    { id: 'f8', name: 'オレンジジュース', aliases: [], unit: 'ml', baseAmount: 200, kcal: 94, p: 1.7, f: 0, c: 22.2 },
    { id: 'f9', name: 'ソイプロテイン（INNOCECT）', aliases: ['ソイプロテイン', 'INNOCECT'], unit: 'g', baseAmount: 30, kcal: 112, p: 21.1, f: 0.7, c: 7.2 },
    { id: 'f10', name: 'ザバスヨーグルト', aliases: ['ザバス ヨーグルト'], unit: '個', baseAmount: 1, kcal: 85, p: 15, f: 0, c: 6.4 },
    { id: 'f11', name: 'オイコス マンゴー', aliases: ['オイコス'], unit: 'g', baseAmount: 113, kcal: 85, p: 10.1, f: 0, c: 0 },
    { id: 'f12', name: '味の素 プロテイン唐揚げ', aliases: ['プロテイン唐揚げ'], unit: 'g', baseAmount: 180, kcal: 239, p: 31.7, f: 5.75, c: 15.1 },
    { id: 'f13', name: 'ハンバーガー', aliases: [], unit: '個', baseAmount: 1, kcal: 478, p: 21.9, f: 24.7, c: 42.2 },
    { id: 'f14', name: 'おにぎり', aliases: [], unit: '個', baseAmount: 1, kcal: 186, p: 2.6, f: 1.1, c: 41.7 },
    { id: 'f15', name: 'ファミマ焼き鳥 もも塩', aliases: ['焼き鳥もも塩'], unit: '本', baseAmount: 1, kcal: 108, p: 13.5, f: 5.6, c: 1.2 },
    { id: 'f16', name: '一蘭ラーメン', aliases: [], unit: '杯', baseAmount: 1, kcal: 443, p: 16.5, f: 16.3, c: 57.7 },
    { id: 'f17', name: '一蘭 替え玉', aliases: ['替え玉'], unit: '玉', baseAmount: 1, kcal: 236, p: 7.7, f: 0.9, c: 42.8 },
    { id: 'f18', name: '牛タン利久 極3枚6切定食', aliases: ['牛タン利久'], unit: '食', baseAmount: 1, kcal: 850, p: 42, f: 42, c: 78 },
    { id: 'f19', name: '牛タン・焼き', aliases: [], unit: 'g', baseAmount: 100, kcal: 250, p: 17, f: 20, c: 0 }
];

const SEED_PERIODS = [
    {
        id: 'phase3', start: '2026-06-24', end: '2026-07-14',
        trainKcal: 1800, trainP: 160, trainF: 35, trainC: 210,
        restKcal: 1550, restP: 160, restF: 45, restC: 126
    },
    {
        id: 'phase4', start: '2026-07-15', end: '2026-07-30',
        trainKcal: 1750, trainP: 160, trainF: 35, trainC: 198,
        restKcal: 1500, restP: 160, restF: 45, restC: 114
    }
];

class Storage {
    constructor() {
        this.initializeStorage();
    }

    initializeStorage() {
        if (!localStorage.getItem(STORAGE_KEYS.FOODS)) {
            localStorage.setItem(STORAGE_KEYS.FOODS, JSON.stringify(SEED_FOODS));
        } else {
            // 初回セット後に追加された既定食品を、同名のものがなければ追記マージする
            const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.FOODS)) || [];
            const existingNames = new Set(existing.map(f => f.name));
            const toAdd = SEED_FOODS.filter(f => !existingNames.has(f.name));
            if (toAdd.length) {
                localStorage.setItem(STORAGE_KEYS.FOODS, JSON.stringify([...existing, ...toAdd]));
            }
        }
        this.runOneTimeFixes();
        if (!localStorage.getItem(STORAGE_KEYS.PERIODS)) {
            localStorage.setItem(STORAGE_KEYS.PERIODS, JSON.stringify(SEED_PERIODS));
        } else {
            const existing = JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIODS)) || [];
            const existingKeys = new Set(existing.map(p => `${p.start}_${p.end}`));
            const toAdd = SEED_PERIODS.filter(p => !existingKeys.has(`${p.start}_${p.end}`));
            if (toAdd.length) {
                localStorage.setItem(STORAGE_KEYS.PERIODS, JSON.stringify([...existing, ...toAdd]));
            }
        }
        if (!localStorage.getItem(STORAGE_KEYS.LOGS)) {
            localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify({}));
        }
        if (!localStorage.getItem(STORAGE_KEYS.WEIGHTS)) {
            localStorage.setItem(STORAGE_KEYS.WEIGHTS, JSON.stringify({}));
        }
    }

    // 過去に間違った初期値で登録された食品の一回限りの修正
    runOneTimeFixes() {
        const FIX_KEY = 'meal_fix_onigiri_v2';
        if (localStorage.getItem(FIX_KEY)) return;
        const foods = this.getFoods();
        const onigiri = foods.find(f => f.name === 'おにぎり');
        if (onigiri) {
            Object.assign(onigiri, { kcal: 186, p: 2.6, f: 1.1, c: 41.7 });
            this.setFoods(foods);
        }
        localStorage.setItem(FIX_KEY, '1');
    }

    // ---------- 食品マスタ ----------
    getFoods() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.FOODS)) || [];
    }

    setFoods(foods) {
        localStorage.setItem(STORAGE_KEYS.FOODS, JSON.stringify(foods));
    }

    addFood(food) {
        const foods = this.getFoods();
        const newFood = {
            id: Utils.uid(),
            aliases: [],
            ...food
        };
        foods.push(newFood);
        this.setFoods(foods);
        return newFood;
    }

    updateFood(id, updates) {
        const foods = this.getFoods();
        const food = foods.find(f => f.id === id);
        if (food) {
            Object.assign(food, updates);
            this.setFoods(foods);
        }
    }

    deleteFood(id) {
        this.setFoods(this.getFoods().filter(f => f.id !== id));
    }

    // 音声のゆらぎ（カタカナ/ひらがな）を吸収したあいまい検索。
    // 漢字の読み違いまでは自動対応できないため、食品側の別名(aliases)登録で吸収する。
    findFoodByName(rawName) {
        const target = Utils.normalize(rawName);
        const foods = this.getFoods();
        return foods.find(f => {
            const candidates = [f.name, ...(f.aliases || [])];
            return candidates.some(c => Utils.normalize(c) === target);
        }) || foods.find(f => {
            const candidates = [f.name, ...(f.aliases || [])];
            return candidates.some(c => Utils.normalize(c).includes(target) || target.includes(Utils.normalize(c)));
        });
    }

    // ---------- 増減量スケジュール（期間） ----------
    getPeriods() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.PERIODS)) || [];
    }

    setPeriods(periods) {
        localStorage.setItem(STORAGE_KEYS.PERIODS, JSON.stringify(periods));
    }

    addPeriod(period) {
        const periods = this.getPeriods();
        const newPeriod = { id: Utils.uid(), ...period };
        periods.push(newPeriod);
        periods.sort((a, b) => a.start.localeCompare(b.start));
        this.setPeriods(periods);
        return newPeriod;
    }

    deletePeriod(id) {
        this.setPeriods(this.getPeriods().filter(p => p.id !== id));
    }

    getActivePeriod(dateStr = Utils.todayStr()) {
        return this.getPeriods().find(p => p.start <= dateStr && dateStr <= p.end) || null;
    }

    isRestDay(dateStr = Utils.todayStr()) {
        return REST_DAYS_OF_WEEK.includes(new Date(dateStr).getDay());
    }

    // その日のトレ日/休み日に応じた目標を返す（休み日=日曜・木曜固定）
    getTodayTargets(dateStr = Utils.todayStr()) {
        const period = this.getActivePeriod(dateStr);
        if (!period) return null;
        const rest = this.isRestDay(dateStr);
        return {
            dayType: rest ? 'rest' : 'train',
            kcal: rest ? period.restKcal : period.trainKcal,
            p: rest ? period.restP : period.trainP,
            f: rest ? period.restF : period.trainF,
            c: rest ? period.restC : period.trainC
        };
    }

    // ---------- 日次記録 ----------
    getLogs() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.LOGS)) || {};
    }

    setLogs(logs) {
        localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify(logs));
    }

    getLogsForDate(dateStr = Utils.todayStr()) {
        return this.getLogs()[dateStr] || [];
    }

    addLogEntry(entry, dateStr = Utils.todayStr()) {
        const logs = this.getLogs();
        if (!logs[dateStr]) logs[dateStr] = [];
        logs[dateStr].push({
            id: Utils.uid(),
            time: new Date().toISOString(),
            ...entry
        });
        this.setLogs(logs);
    }

    deleteLogEntry(dateStr, entryId) {
        const logs = this.getLogs();
        if (!logs[dateStr]) return;
        logs[dateStr] = logs[dateStr].filter(e => e.id !== entryId);
        this.setLogs(logs);
    }

    // 指定量を食品マスタの値からnutrient計算
    calcNutrients(food, amount) {
        const ratio = amount / food.baseAmount;
        return {
            kcal: Utils.round1(food.kcal * ratio),
            p: Utils.round1(food.p * ratio),
            f: Utils.round1(food.f * ratio),
            c: Utils.round1(food.c * ratio)
        };
    }

    sumLogs(entries) {
        return entries.reduce((acc, e) => {
            acc.kcal += e.kcal || 0;
            acc.p += e.p || 0;
            acc.f += e.f || 0;
            acc.c += e.c || 0;
            return acc;
        }, { kcal: 0, p: 0, f: 0, c: 0 });
    }

    // 最近使った食品（直近順・重複なし）
    getRecentFoods(limit = 8) {
        const logs = this.getLogs();
        const dates = Object.keys(logs).sort().reverse();
        const seen = new Map();
        for (const d of dates) {
            const entries = [...logs[d]].reverse();
            for (const e of entries) {
                if (e.foodId && !seen.has(e.foodId)) {
                    seen.set(e.foodId, e);
                }
                if (seen.size >= limit) break;
            }
            if (seen.size >= limit) break;
        }
        const foods = this.getFoods();
        return Array.from(seen.entries()).map(([foodId, lastEntry]) => {
            const food = foods.find(f => f.id === foodId);
            return food ? { food, lastAmount: lastEntry.amount } : null;
        }).filter(Boolean);
    }

    // ---------- 体重 ----------
    getWeights() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.WEIGHTS)) || {};
    }

    setWeight(dateStr, kg) {
        const weights = this.getWeights();
        weights[dateStr] = kg;
        localStorage.setItem(STORAGE_KEYS.WEIGHTS, JSON.stringify(weights));
    }

    deleteWeight(dateStr) {
        const weights = this.getWeights();
        delete weights[dateStr];
        localStorage.setItem(STORAGE_KEYS.WEIGHTS, JSON.stringify(weights));
    }
}

const storage = new Storage();
