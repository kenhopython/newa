import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const publicRoot = join(root, 'public');
const cache = new Map();
const CACHE_MS = 10 * 60 * 1000;

export const TOPICS = {
  all: '("artificial intelligence" OR semiconductor OR inflation OR protest)',
  ai: '("artificial intelligence" OR "generative AI" OR "machine learning")',
  tech: '(semiconductor OR cybersecurity OR technology)',
  finance: '(inflation OR "stock market" OR "central bank")',
  unrest: '(protest OR unrest OR strike OR "civil conflict")',
};

const REGIONS = {
  global: '',
  asia: '(sourcecountry:CH OR sourcecountry:IN OR sourcecountry:JA OR sourcecountry:KS OR sourcecountry:TW)',
  europe: '(sourcecountry:UK OR sourcecountry:FR OR sourcecountry:GM OR sourcecountry:IT OR sourcecountry:SP)',
  americas: '(sourcecountry:US OR sourcecountry:CA OR sourcecountry:BR OR sourcecountry:MX)',
  africa: '(sourcecountry:SF OR sourcecountry:NI OR sourcecountry:EG OR sourcecountry:KE)',
};

export function buildGdeltUrl({ topic = 'all', region = 'global', search = '' } = {}) {
  if (!(topic in TOPICS) || !(region in REGIONS)) throw new Error('無效的篩選條件');
  const cleaned = search.trim().replace(/["()]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);
  const safeSearch = cleaned ? ` "${cleaned}"` : '';
  const query = `${TOPICS[topic]}${REGIONS[region] ? ` ${REGIONS[region]}` : ''}${safeSearch}`;
  const url = new URL('https://api.gdeltproject.org/api/v2/doc/doc');
  url.searchParams.set('query', query);
  url.searchParams.set('mode', 'artlist');
  url.searchParams.set('format', 'json');
  url.searchParams.set('sort', 'datedesc');
  url.searchParams.set('timespan', '7d');
  url.searchParams.set('maxrecords', '35');
  return url;
}

export function normalizeArticles(raw, topic) {
  if (!Array.isArray(raw)) return [];
  const seen = new Set();
  return raw.flatMap((item) => {
    if (typeof item?.url !== 'string' || typeof item?.title !== 'string') return [];
    let link;
    try {
      link = new URL(item.url);
    } catch {
      return [];
    }
    if (!['http:', 'https:'].includes(link.protocol) || seen.has(link.href)) return [];
    seen.add(link.href);
    const seenDate = typeof item.seendate === 'string' && /^\d{14}$/.test(item.seendate)
      ? `${item.seendate.slice(0, 4)}-${item.seendate.slice(4, 6)}-${item.seendate.slice(6, 8)}T${item.seendate.slice(8, 10)}:${item.seendate.slice(10, 12)}:${item.seendate.slice(12, 14)}Z`
      : null;
    return [{
      title: item.title.trim().slice(0, 300),
      image: typeof item.socialimage === 'string' && item.socialimage.startsWith('https://') ? item.socialimage : '',
      url: link.href,
      domain: typeof item.domain === 'string' ? item.domain.slice(0, 100) : link.hostname,
      language: typeof item.language === 'string' ? item.language.slice(0, 50) : '',
      country: typeof item.sourcecountry === 'string' ? item.sourcecountry.slice(0, 50) : '',
      seenAt: seenDate,
      topic,
    }];
  }).filter((item) => item.title);
}

export async function getNews(filters, fetcher = fetch) {
  const url = buildGdeltUrl(filters);
  const key = url.search;
  const saved = cache.get(key);
  if (saved && Date.now() - saved.fetchedAt < CACHE_MS) return { ...saved.data, cached: true };
  try {
    const response = await fetcher(url, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    if (!response.ok) throw new Error(`GDELT 回應 ${response.status}`);
    const payload = await response.json();
    const data = {
      articles: normalizeArticles(payload.articles, filters.topic || 'all'),
      updatedAt: new Date().toISOString(),
      source: 'GDELT',
      stale: false,
    };
    cache.set(key, { data, fetchedAt: Date.now() });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
    return data;
  } catch (error) {
    if (saved) return { ...saved.data, stale: true, cached: true };
    throw error;
  }
}

function sendJson(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(data));
}

const staticFiles = {
  '/': ['index.html', 'text/html; charset=utf-8'],
  '/styles.css': ['styles.css', 'text/css; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/favicon.svg': ['favicon.svg', 'image/svg+xml'],
  '/news.json': ['news.json', 'application/json; charset=utf-8'],
};

export function createAppServer() {
  return createServer(async (req, res) => {
    const url = new URL(req.url || '/', 'http://localhost');
    if (req.method !== 'GET') return sendJson(res, 405, { error: '只支援 GET' });
    if (url.pathname === '/api/health') return sendJson(res, 200, { status: 'ok' });
    if (url.pathname === '/api/news') {
      const filters = {
        topic: url.searchParams.get('topic') || 'all',
        region: url.searchParams.get('region') || 'global',
        search: url.searchParams.get('q') || '',
      };
      try {
        const data = await getNews(filters);
        return sendJson(res, 200, data);
      } catch (error) {
        const invalid = error.message === '無效的篩選條件';
        return sendJson(res, invalid ? 400 : 502, {
          error: invalid ? error.message : '新聞來源暫時無法連線，請稍後再試。',
        });
      }
    }
    const file = staticFiles[url.pathname];
    if (!file) return sendJson(res, 404, { error: '找不到頁面' });
    try {
      const contents = await readFile(join(publicRoot, file[0]));
      res.writeHead(200, { 'Content-Type': file[1], 'Cache-Control': 'no-cache' });
      res.end(contents);
    } catch {
      sendJson(res, 500, { error: '無法載入頁面' });
    }
  });
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const port = Number(process.env.PORT || 3000);
  createAppServer().listen(port, '0.0.0.0', () => {
    console.log(`World Signal listening on http://localhost:${port}`);
  });
}
