const STORAGE_KEYS = {
    FOODS: 'meal_foods',
    PERIODS: 'meal_periods',
    LOGS: 'meal_logs',
    WEIGHTS: 'meal_weights',
    REST_DAYS: 'meal_rest_days',
    MEAL_PLAN: 'meal_plan'
};

// 休み日の初期値（gym-trackerのメニュー設定と同じ：日曜・木曜が休み）。
// 他の人が使う場合は曜日が異なることもあるため、PFC設定画面から変更できる。
const DEFAULT_REST_DAYS_OF_WEEK = [0, 4];

// ---------- 周期化（カーボサイクル）関連の設定 ----------
const SALMON_DAY_OF_WEEK = 3; // 水曜＝サーモンの日（オメガ3摂取日）
const FIBER_MIN_PER_DAY = 25; // 食物繊維の1日下限 (g)
const SALT_MAX_PER_DAY = 7;   // 食塩相当量の1日上限 (g)

const CATEGORY_LABELS = {
    carb: '主食', chicken: '鶏肉', redmeat: '赤身肉', fattyfish: '脂質魚',
    lowfatfish: '低脂質魚', liver: 'レバー', eggwhite: '卵白', dairy: '乳製品', veg_green: '緑野菜'
};

// 週次クオータ。月曜はじまりの1週間で「そのカテゴリを記録した日数」を回数として数える
const QUOTA_DEFS = [
    { category: 'redmeat', label: '赤身肉', limit: 2, note: '休み日(木・日)想定' },
    { category: 'fattyfish', label: 'サーモン', limit: 1, note: '水曜固定' },
    { category: 'lowfatfish', label: 'サバ缶', limit: 2, note: '' },
    { category: 'liver', label: 'レバー', limit: 1, note: '30g厳守・別枠' },
    { category: 'chicken', label: '鶏肉', limit: null, note: '自由枠' }
];

// ---------- 食事スロット（朝①・朝②・昼・間食・夕） ----------
// endHour: その時刻（未満）までなら開いた時に自動でこのスロットを選択する
const MEAL_DEFS = [
    { key: 'b1', label: '朝食①', short: '朝①', endHour: 9 },
    { key: 'b2', label: '朝食②', short: '朝②', endHour: 11 },
    { key: 'lunch', label: '昼食', short: '昼', endHour: 15 },
    { key: 'snack', label: '間食', short: '間食', endHour: 18 },
    { key: 'dinner', label: '夕食', short: '夕', endHour: 24 }
];

function defaultMealKey(date = new Date()) {
    const h = date.getHours();
    const m = MEAL_DEFS.find(m => h < m.endHour);
    return (m || MEAL_DEFS[MEAL_DEFS.length - 1]).key;
}

