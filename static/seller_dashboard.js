// (function(){
//   const h = new Date().getHours();
//   const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
//   document.getElementById('greeting').textContent = `${greet}, Ramesh 👋`;
//   document.getElementById('dateLabel').textContent = new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
// })();

// /* ===== Sales chart ===== */
// const chartData = {
//   '7d': {
//     labels:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
//     values:[2100,1800,2900,2400,3200,4100,3840]
//   },
//   '30d': {
//     labels:['Jul 1','Jul 5','Jul 9','Jul 13','Jul 17','Jul 21','Jul 25','Jul 29','Today'],
//     values:[4200,5800,4900,7200,6100,8400,7800,9100,10200]
//   },
//   '90d': {
//     labels:['May','Early Jun','Mid Jun','Late Jun','Early Jul','Mid Jul','Today'],
//     values:[18000,22000,19500,26000,24000,30000,35000]
//   }
// };

// let currentPeriod = '30d';
// const canvas = document.getElementById('salesChart');
// const ctx = canvas.getContext('2d');

// function drawChart(period){
//   const data = chartData[period];
//   const dpr = window.devicePixelRatio || 1;
//   const w = canvas.parentElement.clientWidth - 44;
//   const h = 220;
//   canvas.style.width = w + 'px';
//   canvas.style.height = h + 'px';
//   canvas.width = w * dpr;
//   canvas.height = h * dpr;
//   ctx.scale(dpr, dpr);

//   const padL=40, padR=16, padT=16, padB=40;
//   const chartW = w - padL - padR;
//   const chartH = h - padT - padB;

//   const max = Math.max(...data.values) * 1.15;
//   const pts = data.values.map((v,i)=>({
//     x: padL + (i/(data.values.length-1))*chartW,
//     y: padT + chartH - (v/max)*chartH
//   }));

//   ctx.clearRect(0,0,w,h);

//   // grid lines
//   const ticks = 4;
//   ctx.strokeStyle = '#E1DED2';
//   ctx.lineWidth = 1;
//   for(let i=0;i<=ticks;i++){
//     const y = padT + (i/ticks)*chartH;
//     ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+chartW,y); ctx.stroke();
//     const val = Math.round(max*(1-i/ticks));
//     ctx.fillStyle = '#9A9587';
//     ctx.font = '10px JetBrains Mono, monospace';
//     ctx.textAlign = 'right';
//     ctx.fillText('₹'+(val>=1000?(val/1000).toFixed(1)+'k':val), padL-6, y+4);
//   }

//   // gradient fill
//   const grad = ctx.createLinearGradient(0,padT,0,padT+chartH);
//   grad.addColorStop(0,'rgba(44,74,110,.18)');
//   grad.addColorStop(1,'rgba(44,74,110,0)');
//   ctx.beginPath();
//   ctx.moveTo(pts[0].x, padT+chartH);
//   pts.forEach(p=>ctx.lineTo(p.x,p.y));
//   ctx.lineTo(pts[pts.length-1].x, padT+chartH);
//   ctx.closePath();
//   ctx.fillStyle = grad;
//   ctx.fill();

//   // line
//   ctx.beginPath();
//   ctx.moveTo(pts[0].x,pts[0].y);
//   for(let i=1;i<pts.length;i++){
//     const cp1x = (pts[i-1].x+pts[i].x)/2;
//     ctx.bezierCurveTo(cp1x,pts[i-1].y,cp1x,pts[i].y,pts[i].x,pts[i].y);
//   }
//   ctx.strokeStyle = '#2C4A6E';
//   ctx.lineWidth = 2.5;
//   ctx.lineJoin = 'round';
//   ctx.stroke();

//   // dots
//   pts.forEach((p,i)=>{
//     ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2);
//     ctx.fillStyle = '#2C4A6E'; ctx.fill();
//     ctx.fillStyle = '#FFFFFB'; ctx.beginPath(); ctx.arc(p.x,p.y,2,0,Math.PI*2); ctx.fill();
//   });

