// 日付・文字列まわりの共通ユーティリティ
const Utils = {
    todayStr() {
        return this.dateToStr(new Date());
    },

    dateToStr(date) {
        const y = date.getFullYear();
        const m = String(date.getMonth() + 1).padStart(2, '0');
        const d = String(date.getDate()).padStart(2, '0');
        return `${y}-${m}-${d}`;
    },

    addDays(dateStr, days) {
        const d = new Date(dateStr);
        d.setDate(d.getDate() + days);
        return this.dateToStr(d);
    },

    formatJP(dateStr) {
        const d = new Date(dateStr);
        const w = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
        return `${d.getMonth() + 1}月${d.getDate()}日（${w}）`;
    },

    // カタカナ→ひらがな正規化（音声認識の表記ゆれ吸収の第一段階）
    toHiragana(str) {
        return str.replace(/[ァ-ヶ]/g, ch =>
            String.fromCharCode(ch.charCodeAt(0) - 0x60)
        );
    },

    normalize(str) {
        return this.toHiragana(String(str).trim().toLowerCase())
            .replace(/\s+/g, '');
    },

    round1(n) {
        return Math.round(n * 10) / 10;
    },

    uid() {
        return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
    },

    // 画面下部に数秒だけ出る通知。actionLabelを渡すと取り消しなどのボタンを添えられる
    toast(message, actionLabel = null, onAction = null, ms = 5000) {
        document.querySelectorAll('.app-toast').forEach(t => t.remove());
        const toast = document.createElement('div');
        toast.className = 'app-toast';
        toast.innerHTML = `<span>${message}</span>`;
        if (actionLabel) {
            const btn = document.createElement('button');
            btn.className = 'app-toast-btn';
            btn.textContent = actionLabel;
            btn.addEventListener('click', () => {
                toast.remove();
                if (onAction) onAction();
            });
            toast.appendChild(btn);
        }
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), ms);
    }
};