// 各食事スロットの献立の初期値。
// ユーザーが「献立の編集」画面で変更した内容は LocalStorage に保存され、以降はそちらが使われる。
// fixed        … 毎回必ず食べるもの（量だけ調整する）
// salmonFixed  … 水曜（サーモンの日）に fixed と差し替える献立
// choices      … そこから1つ選ぶグループ（主菜など）。optional:true は「選ばなければ記録しない」任意枠
// salmonDefault… 水曜に初期選択しておく品名
const MEAL_PRESETS = {
    b1: {
        fixed: [
            { name: '白米(炊飯後)', amount: 200 },
            { name: 'バナナ', amount: 1 },
            { name: 'ホエイプロテイン(エクスプロージョン)', amount: 75 }
        ],
        choices: []
    },
    b2: {
        fixed: [
            { name: '卵(全卵2個)', amount: 2 },
            { name: 'ホエイプロテイン(エクスプロージョン)', amount: 30 }
        ],
        salmonFixed: [
            { name: 'ゆで卵白4個相当', amount: 4 },
            { name: 'ホエイプロテイン(エクスプロージョン)', amount: 30 }
        ],
        choices: []
    },
    lunch: {
        fixed: [
            { name: '白米(炊飯後)', amount: 150 },
            { name: '冷凍ブロッコリー', amount: 150 }
        ],
        choices: [
            {
                label: '主菜（1つ選ぶ）',
                options: [
                    { name: '鶏むね肉(皮なし)150g', amount: 150 },
                    { name: '鶏むね肉(皮なし)100g', amount: 100 },
                    { name: '鶏もも肉(皮なし)', amount: 150 },
                    { name: 'サバ水煮缶(低脂質タイプ)', amount: 150 }
                ]
            }
        ]
    },
    snack: {
        fixed: [
            { name: 'パルテノ ギリシャヨーグルト(無糖)', amount: 150 }
        ],
        choices: [
            {
                label: 'もう1品（1つ選ぶ）',
                salmonDefault: 'キウイ',
                options: [
                    { name: '無塩ミックスナッツ(10g)', amount: 10 },
                    { name: '無塩ミックスナッツ(20g)', amount: 20 },
                    { name: 'キウイ', amount: 1 }
                ]
            }
        ]
    },
    dinner: {
        fixed: [
            { name: '冷凍ブロッコリー', amount: 150 }
        ],
        choices: [
            {
                label: '主菜（1つ選ぶ）',
                salmonDefault: 'サーモン・ギンダラ',
                options: [
                    { name: '鶏むね肉(皮なし)150g', amount: 150 },
                    { name: '鶏もも肉(皮なし)', amount: 150 },
                    { name: '牛もも赤身肉', amount: 150 },
                    { name: 'サバ水煮缶(低脂質タイプ)', amount: 150 },
                    { name: 'サーモン・ギンダラ', amount: 120 }
                ]
            },
            {
                label: '主食（1つ選ぶ）',
                options: [
                    { name: 'さつまいも(蒸し)', amount: 100 },
                    { name: '白米(炊飯後)', amount: 150 }
                ]
            },
            {
                label: 'レバー（任意・主菜とは別枠）',
                optional: true,
                options: [
                    { name: '鶏レバー(30g厳守)', amount: 30 }
                ]
            }
        ]
    }
};

