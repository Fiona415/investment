const html = __HTML_JSON__;
const css = __CSS_JSON__;
const app = __APP_JSON__;
const memory = new Map();
const num = x => Number.isFinite(Number(x)) ? Number(x) : null;
const quoteTime = x => x ? new Date(x * 1000).toISOString() : null;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' } });
async function get(url, ttl = 60000, referer = 'https://quote.eastmoney.com/') {
  const old = memory.get(url);
  if (old && Date.now() - old.at < ttl) return old.value;
  let cached;
  try { cached = await caches.default.match(url); if (cached) return await cached.text(); } catch { /* cache unavailable */ }
  const response = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0', referer }, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw new Error(`上游返回 ${response.status}`);
  const value = await response.text();
  memory.set(url, { at: Date.now(), value });
  try { await caches.default.put(url, new Response(value, { headers: { 'cache-control': `public, max-age=${Math.round(ttl / 1000)}` } })); } catch { /* cache unavailable */ }
  return value;
}
async function east(url, ttl) {
  const candidates = url.includes('push2.eastmoney.com') ? [url, url.replace('push2.eastmoney.com', 'push2delay.eastmoney.com'), url.replace('push2.eastmoney.com', '82.push2.eastmoney.com')] : [url];
  let last;
  for (const candidate of candidates) {
    try {
      const value = JSON.parse(await get(candidate, ttl));
      if (value.rc !== 0 || !value.data) throw new Error('数据结构无效');
      return value.data;
    } catch (error) { last = error; }
  }
  throw new Error(`行情源暂不可用：${new URL(url).pathname}；${last?.message || '未知错误'}`);
}
async function boards() {
  const base = 'https://push2.eastmoney.com/api/qt/clist/get?po=1&np=1&fltt=2&fid=f62&fs=m:90+t:2&fields=f12,f14,f2,f3,f62,f124,f164,f174';
  const first = await east(`${base}&pn=1&pz=100`, 90000);
  const total = Number(first.total);
  if (!Number.isInteger(total) || total < 1 || total > 1000) throw new Error('板块列表数量异常');
  const pages = [first];
  const rest = Array.from({ length: Math.ceil(total / 100) - 1 }, (_, i) => east(`${base}&pn=${i + 2}&pz=100`, 90000));
  pages.push(...await Promise.all(rest));
  const rows = pages.flatMap(p => Array.isArray(p.diff) ? p.diff : Object.values(p.diff || {}));
  if (rows.length < total * .99) throw new Error('板块列表分页不完整');
  return rows;
}
async function market() {
  const fields = 'f43,f47,f48,f57,f58,f60,f86,f170';
  const [shResult, szResult, listResult, flowResult] = await Promise.allSettled([
    east(`https://push2.eastmoney.com/api/qt/stock/get?secid=1.000001&fields=${fields}`, 45000),
    east(`https://push2.eastmoney.com/api/qt/stock/get?secid=0.399001&fields=${fields}`, 45000),
    boards(),
    east('https://push2.eastmoney.com/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399106&fields=f12,f14,f62,f184', 90000)
  ]);
  const sh=shResult.status==='fulfilled'?shResult.value:{};
  const sz=szResult.status==='fulfilled'?szResult.value:{};
  const list=listResult.status==='fulfilled'?listResult.value:[];
  const flow=flowResult.status==='fulfilled'?flowResult.value:null;
  const boardList = list.map(b => ({ code: b.f12, name: b.f14, change: num(b.f3), today: num(b.f62), three: num(b.f164), five: num(b.f174), time: quoteTime(b.f124) })).filter(b => b.name && b.today !== null);
  const breadth = boardList.length ? boardList.filter(x => x.change > 0).length / boardList.length : null;
  const mood = breadth === null ? '待判断' : breadth > .72 ? '偏热' : breadth < .28 ? '偏冷' : '中性';
  const parts = flow?.diff || [];
  const marketNet = parts.length === 2 && parts.every(x => Number.isFinite(Number(x.f62))) ? parts.reduce((s, x) => s + Number(x.f62), 0) : null;
  const partial = [shResult,szResult,listResult,flowResult].some(x=>x.status==='rejected');
  return { asOf: quoteTime(sh.f86 || list[0]?.f124), receivedAt: new Date().toISOString(), index: { value: num(sh.f43) !== null ? sh.f43 / 100 : null, change: num(sh.f170) !== null ? sh.f170 / 100 : null }, turnover: (num(sh.f48) || 0) + (num(sz.f48) || 0), volumeShares: ((num(sh.f47) || 0) + (num(sz.f47) || 0)) * 100, mood, breadth, boards: boardList, marketNet, marketNetCount: null, marketNetTime: quoteTime(sh.f86), marketNetNote: '沪深综指主力净额相加估算，不含北交所', partial, errors: [shResult,szResult,listResult,flowResult].filter(x=>x.status==='rejected').map(x=>x.reason?.message||'未知错误') };
}
async function fund(code) {
  const nav = JSON.parse(await get(`https://api.fund.eastmoney.com/f10/lsjz?fundCode=${code}&pageIndex=1&pageSize=2`, 300000, 'https://fund.eastmoney.com/'));
  if (nav.ErrCode !== 0 || !nav.Data?.LSJZList?.length) throw new Error('基金净值暂不可用');
  const search = JSON.parse(await get(`https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${code}`, 86400000, 'https://fund.eastmoney.com/'));
  const info = (search.Datas || []).find(x => x.CODE === code && x.CATEGORY === 700);
  const latest = nav.Data.LSJZList[0];
  return { code, name: info?.NAME || code, nav: num(latest.DWJZ), date: latest.FSRQ, change: num(latest.JZZZL), buyState: latest.SGZT || '', sellState: latest.SHZT || '', source: `https://fund.eastmoney.com/${code}.html` };
}
async function searchFunds(query) {
  const data = JSON.parse(await get(`https://fundsuggest.eastmoney.com/FundSearch/api/FundSearchAPI.ashx?m=1&key=${encodeURIComponent(query)}`, 3600000, 'https://fund.eastmoney.com/'));
  return (data.Datas || []).filter(x => x.CATEGORY === 700).slice(0, 12).map(x => ({ code: x.CODE, name: x.NAME }));
}
const decode = s => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&').replace(/<[^>]+>/g, '').trim();
async function news() {
  const topics = ['半导体 人工智能 基金', '黄金 价格 基金', '纳斯达克100 美股 基金', '红利低波 政策'];
  const feeds = await Promise.allSettled(topics.map(async topic => {
    const xml = await get(`https://www.bing.com/news/search?q=${encodeURIComponent(topic)}&format=rss`, 900000, 'https://www.bing.com/');
    return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].slice(0, 4).map(m => {
      const part = m[1];
      const pick = tag => decode(part.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] || '');
      const rawLink = (part.match(/<link>([\s\S]*?)<\/link>/)?.[1] || '').replace(/&amp;/g, '&');
      let link = '';
      try { const parsed = new URL(rawLink); const target = parsed.hostname.endsWith('bing.com') ? parsed.searchParams.get('url') : rawLink; if (target && new URL(target).protocol === 'https:') link = target; } catch { /* invalid URL */ }
      return { topic, title: pick('title'), summary: pick('description').slice(0, 145), date: pick('pubDate'), source: pick('News:Source'), link };
    });
  }));
  return feeds.flatMap(x => x.status === 'fulfilled' ? x.value : []).filter(x => x.title && x.link).sort((a, b) => Date.parse(b.date) - Date.parse(a.date)).slice(0, 10);
}
export default {
  async fetch(request) {
    try {
      const u = new URL(request.url);
      if (u.pathname === '/api/market') return json(await market());
      if (u.pathname === '/api/news') return json({ items: await news(), receivedAt: new Date().toISOString() });
      if (u.pathname === '/api/search') { const q = (u.searchParams.get('q') || '').trim().slice(0, 50); return json({ items: q ? await searchFunds(q) : [] }); }
      if (u.pathname === '/api/fund') { const code = u.searchParams.get('code') || ''; return /^\d{6}$/.test(code) ? json(await fund(code)) : json({ error: '请输入六位基金代码' }, 400); }
      const content = u.pathname === '/' ? html : u.pathname === '/style.css' ? css : u.pathname === '/app.js' ? app : null;
      if (content === null) return new Response('Not found', { status: 404 });
      const type = u.pathname === '/' ? 'text/html' : u.pathname.endsWith('.css') ? 'text/css' : 'text/javascript';
      return new Response(content, { headers: { 'content-type': `${type}; charset=utf-8`, 'x-content-type-options': 'nosniff', 'cache-control': 'public, max-age=60' } });
    } catch (error) { return json({ error: error.message || '数据源暂不可用' }, 502); }
  }
};