//   // x labels
//   ctx.fillStyle = '#9A9587';
//   ctx.font = '11px Inter, sans-serif';
//   ctx.textAlign = 'center';
//   const step = Math.max(1, Math.ceil(data.labels.length/7));
//   data.labels.forEach((l,i)=>{
//     if(i % step === 0 || i === data.labels.length-1)
//       ctx.fillText(l, pts[i].x, padT+chartH+16);
//   });
// }

// function switchChart(period, btn){
//   currentPeriod = period;
//   document.querySelectorAll('.chart-tab').forEach(t=>t.classList.remove('active'));
//   btn.classList.add('active');
//   drawChart(period);
// }

// window.addEventListener('resize', ()=>drawChart(currentPeriod));
// setTimeout(()=>drawChart(currentPeriod), 50);

// /* ===== Recent orders ===== */
// const orders = [
//   { id:'ORD-5821', name:'Priya Sharma', items:'Tata Salt, Moong Dal, Atta', amount:412, status:'new', time:'10 min ago' },
//   { id:'ORD-5820', name:'Suresh Kumar', items:'Amul Ghee, Red Label Tea', amount:544, status:'processing', time:'38 min ago' },
//   { id:'ORD-5819', name:'Meena Reddy', items:'Coca-Cola ×12, Lay\'s ×6', amount:720, status:'delivered', time:'1 hr ago' },
//   { id:'ORD-5818', name:'Vijay Nair', items:'Colgate, Dettol Soap, Oil', amount:378, status:'delivered', time:'2 hr ago' },
//   { id:'ORD-5817', name:'Anita Joshi', items:'Basmati Rice 5 kg', amount:549, status:'cancelled', time:'3 hr ago' },
//   { id:'ORD-5816', name:'Ravi Iyer', items:'Toor Dal, Madhur Sugar', amount:217, status:'delivered', time:'4 hr ago' },
// ];

// const statusLabels = { new:'New', processing:'Processing', delivered:'Delivered', cancelled:'Cancelled' };
// const tbody = document.getElementById('ordersBody');
// tbody.innerHTML = orders.map(o=>`
//   <tr>
//     <td><span class="order-id">${o.id}</span></td>
//     <td>
//       <div class="order-name">${o.name}</div>
//       <div class="order-items">${o.items}</div>
//     </td>
//     <td><span class="order-price">₹${o.amount}</span></td>
//     <td><span class="status-pill ${o.status}"><span class="status-dot"></span>${statusLabels[o.status]}</span></td>
//     <td style="font-size:12px;color:var(--muted);">${o.time}</td>
//   </tr>`).join('');

// /* ===== Top products ===== */
// const topProducts = [
//   { emoji:'🌾', name:'Aashirvaad Atta', sub:'Grocery & Staples', sold:142, revenue:35358 },
//   { emoji:'🧴', name:'Fortune Sunflower Oil', sub:'Edible Oils & Ghee', sold:118, revenue:16756 },
//   { emoji:'🫙', name:'Amul Ghee', sub:'Edible Oils & Ghee', sold:97, revenue:29003 },
//   { emoji:'🍵', name:'Red Label Tea', sub:'Beverages', sold:84, revenue:20580 },
//   { emoji:'🧂', name:'Tata Salt', sub:'Sugar & Salt', sold:76, revenue:2128 },
// ];
// const maxSold = topProducts[0].sold;
// document.getElementById('topProducts').innerHTML = topProducts.map((p,i)=>`
//   <div class="product-row">
//     <span class="prod-rank">${i+1}</span>
//     <div class="prod-icon">${p.emoji}</div>
//     <div class="prod-info">
//       <div class="prod-name">${p.name}</div>
//       <div class="prod-sub">${p.sub}</div>
//     </div>
//     <div style="flex:1;min-width:60px;padding:0 10px;">
//       <div class="prod-bar-track"><div class="prod-bar-fill" style="width:${Math.round(p.sold/maxSold*100)}%"></div></div>
//     </div>
//     <div style="text-align:right;">
//       <div class="prod-revenue">₹${p.revenue.toLocaleString('en-IN')}</div>
//       <div class="prod-sold">${p.sold} sold</div>
//     </div>
//   </div>`).join('');

