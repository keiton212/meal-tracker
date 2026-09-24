// GitHub Pages版とCloudflare版が同じ暗号化バックアップAPIを利用します。
window.MEAL_CLOUD_API_BASE = ['localhost', '127.0.0.1'].includes(location.hostname)
    ? location.origin
    : 'https://meal-tracker-cloud.nest-task-manager.workers.dev';
