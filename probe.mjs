import fs from 'node:fs';
const UA = 'HomeBase public event context (+https://github.com/Home-base-drivers/Home-base-app)';
const urls = JSON.parse(fs.readFileSync(new URL('./urls.json', import.meta.url)));
fs.mkdirSync('out', { recursive: true });
let i = 0;
const rows = [];
await Promise.all(Array.from({ length: 6 }, async () => {
  while (i < urls.length) {
    const [label, url, save] = urls[i++];
    const t = Date.now();
    try {
      const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/json,text/calendar' }, signal: AbortSignal.timeout(20000), redirect: 'follow' });
      const body = await r.text();
      const ld = (body.match(/application\/ld\+json/gi) || []).length;
      const ev = (body.match(/"@type"\s*:\s*"[A-Za-z]*Event"/g) || []).length;
      const title = (body.match(/<title[^>]*>([^<]{0,90})/i) || [])[1] || '';
      rows.push([label, r.status, (r.headers.get('content-type') || '').slice(0, 30), body.length, 'ld=' + ld, 'events=' + ev, r.url !== url ? 'redirect=' + r.url.slice(0, 80) : '', title.trim(), (Date.now() - t) + 'ms'].join(' | '));
      if (save === 'bell') { const bits = [...body.matchAll(/bell/gi)].map(m => body.slice(Math.max(0, m.index - 600), m.index + 400)); fs.writeFileSync('out/' + label.replace(/[^a-z0-9]+/gi, '_') + '.txt', bits.join('\n=====\n')); }
      else if (save === 'links') { const links = [...body.matchAll(/<a\b[^>]*href=["']([^"']*\/page\/\d+[^"']*)["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)].map(m => m[1] + ' :: ' + m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()); fs.writeFileSync('out/' + label.replace(/[^a-z0-9]+/gi, '_') + '.txt', links.join('\n')); }
      else if (save) fs.writeFileSync('out/' + label.replace(/[^a-z0-9]+/gi, '_') + '.txt', body.slice(0, 600000));
    } catch (e) { rows.push([label, 'ERR', e.name + ': ' + (e.cause?.code || e.message)].join(' | ')); }
  }
}));
rows.sort();
console.log(rows.join('\n'));
fs.writeFileSync('out/summary.txt', rows.join('\n'));
