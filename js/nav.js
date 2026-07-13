const Nav = {
    tabOrder: [],

    show(screenId) {
        const target = document.getElementById(screenId);
        if (!target) return;
        const current = document.querySelector('.screen.active');

        if (current && current !== target && this.tabOrder.includes(current.id) && this.tabOrder.includes(screenId)) {
            const dir = this.tabOrder.indexOf(screenId) > this.tabOrder.indexOf(current.id) ? 1 : -1;
            this.slide(current, target, dir);
        } else {
            document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
            target.classList.add('active');
        }

        document.querySelectorAll('.tab-item').forEach(t => {
            t.classList.toggle('active', t.dataset.nav === screenId);
        });

        document.dispatchEvent(new CustomEvent('screen:show', { detail: { screenId } }));
    },

    // タブ画面同士は、瞬時の切り替えではなくページがつながっているように滑らかにスライドさせる
    slide(current, target, dir) {
        if (this._cleanup) this._cleanup(); // 前回のアニメーションが残っていれば片付けておく

        target.style.transition = 'none';
        target.style.transform = `translateX(${dir * 100}%)`;
        target.classList.add('active');
        current.style.transition = 'none';
        current.style.transform = 'translateX(0)';

        const cleanup = () => {
            current.classList.remove('active');
            current.style.transition = '';
            current.style.transform = '';
            target.style.transition = '';
            target.style.transform = '';
            target.removeEventListener('transitionend', cleanup);
            clearTimeout(fallbackTimer);
            this._cleanup = null;
        };
        this._cleanup = cleanup;

        // transition:noneの適用をブラウザに1フレーム分確実に描画させてから、
        // 次のフレームでtransitionを有効にして初めて動かす（2段rAFが最も確実）
        requestAnimationFrame(() => {
            requestAnimationFrame(() => {
                current.style.transition = 'transform .3s ease';
                target.style.transition = 'transform .3s ease';
                current.style.transform = `translateX(${-dir * 100}%)`;
                target.style.transform = 'translateX(0)';
            });
        });

        target.addEventListener('transitionend', cleanup, { once: true });
        // transitionendが何らかの理由で発火しない場合の保険
        const fallbackTimer = setTimeout(cleanup, 500);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    Nav.tabOrder = Array.from(document.querySelectorAll('.tab-item')).map(t => t.dataset.nav);

    document.querySelectorAll('[data-nav]').forEach(el => {
        el.addEventListener('click', () => Nav.show(el.dataset.nav));
    });
    document.querySelectorAll('[data-back]').forEach(el => {
        el.addEventListener('click', () => Nav.show(el.dataset.back));
    });
    document.getElementById('openAddFoodBtn').addEventListener('click', () => Nav.show('addFoodScreen'));

    // 下部タブ画面同士は左右スワイプでも切り替えられるようにする
    let touchStartX = 0;
    let touchStartY = 0;

    document.addEventListener('touchstart', e => {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }, { passive: true });

    document.addEventListener('touchend', e => {
        const dx = e.changedTouches[0].clientX - touchStartX;
        const dy = e.changedTouches[0].clientY - touchStartY;

        // 横方向にはっきり動いたスワイプだけを対象にする（縦スクロールと誤認しないように）
        if (Math.abs(dx) < 60 || Math.abs(dx) < Math.abs(dy) * 1.5) return;

        const activeScreen = document.querySelector('.screen.active');
        if (!activeScreen) return;
        const idx = Nav.tabOrder.indexOf(activeScreen.id);
        if (idx === -1) return; // サブ画面（設定の各詳細画面など）ではスワイプ切り替えしない

        if (dx < 0 && idx < Nav.tabOrder.length - 1) Nav.show(Nav.tabOrder[idx + 1]);
        else if (dx > 0 && idx > 0) Nav.show(Nav.tabOrder[idx - 1]);
    }, { passive: true });
});

if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').then(reg => {
        // 新しいservice workerが見つかったら即座に有効化を促す
        reg.addEventListener('updatefound', () => {
            const newWorker = reg.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
                if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
                    newWorker.postMessage('skipWaiting');
                }
            });
        });
        // 起動のたびに更新確認
        reg.update();
    }).catch(err => {
        console.log('SW registration failed', err);
    });

    // 新しいservice workerが制御を引き継いだら1回だけ自動リロード
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
    });
}
