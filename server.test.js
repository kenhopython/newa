import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGdeltUrl, normalizeArticles, getNews, createAppServer } from './server.js';
import { buildSnapshot, parseRss, regionForCountry } from './scripts/build-news.js';

test('GDELT query includes the selected topic, region and safe search phrase', () => {
  const url = buildGdeltUrl({ topic: 'finance', region: 'asia', search: '  central "bank"  ' });
  assert.equal(url.hostname, 'api.gdeltproject.org');
  assert.match(url.searchParams.get('query'), /inflation/);
  assert.match(url.searchParams.get('query'), /sourcecountry:CH/);
  assert.match(url.searchParams.get('query'), /"central bank"$/);
  assert.equal(url.searchParams.get('timespan'), '7d');
  assert.throws(() => buildGdeltUrl({ topic: 'invalid' }), /無效/);
});

test('articles keep valid original links and convert GDELT timestamps', () => {
  const articles = normalizeArticles([
    { title: 'A global story', url: 'https://example.com/news/1', domain: 'example.com', seendate: '20261021083000' },
    { title: 'duplicate', url: 'https://example.com/news/1' },
    { title: 'unsafe', url: 'javascript:alert(1)' },
  ], 'ai');
  assert.equal(articles.length, 1);
  assert.equal(articles[0].seenAt, '2026-10-21T08:30:00Z');
  assert.equal(articles[0].topic, 'ai');
});

test('news results are cached for repeat requests', async () => {
  let calls = 0;
  const filters = { topic: 'tech', region: 'global', search: 'unique-cache-case' };
  const fetcher = async () => {
    calls += 1;
    return { ok: true, json: async () => ({ articles: [{ title: 'Test report', url: 'https://example.com/report' }] }) };
  };
  const first = await getNews(filters, fetcher);
  const second = await getNews(filters, fetcher);
  assert.equal(first.articles[0].title, 'Test report');
  assert.equal(second.cached, true);
  assert.equal(calls, 1);
});

test('server serves the page and rejects invalid filters', async (t) => {
  const server = createAppServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const base = `http://127.0.0.1:${server.address().port}`;
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /World Signal/);
  const health = await fetch(`${base}/api/health`);
  assert.deepEqual(await health.json(), { status: 'ok' });
  const invalid = await fetch(`${base}/api/news?topic=invalid`);
  assert.equal(invalid.status, 400);
});

test('Pages snapshot combines all four topics with source regions', async () => {
  let requests = 0;
  const snapshot = await buildSnapshot({
    pause: async () => {},
    fetcher: async () => {
      requests += 1;
      return { ok: true, json: async () => ({ articles: [{
        title: `Story ${requests}`,
        url: `https://example.com/${requests}`,
        sourcecountry: 'Japan',
        seendate: '20261021083000',
      }] }) };
    },
  });
  assert.equal(requests, 4);
  assert.deepEqual(snapshot.articles.map((item) => item.topic), ['ai', 'tech', 'finance', 'unrest']);
  assert.ok(snapshot.articles.every((item) => item.region === 'asia'));
  assert.deepEqual(snapshot.staleTopics, []);
  assert.equal(regionForCountry('United States'), 'americas');
});

test('Google News RSS fallback parses original headlines and links', () => {
  const xml = '<rss><channel><item><title>AI &amp; society - Example News</title><link>https://news.google.com/articles/123?x=1&amp;y=2</link><pubDate>Wed, 21 Oct 2026 08:00:00 GMT</pubDate><source url="https://example.com">Example News</source></item></channel></rss>';
  const articles = parseRss(xml, 'ai');
  assert.equal(articles.length, 1);
  assert.equal(articles[0].title, 'AI & society');
  assert.equal(articles[0].url, 'https://news.google.com/articles/123?x=1&y=2');
  assert.equal(articles[0].source, 'google-rss');
});