// /* ===== Stock alerts ===== */
// const stockAlerts = [
//   { name:'Good Knight Refill', cat:'Household', stock:3, out:false },
//   { name:'Moong Dal', cat:'Pulses & Dal', stock:9, out:false },
//   { name:'Maida (Refined Flour)', cat:'Atta & Flour', stock:0, out:true },
//   { name:'Everest Garam Masala', cat:'Blended Masalas', stock:5, out:false },
//   { name:'Fortune Sunflower Oil', cat:'Edible Oils & Ghee', stock:14, out:false },
//   { name:'Real Mixed Fruit Juice', cat:'Juices', stock:0, out:true },
// ];
// document.getElementById('stockAlerts').innerHTML = stockAlerts.map(s=>`
//   <div class="stock-item">
//     <div>
//       <div class="stock-name">${s.name}</div>
//       <div class="stock-cat">${s.cat}</div>
//     </div>
//     <span class="stock-count ${s.out?'out':'low'}">${s.out?'Out of stock':`${s.stock} left`}</span>
//   </div>`).join('');

// /* ===== Activity feed ===== */
// const activity = [
//   { color:'var(--green)', msg:'<strong>ORD-5821</strong> placed by Priya Sharma — ₹412', time:'10 min ago' },
//   { color:'var(--amber)', msg:'<strong>Moong Dal</strong> is running low — 9 units left', time:'25 min ago' },
//   { color:'var(--blue)', msg:'Stock updated: <strong>Aashirvaad Atta</strong> restocked to 50 bags', time:'1 hr ago' },
//   { color:'var(--danger)', msg:'<strong>ORD-5817</strong> cancelled by Anita Joshi', time:'3 hr ago' },
//   { color:'var(--green)', msg:'Payout of <strong>₹24,300</strong> processed successfully', time:'Yesterday' },
//   { color:'var(--amber)', msg:'<strong>Maida</strong> is out of stock — update your inventory', time:'Yesterday' },
//   { color:'var(--blue)', msg:'New offer created: <strong>10% off Beverages</strong> this weekend', time:'2 days ago' },
// ];
// document.getElementById('activityFeed').innerHTML = activity.map(a=>`
//   <div class="feed-item">
//     <div class="feed-dot" style="background:${a.color};"></div>
//     <div>
//       <div class="feed-msg">${a.msg}</div>
//       <div class="feed-time">${a.time}</div>
//     </div>
//   </div>`).join('');

// lucide.createIcons();
const pathParts = window.location.pathname.split("/");

const resId = pathParts[pathParts.length - 1];
const type = pathParts[pathParts.length - 4];
const resname=pathParts[pathParts.length - 2]
console.log(resId,name,type);

/* ===== Init greeting + date ===== */
(function(){
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = `${greet}, Ramesh 👋`;
  document.getElementById('dateLabel').textContent = new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
})();

/* ===== State ===== */
let statsData = null;
let currentPeriod = '30d';

const canvas = document.getElementById('salesChart');
const ctx = canvas.getContext('2d');
const overlay=document.querySelector(".overlay")
/* ===== LoadPage ===== */
// function LoadPage(id){
//   if(id==="OrdersBtn") window.location.hred=`/seller/orders/${resId}`
// }
const ordersBtn=document.getElementById("OrdersBtn")
ordersBtn.addEventListener("click",()=>{
  window.location.href=`/seller/orders/${resname}/${resId}`
})
const InventoryBtn=document.getElementById("InventoryBtn")
InventoryBtn.addEventListener("click",()=>{
  window.location.href=`/seller/menu/${resname}/${resId}`
})
/* ===== Boot ===== */
loadDashboard();
lucide.createIcons(); // static sidebar/topbar icons — not dependent on fetch
let total_sold=0
async function loadDashboard(){
  try {
    const res = await fetch('/seller/stats', { method: 'POST', credentials: 'same-origin' });
    const data = await res.json();
    if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load stats');

    statsData = data.stats;
    console.log(statsData)
    
    data.stats.inventory.forEach(item=>{
      total_sold+=parseInt(item.sold)
      })
    console.log(total_sold);
    
    renderKPIs(statsData.kpis);
    renderToday(statsData.kpis);
    renderChart(currentPeriod);
    renderOrders(statsData.recent_orders);
    renderTopProducts(statsData.top_products);
    renderStockAlerts(statsData.stock_alerts);
    renderActivity(statsData);
  } catch (err) {
    console.error('Dashboard load failed:', err);
    showLoadError();
  }
}

