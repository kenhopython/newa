import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildGdeltUrl, normalizeArticles } from '../server.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'public', 'news.json');
const topics = ['ai', 'tech', 'finance', 'unrest'];
const rssQueries = {
  ai: '"artificial intelligence" OR "generative AI" when:7d',
  tech: 'semiconductor OR cybersecurity when:7d',
  finance: 'inflation OR "stock market" when:7d',
  unrest: 'protest OR "civil unrest" when:7d',
};

const regionCountries = {
  asia: ['china', 'india', 'japan', 'south korea', 'north korea', 'taiwan', 'hong kong', 'singapore', 'malaysia', 'indonesia', 'thailand', 'vietnam', 'philippines', 'pakistan', 'bangladesh', 'saudi arabia', 'united arab emirates', 'israel', 'iran', 'turkey', 'nepal', 'sri lanka', 'qatar', 'myanmar', 'cambodia'],
  europe: ['united kingdom', 'germany', 'france', 'spain', 'italy', 'netherlands', 'belgium', 'sweden', 'norway', 'denmark', 'finland', 'poland', 'ukraine', 'russia', 'switzerland', 'austria', 'portugal', 'ireland', 'greece', 'czech republic', 'hungary', 'romania', 'serbia', 'croatia'],
  americas: ['united states', 'canada', 'mexico', 'brazil', 'argentina', 'chile', 'colombia', 'peru', 'venezuela', 'cuba', 'ecuador', 'uruguay', 'bolivia'],
  africa: ['south africa', 'nigeria', 'egypt', 'kenya', 'ethiopia', 'ghana', 'morocco', 'algeria', 'tunisia', 'uganda', 'tanzania', 'sudan', 'senegal', 'rwanda'],
};

export function regionForCountry(country) {
  const value = String(country || '').trim().toLowerCase();
  for (const [region, countries] of Object.entries(regionCountries)) {
    if (countries.includes(value)) return region;
  }
  return 'global';
}

function decodeXml(value) {
  return String(value || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (match, entity) => {
    if (entity.startsWith('#x')) return String.fromCodePoint(parseInt(entity.slice(2), 16));
    if (entity.startsWith('#')) return String.fromCodePoint(parseInt(entity.slice(1), 10));
    return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[entity.toLowerCase()] || match;
  });
}

export function parseRss(xml, topic) {
  const items = [...xml.matchAll(/<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/gi)];
  const tag = (item, name) => decodeXml(item.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, 'i'))?.[1] || '').trim();
  return items.flatMap(([, item]) => {
    const link = tag(item, 'link');
    let url;
    try { url = new URL(link); } catch { return []; }
    if (!['http:', 'https:'].includes(url.protocol)) return [];
    const source = tag(item, 'source');
    const rawTitle = tag(item, 'title');
    const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -source.length - 3) : rawTitle;
    if (!title) return [];
    const published = new Date(tag(item, 'pubDate'));
    return [{
      title: title.slice(0, 300), url: url.href, domain: source || url.hostname,
      language: 'English', country: '', region: 'global', topic, source: 'google-rss',
      seenAt: Number.isNaN(published.getTime()) ? null : published.toISOString(),
    }];
  }).slice(0, 100);
}

async function fetchRssTopic(topic, fetcher) {
  const url = new URL('https://news.google.com/rss/search');
  url.searchParams.set('q', rssQueries[topic]);
  url.searchParams.set('hl', 'en-US');
  url.searchParams.set('gl', 'US');
  url.searchParams.set('ceid', 'US:en');
  const response = await fetcher(url, { signal: AbortSignal.timeout(25000) });
  if (!response.ok) throw new Error(`Google News RSS 回應 ${response.status}`);
  const articles = parseRss(await response.text(), topic);
  if (!articles.length) throw new Error(`Google News RSS 沒有回傳 ${topic} 報導`);
  return articles;
}

async function fetchTopic(topic, fetcher, pause) {
  const url = buildGdeltUrl({ topic });
  url.searchParams.set('maxrecords', '100');
  let lastError;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetcher(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(25000),
      });
      if (!response.ok) throw new Error(`GDELT 回應 ${response.status}`);
      const payload = await response.json();
      const articles = normalizeArticles(payload.articles, topic).map((article) => ({
        ...article,
        region: regionForCountry(article.country),
        source: 'gdelt',
      }));
      if (!articles.length) throw new Error(`GDELT 沒有回傳 ${topic} 報導`);
      return articles;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await pause(10000);
    }
  }
  console.warn(`${topic} GDELT 查詢失敗，嘗試 Google News RSS：${lastError.message}`);
  try {
    return await fetchRssTopic(topic, fetcher);
  } catch (rssError) {
    throw new Error(`GDELT：${lastError.message}；Google News RSS：${rssError.message}`);
  }
}

export async function buildSnapshot({ fetcher = fetch, pause = (ms) => new Promise((done) => setTimeout(done, ms)), previous = { articles: [] } } = {}) {
  const articles = [];
  const staleTopics = [];
  const rssTopics = [];
  for (const [index, topic] of topics.entries()) {
    if (index > 0) await pause(6000);
    try {
      const fetched = await fetchTopic(topic, fetcher, pause);
      articles.push(...fetched);
      if (fetched[0]?.source === 'google-rss') rssTopics.push(topic);
    } catch (error) {
      const fallback = (previous.articles || []).filter((article) => article.topic === topic);
      if (!fallback.length) throw new Error(`${topic} 新聞更新失敗，而且沒有可用的舊資料：${error.message}`);
      console.warn(`${topic} 新聞更新失敗，保留 ${fallback.length} 篇舊資料：${error.message}`);
      articles.push(...fallback);
      staleTopics.push(topic);
      if (fallback[0]?.source === 'google-rss') rssTopics.push(topic);
    }
  }
  return { generatedAt: new Date().toISOString(), staleTopics, rssTopics, articles };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    let previous = { articles: [] };
    try { previous = JSON.parse(await readFile(output, 'utf8')); } catch {}
    const snapshot = await buildSnapshot({ previous });
    const temporary = `${output}.tmp`;
    await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`);
    await rename(temporary, output);
    console.log(`已更新 ${snapshot.articles.length} 篇新聞報導。`);
  } catch (error) {
    console.error(`::error::新聞快照建立失敗：${error.message.replace(/[\r\n]/g, ' ')}`);
    process.exitCode = 1;
  }
}
