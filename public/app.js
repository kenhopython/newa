const topics = { ai: { name: '人工智能', code: 'AI' }, tech: { name: '科技', code: 'TECH' }, finance: { name: '金融', code: 'FIN' }, unrest: { name: '社會動盪', code: 'SOC' } };
const $ = (selector) => document.querySelector(selector);
const params = new URLSearchParams(location.search);
const state = { topic: topics[params.get('topic')] ? params.get('topic') : 'all', search: params.get('q')?.slice(0, 80) || '', region: ['asia','europe','americas','africa'].includes(params.get('region')) ? params.get('region') : 'global', articles: [], visible: 40, payload: null, controller: null };
function node(tag, className, text) { const element = document.createElement(tag); if (className) element.className = className; if (text !== undefined) element.textContent = text; return element; }
function tone(element, topic) { element.style.setProperty('--tone', `var(--${topics[topic] ? topic : 'ai'})`); return element; }
function link(article, className) { const element = tone(node('a', className), article.topic); element.href = article.url; element.target = '_blank'; element.rel = 'noopener noreferrer'; element.setAttribute('aria-label', `${article.title}（在新分頁閱讀原文）`); return element; }
function date(value, short = false) { const d = new Date(value); if (!value || Number.isNaN(d.getTime())) return '時間不詳'; return new Intl.DateTimeFormat('zh-Hant-HK', { timeZone: 'Asia/Hong_Kong', ...(short ? {} : { month: '2-digit', day: '2-digit' }), hour: '2-digit', minute: '2-digit', hour12: false }).format(d); }
function empty(container, message) { container.replaceChildren(node('div', 'empty', message)); }
function normalize(articles) { return articles.filter(a => { try { return topics[a.topic] && a.title && ['https:','http:'].includes(new URL(a.url).protocol); } catch { return false; } }).sort((a,b) => (Date.parse(b.seenAt) || 0) - (Date.parse(a.seenAt) || 0)); }
function unique(articles) { const seen = new Set(); return articles.filter(a => { if (seen.has(a.url)) return false; seen.add(a.url); return true; }); }
function filtered(deduplicate = true) { const term = state.search.toLocaleLowerCase(); const result = state.articles.filter(a => (state.topic === 'all' || a.topic === state.topic) && (state.region === 'global' || a.region === state.region) && (!term || [a.title,a.domain,a.country,a.language].some(v => String(v || '').toLocaleLowerCase().includes(term)))); return deduplicate ? unique(result) : result; }
function sync() { const url = new URL(location.href); url.search = ''; if (state.topic !== 'all') url.searchParams.set('topic', state.topic); if (state.search) url.searchParams.set('q', state.search); if (state.region !== 'global') url.searchParams.set('region', state.region); history.replaceState(null, '', url); document.querySelectorAll('[data-topic]').forEach(button => { const active = button.dataset.topic === state.topic; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); }); }
function selectTopic(topic) { state.topic = topic; state.visible = 40; render(); }
function renderSectors() {
  $('#sector-strip').replaceChildren(); $('#distribution').replaceChildren();
  const total = state.articles.length;
  Object.entries(topics).forEach(([topic, info]) => {
    const articles = unique(state.articles.filter(a => a.topic === topic));
    const button = tone(node('button','sector'),topic); button.type = 'button'; button.dataset.topic = topic;
    button.append(node('span','sector-label',info.name), node('span','sector-code',info.code));
    const count = node('span','sector-count',state.payload ? String(articles.length).padStart(2,'0') : '—'); count.append(node('small','', '篇報導')); button.append(count);
    const meter = node('span','sector-meter'); meter.title = '最近七日報導數量分布';
    const buckets = Array.from({length:7},(_,i) => articles.filter(a => { const age = (Date.now()-Date.parse(a.seenAt))/86400000; return age >= 6-i && age < 7-i; }).length);
    buckets.forEach(amount => { const bar = node('i'); bar.style.height = `${2 + amount / Math.max(1,...buckets) * 23}px`; meter.append(bar); }); button.append(meter); button.addEventListener('click',()=>selectTopic(topic)); $('#sector-strip').append(button);
    const row = tone(node('div','distribution-row'),topic); const label = node('div','distribution-label'); label.append(node('span','',info.name),node('b','',`${articles.length} 篇`)); const bar = node('div','bar'); const fill = node('span'); fill.style.width = `${total ? articles.length/total*100 : 0}%`; bar.append(fill); row.append(label,bar); $('#distribution').append(row);
  });
}
function renderFocus(articles) {
  const container = $('#focus-grid'); container.replaceChildren();
  Object.keys(topics).filter(t => state.topic === 'all' || t === state.topic).forEach(topic => {
    const article = articles.find(a => a.topic === topic); if (!article) return;
    const card = link(article,'focus-card'); const top = node('div','focus-top'); top.append(node('span','',`${topics[topic].code} / ${topics[topic].name}`),node('span','','↗'));
    const bottom = node('div','focus-bottom'); bottom.append(node('span','',article.domain),node('span','',date(article.seenAt))); card.append(top,node('h3','',article.title),bottom); container.append(card);
  });
  if (!container.children.length) empty(container,state.payload ? '沒有符合條件的焦點新聞。試試清除篩選。' : '尚未取得新聞資料。');
}
function renderChannels() {
  const container = $('#channel-grid'); container.replaceChildren();
  Object.entries(topics).filter(([topic]) => state.topic === 'all' || state.topic === topic).forEach(([topic,info]) => {
    const term = state.search.toLocaleLowerCase();
    const articles = unique(state.articles.filter(a => a.topic === topic && (state.region === 'global' || a.region === state.region) && (!term || [a.title,a.domain,a.country,a.language].some(v=>String(v||'').toLocaleLowerCase().includes(term)))));
    const panel = tone(node('section','channel'),topic); const header = node('div','channel-heading'); header.append(node('h3','',`${info.name} / ${info.code}`)); const more = node('button','',`全部 ${articles.length} 篇 ↗`); more.addEventListener('click',()=>{selectTopic(topic);$('#all-news').scrollIntoView({behavior:'smooth'});}); header.append(more); panel.append(header);
    articles.slice(0,5).forEach((article,i) => { const item = link(article,'channel-story'); const content = node('div'); content.append(node('h4','',article.title),node('small','',`${article.domain} · ${date(article.seenAt)}`)); item.append(node('span','story-number',String(i+1).padStart(2,'0')),content); panel.append(item); });
    if (!articles.length) panel.append(node('p','empty',state.payload ? '沒有符合條件的報導' : '等待新聞資料')); container.append(panel);
  });
}
function renderFeed(articles) {
  $('#feed-label').replaceChildren(node('i'),document.createTextNode(state.topic === 'all' ? '全部報導' : `${topics[state.topic].name}報導`)); $('#feed-count').textContent = `${articles.length} 篇 / 按時間排序`;
  const container = $('#article-list'); container.replaceChildren();
  articles.slice(0,state.visible).forEach(article => { const row = link(article,'article-row'); const time = node('div','row-time',date(article.seenAt)); time.append(node('span','topic-badge',topics[article.topic].name)); const source = node('div','row-source',article.domain); source.append(node('span','',article.country || article.language || '原文來源')); row.append(time,node('h3','',article.title),source); container.append(row); });
  if (!articles.length) empty(container,state.payload ? '沒有符合條件的報導。清除篩選或更換關鍵字再試。' : '新聞來源暫時未能載入，請稍後更新。');
  $('#load-more').hidden = state.visible >= articles.length;
}
function renderWire(articles) {
  const wire = $('#news-wire'); wire.replaceChildren();
  articles.slice(0,8).forEach(article => { const item = link(article,'wire-item'); item.append(node('time','',date(article.seenAt)),node('h3','',article.title),node('small','',`${topics[article.topic].name} · ${article.domain}`)); wire.append(item); });
  if (!articles.length) empty(wire,'暫無快訊');
  const ticker = $('#ticker-items'); ticker.replaceChildren(); unique(state.articles).slice(0,5).forEach(article=>{const item=link(article,'');item.append(node('b','',topics[article.topic].code),document.createTextNode(article.title));ticker.append(item);}); if (!ticker.children.length) ticker.textContent='新聞來源載入後，最新標題將顯示於此。';
}
function render() { const articles = filtered(); renderSectors(); renderFocus(filtered(false)); renderChannels(); renderFeed(articles); renderWire(articles); sync(); }
async function fetchData(signal) {
  let snapshot;
  try { const response = await fetch(new URL('news.json',document.baseURI),{signal,cache:'no-cache'}); if (response.ok) {snapshot = await response.json(); if (snapshot.articles?.length) return snapshot;} } catch(error) {if(error.name==='AbortError')throw error;}
  if (location.hostname.endsWith('.github.io')) throw new Error('首次新聞更新尚未完成');
  const results = await Promise.allSettled(Object.keys(topics).map(async topic => { const response = await fetch(new URL(`api/news?topic=${topic}`,document.baseURI),{signal}); if(!response.ok)throw new Error('來源連線失敗'); return response.json(); }));
  if(signal.aborted)throw new DOMException('Aborted','AbortError');
  const successful=results.filter(r=>r.status==='fulfilled'); const articles=successful.flatMap(r=>r.value.articles||[]); if(!articles.length)throw new Error('新聞來源暫時無法連線');
  return {articles,generatedAt:new Date().toISOString(),partial:successful.length<4};
}
async function load() {
  state.controller?.abort(); const controller=new AbortController(); state.controller=controller; $('#refresh').disabled=true; $('#feed-status').textContent='正在更新四個新聞板塊…'; $('#connection').textContent='更新中';
  try { const payload=await fetchData(controller.signal); state.payload=payload; state.articles=normalize(payload.articles); state.visible=40;
    const hasRegions=state.articles.some(a=>a.region && a.region!=='global'); $('#region-select').disabled=!hasRegions; if(!hasRegions){state.region='global';$('#region-select').value='global';}
    $('#connection').textContent='資料已載入';$('#connection').className='ready';$('#updated-at').textContent=`更新 ${date(payload.generatedAt)}`;
    const notes=['依各主題最新時間排列 · 標題保留原文']; if(payload.rssTopics?.length)notes.push('含 Google News RSS 報導'); if(payload.staleTopics?.length||payload.partial)notes.push('部分主題更新延遲'); if(!hasRegions)notes.push('目前資料未提供可靠的來源地區'); $('#feed-status').textContent=notes.join(' / ');render();
  } catch(error) {if(error.name==='AbortError')return;$('#connection').textContent='更新失敗';$('#connection').className='';$('#feed-status').textContent=state.payload?'更新失敗，保留目前顯示的報導。':`${error.message}。請稍後重試。`;if(!state.payload)render();}
  finally{if(state.controller===controller)$('#refresh').disabled=false;}
}
$('#search-input').value=state.search;$('#region-select').value=state.region;
document.querySelectorAll('.topic-tab').forEach(button=>button.addEventListener('click',()=>selectTopic(button.dataset.topic)));
$('#search-form').addEventListener('submit',event=>{event.preventDefault();state.search=$('#search-input').value.trim();state.region=$('#region-select').value;state.visible=40;render();});
$('#region-select').addEventListener('change',()=>{state.region=$('#region-select').value;state.visible=40;render();});
$('#reset').addEventListener('click',()=>{state.topic='all';state.region='global';state.search='';state.visible=40;$('#search-input').value='';$('#region-select').value='global';render();});
document.querySelectorAll('[data-keyword]').forEach(button=>button.addEventListener('click',()=>{state.topic='all';state.search=button.dataset.keyword;$('#search-input').value=state.search;state.visible=40;render();$('#all-news').scrollIntoView({behavior:'smooth'});}));
$('#load-more').addEventListener('click',()=>{state.visible+=40;renderFeed(filtered());});$('#refresh').addEventListener('click',load);
function clock(){ $('#clock').textContent=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hong_Kong',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date()); }clock();setInterval(clock,1000);
renderSectors();sync();$('#focus-grid').replaceChildren(...Object.keys(topics).map(topic=>{const card=node('div','pending',topics[topic].name);card.append(node('span'),node('span'));return card;}));load();
