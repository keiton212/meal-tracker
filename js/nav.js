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