function showLoadError(){
  ['ordersBody','topProducts','stockAlerts','activityFeed'].forEach(id=>{
    const el = document.getElementById(id);
    if (el) el.innerHTML = `<div style="padding:20px;color:var(--muted);font-size:13px;">Couldn't load data — try refreshing.</div>`;
  });
}

function setText(id, value){
  const el = document.getElementById(id);
  if (el) el.textContent = value;
}

/* =====================================================================
   KPI row
   NOTE: these ids don't exist in seller_dashboard.html yet — the 4 KPI
   values are currently hardcoded text. Add ids to the .kpi-value spans:
     kpiRevenue  → "Revenue this month" value
     kpiOrders   → "Orders this month" value
     kpiToday    → "New orders today" value
     kpiStock    → "Low / out-of-stock items" value
   The % change / "6 pending" text under each icon isn't backed by the API
   yet — I removed those rather than leave stale numbers in place. If you
   want trend arrows back, the backend needs to compute a prior-period
   comparison and return it in kpis.
===================================================================== */
function renderKPIs(kpis){
  setText('kpiRevenue', '₹' + kpis.month_revenue.toLocaleString('en-IN'));
  setText('kpiOrders', kpis.month_orders.toLocaleString('en-IN'));
  setText('kpiToday', kpis.today_orders);
  setText('kpiTodayBtm',kpis.today_orders)
  setText('kpiTotalSold',total_sold);
  setText('kpiStock', kpis.low_stock_count + kpis.out_of_stock_count);
}

/* =====================================================================
   "Today" side panel
   NOTE: needs ids too — todayRevenue / todayOrders / todayAvg.
   "Items sold" is dropped: the API has no field for it right now.
===================================================================== */
function renderToday(kpis){
  setText('todayRevenue', '₹' + kpis.today_revenue.toLocaleString('en-IN'));
  setText('todayOrders', kpis.today_orders);
  const avg = kpis.today_orders > 0 ? Math.round(kpis.today_revenue / kpis.today_orders) : 0;
  setText('todayAvg', '₹' + avg.toLocaleString('en-IN'));
}

/* ===== Sales chart ===== */
function getChartSlice(period){
  // The API only returns the last 30 days of daily revenue — there's no
  // separate 7-day or 90-day dataset from the backend yet.
  const labels = statsData.chart.labels;
  const values = statsData.chart.values;
  if (period === '7d') {
    return { labels: labels.slice(-7), values: values.slice(-7) };
  }
  // '30d' and '90d' both use the same 30-day array for now — '90d' is NOT
  // real 3-month data, just a placeholder until the backend supports it.
  return { labels, values };
}

function renderChart(period){
  currentPeriod = period;
  if (statsData) drawChart(getChartSlice(period));
}

