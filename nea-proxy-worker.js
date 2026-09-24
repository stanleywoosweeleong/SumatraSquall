// NEA radar proxy for Sumatra Squall Watch (苏门答腊飑线).
// Holds the data.gov.sg API key so it never appears on GitHub.
// Secret required: DATA_GOV_SG_API_KEY  (Worker → Settings → Variables and Secrets → Type: Secret)
// Passes through ONLY the two feeds the app uses: radar images and lightning.

const UPSTREAM = 'https://api-open.data.gov.sg/v2/real-time/api';
const ALLOWED_ORIGINS = ['https://stanleywoosweeleong.github.io', 'null'];   // 'null' = opening index.html from file:// for testing
const LOCALHOST = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;

function corsHeaders(origin) {
  if (!(ALLOWED_ORIGINS.includes(origin) || LOCALHOST.test(origin))) return null;
  return { 'Access-Control-Allow-Origin': origin, 'Vary': 'Origin' };
}
function reply(obj, status, extra) {
  return new Response(JSON.stringify(obj), { status, headers: Object.assign({ 'Content-Type': 'application/json' }, extra || {}) });
}
function pathAllowed(url) {
  if (/^\/weather-radar-images\/(70|240|480)km$/.test(url.pathname)) return true;
  return url.pathname === '/weather' && url.searchParams.get('api') === 'lightning';
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeaders(origin);
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: cors ? 204 : 403, headers: cors ? Object.assign({ 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Max-Age': '86400' }, cors) : {} });
    }
    if (!cors) return reply({ code: -1, errorMsg: 'origin not allowed: ' + (origin || '(none)') }, 403);
    if (request.method !== 'GET') return reply({ code: -1, errorMsg: 'GET only' }, 405, cors);
    const url = new URL(request.url);
    if (!pathAllowed(url)) return reply({ code: -1, errorMsg: 'path not allowed' }, 404, cors);
    if (!env.DATA_GOV_SG_API_KEY) return reply({ code: -1, errorMsg: 'proxy has no DATA_GOV_SG_API_KEY secret' }, 500, cors);

    const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
      headers: { 'x-api-key': env.DATA_GOV_SG_API_KEY },
      cf: { cacheTtl: 60, cacheEverything: true },   // the feed updates every 5 min; 60 s edge cache spares the key
    });
    const res = new Response(upstream.body, upstream);
    for (const [k, v] of Object.entries(cors)) res.headers.set(k, v);
    return res;
  },
};