// 周期化用の食品一括登録データ。migrateCycleV1()で一度だけマスタに取り込む
// （同名の食品が既にあれば栄養値を更新、なければ追加）
const CYCLE_FOODS = [
    { name: '白米(炊飯後)', unit: 'g', baseAmount: 150, kcal: 234, p: 3.8, f: 0.5, c: 55.7, fiber: 0.5, salt: 0, category: 'carb', favorite: true, aliases: [] },
    { name: '卵(全卵2個)', unit: '個', baseAmount: 2, kcal: 142, p: 12.2, f: 10.2, c: 0.4, fiber: 0, salt: 0.4, category: null, favorite: true, aliases: ['全卵'] },
    { name: 'バナナ', unit: '本', baseAmount: 1, kcal: 93, p: 1.1, f: 0.2, c: 21.4, fiber: 1.1, salt: 0, category: null, favorite: true, aliases: [] },
    { name: 'ゆで卵白4個相当', unit: '個', baseAmount: 4, kcal: 34, p: 7.2, f: 0.06, c: 0.5, fiber: 0, salt: 0.1, category: 'eggwhite', favorite: true, aliases: ['卵白', 'ゆで卵白'] },
    { name: 'ホエイプロテイン(エクスプロージョン)', unit: 'g', baseAmount: 30, kcal: 138, p: 25.0, f: 0, c: 9.6, fiber: 0, salt: 0.1, category: null, favorite: true, aliases: ['ホエイプロテイン', 'エクスプロージョン', 'ホエイ'] },
    { name: 'パルテノ ギリシャヨーグルト(無糖)', unit: 'g', baseAmount: 150, kcal: 148.5, p: 15.3, f: 6.5, c: 7.4, fiber: 0, salt: 0.15, category: 'dairy', favorite: true, aliases: ['パルテノ', 'ギリシャヨーグルト'] },
    { name: '無塩ミックスナッツ(10g)', unit: 'g', baseAmount: 10, kcal: 64, p: 2.0, f: 5.75, c: 0.75, fiber: 0.75, salt: 0, category: null, favorite: true, aliases: ['ミックスナッツ', 'ナッツ'] },
    { name: '無塩ミックスナッツ(20g)', unit: 'g', baseAmount: 20, kcal: 128, p: 4.0, f: 11.5, c: 1.5, fiber: 1.5, salt: 0, category: null, favorite: false, aliases: [] },
    { name: 'キウイ', unit: '個', baseAmount: 1, kcal: 43, p: 0.9, f: 0.2, c: 8.9, fiber: 2.2, salt: 0, category: null, favorite: true, aliases: [] },
    { name: '鶏むね肉(皮なし)150g', unit: 'g', baseAmount: 150, kcal: 158, p: 35.0, f: 2.9, c: 0.2, fiber: 0, salt: 0.2, category: 'chicken', favorite: true, aliases: [] },
    { name: '鶏むね肉(皮なし)100g', unit: 'g', baseAmount: 100, kcal: 105, p: 23.3, f: 1.9, c: 0.1, fiber: 0, salt: 0.1, category: 'chicken', favorite: false, aliases: [] },
    { name: '鶏もも肉(皮なし)', unit: 'g', baseAmount: 150, kcal: 170, p: 29.0, f: 5.6, c: 0.0, fiber: 0, salt: 0.3, category: 'chicken', favorite: true, aliases: ['鶏もも', 'とりもも'] },
    { name: '牛もも赤身肉', unit: 'g', baseAmount: 150, kcal: 200, p: 31.8, f: 6.5, c: 0.6, fiber: 0, salt: 0.2, category: 'redmeat', favorite: true, aliases: ['赤身肉', '牛もも'] },
    { name: 'サーモン・ギンダラ', unit: 'g', baseAmount: 120, kcal: 262, p: 24.1, f: 19.8, c: 0.1, fiber: 0, salt: 0.2, category: 'fattyfish', favorite: true, aliases: ['サーモン', 'ギンダラ'] },
    { name: 'サバ水煮缶(低脂質タイプ)', unit: 'g', baseAmount: 150, kcal: 92.1, p: 19.7, f: 0.0, c: 0.0, fiber: 0, salt: 1.2, category: 'lowfatfish', favorite: true, aliases: ['サバ缶', 'さば缶', 'サバ水煮'] },
    { name: '鶏レバー(30g厳守)', unit: 'g', baseAmount: 30, kcal: 30, p: 5.7, f: 0.9, c: 0.2, fiber: 0, salt: 0.1, category: 'liver', favorite: true, aliases: ['レバー', '鶏レバー'] },
    { name: '冷凍ブロッコリー', unit: 'g', baseAmount: 150, kcal: 40, p: 4.5, f: 0.7, c: 3.0, fiber: 6.5, salt: 0.1, category: 'veg_green', favorite: true, aliases: [] },
    { name: 'さつまいも(蒸し)', unit: 'g', baseAmount: 100, kcal: 131, p: 0.9, f: 0.2, c: 29.3, fiber: 2.3, salt: 0, category: 'carb', favorite: true, aliases: ['さつまいも', 'サツマイモ'] }
];