function drawChart(data){
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.parentElement.clientWidth - 44;
  const h = 220;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.setTransform(1,0,0,1,0,0);
  ctx.scale(dpr, dpr);

  const padL=40, padR=16, padT=16, padB=40;
  const chartW = w - padL - padR;
  const chartH = h - padT - padB;

  if (!data.values.length) {
    ctx.clearRect(0,0,w,h);
    return;
  }

  const max = Math.max(...data.values, 1) * 1.15;
  const pts = data.values.map((v,i)=>({
    x: padL + (data.values.length > 1 ? (i/(data.values.length-1))*chartW : chartW/2),
    y: padT + chartH - (v/max)*chartH
  }));

  ctx.clearRect(0,0,w,h);

  // grid lines
  const ticks = 4;
  ctx.strokeStyle = '#E1DED2';
  ctx.lineWidth = 1;
  for(let i=0;i<=ticks;i++){
    const y = padT + (i/ticks)*chartH;
    ctx.beginPath(); ctx.moveTo(padL,y); ctx.lineTo(padL+chartW,y); ctx.stroke();
    const val = Math.round(max*(1-i/ticks));
    ctx.fillStyle = '#9A9587';
    ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'right';
    ctx.fillText('₹'+(val>=1000?(val/1000).toFixed(1)+'k':val), padL-6, y+4);
  }

  // gradient fill
  const grad = ctx.createLinearGradient(0,padT,0,padT+chartH);
  grad.addColorStop(0,'rgba(44,74,110,.18)');
  grad.addColorStop(1,'rgba(44,74,110,0)');
  ctx.beginPath();
  ctx.moveTo(pts[0].x, padT+chartH);
  pts.forEach(p=>ctx.lineTo(p.x,p.y));
  ctx.lineTo(pts[pts.length-1].x, padT+chartH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // line
  ctx.beginPath();
  ctx.moveTo(pts[0].x,pts[0].y);
  for(let i=1;i<pts.length;i++){
    const cp1x = (pts[i-1].x+pts[i].x)/2;
    ctx.bezierCurveTo(cp1x,pts[i-1].y,cp1x,pts[i].y,pts[i].x,pts[i].y);
  }
  ctx.strokeStyle = '#2C4A6E';
  ctx.lineWidth = 2.5;
  ctx.lineJoin = 'round';
  ctx.stroke();

  // dots
  pts.forEach((p)=>{
    ctx.beginPath(); ctx.arc(p.x,p.y,4,0,Math.PI*2);
    ctx.fillStyle = '#2C4A6E'; ctx.fill();
    ctx.fillStyle = '#FFFFFB'; ctx.beginPath(); ctx.arc(p.x,p.y,2,0,Math.PI*2); ctx.fill();
  });

  // x labels
  ctx.fillStyle = '#9A9587';
  ctx.font = '11px Inter, sans-serif';
  ctx.textAlign = 'center';
  const step = Math.max(1, Math.ceil(data.labels.length/7));
  data.labels.forEach((l,i)=>{
    if(i % step === 0 || i === data.labels.length-1)
      ctx.fillText(l, pts[i].x, padT+chartH+16);
  });
}

function switchChart(period, btn){
  document.querySelectorAll('.chart-tab').forEach(t=>t.classList.remove('active'));
  btn.classList.add('active');
  renderChart(period);
}

window.addEventListener('resize', ()=>{ if (statsData) drawChart(getChartSlice(currentPeriod)); });

/* ===== Time formatting ===== */
function timeAgo(iso){
  if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(iso)) {
    iso += "Z";
  }
  const then = new Date(iso).getTime();
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs/60000);
  console.log(mins);
  
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins/60);
  if (hrs < 24) return `${hrs} hr ago`;
  const days = Math.floor(hrs/24);
  if (days === 1) return 'Yesterday';
  return `${days} days ago`;
}

/* =====================================================================
   Recent orders
   Backend statuses are "placed" / "completed" / "canceled" (see
   resturant_stats in mongodb.py) — mapped here to the CSS classes the
   dashboard's .status-pill styles expect.
===================================================================== */
const statusMap = {
  placed:    { cls:'new',       label:'New' },
  completed: { cls:'delivered', label:'Completed' },
  canceled:  { cls:'cancelled', label:'Cancelled' },
};

function renderOrders(orders){
  const tbody = document.getElementById('ordersBody');
  if (!orders || !orders.length){
    tbody.innerHTML = `<tr><td colspan="5" style="padding:20px;color:var(--muted);">No orders yet</td></tr>`;
    return;
  }
  tbody.innerHTML = orders.map(o=>{
    const s = statusMap[o.status] || { cls:'new', label:o.status || 'Unknown' };
    return `
    <tr>
      <td><span class="order-id">${o.order_id.slice(-6).toUpperCase()}</span></td>
      <td>
        <div class="order-name">Customer #${String(o.customer_id).slice(-6)}</div>
        <div class="order-items">${o.items_summary || '—'}</div>
      </td>
      <td><span class="order-price">₹${o.total_amount.toLocaleString('en-IN')}</span></td>
      <td><span class="status-pill ${s.cls}"><span class="status-dot"></span>${s.label}</span></td>
      <td style="font-size:12px;color:var(--muted);">${timeAgo(o.created_at)}</td>
    </tr>`;
  }).join('');
}

