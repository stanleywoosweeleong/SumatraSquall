const { JSDOM } = require('jsdom'); const fs = require('fs');
const html = fs.readFileSync('../index.html', 'utf8').replace(/<script src=[^>]+><\/script>/g, '');
const app = fs.readFileSync('app.js', 'utf8'); let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : (fail++, console.log('FAIL', m)); };
(async () => { for (const lang of ['zh', 'en', 'ms']) {
  const dom = new JSDOM(html, { url: 'https://example.test/', runScripts: 'outside-only' }); const w = dom.window;
  w.localStorage.setItem('ssw.lang', JSON.stringify(lang)); w.fetch = async () => { throw new TypeError('offline'); }; w.Element.prototype.scrollIntoView = () => {};
  w.eval(app);
  const a = w.document.getElementById('lnkWa'), href = a.getAttribute('href');
  ok(href.startsWith('https://wa.me/?text='), lang + ' wa.me link');
  const msg = decodeURIComponent(href.split('text=')[1]);
  ok(msg.includes('https://stanleywoosweeleong.github.io/SumatraSquall/'), lang + ' message carries the app URL');
  ok(a.getAttribute('target') === '_blank' && /noopener/.test(a.getAttribute('rel')), lang + ' opens safely in a new tab');
  ok(a.textContent.length > 3 && w.document.getElementById('btnCopy').textContent.length > 1, lang + ' labels present');
  if (lang === 'zh') ok(!/\bapp\b/i.test(msg + w.document.getElementById('shareSub').textContent), 'no "app" in Chinese copy');
  w.navigator.clipboard = { writeText: async () => {} }; w.document.getElementById('btnCopy').click(); await new Promise(r => setTimeout(r, 20));
  ok(w.document.getElementById('copyMsg').textContent.length > 0, lang + ' copy feedback shown');
  ok(w.document.querySelector('.qrwrap svg path[stroke]'), lang + ' QR rendered'); }
  console.log(pass, 'passed', fail, 'failed'); process.exit(fail ? 1 : 0); })();
