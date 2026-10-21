import { readFile, rename, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { buildGdeltUrl, normalizeArticles } from '../server.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'public', 'news.json');
const topics = ['ai', 'tech', 'finance', 'unrest'];

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
      }));
      if (!articles.length) throw new Error(`GDELT 沒有回傳 ${topic} 報導`);
      return articles;
    } catch (error) {
      lastError = error;
      if (attempt === 0) await pause(10000);
    }
  }
  throw lastError;
}

export async function buildSnapshot({ fetcher = fetch, pause = (ms) => new Promise((done) => setTimeout(done, ms)), previous = { articles: [] } } = {}) {
  const articles = [];
  const staleTopics = [];
  for (const [index, topic] of topics.entries()) {
    if (index > 0) await pause(6000);
    try {
      articles.push(...await fetchTopic(topic, fetcher, pause));
    } catch (error) {
      const fallback = (previous.articles || []).filter((article) => article.topic === topic);
      if (!fallback.length) throw new Error(`${topic} 新聞更新失敗，而且沒有可用的舊資料：${error.message}`);
      console.warn(`${topic} 新聞更新失敗，保留 ${fallback.length} 篇舊資料：${error.message}`);
      articles.push(...fallback);
      staleTopics.push(topic);
    }
  }
  return { generatedAt: new Date().toISOString(), staleTopics, articles };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  let previous = { articles: [] };
  try {
    previous = JSON.parse(await readFile(output, 'utf8'));
  } catch {}
  const snapshot = await buildSnapshot({ previous });
  const temporary = `${output}.tmp`;
  await writeFile(temporary, `${JSON.stringify(snapshot, null, 2)}\n`);
  await rename(temporary, output);
  console.log(`已更新 ${snapshot.articles.length} 篇新聞報導。`);
}
