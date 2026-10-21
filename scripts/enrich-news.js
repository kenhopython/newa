// Translation happens during publishing; no credentials or translation requests in the browser.
export function safeImage(value) {
  try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
}
export async function enrichArticles(articles, { fetcher = fetch, previous = [], pause = ms => new Promise(r => setTimeout(r, ms)) } = {}) {
  const cache = new Map(previous.filter(a => a.titleZh && a.titleEn).map(a => [a.title, { titleZh: a.titleZh, titleEn: a.titleEn }]));
  const jobs = [...new Set(articles.map(a => a.title))];
  async function translate(title, target) {
    const url = new URL('https://translate.googleapis.com/translate_a/single');
    for (const [key, value] of Object.entries({ client: 'gtx', sl: 'auto', tl: target, dt: 't', q: title })) url.searchParams.set(key, value);
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const response = await fetcher(url, { signal: AbortSignal.timeout(15000) });
        if (!response.ok) throw new Error(`Translation HTTP ${response.status}`);
        const data = await response.json();
        const text = data[0]?.map(part => part[0] || '').join('').trim();
        if (!text) throw new Error('Empty translation');
        return text;
      } catch (error) { if (attempt === 2) throw error; await pause(1000 * (attempt + 1)); }
    }
  }
  await Promise.all(Array.from({ length: 3 }, async () => {
    while (jobs.length) {
      const title = jobs.shift();
      if (cache.has(title)) continue;
      const article = articles.find(a => a.title === title);
      const titleEn = /^english$/i.test(article.language) ? title : await translate(title, 'en');
      const titleZh = await translate(title, 'zh-TW');
      cache.set(title, { titleEn, titleZh });
      await pause(180);
    }
  }));
  return articles.map(a => ({ ...a, ...cache.get(a.title), image: safeImage(a.image), translation: 'machine' }));
}
