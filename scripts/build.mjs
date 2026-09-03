import { cp, mkdir } from 'node:fs/promises';

const output = new URL('../public/', import.meta.url);
await mkdir(output, { recursive: true });

for (const path of ['index.html', 'manifest.json', 'sw.js', 'css', 'js']) {
    await cp(new URL(`../${path}`, import.meta.url), new URL(`../public/${path}`, import.meta.url), {
        recursive: true
    });
}