const SEED_FOODS = [
    { id: 'f1', name: '鶏胸肉・皮なし', aliases: ['鶏むね肉', 'とりむね肉', '鶏胸肉', 'とり胸', 'トリムネ肉'], unit: 'g', baseAmount: 100, kcal: 108, p: 23.3, f: 1.5, c: 0 },
    { id: 'f2', name: '白米', aliases: ['ごはん', 'ご飯'], unit: 'g', baseAmount: 100, kcal: 156, p: 2.5, f: 0.3, c: 35.6 },
    { id: 'f4', name: '卵', aliases: ['たまご', 'タマゴ'], unit: '個', baseAmount: 1, kcal: 76, p: 6.2, f: 5.2, c: 0.2 },
    { id: 'f5', name: 'ブロッコリー', aliases: [], unit: 'g', baseAmount: 100, kcal: 33, p: 4.3, f: 0.5, c: 5.2 },
    { id: 'f6', name: 'バナナ', aliases: [], unit: 'g', baseAmount: 100, kcal: 93, p: 1.1, f: 0.2, c: 22.5 },
    { id: 'f7', name: '森永 高たんぱく牛乳', aliases: ['高たんぱく牛乳'], unit: 'ml', baseAmount: 200, kcal: 104, p: 10.3, f: 0.3, c: 15.1 },
    { id: 'f8', name: 'オレンジジュース', aliases: [], unit: 'ml', baseAmount: 200, kcal: 94, p: 1.7, f: 0, c: 22.2 },
    { id: 'f9', name: 'ソイプロテイン（INNOCECT）', aliases: ['ソイプロテイン', 'INNOCECT'], unit: '杯', baseAmount: 1, kcal: 112, p: 21.1, f: 0.7, c: 7.2 },
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
        id: 'phase3', start: '2026-06-24', end: '2026-07-14', targetMode: 'trainRest',
        trainKcal: 1800, trainP: 160, trainF: 35, trainC: 210,
        restKcal: 1550, restP: 160, restF: 45, restC: 126
    },
    {
        id: 'phase4', start: '2026-07-15', end: '2026-07-30', targetMode: 'trainRest',
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
        if (!localStorage.getItem(STORAGE_KEYS.REST_DAYS)) {
            localStorage.setItem(STORAGE_KEYS.REST_DAYS, JSON.stringify(DEFAULT_REST_DAYS_OF_WEEK));
        }
        // シード投入・マージが終わった後に走らせる（シード分の期間にもtargetModeを補完するため）
        this.migrateCycleV1();
    }

    // ---------- 休み日の曜日設定 ----------
    getRestDays() {
        return JSON.parse(localStorage.getItem(STORAGE_KEYS.REST_DAYS)) || DEFAULT_REST_DAYS_OF_WEEK;
    }

    setRestDays(days) {
        localStorage.setItem(STORAGE_KEYS.REST_DAYS, JSON.stringify(days));
    }

    // 過去に間違った初期値で登録された食品の一回限りの修正
    runOneTimeFixes() {
        const FIX_KEY = 'meal_fix_onigiri_v2';
        if (!localStorage.getItem(FIX_KEY)) {
            const foods = this.getFoods();
            const onigiri = foods.find(f => f.name === 'おにぎり');
            if (onigiri) {
                Object.assign(onigiri, { kcal: 186, p: 2.6, f: 1.1, c: 41.7 });
                this.setFoods(foods);
            }
            localStorage.setItem(FIX_KEY, '1');
        }

        const SOY_FIX_KEY = 'meal_fix_soyprotein_unit_v1';
        if (!localStorage.getItem(SOY_FIX_KEY)) {
            const foods = this.getFoods();
            const soy = foods.find(f => f.name === 'ソイプロテイン（INNOCECT）');
            if (soy) {
                Object.assign(soy, { unit: '杯', baseAmount: 1 });
                this.setFoods(foods);
            }
            localStorage.setItem(SOY_FIX_KEY, '1');
        }
    }

    // 周期化（カーボサイクル）導入に伴う一回限りのスキーマ移行：
    // - 食品マスタに category / fiber(食物繊維) / salt(食塩相当量) を補完（未設定はnull）
    // - 周期化用の食品を一括登録（同名があれば栄養値を更新、なければ追加）
    // - 期間に targetMode を補完（未設定は従来のトレ日/休み日方式）
    migrateCycleV1() {
        const KEY = 'meal_migration_cycle_v1';
        if (localStorage.getItem(KEY)) return;

        const foods = this.getFoods();
        const byName = new Map(foods.map(f => [f.name, f]));
        CYCLE_FOODS.forEach(cf => {
            const existing = byName.get(cf.name);
            if (existing) {
                // ユーザーが付けた別名・お気に入りは残しつつ、栄養値と単位を新データに揃える
                const aliases = Array.from(new Set([...(existing.aliases || []), ...(cf.aliases || [])]));
                Object.assign(existing, { ...cf, id: existing.id, favorite: existing.favorite || cf.favorite, aliases });
            } else {
                foods.push({ id: Utils.uid(), ...cf });
            }
        });
        foods.forEach(f => {
            if (f.fiber === undefined) f.fiber = null;
            if (f.salt === undefined) f.salt = null;
            if (f.category === undefined) f.category = null;
        });
        this.setFoods(foods);

        const periods = this.getPeriods();
        periods.forEach(p => { if (!p.targetMode) p.targetMode = 'trainRest'; });
        this.setPeriods(periods);

        localStorage.setItem(KEY, '1');
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
            fiber: null,
            salt: null,
            category: null,
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

    toggleFavorite(id) {
        const foods = this.getFoods();
        const food = foods.find(f => f.id === id);
        if (food) {
            food.favorite = !food.favorite;
            this.setFoods(foods);
        }
    }

    getFavoriteFoods() {
        return this.getFoods().filter(f => f.favorite);
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

    // 入力中の文字列を先頭一致で検索（オートコンプリート用）。品名・別名（読み）どちらも対象
    findFoodsByPrefix(prefix, limit = 6) {
        const target = Utils.normalize(prefix);
        if (!target) return [];
        const foods = this.getFoods();
        const seen = new Set();
        const results = [];
        for (const f of foods) {
            const candidates = [f.name, ...(f.aliases || [])];
            const hit = candidates.some(c => Utils.normalize(c).startsWith(target));
            if (hit && !seen.has(f.id)) {
                seen.add(f.id);
                results.push(f);
                if (results.length >= limit) break;
            }
        }
        return results;
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

    updatePeriod(id, updates) {
        const periods = this.getPeriods();
        const period = periods.find(p => p.id === id);
        if (!period) return;
        // 方式を切り替えたときに古い項目が残らないよう、日付とid以外は入れ替える
        Object.keys(period).forEach(k => { if (k !== 'id') delete period[k]; });
        Object.assign(period, updates);
        periods.sort((a, b) => a.start.localeCompare(b.start));
        this.setPeriods(periods);
    }

    getActivePeriod(dateStr = Utils.todayStr()) {
        return this.getPeriods().find(p => p.start <= dateStr && dateStr <= p.end) || null;
    }

    isRestDay(dateStr = Utils.todayStr()) {
        return this.getRestDays().includes(new Date(dateStr).getDay());
    }

    isSalmonDay(dateStr = Utils.todayStr()) {
        return new Date(dateStr).getDay() === SALMON_DAY_OF_WEEK;
    }

    // その日の目標を返す。期間が「曜日ごとに設定」(targetMode:'weekly')ならその曜日の目標、
    // 従来方式ならトレ日/休み日の2種類から選ぶ（休み日の曜日はPFC設定画面で変更可能）
    getTodayTargets(dateStr = Utils.todayStr()) {
        const period = this.getActivePeriod(dateStr);
        if (!period) return null;
        const rest = this.isRestDay(dateStr);
        const base = {
            dayType: rest ? 'rest' : 'train',
            salmonDay: this.isSalmonDay(dateStr)
        };
        const dow = new Date(dateStr).getDay();
        if (period.targetMode === 'weekly' && Array.isArray(period.weekly) && period.weekly[dow]) {
            const t = period.weekly[dow];
            return { ...base, kcal: t.kcal, p: t.p, f: t.f, c: t.c };
        }
        return {
            ...base,
            kcal: rest ? period.restKcal : period.trainKcal,
            p: rest ? period.restP : period.trainP,
            f: rest ? period.restF : period.trainF,
            c: rest ? period.restC : period.trainC
        };
    }

    // ---------- 献立（編集可能） ----------
    getMealPlan() {
        const raw = localStorage.getItem(STORAGE_KEYS.MEAL_PLAN);
        if (!raw) return JSON.parse(JSON.stringify(MEAL_PRESETS));
        try {
            return JSON.parse(raw);
        } catch (err) {
            return JSON.parse(JSON.stringify(MEAL_PRESETS));
        }
    }

    setMealPlan(plan) {
        localStorage.setItem(STORAGE_KEYS.MEAL_PLAN, JSON.stringify(plan));
    }

    resetMealPlan() {
        localStorage.removeItem(STORAGE_KEYS.MEAL_PLAN);
    }

    // 指定スロットの献立を食品マスタと突き合わせて返す。
    // 量は「前回その食品を記録した量」を優先し、なければ献立の既定量を使う
    // （毎日少しずつ量が変わる運用に合わせ、前回の調整をそのまま引き継ぐ）
    getMealPreset(mealKey, dateStr = Utils.todayStr()) {
        const preset = this.getMealPlan()[mealKey];
        if (!preset) return null;
        const foods = this.getFoods();
        const resolve = item => {
            const food = foods.find(f => f.name === item.name);
            if (!food) return null;
            const last = this.getLastAmountForFood(food.id, mealKey);
            return { food, amount: last != null ? last : item.amount };
        };

        const salmonDay = this.isSalmonDay(dateStr);
        const fixedSource = (preset.salmonFixed && salmonDay) ? preset.salmonFixed : (preset.fixed || []);
        const fixed = fixedSource.map(resolve).filter(Boolean);

        const choices = (preset.choices || []).map(group => {
            const options = group.options.map(resolve).filter(Boolean);
            // 任意枠は未選択で開始。通常の選択枠は先頭（水曜は指定があればその品）を初期選択にする
            let selectedIndex = -1;
            if (!group.optional && options.length) {
                const salmonIdx = (salmonDay && group.salmonDefault)
                    ? options.findIndex(o => o.food.name === group.salmonDefault) : -1;
                selectedIndex = salmonIdx >= 0 ? salmonIdx : 0;
            }
            return { label: group.label, optional: !!group.optional, options, selectedIndex };
        }).filter(g => g.options.length);

        return { fixed, choices, hasChoices: choices.length > 0 };
    }

    // ---------- 週次クオータ ----------
    // 月曜はじまりの週の開始日を返す
    weekStartStr(dateStr = Utils.todayStr()) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() - (d.getDay() + 6) % 7);
        return Utils.dateToStr(d);
    }

    // 今週（月〜日）のクオータ消化状況を返す。回数は「そのカテゴリを記録した日数」で数える
    // （同じ日に複数回記録しても1回。主菜1食=1回の感覚に合わせる）
    getWeekQuotaStatus(dateStr = Utils.todayStr()) {
        const weekStart = this.weekStartStr(dateStr);
        const logs = this.getLogs();
        const catById = new Map(this.getFoods().map(f => [f.id, f.category || null]));
        const usedDays = {};
        for (let i = 0; i < 7; i++) {
            const d = Utils.addDays(weekStart, i);
            (logs[d] || []).forEach(e => {
                const cat = e.foodId ? catById.get(e.foodId) : null;
                if (!cat) return;
                if (!usedDays[cat]) usedDays[cat] = new Set();
                usedDays[cat].add(d);
            });
        }
        return QUOTA_DEFS.map(q => ({
            ...q,
            used: usedDays[q.category] ? usedDays[q.category].size : 0
        }));
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
        const created = {
            id: Utils.uid(),
            time: new Date().toISOString(),
            ...entry
        };
        logs[dateStr].push(created);
        this.setLogs(logs);
        return created;
    }

    deleteLogEntry(dateStr, entryId) {
        const logs = this.getLogs();
        if (!logs[dateStr]) return;
        logs[dateStr] = logs[dateStr].filter(e => e.id !== entryId);
        this.setLogs(logs);
    }

    // 記録済みエントリの量を変更し、栄養価を再計算する。
    // 食品マスタに紐づく場合はマスタから計算し直し、
    // 紐づかない（1行入力で登録だけした）場合は量の比率でスケールする
    updateLogEntryAmount(dateStr, entryId, newAmount) {
        if (!(newAmount > 0)) return;
        const logs = this.getLogs();
        const entry = (logs[dateStr] || []).find(e => e.id === entryId);
        if (!entry) return;
        const food = entry.foodId ? this.getFoods().find(f => f.id === entry.foodId) : null;
        let nutrients;
        if (food) {
            nutrients = this.calcNutrients(food, newAmount);
        } else {
            const ratio = newAmount / (entry.amount || 1);
            nutrients = {
                kcal: Utils.round1((entry.kcal || 0) * ratio),
                p: Utils.round1((entry.p || 0) * ratio),
                f: Utils.round1((entry.f || 0) * ratio),
                c: Utils.round1((entry.c || 0) * ratio),
                fiber: Utils.round1((entry.fiber || 0) * ratio),
                salt: Utils.round1((entry.salt || 0) * ratio)
            };
        }
        Object.assign(entry, { amount: newAmount, ...nutrients });
        this.setLogs(logs);
    }

    // 指定量を食品マスタの値からnutrient計算
    calcNutrients(food, amount) {
        const ratio = amount / food.baseAmount;
        return {
            kcal: Utils.round1(food.kcal * ratio),
            p: Utils.round1(food.p * ratio),
            f: Utils.round1(food.f * ratio),
            c: Utils.round1(food.c * ratio),
            fiber: Utils.round1((food.fiber || 0) * ratio),
            salt: Utils.round1((food.salt || 0) * ratio)
        };
    }

    sumLogs(entries) {
        return entries.reduce((acc, e) => {
            acc.kcal += e.kcal || 0;
            acc.p += e.p || 0;
            acc.f += e.f || 0;
            acc.c += e.c || 0;
            acc.fiber += e.fiber || 0;
            acc.salt += e.salt || 0;
            return acc;
        }, { kcal: 0, p: 0, f: 0, c: 0, fiber: 0, salt: 0 });
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

    // 指定した食品を最後に記録した時の量（記録が無ければnull）。
    // mealKeyを渡すとその食事スロットでの記録だけを見る
    // （白米のように朝は200g・昼は150gと食事ごとに量が違う食品があるため）
    getLastAmountForFood(foodId, mealKey = null) {
        const logs = this.getLogs();
        const dates = Object.keys(logs).sort().reverse();
        for (const d of dates) {
            const entries = [...logs[d]].reverse();
            for (const e of entries) {
                if (e.foodId !== foodId) continue;
                if (mealKey && e.meal !== mealKey) continue;
                return e.amount;
            }
        }
        return null;
    }

    // 指定した食事スロットを他の日に記録した内容のうち、いちばん近い日のものを返す。
    // 「前回と同じ」でまるごと記録するために使う。
    // 基本は過去にさかのぼって探すが、記録し忘れた過去日を埋めている場合は
    // その日より後の記録しか無いこともあるため、見つからなければ未来側からも探す
    getLastMealEntries(mealKey, baseDateStr = Utils.todayStr()) {
        const logs = this.getLogs();
        const hasMeal = d => logs[d].some(e => e.meal === mealKey);
        const all = Object.keys(logs).filter(d => d !== baseDateStr);
        const earlier = all.filter(d => d < baseDateStr).sort().reverse().find(hasMeal);
        const later = earlier ? null : all.filter(d => d > baseDateStr).sort().find(hasMeal);
        const date = earlier || later;
        if (!date) return null;
        return { date, entries: logs[date].filter(e => e.meal === mealKey) };
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
