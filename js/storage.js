const STORAGE_KEYS = {
    FOODS: 'meal_foods',
    PERIODS: 'meal_periods',
    LOGS: 'meal_logs',
    WEIGHTS: 'meal_weights'
};

const SEED_FOODS = [
    { id: 'f1', name: '鶏むね肉', aliases: ['とりむね肉', '鶏胸肉', 'とり胸', 'トリムネ肉'], unit: 'g', baseAmount: 100, kcal: 111, p: 23, f: 1.5, c: 0 },
    { id: 'f2', name: '白米', aliases: ['ごはん', 'ご飯'], unit: 'g', baseAmount: 100, kcal: 168, p: 2.5, f: 0.3, c: 37 },
    { id: 'f3', name: 'プロテイン（チョコ）', aliases: ['プロテインチョコ味'], unit: '杯', baseAmount: 1, kcal: 110, p: 20, f: 2, c: 3 },
    { id: 'f4', name: '卵', aliases: ['たまご', 'タマゴ'], unit: '個', baseAmount: 1, kcal: 91, p: 7.4, f: 6.2, c: 0.2 },
    { id: 'f5', name: 'ブロッコリー', aliases: [], unit: 'g', baseAmount: 100, kcal: 33, p: 4.3, f: 0.5, c: 5.2 }
];

class Storage {
    constructor() {
        this.initializeStorage();
    }

    initializeStorage() {
        if (!localStorage.getItem(STORAGE_KEYS.FOODS)) {
            localStorage.setItem(STORAGE_KEYS.FOODS, JSON.stringify(SEED_FOODS));
        }
        if (!localStorage.getItem(STORAGE_KEYS.PERIODS)) {
            localStorage.setItem(STORAGE_KEYS.PERIODS, JSON.stringify([]));
        }
        if (!localStorage.getItem(STORAGE_KEYS.LOGS)) {
            localStorage.setItem(STORAGE_KEYS.LOGS, JSON.stringify({}));
        }
        if (!localStorage.getItem(STORAGE_KEYS.WEIGHTS)) {
            localStorage.setItem(STORAGE_KEYS.WEIGHTS, JSON.stringify({}));
        }
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
