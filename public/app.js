const topicNames = {
  all: '所有報導',
  ai: '人工智能',
  tech: '科技前沿',
  finance: '全球金融',
  unrest: '社會動盪',
};
const topicMarks = { all: '◎', ai: '✳', tech: '⌘', finance: '↗', unrest: '◉' };

const elements = {
  date: document.querySelector('#today-date'),
  tabs: [...document.querySelectorAll('.topic-tab')],
  cards: [...document.querySelectorAll('.coverage-card')],
  keywords: [...document.querySelectorAll('[data-keyword]')],
  form: document.querySelector('#search-form'),
  input: document.querySelector('#search-input'),
  region: document.querySelector('#region-select'),
  label: document.querySelector('#feed-label'),
  count: document.querySelector('#feed-count'),
  status: document.querySelector('#feed-status'),
  list: document.querySelector('#article-list'),
  more: document.querySelector('#load-more'),
};

const params = new URLSearchParams(location.search);
const state = {
  topic: topicNames[params.get('topic')] ? params.get('topic') : 'all',
  region: ['global', 'asia', 'europe', 'americas', 'africa'].includes(params.get('region')) ? params.get('region') : 'global',
  search: params.get('q')?.slice(0, 80) || '',
  articles: [],
  visible: 10,
  controller: null,
};

