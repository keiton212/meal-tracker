const Nav = {
    show(screenId) {
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        const target = document.getElementById(screenId);
        if (target) target.classList.add('active');

        document.querySelectorAll('.tab-item').forEach(t => {
            t.classList.toggle('active', t.dataset.nav === screenId);
        });

        document.dispatchEvent(new CustomEvent('screen:show', { detail: { screenId } }));
    }
};

document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-nav]').forEach(el => {
        el.addEventListener('click', () => Nav.show(el.dataset.nav));
    });
    document.querySelectorAll('[data-back]').forEach(el => {
        el.addEventListener('click', () => Nav.show(el.dataset.back));
    });
    document.getElementById('openAddFoodBtn').addEventListener('click', () => Nav.show('addFoodScreen'));

    // 下部タブ画面同士は左右スワイプでも切り替えられるようにする
    const TAB_ORDER = Array.from(document.querySelectorAll('.tab-item')).map(t => t.dataset.nav);
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
        const idx = TAB_ORDER.indexOf(activeScreen.id);
        if (idx === -1) return; // サブ画面（設定の各詳細画面など）ではスワイプ切り替えしない

        if (dx < 0 && idx < TAB_ORDER.length - 1) Nav.show(TAB_ORDER[idx + 1]);
        else if (dx > 0 && idx > 0) Nav.show(TAB_ORDER[idx - 1]);
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