/* ===== Top products ===== */
function renderTopProducts(products){
  const el = document.getElementById('topProducts');
  if (!products || !products.length){
    el.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px;">No sales yet</div>`;
    return;
  }
  const maxSold = Math.max(...products.map(p=>p.sold), 1);
  el.innerHTML = products.map((p,i)=>`
    <div class="product-row">
      <span class="prod-rank">${i+1}</span>
      <div class="prod-icon">📦</div>
      <div class="prod-info">
        <div class="prod-name">${p.item_name}</div>
        <div class="prod-sub">${p.unit || ''}</div>
      </div>
      <div style="flex:1;min-width:60px;padding:0 10px;">
        <div class="prod-bar-track"><div class="prod-bar-fill" style="width:${Math.round(p.sold/maxSold*100)}%"></div></div>
      </div>
      <div style="text-align:right;">
        <div class="prod-revenue">₹${p.revenue.toLocaleString('en-IN')}</div>
        <div class="prod-sold">${p.sold} sold</div>
      </div>
    </div>`).join('');
}

/* ===== Stock alerts ===== */
function renderStockAlerts(alerts){
  const el = document.getElementById('stockAlerts');
  if (!alerts || !alerts.length){
    el.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px;">All stocked up</div>`;
    return;
  }
  el.innerHTML = alerts.map(s=>`
    <div class="stock-item">
      <div>
        <div class="stock-name">${s.item_name}</div>
        <div class="stock-cat">${s.sub_id != null ? 'Category #' + s.sub_id : ''}</div>
      </div>
      <span class="stock-count ${s.status === 'out' ? 'out' : 'low'}">${s.status === 'out' ? 'Out of stock' : `${s.stock} left`}</span>
    </div>`).join('');
}

/* =====================================================================
   Activity feed
   The API has no dedicated activity-log endpoint, so this is synthesized
   client-side from recent_orders + stock_alerts (real data, not invented
   numbers) rather than left as static fake entries. If you want a true
   audit trail (payouts, offers created, restocks) later, that needs its
   own backend collection/endpoint.
===================================================================== */
function renderActivity(stats){
  const el = document.getElementById('activityFeed');
  const items = [];

  (stats.recent_orders || []).slice(0,4).forEach(o=>{
    const cancelled = o.status === 'canceled';
    console.log(timeAgo(o.created_at));
    
    items.push({
      color: cancelled ? 'var(--danger)' : 'var(--green)',
      msg: cancelled
        ? `<strong>Order #${o.order_id.slice(-6).toUpperCase()}</strong> was cancelled`
        : `<strong>Order #${o.order_id.slice(-6).toUpperCase()}</strong> placed — ₹${o.total_amount.toLocaleString('en-IN')}`,
      time: timeAgo(o.created_at),
      sortKey: new Date(o.created_at).getTime(),
    });
  });

  (stats.stock_alerts || []).slice(0,3).forEach(s=>{
    items.push({
      color: s.status === 'out' ? 'var(--danger)' : 'var(--amber)',
      msg: s.status === 'out'
        ? `<strong>${s.item_name}</strong> is out of stock`
        : `<strong>${s.item_name}</strong> is running low — ${s.stock} left`,
      time: '',
      sortKey: 0,
    });
  });

  items.sort((a,b)=>b.sortKey - a.sortKey);

  if (!items.length){
    el.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px;">No recent activity</div>`;
    return;
  }

  el.innerHTML = items.map(a=>`
    <div class="feed-item">
      <div class="feed-dot" style="background:${a.color};"></div>
      <div>
        <div class="feed-msg">${a.msg}</div>
        ${a.time ? `<div class="feed-time">${a.time}</div>` : ''}
      </div>
    </div>`).join('');
}

/*
========================SideBar=======================
 */

document.getElementById("menuToggle").onclick = function () {
  const sidebar=document.querySelector(".sidebar")
  sidebar.classList.add("show")
  sidebar.style.display="block"
  overlay.classList.add("show")
};

document.getElementById("hideCategoryBtn").addEventListener("click", function () {
  const sidebar=document.querySelector(".sidebar")
  sidebar.style.display="none"
  overlay.classList.remove("show")
});