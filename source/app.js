const $ = s => document.querySelector(s);
const yuan = n => `¥ ${Number(n || 0).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const shortMoney = n => n == null ? '--' : `${n < 0 ? '-' : '+'}${(Math.abs(n) / 1e8).toFixed(1)} 亿`;
const safe = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmtDate = d => d ? new Date(d).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '--';
const dayCN = d => new Date(d).toLocaleDateString('en-CA', { timeZone: 'Asia/Shanghai' });
const key = 'fund-portfolio-atlas-v1';
const initial = [];
let positions;
const defaultPositions = () => window.__PUBLIC_TEMPLATE__ ? [] : structuredClone(initial);
try { const x = JSON.parse(localStorage.getItem(key)); positions = Array.isArray(x) ? x : defaultPositions(); } catch { positions = defaultPositions(); }
positions = positions.map(p => ({ ...p, updatedDate: p.updatedDate || '2026-11-05' }));
let moneyHidden = localStorage.getItem('fund-portfolio-hide-money') === 'true';
let limits;
try { limits=JSON.parse(localStorage.getItem('fund-portfolio-limits')) || {gold:25,global:40}; } catch { limits={gold:25,global:40}; }
limits.gold=Number.isFinite(Number(limits.gold))?Math.max(5,Math.min(80,Number(limits.gold))):25;
limits.global=Number.isFinite(Number(limits.global))?Math.max(5,Math.min(80,Number(limits.global))):40;
const shownMoney = n => moneyHidden ? '••••' : yuan(n);
const pct = (value,cost) => Number(cost)>0 ? `${((value-Number(cost))/Number(cost)*100)>=0?'+':''}${((value-Number(cost))/Number(cost)*100).toFixed(1)}%` : '--';
let marketData = null, newsData = [], quotes = {}, period = 'today';
const tradeKey='fund-portfolio-trades-v1', snapshotKey='fund-portfolio-market-snapshots-v1';
const readArray=k=>{try{const x=JSON.parse(localStorage.getItem(k));return Array.isArray(x)?x:[];}catch{return [];}};
let trades=readArray(tradeKey), snapshots=readArray(snapshotKey), reviewPeriod='week';
const saveTrades=()=>localStorage.setItem(tradeKey,JSON.stringify(trades));
const save = () => localStorage.setItem(key, JSON.stringify(positions));
const alertBox = (msg, warn = false) => { const n=$('#notice'); n.textContent=msg; n.classList.toggle('warn',warn); };
const isCurrentMarket = () => marketData?.asOf && dayCN(marketData.asOf) === dayCN(Date.now()) && Number.isFinite(marketData?.index?.value) && marketData?.boards?.length>0;
const isCurrentHoldings = () => positions.length && positions.every(p => p.updatedDate === dayCN(Date.now()));
const validValue = p => Number(p.shares) > 0 && quotes[p.code]?.nav > 0 ? Number(p.shares) * quotes[p.code].nav : Number(p.value || 0);
function renderPositions() {
  const sum = positions.reduce((s,p)=>s+validValue(p),0);
  const verified=positions.filter(p=>/^\d{6}$/.test(p.code)).length;
  const quoted=positions.filter(p=>Number(p.shares)>0 && quotes[p.code]?.nav>0).length;
  const totalCost=positions.reduce((s,p)=>s+(Number(p.cost)||0),0);
  $('#total-value').textContent=moneyHidden ? `累计 ${pct(sum,totalCost)}` : yuan(sum);
  $('#total-sub').textContent=!positions.length?'添加基金或导入个人备份后显示':quoted ? `${quoted} 笔按最新公布净值计算，其余使用手工金额` : '按当前输入金额汇总；输入份额后可按已公布净值估算';
  $('#portfolio-label').textContent=!positions.length?'空白持仓模板':quoted ? `最新公布净值 ${quoted} 笔 · 其余手工金额` : '当前输入的持仓金额';
  $('#verified-count').textContent=`${verified} / ${positions.length}`;
  $('#verified-bar').style.width=`${positions.length?verified/positions.length*100:0}%`;
  const themes={tech:0,global:0,gold:0,dividend:0,other:0};
  positions.forEach(p=>themes[p.theme]=(themes[p.theme]||0)+validValue(p));
  const max=Object.entries(themes).sort((a,b)=>b[1]-a[1])[0];
  const themeNames={tech:'科技集中',global:'海外成长集中',gold:'黄金集中',dividend:'红利集中',other:'其他资产集中'};
  $('#risk-label').textContent=max?.[1] ? themeNames[max[0]] : '暂无持仓';
  $('#risk-sub').textContent=max?.[1] && sum ? `粗分类占比 ${(max[1]/sum*100).toFixed(1)}% · 需核对实际持仓` : '添加持仓后显示';
  for(const account of ['a','b']){
    const list=positions.filter(p=>p.account===account);
    const accountValue=list.reduce((s,p)=>s+validValue(p),0);
    const accountCost=list.reduce((s,p)=>s+(Number(p.cost)||0),0);
    $(`#account-${account}-total`).textContent=moneyHidden?`累计 ${pct(accountValue,accountCost)}`:yuan(accountValue);
    const hasDaily=list.length>0&&list.every(p=>Number(p.shares)>0&&quotes[p.code]?.date===dayCN(Date.now())&&Number.isFinite(quotes[p.code]?.change));
    const daily=hasDaily?list.reduce((sum,p)=>{const value=validValue(p),pct=quotes[p.code].change;return sum+value-value/(1+pct/100);},0):null;
    const prior=hasDaily?list.reduce((sum,p)=>{const value=validValue(p),pct=quotes[p.code].change;return sum+value/(1+pct/100);},0):null;
    $(`#account-${account}-daily`).textContent=hasDaily?`今日净值变动估算 ${moneyHidden?'':`${daily>=0?'+':''}${yuan(daily)} · `}${prior>0?(daily/prior*100).toFixed(2):'--'}%`:'今日盈亏：待全部份额及今日净值公布';
    $(`#account-${account}-rows`).innerHTML=list.length?list.map(p=>{
      const q=quotes[p.code], useNav=Number(p.shares)>0 && q?.nav>0;
      const value=validValue(p), pnl=p.cost!==null&&p.cost!==undefined&&Number.isFinite(Number(p.cost))?value-Number(p.cost):null;
      const dailyMove=useNav&&Number.isFinite(q.change)?value-value/(1+q.change/100):null;
      const displayName=safe(p.name);
      const status=p.code ? (q ? `净值 ${safe(q.date)} · ${q.change>=0?'+':''}${q.change??'--'}%`:'净值加载中') : '代码待确认';
      return `<div class="fund-row"><div title="${displayName}"><span class="fund-name">${displayName}</span><div class="fund-meta">${p.code||'待确认'} · ${status}${useNav?' · 净值估算':' · 手工金额'}</div></div><div class="fund-numbers"><b>${moneyHidden?(pnl===null?'--':pct(value,p.cost)):yuan(value)}</b><small class="${pnl>0?'positive':pnl<0?'negative':''}">${pnl===null?'成本未录入':`累计 ${moneyHidden?'':`${pnl>=0?'+':''}${pnl.toFixed(2)} · `}${pct(value,p.cost)}`}</small>${dailyMove===null?'':`<small class="${dailyMove>=0?'positive':'negative'}">净值日 ${moneyHidden?'':`${dailyMove>=0?'+':''}${dailyMove.toFixed(2)} · `}${q.change>=0?'+':''}${q.change}%</small>`}</div><div class="row-tools"><button class="edit" data-trade="${safe(p.id)}" title="记录买卖">↕</button><button class="edit" data-edit="${safe(p.id)}" title="修改持仓">✎</button></div></div>`;
    }).join(''):'<div class="empty">暂无持仓，点击添加基金。</div>';
  }
  renderAdvice(themes,sum);
  renderPositionAnalysis(themes,sum);
  renderReview();
}
function buildPlan(themes,total){
  const actions=new Map();
  if(!positions.length||!isCurrentMarket()||!isCurrentHoldings())return actions;
  for(const [theme,cap] of [['gold',limits.gold/100],['global',limits.global/100]]){
    const excess=(themes[theme]||0)-cap*total;
    if(excess<100)continue;
    const candidates=positions.filter(p=>p.theme===theme).sort((a,b)=>validValue(b)-validValue(a));
    const target=candidates[0];
    if(!target)continue;
    const amount=Math.min(excess,validValue(target)*.1);
    const rounded=Math.min(Math.floor(validValue(target)/100)*100,Math.round(amount/100)*100);
    if(rounded>=100)actions.set(target.id,{type:'sell',amount:rounded,theme,cap,weight:themes[theme]/total});
  }
  return actions;
}
function themeSignal(p){
  const q=quotes[p.code];
  if(p.theme==='tech'){
    const board=marketData?.boards?.find(x=>x.name==='半导体');
    if(board&&isCurrentMarket()){
      const three=board.three>0?'流入':'流出',five=board.five>0?'流入':'流出';
      return `半导体板块今日主力资金${board.today>0?'流入':'流出'}，近 3 日${three}、近 5 日${five}；这是板块观察，不能当作基金真实持仓。`;
    }
    return '半导体板块行情未就绪，先按主题集中度观察。';
  }
  if(q)return `${q.date} 已公布净值变动 ${q.change>=0?'+':''}${q.change}%（${p.code}）；基金净值与今天盘中价格可能不同步。`;
  if(p.theme==='gold')return '黄金联接基金应结合金价、汇率和跟踪误差；未确认份额时不套用别的基金净值。';
  if(p.theme==='global')return '海外市场与 A 股交易时段不同；今天 A 股资金流不能代表该基金的美股表现。';
  if(p.theme==='dividend')return '红利低波策略关注股息和估值，单日涨跌不构成停投或加仓依据。';
  return '缺少可靠的基金或相关市场趋势，优先观察仓位变化。';
}
function renderPositionAnalysis(themes,total){
  const plan=buildPlan(themes,total);
  $('#analysis-time').textContent=isCurrentMarket()&&isCurrentHoldings()?`行情 ${fmtDate(marketData.asOf)} · 今日金额已核对`:'行情或持仓金额未核对到今日 · 仅观察';
  $('#position-analysis-list').innerHTML=positions.length?positions.map(p=>{
    const value=validValue(p),share=total?value/total:0,themeShare=total?(themes[p.theme]||0)/total:0;
    const action=plan.get(p.id);
    const label=action?`参考卖出 ${moneyHidden?`${(action.amount/value*100).toFixed(1)}% 持仓`:yuan(action.amount)}`:'按兵不动';
    const reason=action?`仓位依据：${p.theme==='gold'?'黄金':'海外成长'}主题占组合 ${(themeShare*100).toFixed(1)}%，高于你设置的 ${(action.cap*100).toFixed(0)}% 提醒线 ${((themeShare-action.cap)*100).toFixed(1)} 个百分点。为控制一次性择时风险，先从该主题金额最大的一笔测算 ${moneyHidden?`${(action.amount/value*100).toFixed(1)}%`:yuan(action.amount)}，不超过本笔 10%；并不代表卖出后立即回到上限。`:`仓位依据：这笔占组合 ${(share*100).toFixed(1)}%，${p.theme==='gold'||p.theme==='global'?`所属主题占比 ${(themeShare*100).toFixed(1)}%；${themeShare>(limits[p.theme]||100)/100?'同主题优先处理最大一笔，其余暂时不动。':'未越过你设定的提醒线。'}`:'该主题尚未设置机械交易触发线。'}仅凭单日涨跌或历史亏损不建议补仓或止损。`;
    const pending=trades.filter(t=>t.positionId===p.id&&t.status==='pending'&&t.action!=='hold');
    const pendingText=pending.length?`已有 ${pending.length} 笔待确认下单；正式持仓仍按上次核对金额计算。`:'';
    return `<article class="panel analysis-item"><div class="analysis-item-head"><div><span class="account-kicker">${p.account==='a'?'账户 01':'账户 02'} · ${p.code||'份额代码待核实'}</span><h3>${safe(p.name)}</h3></div><span class="decision ${action?'decision-sell':'decision-hold'}">${safe(label)}</span></div><p>${safe(reason)}</p><p>行情依据：${safe(themeSignal(p))}</p><p>执行前核对：${p.code?'基金代码、交易费率、持有期和可用份额。':'基金代码及份额类别尚未确认，先核对基金全名和交易费率。'}${safe(pendingText)}</p><div class="analysis-foot"><span>单笔占比 ${(share*100).toFixed(1)}%</span><span>累计收益率 ${pct(value,p.cost)}</span></div><div class="analysis-actions"><button type="button" data-trade="${safe(p.id)}" data-action="buy">记录买入</button><button type="button" data-trade="${safe(p.id)}" data-action="sell">记录卖出</button><button type="button" data-trade="${safe(p.id)}" data-action="hold">记录按兵不动</button></div></article>`;
  }).join(''):'<div class="panel empty">还没有持仓。添加基金和当前金额后，这里会逐笔生成分析。</div>';
}
function renderAdvice(themes,total){
  const plan=buildPlan(themes,total);
  const sales=positions.filter(p=>plan.has(p.id)).map(p=>({p,...plan.get(p.id)}));
  const amount=sales.reduce((sum,x)=>sum+x.amount,0);
  const stale=!isCurrentMarket()||!isCurrentHoldings();
  $('#action-status').textContent=!positions.length?'先添加持仓':stale?'今日行情未就绪 · 暂不执行':sales.length?'集中度触发分批再平衡参考':'维持长期计划';
  const lines=sales.map(x=>`${safe(x.p.name)}：参考卖出 ${moneyHidden?`${(x.amount/validValue(x.p)*100).toFixed(1)}% 持仓`:yuan(x.amount)}。`).join('<br>');
  const summary=!positions.length?'分享版默认没有个人持仓。请添加基金或导入自己的 JSON / JPG 图片。':stale?'今日行情或持仓金额尚未核对到今天。可以阅读逐笔分析；更新金额后点击“确认今日金额”，再看当日金额参考。':sales.length?`今日再平衡测算：${lines}新增买入、转换均无建议动作；${moneyHidden?'卖出比例见上方':'参考卖出合计 '+yuan(amount)}。卖出只是集中风险的分批控制，并非预测短期下跌；是否执行还取决于赎回费、持有期和现金需求。`:'当前仓位未触发分批再平衡规则。新增买入、卖出、转换均无建议动作；原定投计划按你的现金预算执行。';
  $('#action-detail').innerHTML=`<p>${summary}</p><p>金额按你当前输入的持仓市值测算，份额不是决定仓位占比的必要条件。代码不确定的基金只用名称和主题做粗分类，不使用错误净值。年化 20% 和本金不亏损都无法保证。</p>`;
  for(const account of ['a','b'])$('#account-'+account+'-action').innerHTML='<b>逐笔分析见下方</b><br>先看每笔依据，再看总体调仓。';
}
function renderMarket(){
  const d=marketData;if(!d)return;
  $('#market-time').textContent=`行情 ${fmtDate(d.asOf)} · ${isCurrentMarket()?'今日':'非今日'}`;
  $('#sh-index').textContent=d.index.value?.toFixed(2)??'--';
  $('#sh-change').textContent=d.index.change==null?'--':`${d.index.change>=0?'+':''}${d.index.change.toFixed(2)}%`;
  $('#sh-change').className=d.index.change>=0?'up':'down';
  $('#turnover').textContent=d.turnover?`${(d.turnover/1e12).toFixed(2)} 万亿`:'--';
  $('#volume').textContent=d.volumeShares?`成交量 ${(d.volumeShares/1e8).toFixed(1)} 亿股 · 不含北交所`:'成交量暂无数据';
  $('#market-net').textContent=d.marketNet===null?'数据缺失':shortMoney(d.marketNet);
  $('#market-net').className=d.marketNet>0?'up':d.marketNet<0?'down':'';
  $('#market-net-note').textContent=d.marketNet===null?'净额汇总失败，未显示猜测值':d.marketNetCount?`${d.marketNetCount} 只个股汇总估算 · ${fmtDate(d.marketNetTime)}`:`${d.marketNetNote||'指数资金净额估算'} · ${fmtDate(d.marketNetTime)}`;
  $('#mood').textContent=d.mood;
  $('#breadth').textContent=d.breadth==null?'样本不足':`板块上涨占比 ${(d.breadth*100).toFixed(0)}% · 非官方情绪指标`;
  $('#heat-pointer').style.left=`calc(${Math.max(2,Math.min(97,(d.breadth||.5)*100))}% - 8px)`;
  renderFlow();
  const fresh=isCurrentMarket();
  const ranked=[...d.boards].filter(x=>Number.isFinite(x[period])).sort((a,b)=>b[period]-a[period]);
  const top=ranked[0], bottom=ranked.at(-1);
  $('#market-insight').textContent=!fresh?`行情或板块数据未完整更新到今天（最近时间 ${fmtDate(d.asOf)}）。可查看已取得的指标，暂不据此做今日交易决定。`:`上证指数 ${d.index.change>=0?'上涨':'下跌'} ${Math.abs(d.index.change||0).toFixed(2)}%，板块上涨占比 ${((d.breadth||0)*100).toFixed(0)}%，情绪判断为“${d.mood}”。${top?`${top.name}资金流入较多，${bottom.name}流出较多。`:''}板块净流向与指数表现可能背离，需观察多日持续性。`;
  $('#flow-reason').textContent=top&&bottom?`当前选定区间内，${top.name}净流入 ${shortMoney(top[period])}，${bottom.name}净流出 ${shortMoney(bottom[period])}。观察 3 日、5 日是否同向；板块重叠及口径限制需保留。`:'等待资金流数据。';
  renderPositions();
}
function renderFlow(){
  if(!marketData)return;
  const all=marketData.boards.filter(x=>Number.isFinite(x[period]));
  const incoming=[...all].filter(x=>x[period]>0).sort((a,b)=>b[period]-a[period]).slice(0,5);
  const outgoing=[...all].filter(x=>x[period]<0).sort((a,b)=>a[period]-b[period]).slice(0,5);
  const draw=(items,into,mode)=>{const max=Math.max(...items.map(x=>Math.abs(x[period])),1);$(into).innerHTML=items.length?items.map(x=>`<div class="bar-item" title="${safe(x.name)}"><span class="bar-name">${safe(x.name)}</span><div class="bar-track"><span class="bar-fill ${mode}" style="width:${Math.max(4,Math.abs(x[period])/max*100)}%"></span></div><span class="bar-val ${mode==='in'?'positive':'negative'}">${shortMoney(x[period])}</span></div>`).join(''):'该区间暂无可用板块数据';};
  draw(incoming,'#inflow','in');draw(outgoing,'#outflow','out');
}
function renderNews(){
  $('#news-time').textContent=newsData.length?`已获取 ${newsData.length} 条`:'暂无可用新闻';
  $('#news-list').innerHTML=newsData.length?newsData.map(n=>`<a class="panel news-item" href="${safe(n.link)}" target="_blank" rel="noopener noreferrer"><div class="news-head"><span>${safe(n.topic)} · ${safe(n.date?new Date(n.date).toLocaleDateString('zh-CN'):'日期未知')}</span><span class="external" aria-label="打开原文">↗</span></div><h3>${safe(n.title)}</h3><p>${safe(n.summary||'点击阅读原文')}</p></a>`).join(''):'<div class="panel empty">新闻源暂不可用。可点击刷新重试。</div>';
}
async function api(path){const r=await fetch(path);const data=await r.json();if(!r.ok)throw new Error(data.error||`HTTP ${r.status}`);return data;}
let jsonpId=0;
function jsonp(url){
  return new Promise((resolve,reject)=>{
    const name=`fundAtlasJsonp${++jsonpId}`;
    const script=document.createElement('script');
    const timer=setTimeout(()=>finish(new Error('行情源超时')),9000);
    const finish=(error,value)=>{clearTimeout(timer);delete window[name];script.remove();error?reject(error):resolve(value);};
    window[name]=value=>finish(null,value);
    script.onerror=()=>finish(new Error('行情脚本加载失败'));
    script.src=`${url}${url.includes('?')?'&':'?'}cb=${name}`;
    document.head.appendChild(script);
  });
}
async function browserEast(path){
  let last;
  for(const host of ['push2.eastmoney.com','push2delay.eastmoney.com']){
    try{const value=await jsonp(`https://${host}${path}`);if(value?.rc===0&&value.data)return value.data;throw new Error('行情结构无效');}catch(error){last=error;}
  }
  throw last;
}
async function browserMarket(){
  const fields='f43,f47,f48,f57,f58,f60,f86,f170';
  const boardBase='/api/qt/clist/get?po=1&np=1&fltt=2&fid=f62&fs=m:90+t:2&fields=f12,f14,f2,f3,f62,f124,f164,f174';
  const [sh,sz,first,flowResult]=await Promise.all([
    browserEast(`/api/qt/stock/get?secid=1.000001&fields=${fields}`),
    browserEast(`/api/qt/stock/get?secid=0.399001&fields=${fields}`),
    browserEast(`${boardBase}&pn=1&pz=100`),
    browserEast('/api/qt/ulist.np/get?fltt=2&secids=1.000001,0.399106&fields=f12,f14,f62,f184').catch(()=>null)
  ]);
  const total=Number(first.total);
  if(!Number.isInteger(total)||total<1||total>1000)throw new Error('板块数量异常');
  const rest=await Promise.all(Array.from({length:Math.ceil(total/100)-1},(_,i)=>browserEast(`${boardBase}&pn=${i+2}&pz=100`)));
  const rows=[first,...rest].flatMap(p=>Array.isArray(p.diff)?p.diff:Object.values(p.diff||{}));
  if(rows.length<total*.99)throw new Error('板块数据缺页');
  const num=x=>Number.isFinite(Number(x))?Number(x):null;
  const boards=rows.map(b=>({code:b.f12,name:b.f14,change:num(b.f3),today:num(b.f62),three:num(b.f164),five:num(b.f174),time:b.f124?new Date(b.f124*1000).toISOString():null})).filter(x=>x.name&&x.today!==null);
  const breadth=boards.length?boards.filter(x=>x.change>0).length/boards.length:null;
  const flow=flowResult?.diff||[];
  return {asOf:sh.f86?new Date(sh.f86*1000).toISOString():null,receivedAt:new Date().toISOString(),index:{value:num(sh.f43)!==null?sh.f43/100:null,change:num(sh.f170)!==null?sh.f170/100:null},turnover:(num(sh.f48)||0)+(num(sz.f48)||0),volumeShares:((num(sh.f47)||0)+(num(sz.f47)||0))*100,mood:breadth===null?'待判断':breadth>.72?'偏热':breadth<.28?'偏冷':'中性',breadth,boards,marketNet:flow.length===2?flow.reduce((s,x)=>s+(Number(x.f62)||0),0):null,marketNetCount:null,marketNetTime:sh.f86?new Date(sh.f86*1000).toISOString():null,marketNetNote:'沪深综指主力净额相加估算，不含北交所',partial:false,source:'浏览器直连行情源'};
}
async function refresh(){
  $('#refresh').disabled=true;alertBox('正在更新行情、基金净值和新闻…');
  const codes=[...new Set(positions.map(p=>p.code).filter(x=>/^\d{6}$/.test(x)))];
  const marketRequest=window.__PUBLIC_TEMPLATE__?browserMarket().catch(()=>api('/api/market')):api('/api/market');
  const [m,n,...funds]=await Promise.allSettled([marketRequest,api('/api/news'),...codes.map(c=>api(`/api/fund?code=${c}`))]);
  marketData=m.status==='fulfilled'?m.value:null;
  if(!marketData||marketData.partial||!marketData.boards?.length){try{marketData=await browserMarket();}catch{/* 保留上游返回的部分数据 */}}
  if(marketData?.index?.value&&marketData.asOf){const date=dayCN(marketData.asOf);snapshots=snapshots.filter(x=>x.date!==date);snapshots.push({date,index:marketData.index.value,change:marketData.index.change});snapshots=snapshots.sort((a,b)=>a.date.localeCompare(b.date)).slice(-370);localStorage.setItem(snapshotKey,JSON.stringify(snapshots));}
  if(marketData)renderMarket();else $('#market-time').textContent='行情连接失败';
  if(n.status==='fulfilled'){newsData=n.value.items||[];renderNews();} else {newsData=[];renderNews();}
  funds.forEach((result,i)=>{if(result.status==='fulfilled')quotes[codes[i]]=result.value;});
  renderPositions();
  const errors=[n,...funds].filter(x=>x.status==='rejected').length+(!marketData||marketData.partial?1:0);
  alertBox(errors||marketData?.partial?`已更新部分数据；${errors + (marketData?.partial?1:0)} 项数据源暂不可用。请查看各项时间标记。`:`数据已更新。行情 ${fmtDate(marketData?.asOf)}；基金净值按各基金公布日期显示。`,!!errors||!!marketData?.partial||!isCurrentMarket());
  $('#refresh').disabled=false;
}
function openTrade(p,action='buy'){
  if(!p)return;
  $('#trade-position-id').value=p.id;$('#trade-title').textContent=`记录${action==='buy'?'买入':action==='sell'?'卖出':'按兵不动'}`;$('#trade-position').textContent=`${p.name} · 当前已确认金额 ${shownMoney(validValue(p))}`;
  $('#trade-action').value=action;$('#trade-amount').value='';$('#trade-fraction').value='';
  const beijingNow=new Date(Date.now()+8*3600e3).toISOString().slice(0,16);$('#trade-time').value=beijingNow;
  $('#trade-cutoff').value=beijingCutoff(beijingNow);
  $('#trade-dialog').showModal();
}
const tradeName=x=>({buy:'买入',sell:'卖出',hold:'按兵不动'})[x]||x;
function beijingCutoff(value){const [date,clock]=value.split('T'),[year,month,day]=date.split('-').map(Number),weekday=new Date(Date.UTC(year,month-1,day)).getUTCDay();return weekday!==0&&weekday!==6&&clock<'15:00'?'before':'after';}
function renderReview(){
  const ordered=[...trades].sort((a,b)=>b.time.localeCompare(a.time));
  $('#trade-list').innerHTML=ordered.length?ordered.map(t=>`<div class="trade-entry"><div><b>${safe(t.name)}</b><small>${safe(fmtDate(t.time))} · ${t.cutoff==='before'?'15:00 前':'15:00 后 / 非交易日'} · ${t.status==='confirmed'?'已确认':t.status==='cancelled'?'已撤销':'待确认'}</small></div><div><strong>${tradeName(t.action)} ${t.action==='hold'?'':moneyHidden?`${((t.fraction||0)*100).toFixed(0)}%`:yuan(t.amount)}</strong>${t.status==='pending'&&t.action!=='hold'?`<button type="button" data-confirm-trade="${safe(t.id)}">确认结果</button>`:''}${t.status==='pending'?`<button type="button" data-cancel-trade="${safe(t.id)}">撤销记录</button>`:''}</div></div>`).join(''):'<div class="empty">还没有交易记录。逐笔分析里的按钮可记录买入、卖出或按兵不动。</div>';
  const now=Date.now(),start=reviewPeriod==='week'?now-7*864e5:reviewPeriod==='month'?now-30*864e5:0;
  const selected=reviewPeriod==='since'?ordered.filter(t=>t.action==='sell'&&t.status!=='cancelled'):ordered.filter(t=>new Date(t.time).getTime()>=start&&t.status!=='cancelled');
  const buys=selected.filter(t=>t.action==='buy'),sells=selected.filter(t=>t.action==='sell'),holds=selected.filter(t=>t.action==='hold');
  const buySum=buys.reduce((s,t)=>s+t.amount,0),sellSum=sells.reduce((s,t)=>s+t.amount,0);
  let comparison='缺少覆盖期初与期末的行情快照，暂不能计算市场区间涨跌。';
  if(reviewPeriod==='since'&&sells.length){
    comparison=sells.map(t=>{const q=quotes[t.code],before=Number(t.nav),after=Number(q?.nav);return `<p>${safe(t.name)}：${before>0&&after>0&&q.date&&q.date>=dayCN(t.time)?`卖出记录净值至 ${safe(q.date)} 变动 ${((after/before-1)*100).toFixed(2)}%（未计费用和分红）`:'卖出时或当前净值缺失，暂无法做卖后走势比较'}。</p>`;}).join('');
  }else if(reviewPeriod!=='since'){
    const range=snapshots.filter(x=>new Date(x.date).getTime()>=start);if(range.length>=2)comparison=`保存的上证指数快照：${range[0].date} 至 ${range.at(-1).date}，变动 ${((range.at(-1).index/range[0].index-1)*100).toFixed(2)}%。这是市场背景，不是组合收益。`;
  }
  $('#review-report').innerHTML=`<h3>${reviewPeriod==='week'?'近 7 日':reviewPeriod==='month'?'近 30 日':'全部卖出记录'}复盘</h3><div class="review-stats"><span>买入 <b>${buys.length}</b> 笔</span><span>卖出 <b>${sells.length}</b> 笔</span><span>按兵不动 <b>${holds.length}</b> 笔</span></div><p>${selected.length?`记录的买入 ${moneyHidden?'已隐藏金额':yuan(buySum)}、卖出 ${moneyHidden?'已隐藏金额':yuan(sellSum)}；净投入 ${moneyHidden?'已隐藏金额':yuan(buySum-sellSum)}。其中待确认订单不等于实际成交。`:'此期间没有相关记录。'}</p><div class="review-comparison">${comparison}</div><p>复盘提示：对照交易时的理由、成本和后续走势判断过程是否一致；没有完整每日组合市值与现金流时，不计算虚假的策略收益率。</p>`;
}
document.addEventListener('click',e=>{
  const b=e.target.closest('[data-trade]');if(b)openTrade(positions.find(p=>p.id===b.dataset.trade),b.dataset.action||'buy');
  const c=e.target.closest('[data-confirm-trade]');if(c){const t=trades.find(x=>x.id===c.dataset.confirmTrade),p=positions.find(x=>x.id===t?.positionId);if(!t||!p)return;const entered=prompt(`请根据交易平台填写 ${p.name} 确认后的最新持仓金额（元）。下单金额可能受净值、手续费影响。`,String(p.value));if(entered===null)return;const next=Number(entered);if(!Number.isFinite(next)||next<0)return alert('请输入有效金额。');const enteredCost=prompt('请填写平台显示的确认后累计成本（元）；不知道可留空，页面不会猜测卖出成本。',p.cost==null?'':String(p.cost));if(enteredCost===null)return;const nextCost=enteredCost.trim()===''?null:Number(enteredCost);if(nextCost!==null&&(!Number.isFinite(nextCost)||nextCost<0))return alert('累计成本必须是非负数。');p.value=next;p.cost=nextCost;p.shares=null;p.updatedDate=dayCN(Date.now());t.status='confirmed';t.confirmedAt=new Date().toISOString();t.confirmedValue=next;save();saveTrades();renderPositions();}
  const d=e.target.closest('[data-cancel-trade]');if(d){const t=trades.find(x=>x.id===d.dataset.cancelTrade);if(t&&confirm('仅撤销这条下单记录？')){t.status='cancelled';saveTrades();renderReview();}}
});
$('#close-trade').onclick=$('#cancel-trade').onclick=()=>$('#trade-dialog').close();
$('#trade-action').addEventListener('change',()=>{$('#trade-title').textContent=`记录${tradeName($('#trade-action').value)}`;});
$('#trade-fraction').addEventListener('change',()=>{if($('#trade-fraction').value)$('#trade-amount').value='';});
$('#trade-amount').addEventListener('input',()=>{if($('#trade-amount').value)$('#trade-fraction').value='';});
$('#trade-time').addEventListener('change',()=>{$('#trade-cutoff').value=beijingCutoff($('#trade-time').value);});
$('#trade-form').addEventListener('submit',e=>{e.preventDefault();const p=positions.find(x=>x.id===$('#trade-position-id').value);if(!p)return;const action=$('#trade-action').value,fraction=Number($('#trade-fraction').value)||null,amount=action==='hold'?0:fraction?Math.round(validValue(p)*fraction*100)/100:Number($('#trade-amount').value);if(action!=='hold'&&(!Number.isFinite(amount)||amount<=0))return alert('请输入买卖金额或选择比例。');if(action==='sell'&&amount>validValue(p))return alert('卖出金额不能超过目前记录的持仓金额。');const time=new Date(`${$('#trade-time').value}+08:00`);if(!Number.isFinite(time.getTime()))return alert('请填写下单时间。');const q=quotes[p.code];trades.push({id:crypto.randomUUID(),positionId:p.id,name:p.name,code:p.code,account:p.account,action,amount,fraction:fraction||amount/Math.max(1,validValue(p)),time:time.toISOString(),cutoff:$('#trade-cutoff').value,status:action==='hold'?'confirmed':'pending',nav:q?.nav||null,navDate:q?.date||null,recordedAt:new Date().toISOString()});saveTrades();$('#trade-dialog').close();renderReview();renderPositions();alertBox('操作已记录；买卖待平台确认，正式持仓金额尚未更改。');});
document.querySelectorAll('[data-review]').forEach(b=>b.addEventListener('click',()=>{reviewPeriod=b.dataset.review;document.querySelectorAll('[data-review]').forEach(x=>x.classList.toggle('selected',x===b));renderReview();}));
function fillDialog(p){
  if(moneyHidden){alert('请先点击“显示金额”，再编辑持仓。');return;}
  $('#field-id').value=p?.id||'';$('#field-account').value=p?.account||'a';$('#field-code').value=p?.code||'';$('#field-name').value=p?.name||'';$('#field-value').value=p?.value??'';$('#field-cost').value=p?.cost??'';$('#field-shares').value=p?.shares??'';$('#field-theme').value=p?.theme||'other';$('#dialog-title').textContent=p?'修改持仓':'添加基金';$('#fund-search-results').innerHTML='';$('#fund-dialog').showModal();
}
let searchTimer;
$('#field-code').addEventListener('input',()=>{clearTimeout(searchTimer);const q=$('#field-code').value.trim();$('#fund-search-results').innerHTML='';if(q.length<2)return;searchTimer=setTimeout(async()=>{try{const data=await api(`/api/search?q=${encodeURIComponent(q)}`);$('#fund-search-results').innerHTML=data.items.map(x=>`<button type="button" data-code="${safe(x.code)}" data-name="${safe(x.name)}">${safe(x.code)} · ${safe(x.name)}</button>`).join('')||'<small>没有找到匹配基金，请核对代码。</small>';}catch{$('#fund-search-results').textContent='搜索暂不可用，请稍后重试。';}},300);});
$('#fund-search-results').addEventListener('click',e=>{const b=e.target.closest('button[data-code]');if(!b)return;$('#field-code').value=b.dataset.code;$('#field-name').value=b.dataset.name;$('#fund-search-results').innerHTML='';});
$('#add-open').addEventListener('click',()=>fillDialog(null));
$('#confirm-values').addEventListener('click',()=>{if(!positions.length)return alert('请先添加持仓。');if(moneyHidden)return alert('请先显示金额并核对，再确认今日持仓。');if(!confirm('已核对所有持仓金额与今天的交易平台一致？'))return;positions=positions.map(p=>({...p,updatedDate:dayCN(Date.now())}));save();renderPositions();});
$('#cancel-dialog').addEventListener('click',()=>$('#fund-dialog').close());
$('#close-dialog').addEventListener('click',()=>$('#fund-dialog').close());
document.addEventListener('click',e=>{const b=e.target.closest('[data-edit]');if(b)fillDialog(positions.find(p=>p.id===b.dataset.edit));});
$('#fund-form').addEventListener('submit',async e=>{
  e.preventDefault();
  const code=$('#field-code').value.trim();
  if(code&&!/^\d{6}$/.test(code)){alert('基金代码必须是六位数字；未确认时请留空。');return;}
  const id=$('#field-id').value||crypto.randomUUID();
  const old=positions.find(p=>p.id===id)||{};
  const p={...old,id,account:$('#field-account').value,code,name:$('#field-name').value.trim(),value:Number($('#field-value').value),cost:$('#field-cost').value===''?null:Number($('#field-cost').value),shares:$('#field-shares').value===''?null:Number($('#field-shares').value),theme:$('#field-theme').value,note:old.note||'手工录入',updatedDate:dayCN(Date.now())};
  if(!p.name||!Number.isFinite(p.value)||p.value<0){alert('请填写基金名称和有效金额。');return;}
  if(code){try{const q=await api(`/api/fund?code=${code}`);quotes[code]=q;p.name=q.name;}catch{alert('基金代码未能核验，请从搜索结果中选择或稍后重试。');return;}}
  const i=positions.findIndex(x=>x.id===id);if(i<0)positions.push(p);else positions[i]=p;
  save();$('#fund-dialog').close();renderPositions();
});
$('#fund-dialog').addEventListener('keydown',e=>{if(e.key==='Delete'&&$('#field-id').value&&e.target.tagName!=='INPUT'){if(confirm('删除这笔持仓？')){positions=positions.filter(p=>p.id!==$('#field-id').value);save();$('#fund-dialog').close();renderPositions();}}});
const deleteButton=document.createElement('button');deleteButton.type='button';deleteButton.className='secondary';deleteButton.textContent='删除这笔持仓';deleteButton.id='delete-position';deleteButton.style.marginRight='auto';$('.dialog-actions').prepend(deleteButton);
deleteButton.addEventListener('click',()=>{const id=$('#field-id').value;if(!id)return;if(confirm('删除这笔持仓？')){positions=positions.filter(p=>p.id!==id);save();$('#fund-dialog').close();renderPositions();}});
$('#fund-dialog').addEventListener('close',()=>{deleteButton.style.visibility='visible';});
document.querySelectorAll('[data-period]').forEach(b=>b.addEventListener('click',()=>{period=b.dataset.period;document.querySelectorAll('[data-period]').forEach(x=>x.classList.toggle('selected',x===b));renderFlow();if(marketData)renderMarket();}));
$('#refresh').addEventListener('click',refresh);
for(const theme of ['gold','global']){
  const input=$(`#${theme}-limit`);input.value=limits[theme];
  input.addEventListener('change',()=>{limits[theme]=Math.max(5,Math.min(80,Number(input.value)||limits[theme]));input.value=limits[theme];localStorage.setItem('fund-portfolio-limits',JSON.stringify(limits));renderPositions();});
}
function updatePrivacyButton(){const b=$('#privacy-toggle');b.textContent=moneyHidden?'◎ 显示金额':'◉ 隐藏金额';b.setAttribute('aria-pressed',String(moneyHidden));}
$('#privacy-toggle').addEventListener('click',()=>{moneyHidden=!moneyHidden;localStorage.setItem('fund-portfolio-hide-money',String(moneyHidden));updatePrivacyButton();renderPositions();});
updatePrivacyButton();
$('#export-data').addEventListener('click',()=>{const blob=new Blob([JSON.stringify({version:2,exportedAt:new Date().toISOString(),positions,trades,snapshots,limits},null,2)],{type:'application/json'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='基金持仓与交易完整备份.json';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);});
$('#import-data').addEventListener('click',()=>$('#import-file').click());
function parseImageRows(text){
  const lines=text.split(/\r?\n/).map(s=>s.trim()).filter(Boolean),rows=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];if(!/[\u4e00-\u9fa5]{2,}/.test(line)||!/(基金|指数|黄金|红利|纳斯达克|标普|科技|成长|制造|混|联接|ETF|QDII)/i.test(line)||/(资产|收益|排名|成交|数据|持仓|金额|全部|累计)/.test(line))continue;
    const windowLines=lines.slice(i+1,i+4).join(' '),money=(windowLines.match(/(?:[¥￥]\s*)?(\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?|\d{2,6}\.\d{2})(?!\d)/)||[])[1];
    if(!money)continue;const value=Number(money.replace(/,/g,''));if(value<=0||value>1e8)continue;
    const name=line.replace(/^[^\u4e00-\u9fa5A-Za-z]+/,'').replace(/\s*[¥￥].*$/,'').trim();
    if(name.length<4)continue;rows.push({account:'a',name,code:(line.match(/(?:^|\D)(\d{6})(?:\D|$)/)||[])[1]||'',value,theme:/黄金/.test(name)?'gold':/纳斯达克|标普|全球|QDII/i.test(name)?'global':/红利|低波/.test(name)?'dividend':/芯片|半导体|科技|人工智能|制造/i.test(name)?'tech':'other'});i+=1;
  }
  return rows;
}
function imageEntry(r={account:'a',name:'',code:'',value:'',theme:'other'}){return `<div class="image-entry"><button type="button" data-remove-image aria-label="删除此行">×</button><input aria-label="基金名称" placeholder="基金名称" value="${safe(r.name)}" data-image-name><input aria-label="基金代码" maxlength="6" placeholder="代码可留空" value="${safe(r.code)}" data-image-code><input aria-label="金额" type="number" min="0" step="0.01" placeholder="金额" value="${r.value}" data-image-value><select aria-label="账户" data-image-account><option value="a" ${r.account==='a'?'selected':''}>账户 01</option><option value="b" ${r.account==='b'?'selected':''}>账户 02</option></select><select aria-label="主题" data-image-theme>${[['tech','科技'],['global','海外'],['gold','黄金'],['dividend','红利'],['other','其他']].map(([v,n])=>`<option value="${v}" ${r.theme===v?'selected':''}>${n}</option>`).join('')}</select></div>`;}
function showImageRows(rows){$('#image-rows').innerHTML=rows.length?rows.map(imageEntry).join(''):'<div class="empty">没有可靠识别出持仓行。点击“补录一行”手动填写，或取消后用“添加基金”逐笔录入。</div>';}
async function loadOcr(){if(window.Tesseract)return;await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/tesseract.js@6/dist/tesseract.min.js';s.onload=resolve;s.onerror=()=>reject(new Error('中文识别组件加载失败，请检查网络或改用 JSON 导入'));document.head.appendChild(s);});}
async function importImage(file){
  $('#image-dialog').showModal();$('#image-status').textContent='正在加载中文识别组件并识别图片…';showImageRows([]);
  try{await loadOcr();const worker=await window.Tesseract.createWorker('chi_sim+eng',1);let result;try{result=await worker.recognize(file);}finally{await worker.terminate();}const rows=parseImageRows(result.data.text||'');showImageRows(rows);$('#image-status').textContent=`识别出 ${rows.length} 行候选。截图常截断基金名称或混淆金额，请按原图逐行核对；可修改后导入。`;
  }catch(error){$('#image-status').textContent=`图片识别失败：${error?.message||'图片可能损坏或中文识别资源未能加载'}。可点击“补录一行”手动添加。`;}
}
$('#image-rows').addEventListener('click',e=>{const b=e.target.closest('[data-remove-image]');if(b)b.closest('.image-entry').remove();});
$('#add-image-row').addEventListener('click',()=>{$('#image-rows').querySelector('.empty')?.remove();$('#image-rows').insertAdjacentHTML('beforeend',imageEntry());});
$('#close-image').onclick=$('#cancel-image').onclick=()=>$('#image-dialog').close();
$('#save-image').addEventListener('click',()=>{const rows=[...document.querySelectorAll('.image-entry')].map(el=>({name:el.querySelector('[data-image-name]').value.trim(),code:el.querySelector('[data-image-code]').value.trim(),value:Number(el.querySelector('[data-image-value]').value),account:el.querySelector('[data-image-account]').value,theme:el.querySelector('[data-image-theme]').value}));if(!rows.length)return alert('没有可导入的持仓行。');if(rows.some(r=>!r.name||!Number.isFinite(r.value)||r.value<0||(r.code&&!/^\d{6}$/.test(r.code))))return alert('请核对每行基金名称、金额和六位代码。');if(!confirm(`将 ${rows.length} 笔持仓添加到当前浏览器？请确认没有重复录入。`))return;positions.push(...rows.map(r=>({...r,id:crypto.randomUUID(),cost:null,shares:null,note:'图片 OCR 录入，待核对',updatedDate:dayCN(Date.now())})));save();$('#image-dialog').close();renderPositions();refresh();alertBox(`已导入 ${rows.length} 笔；请逐笔核对基金代码和金额。`);});
$('#import-file').addEventListener('change',async e=>{const f=e.target.files[0];if(!f)return;try{if(/^image\/(jpeg|png)$/.test(f.type)||/\.(jpe?g|png)$/i.test(f.name)){await importImage(f);}else{const j=JSON.parse(await f.text());if(!Array.isArray(j.positions)||!j.positions.every(p=>['a','b'].includes(p.account)&&typeof p.name==='string'&&Number.isFinite(Number(p.value))))throw new Error('文件格式不符');if(!confirm('导入 JSON 将覆盖当前持仓和交易记录，继续吗？'))return;positions=j.positions;trades=Array.isArray(j.trades)?j.trades:[];snapshots=Array.isArray(j.snapshots)?j.snapshots:[];save();saveTrades();localStorage.setItem(snapshotKey,JSON.stringify(snapshots));renderPositions();refresh();alertBox('持仓与交易备份已导入。');}}catch(err){alert(`导入失败：${err.message}`);}e.target.value='';});
setInterval(()=>{$('#clock').textContent=new Date().toLocaleTimeString('zh-CN',{timeZone:'Asia/Shanghai',hour12:false});},1000);
renderPositions();refresh();setInterval(refresh,5*60*1000);

