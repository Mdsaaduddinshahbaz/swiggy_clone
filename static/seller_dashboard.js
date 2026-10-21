const pathParts = window.location.pathname.split("/");

const resId = pathParts[pathParts.length - 1];
const type = pathParts[pathParts.length - 4];
const resname=pathParts[pathParts.length - 2];
console.log(resId,resname,type);

/* ===== Init greeting + date ===== */
(function(){
  const h = new Date().getHours();
  const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  document.getElementById('greeting').textContent = `${greet}, ${CurrentUsername} 👋`;
  document.getElementById('dateLabel').textContent = new Date().toLocaleDateString('en-IN',{weekday:'long',year:'numeric',month:'long',day:'numeric'});
})();
document.getElementById("inventoryRedirectBtn").addEventListener("click",()=>{
  window.location.href=`/seller/menu/${resname}/${resId}`
})
document.addEventListener("DOMContentLoaded",()=>{
document.getElementById("ordersRedirectBtn").addEventListener("click",()=>{
  window.location.href=`/seller/orders/${resname}/${resId}`
})
document.getElementById("addItemBtn").addEventListener("click",()=>{
  window.location.href=`/seller/menu/${resname}/${resId}`
})
document.getElementById("updateStockBtn").addEventListener("click",()=>{
  console.log("update stock clicked")
  window.location.href=`/seller/menu/${resname}/${resId}#updateStock`
})
// document.getElementById("createOfferBtn").addEventListener("click",()=>{
//   window.location.href=`/seller/menu/${resname}/${resId}#createOffer`
// })
});
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
// const ordersBtn=document.getElementById("OrdersBtn")
// ordersBtn.addEventListener("click",()=>{
//   window.location.href=`/seller/orders/${resname}/${resId}`
// })
// const InventoryBtn=document.getElementById("InventoryBtn")
// InventoryBtn.addEventListener("click",()=>{
//   window.location.href=`/seller/menu/${resname}/${resId}`
// })
/* ===== Boot ===== */
loadDashboard();
lucide.createIcons(); // static sidebar/topbar icons — not dependent on fetch
let total_sold=0
async function loadDashboard(){
  try {
    const res = await fetch('/seller/stats', { method: 'POST', credentials: 'same-origin' });
    if(res.status ==401){
        alert("unauthorized,Please log in")
        window.location.href="/login/seller";
        return;    
    }
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
  setText('active_orders',statsData["active_orders"])
  setText('pendingOrders',statsData["active_orders"])
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
  const recentOrders = orders.slice(0, 5); // Show only the 5 most recent orders
  tbody.innerHTML = recentOrders.map(o=>{
    const s = statusMap[o.status] || { cls:'new', label:o.status || 'Unknown' };
    // <td><span class="order-id">${o.order_id.slice(-6).toUpperCase()}</span></td>
    return `
    <tr>
      <td><span class="order-id">${o.tokenNo}</span></td>
      <td>
        <div class="order-details">
        <div class="order-name">Customer #${String(o.customer_id).slice(-6)}</div>
        <div class="order-items">${o.items_summary || '—'}</div>
        </div>
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
      // msg: cancelled
      //   ? `<strong>Order #${o.order_id.slice(-6).toUpperCase()}</strong> was cancelled`
      //   : `<strong>Order #${o.order_id.slice(-6).toUpperCase()}</strong> placed — ₹${o.total_amount.toLocaleString('en-IN')}`,
      msg: cancelled
          ? `<strong>Order #${o.tokenNo}</strong> was cancelled`
          : `<strong>Order #${o.tokenNo}</strong> placed — ₹${o.total_amount.toLocaleString('en-IN')}`,
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

/* =====================================================================
   Store Online / Offline toggle (top-right of the topbar)

   GET  /store_status/<res_id>  -> { success, is_online }
   POST /seller/set_online      -> body { is_online: bool }
                                   -> { success, is_online }

   Optimistic update with revert on failure. Also listens for the socket
   "store_status" event (if the socket.io client is on the page) so a
   second tab/device stays in sync, and re-checks when the tab becomes
   visible again since mobile browsers suspend background tabs.
===================================================================== */
(function initStoreToggle(){
  const root = document.getElementById("storeToggle");
  if (!root) return;

  const sw = document.getElementById("storeToggleSwitch");
  const label = document.getElementById("storeToggleLabel");
  const retryBtn = document.getElementById("storeToggleRetry");

  let isOnline = null;   // null until the first successful load
  let busy = false;
  let toastTimer = null;

  function toast(message, kind){
    let el = document.getElementById("sdToast");
    if (!el){
      el = document.createElement("div");
      el.id = "sdToast";
      el.className = "sd-toast";
      el.setAttribute("role", "status");
      el.setAttribute("aria-live", "polite");
      document.body.appendChild(el);
    }
    el.textContent = message;
    el.dataset.kind = kind || "info";
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(()=>el.classList.remove("show"), 3000);
  }

  // state: "loading" | "online" | "offline" | "error"
  function render(state){
    root.dataset.state = state;
    root.classList.toggle("is-busy", busy);

    sw.setAttribute("aria-checked", String(state === "online"));
    sw.disabled = busy || state === "loading" || state === "error";
    retryBtn.hidden = state !== "error";

    if (state === "online") label.textContent = "Online";
    else if (state === "offline") label.textContent = "Offline";
    else if (state === "error") label.textContent = "Status unavailable";
    else label.textContent = "Checking…";

    sw.title = state === "online"
      ? "Taking orders — click to go offline"
      : state === "offline"
        ? "Not taking orders — click to go online"
        : "";
  }

  function currentState(){
    return isOnline === null ? "loading" : isOnline ? "online" : "offline";
  }

  function handleUnauthorized(){
    alert("unauthorized,Please log in");
    window.location.href = "/login/seller";
  }

  async function loadStatus(silent){
    if (!silent && isOnline === null) render("loading");
    try {
      const res = await fetch(`/store_status/${encodeURIComponent(resId)}`, { credentials: "same-origin" });
      if (res.status === 401){ handleUnauthorized(); return; }
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || "status failed");
      isOnline = data.is_online !== false;
      render(currentState());
    } catch (err) {
      console.error("store status load failed", err);
      // On a silent refresh failure keep showing the last known state.
      if (isOnline === null) render("error");
    }
  }

  async function setOnline(next){
    if (busy || isOnline === null) return;

    const previous = isOnline;
    busy = true;
    isOnline = next;                 // optimistic
    render(currentState());

    try {
      const res = await fetch("/seller/set_online", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_online: next })
      });
      if (res.status === 401){ handleUnauthorized(); return; }
      const data = await res.json().catch(()=>null);
      if (!res.ok || !data || !data.success){
        throw new Error((data && data.message) || "Couldn't update store status");
      }

      isOnline = data.is_online !== false;
      toast(
        isOnline
          ? "You're online — customers can order again"
          : "You're offline — customers can't add items",
        isOnline ? "success" : "warn"
      );
    } catch (err) {
      console.error("set_online failed", err);
      isOnline = previous;           // revert
      toast("Couldn't change status. Please try again.", "error");
    } finally {
      busy = false;
      render(currentState());
    }
  }

  sw.addEventListener("click", ()=>{
    if (isOnline === null) return;
    setOnline(!isOnline);
  });
  retryBtn.addEventListener("click", ()=>loadStatus(false));

  document.addEventListener("visibilitychange", ()=>{
    if (!document.hidden && !busy) loadStatus(true);
  });

  try {
    const hasSocket = window.socket && typeof window.socket.on === "function";
    if (hasSocket || typeof io === "function"){
      const socket = hasSocket ? window.socket : io();
      const watch = ()=>socket.emit("watch_store", { res_id: resId });

      socket.on("connect", watch);
      if (socket.connected) watch();

      socket.on("store_status", (payload)=>{
        if (!payload || String(payload.res_id) !== String(resId) || busy) return;
        isOnline = payload.is_online !== false;
        render(currentState());
      });
    }
  } catch (err) {
    console.warn("store toggle socket sync unavailable", err);
  }

  render("loading");
  loadStatus(false);
})();

/*
========================SideBar=======================
 */
document.querySelector(".seller-name").textContent=decodeURIComponent(resname)
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

overlay.addEventListener("click",()=>{
  const sidebar=document.querySelector(".sidebar")
  overlay.classList.remove("show")
  sidebar.style.display="none"
  sidebar.classList.remove("show")
})