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
    navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('SW registration failed', err);
    });
}