elements.date.textContent = new Intl.DateTimeFormat('zh-Hant-HK', {
  timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());
elements.input.value = state.search;
elements.region.value = state.region;

function setStatus(message, type = '') {
  elements.status.textContent = message;
  elements.status.className = `feed-status ${type}`;
}

function setTopic(topic) {
  state.topic = topic;
  elements.tabs.forEach((tab) => {
    const active = tab.dataset.topic === topic;
    tab.classList.toggle('active', active);
    tab.setAttribute('aria-pressed', String(active));
  });
  elements.label.textContent = topicNames[topic];
  loadNews();
}

function syncUrl() {
  const url = new URL(location.href);
  url.search = '';
  if (state.topic !== 'all') url.searchParams.set('topic', state.topic);
  if (state.region !== 'global') url.searchParams.set('region', state.region);
  if (state.search) url.searchParams.set('q', state.search);
  history.replaceState(null, '', url);
}

function formatSeenDate(value) {
  if (!value) return '日期不詳';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '日期不詳';
  return new Intl.DateTimeFormat('zh-Hant-HK', {
    timeZone: 'Asia/Hong_Kong', month: 'numeric', day: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function renderEmpty(title, description) {
  const empty = document.createElement('div');
  empty.className = 'empty-feed';
  const symbol = document.createElement('span');
  symbol.textContent = '◎';
  const heading = document.createElement('h3');
  heading.textContent = title;
  const copy = document.createElement('p');
  copy.textContent = description;
  empty.append(symbol, heading, copy);
  elements.list.replaceChildren(empty);
}

function renderArticles() {
  elements.list.replaceChildren();
  if (!state.articles.length) {
    renderEmpty('暫時沒有符合條件的報導', '試試其他主題、地區或搜尋字詞。');
    elements.more.hidden = true;
    return;
  }
  const fragment = document.createDocumentFragment();
  state.articles.slice(0, state.visible).forEach((article) => {
    const link = document.createElement('a');
    link.className = 'article-card';
    link.href = article.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.setAttribute('aria-label', `${article.title}（於新分頁開啟原始報導）`);

    const graphic = document.createElement('span');
    graphic.className = `article-graphic ${article.topic}`;
    graphic.textContent = topicMarks[article.topic] || '◎';

    const body = document.createElement('div');
    const meta = document.createElement('div');
    meta.className = 'article-meta';
    [topicNames[article.topic] || '全球', article.domain, `收錄 ${formatSeenDate(article.seenAt)}`, article.language, article.country]
      .filter(Boolean).forEach((value) => {
        const piece = document.createElement('span');
        piece.textContent = value;
        meta.append(piece);
      });
    const title = document.createElement('h3');
    title.className = 'article-title';
    title.textContent = article.title;
    body.append(meta, title);

    const arrow = document.createElement('span');
    arrow.className = 'article-link-icon';
    arrow.setAttribute('aria-hidden', 'true');
    arrow.textContent = '↗';
    link.append(graphic, body, arrow);
    fragment.append(link);
  });
  elements.list.append(fragment);
  elements.more.hidden = state.visible >= state.articles.length;
}

async function fetchLiveNews(signal) {
  const query = new URLSearchParams({ topic: state.topic, region: state.region });
  if (state.search) query.set('q', state.search);
  const url = new URL(`api/news?${query}`, document.baseURI);
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('即時新聞 API 暫時無法連線');
  return { ...await response.json(), snapshot: false };
}

async function fetchNewsSnapshot(signal) {
  const response = await fetch(new URL('news.json', document.baseURI), { signal, cache: 'no-cache' });
  if (!response.ok) throw new Error('新聞快照尚未取得');
  const payload = await response.json();
  const term = state.search.toLocaleLowerCase();
  let articles = (Array.isArray(payload.articles) ? payload.articles : []).filter((article) => {
    if (state.topic !== 'all' && article.topic !== state.topic) return false;
    if (state.region !== 'global' && article.region !== state.region) return false;
    if (!term) return true;
    return [article.title, article.domain, article.country, article.language]
      .some((value) => String(value || '').toLocaleLowerCase().includes(term));
  });
  if (state.topic === 'all') {
    const seen = new Set();
    articles = articles.filter((article) => {
      if (seen.has(article.url)) return false;
      seen.add(article.url);
      return true;
    });
  }
  return { articles, snapshot: true, generatedAt: payload.generatedAt, staleTopics: payload.staleTopics };
}

async function fetchArticleData(signal) {
  if (location.hostname.endsWith('.github.io')) return fetchNewsSnapshot(signal);
  try {
    return await fetchLiveNews(signal);
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    return fetchNewsSnapshot(signal);
  }
}

async function loadNews() {
  state.controller?.abort();
  state.controller = new AbortController();
  const controller = state.controller;
  state.visible = 10;
  state.articles = [];
  elements.count.textContent = '—';
  elements.more.hidden = true;
  renderEmpty('正在尋找全球訊號', '新聞來源載入中…');
  setStatus('正在更新最近七日的全球報導…', 'loading');
  syncUrl();

  try {
    const payload = await fetchArticleData(controller.signal);
    state.articles = Array.isArray(payload.articles) ? payload.articles : [];
    elements.count.textContent = payload.snapshot && !payload.generatedAt ? '待更新' : `${state.articles.length} 篇`;
    if (payload.snapshot && !payload.generatedAt) {
      setStatus('新聞快照尚未建立。定期更新流程完成後，報導會出現在這裏。');
      renderEmpty('首次新聞更新尚未完成', '網站已就緒，新聞列表會在資料更新後顯示。');
      return;
    }
    if (payload.snapshot) {
      const delayed = payload.staleTopics?.length ? '部分主題沿用較早的報導。' : '';
      setStatus(`顯示 ${formatSeenDate(payload.generatedAt)} 更新的新聞快照；篩選與搜尋會在這批報導中進行。${delayed}`);
    } else if (payload.stale) {
      setStatus('目前顯示稍早取得的報導，新聞來源暫時無法更新。');
    } else {
      setStatus('');
    }
    renderArticles();
  } catch (error) {
    if (error.name === 'AbortError') return;
    elements.count.textContent = '未連線';
    setStatus('新聞來源暫時無法連線。請稍後重試。');
    renderEmpty('暫時無法取得即時報導', '你仍可探索四個觀察領域；連線恢復後，新聞列表會顯示原始報導。');
  }
}

elements.tabs.forEach((tab) => tab.addEventListener('click', () => setTopic(tab.dataset.topic)));
elements.cards.forEach((card) => card.addEventListener('click', () => {
  setTopic(card.dataset.topic);
  document.querySelector('#latest').scrollIntoView({ behavior: 'smooth' });
}));
elements.keywords.forEach((keyword) => keyword.addEventListener('click', () => {
  elements.input.value = keyword.dataset.keyword;
  state.search = elements.input.value;
  loadNews();
  document.querySelector('#latest').scrollIntoView({ behavior: 'smooth' });
}));
elements.form.addEventListener('submit', (event) => {
  event.preventDefault();
  state.search = elements.input.value.trim().slice(0, 80);
  state.region = elements.region.value;
  loadNews();
});
elements.region.addEventListener('change', () => {
  state.region = elements.region.value;
  state.search = elements.input.value.trim().slice(0, 80);
  loadNews();
});
elements.more.addEventListener('click', () => {
  state.visible += 10;
  renderArticles();
});

setTopic(state.topic);
