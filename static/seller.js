/* =====================================================================
   seller.js  —  merged from:
     base.js + sidebar.js + seller_dashboard.js + menu_seller.js + seller_orders.js

   Sections
     1. Shared setup (URL params, socket, helpers)
     2. Navigation (views, nav sidebar, catalogue sidebar, logout)
     3. Dashboard
     4. Inventory (catalogue, items, barcode scanner)
     5. Orders (order cards, QR scanner)
     6. Boot (wiring that crosses sections)
===================================================================== */

/* =====================================================================
   1. SHARED SETUP
===================================================================== */
const pathParts = window.location.pathname.split("/");
const resId = pathParts[pathParts.length - 1];
const resname = pathParts[pathParts.length - 2];
// Old menu/orders pages read this from the 4th-last URL segment ("seller").
// The merged page can sit at /seller/<resname>/<resId>, so it is fixed here.
const type = "seller";
console.log(resId, resname, type);

// ONE socket for the whole page (orders + store-status toggle share it)
const socket = io();
window.socket = socket;

function escapeSellerHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

/* =====================================================================
   2. NAVIGATION
===================================================================== */
const VIEWS = ["dashboard", "inventory", "orders"];

/* ----- Nav sidebar (Dashboard / Orders / Inventory ...) ----- */
const navSidebar = document.querySelector("aside.sidebar");
const navOverlay = document.getElementById("overlayContainer");

function openNavSidebar() {
    navSidebar.classList.add("show");
    navSidebar.style.display = "block";
    navOverlay.classList.add("show");
}

function closeNavSidebar() {
    navSidebar.style.display = "none";
    navSidebar.classList.remove("show");
    navOverlay.classList.remove("show");
}

document.getElementById("menuToggleDashboard").onclick = openNavSidebar;
document.getElementById("menuToggleOrders").onclick = openNavSidebar;
document.getElementById("hideCategoryBtn").addEventListener("click", closeNavSidebar);
navOverlay.addEventListener("click", closeNavSidebar);

/* ----- View switching (replaces the old page redirects) ----- */
function showView(name, refresh = true) {
    if (!VIEWS.includes(name)) return;

    document.querySelectorAll(".view").forEach(v =>
        v.classList.toggle("active", v.id === "view-" + name));
    document.querySelectorAll(".nav-item[data-view], .nav-btn[data-view]").forEach(b =>
        b.classList.toggle("active", b.dataset.view === name));

    history.replaceState(null, "", "#" + name);

    // only close the mobile drawer; on desktop the sidebar stays put
    if (navOverlay.classList.contains("show")) closeNavSidebar();
    window.scrollTo(0, 0);

    if (name === "dashboard") {
        // the chart can't be measured while its view is hidden, so redraw now
        if (statsData) drawChart(getChartSlice(currentPeriod));
        if (refresh) loadDashboard();
    } else if (name === "orders" && refresh) {
        loadOrders();
    }
}

// Any element with data-view="dashboard|inventory|orders" switches views.
// Capture phase + stopImmediatePropagation: this runs BEFORE any leftover
// handler from the old base.js / sidebar.js / seller_dashboard.js that does
// window.location.href = ..., so those can never trigger a page reload.
document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-view]");
    if (!el) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    showView(el.dataset.view);
}, true);

/* ----- Logout ----- */
document.getElementById("Logout").addEventListener("click", async () => {
    localStorage.removeItem("resId");
    localStorage.removeItem("resname");
    try {
        const res = await fetch("/logout/seller", { method: "GET" });
        if (res.ok) {
            console.log("logged out");
        } else {
            console.log("error logging out");
        }
    } catch (err) {
        console.log("error logging out", err);
    }
    window.location.href = "/landing";
});

/* =====================================================================
   3. DASHBOARD  (was seller_dashboard.js)
===================================================================== */

/* ===== Init greeting + date ===== */
(function () {
    const h = new Date().getHours();
    const greet = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
    document.getElementById('greeting').textContent = `${greet}, ${CurrentUsername} 👋`;
    document.getElementById('dateLabel').textContent = new Date().toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
})();

/* ===== State ===== */
let statsData = null;
let currentPeriod = '30d';
let total_sold = 0;

const canvas = document.getElementById('salesChart');
const ctx = canvas.getContext('2d');

async function loadDashboard() {
    try {
        const res = await fetch('/seller/stats', { method: 'POST', credentials: 'same-origin' });
        if (res.status == 401) {
            alert("unauthorized,Please log in");
            window.location.href = "/login/seller";
            return;
        }
        const data = await res.json();
        if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load stats');

        statsData = data.stats;
        console.log(statsData);

        total_sold = 0; // reset so reloading doesn't double count
        data.stats.inventory.forEach(item => {
            total_sold += parseInt(item.sold);
        });
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

function showLoadError() {
    ['ordersBody', 'topProducts', 'stockAlerts', 'activityFeed'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = `<div style="padding:20px;color:var(--muted);font-size:13px;">Couldn't load data — try refreshing.</div>`;
    });
}

function setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
}

/* ===== KPI row ===== */
function renderKPIs(kpis) {
    setText('kpiRevenue', '₹' + kpis.month_revenue.toLocaleString('en-IN'));
    setText('kpiOrders', kpis.month_orders.toLocaleString('en-IN'));
    setText('kpiToday', kpis.today_orders);
    setText('kpiTodayBtm', kpis.today_orders);
    setText('kpiTotalSold', total_sold);
    setText('kpiStock', kpis.low_stock_count + kpis.out_of_stock_count);
    setText('active_orders', statsData["active_orders"]);
    setText('pendingOrders', statsData["active_orders"]);
}

/* ===== "Today" side panel ===== */
function renderToday(kpis) {
    setText('todayRevenue', '₹' + kpis.today_revenue.toLocaleString('en-IN'));
    setText('todayOrders', kpis.today_orders);
    const avg = kpis.today_orders > 0 ? Math.round(kpis.today_revenue / kpis.today_orders) : 0;
    setText('todayAvg', '₹' + avg.toLocaleString('en-IN'));
}

/* ===== Sales chart ===== */
function getChartSlice(period) {
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

function renderChart(period) {
    currentPeriod = period;
    if (statsData) drawChart(getChartSlice(period));
}

function drawChart(data) {
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.parentElement.clientWidth - 44;
    const h = 220;
    // Dashboard view is hidden (display:none) -> width is 0. showView()
    // redraws the chart as soon as the dashboard is shown again.
    if (w <= 0) return;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);

    const padL = 40, padR = 16, padT = 16, padB = 40;
    const chartW = w - padL - padR;
    const chartH = h - padT - padB;

    if (!data.values.length) {
        ctx.clearRect(0, 0, w, h);
        return;
    }

    const max = Math.max(...data.values, 1) * 1.15;
    const pts = data.values.map((v, i) => ({
        x: padL + (data.values.length > 1 ? (i / (data.values.length - 1)) * chartW : chartW / 2),
        y: padT + chartH - (v / max) * chartH
    }));

    ctx.clearRect(0, 0, w, h);

    // grid lines
    const ticks = 4;
    ctx.strokeStyle = '#E1DED2';
    ctx.lineWidth = 1;
    for (let i = 0; i <= ticks; i++) {
        const y = padT + (i / ticks) * chartH;
        ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(padL + chartW, y); ctx.stroke();
        const val = Math.round(max * (1 - i / ticks));
        ctx.fillStyle = '#9A9587';
        ctx.font = '10px JetBrains Mono, monospace';
        ctx.textAlign = 'right';
        ctx.fillText('₹' + (val >= 1000 ? (val / 1000).toFixed(1) + 'k' : val), padL - 6, y + 4);
    }

    // gradient fill
    const grad = ctx.createLinearGradient(0, padT, 0, padT + chartH);
    grad.addColorStop(0, 'rgba(44,74,110,.18)');
    grad.addColorStop(1, 'rgba(44,74,110,0)');
    ctx.beginPath();
    ctx.moveTo(pts[0].x, padT + chartH);
    pts.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, padT + chartH);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // line
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) {
        const cp1x = (pts[i - 1].x + pts[i].x) / 2;
        ctx.bezierCurveTo(cp1x, pts[i - 1].y, cp1x, pts[i].y, pts[i].x, pts[i].y);
    }
    ctx.strokeStyle = '#2C4A6E';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // dots
    pts.forEach((p) => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#2C4A6E'; ctx.fill();
        ctx.fillStyle = '#FFFFFB'; ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, Math.PI * 2); ctx.fill();
    });

    // x labels
    ctx.fillStyle = '#9A9587';
    ctx.font = '11px Fraunces, serif';
    ctx.textAlign = 'center';
    const step = Math.max(1, Math.ceil(data.labels.length / 7));
    data.labels.forEach((l, i) => {
        if (i % step === 0 || i === data.labels.length - 1)
            ctx.fillText(l, pts[i].x, padT + chartH + 16);
    });
}

function switchChart(period, btn) {
    document.querySelectorAll('.chart-tab').forEach(t => t.classList.remove('active'));
    btn.classList.add('active');
    renderChart(period);
}

window.addEventListener('resize', () => { if (statsData) drawChart(getChartSlice(currentPeriod)); });

/* ===== Time formatting ===== */
function timeAgo(iso) {
    if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(iso)) {
        iso += "Z";
    }
    const then = new Date(iso).getTime();
    const diffMs = Date.now() - then;
    const mins = Math.floor(diffMs / 60000);

    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} min ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} hr ago`;
    const days = Math.floor(hrs / 24);
    if (days === 1) return 'Yesterday';
    return `${days} days ago`;
}

/* ===== Recent orders (dashboard table) =====
   Backend statuses are "placed" / "completed" / "canceled" — mapped to the
   CSS classes the dashboard's .status-pill styles expect. */
const statusMap = {
    placed: { cls: 'new', label: 'New' },
    completed: { cls: 'delivered', label: 'Completed' },
    canceled: { cls: 'cancelled', label: 'Cancelled' },
};

function renderOrders(orders) {
    const tbody = document.getElementById('ordersBody');
    if (!orders || !orders.length) {
        tbody.innerHTML = `<tr><td colspan="5" style="padding:20px;color:var(--muted);">No orders yet</td></tr>`;
        return;
    }
    const recentOrders = orders.slice(0, 5); // Show only the 5 most recent orders
    tbody.innerHTML = recentOrders.map(o => {
        const s = statusMap[o.status] || { cls: 'new', label: o.status || 'Unknown' };
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
function renderTopProducts(products) {
    const el = document.getElementById('topProducts');
    if (!products || !products.length) {
        el.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px;">No sales yet</div>`;
        return;
    }
    const maxSold = Math.max(...products.map(p => p.sold), 1);
    el.innerHTML = products.map((p, i) => `
    <div class="product-row">
      <span class="prod-rank">${i + 1}</span>
      <div class="prod-icon">📦</div>
      <div class="prod-info">
        <div class="prod-name">${p.item_name}</div>
        <div class="prod-sub">${p.unit || ''}</div>
      </div>
      <div style="flex:1;min-width:60px;padding:0 10px;">
        <div class="prod-bar-track"><div class="prod-bar-fill" style="width:${Math.round(p.sold / maxSold * 100)}%"></div></div>
      </div>
      <div style="text-align:right;">
        <div class="prod-revenue">₹${p.revenue.toLocaleString('en-IN')}</div>
        <div class="prod-sold">${p.sold} sold</div>
      </div>
    </div>`).join('');
}

/* ===== Stock alerts ===== */
function renderStockAlerts(alerts) {
    const el = document.getElementById('stockAlerts');
    if (!alerts || !alerts.length) {
        el.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px;">All stocked up</div>`;
        return;
    }
    el.innerHTML = alerts.map(s => `
    <div class="stock-item">
      <div>
        <div class="stock-name">${s.item_name}</div>
        <div class="stock-cat">${s.sub_id != null ? 'Category #' + s.sub_id : ''}</div>
      </div>
      <span class="stock-count ${s.status === 'out' ? 'out' : 'low'}">${s.status === 'out' ? 'Out of stock' : `${s.stock} left`}</span>
    </div>`).join('');
}

/* ===== Activity feed (synthesized from recent_orders + stock_alerts) ===== */
function renderActivity(stats) {
    const el = document.getElementById('activityFeed');
    const items = [];

    (stats.recent_orders || []).slice(0, 4).forEach(o => {
        const cancelled = o.status === 'canceled';
        items.push({
            color: cancelled ? 'var(--danger)' : 'var(--green)',
            msg: cancelled
                ? `<strong>Order #${o.tokenNo}</strong> was cancelled`
                : `<strong>Order #${o.tokenNo}</strong> placed — ₹${o.total_amount.toLocaleString('en-IN')}`,
            time: timeAgo(o.created_at),
            sortKey: new Date(o.created_at).getTime(),
        });
    });

    (stats.stock_alerts || []).slice(0, 3).forEach(s => {
        items.push({
            color: s.status === 'out' ? 'var(--danger)' : 'var(--amber)',
            msg: s.status === 'out'
                ? `<strong>${s.item_name}</strong> is out of stock`
                : `<strong>${s.item_name}</strong> is running low — ${s.stock} left`,
            time: '',
            sortKey: 0,
        });
    });

    items.sort((a, b) => b.sortKey - a.sortKey);

    if (!items.length) {
        el.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px;">No recent activity</div>`;
        return;
    }

    el.innerHTML = items.map(a => `
    <div class="feed-item">
      <div class="feed-dot" style="background:${a.color};"></div>
      <div>
        <div class="feed-msg">${a.msg}</div>
        ${a.time ? `<div class="feed-time">${a.time}</div>` : ''}
      </div>
    </div>`).join('');
}

/* =====================================================================
   Store Online / Offline toggle (top-right of the dashboard topbar)

   GET  /store_status/<res_id>  -> { success, is_online }
   POST /seller/set_online      -> body { is_online: bool }
                                   -> { success, is_online }
===================================================================== */
(function initStoreToggle() {
    const root = document.getElementById("storeToggle");
    if (!root) return;

    const sw = document.getElementById("storeToggleSwitch");
    const label = document.getElementById("storeToggleLabel");
    const retryBtn = document.getElementById("storeToggleRetry");

    let isOnline = null;   // null until the first successful load
    let busy = false;
    let toastTimer = null;

    function toast(message, kind) {
        let el = document.getElementById("sdToast");
        if (!el) {
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
        toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
    }

    // state: "loading" | "online" | "offline" | "error"
    function render(state) {
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

    function currentState() {
        return isOnline === null ? "loading" : isOnline ? "online" : "offline";
    }

    function handleUnauthorized() {
        alert("unauthorized,Please log in");
        window.location.href = "/login/seller";
    }

    async function loadStatus(silent) {
        if (!silent && isOnline === null) render("loading");
        try {
            const res = await fetch(`/store_status/${encodeURIComponent(resId)}`, { credentials: "same-origin" });
            if (res.status === 401) { handleUnauthorized(); return; }
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

    async function setOnline(next) {
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
            if (res.status === 401) { handleUnauthorized(); return; }
            const data = await res.json().catch(() => null);
            if (!res.ok || !data || !data.success) {
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

    sw.addEventListener("click", () => {
        if (isOnline === null) return;
        setOnline(!isOnline);
    });
    retryBtn.addEventListener("click", () => loadStatus(false));

    document.addEventListener("visibilitychange", () => {
        if (!document.hidden && !busy) loadStatus(true);
    });

    // uses the shared page socket (window.socket)
    try {
        const watch = () => socket.emit("watch_store", { res_id: resId });

        socket.on("connect", watch);
        if (socket.connected) watch();

        socket.on("store_status", (payload) => {
            if (!payload || String(payload.res_id) !== String(resId) || busy) return;
            isOnline = payload.is_online !== false;
            render(currentState());
        });
    } catch (err) {
        console.warn("store toggle socket sync unavailable", err);
    }

    render("loading");
    loadStatus(false);
})();

document.querySelector(".seller-name").textContent = decodeURIComponent(resname);

/* =====================================================================
   4. INVENTORY  (was menu_seller.js)
===================================================================== */

async function loadInventory() {
    const res = await fetch("/list_items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ res_id: resId, type: type })
    });

    if (res.status == 401) {
        alert("unauthorized,Please Log in");
        window.location.href = "/login/seller";
        return;
    }

    const data = await res.json();
    console.log(data);

    if (data.success) {
        state.tree = data.categories.categories.map(cat => ({
            id: String(cat._id),
            name: cat.name,
            subcategories: cat.subcategories.map(sub => ({
                id: String(sub._id),
                name: sub.name
            }))
        }));

        state.items = Object.entries(data.res).map(([id, item]) => ({
            id: id,
            name: item.name,
            desc: item.desc || "",
            unit: item.unit || "",
            price: Number(item.price),
            stock: Number(item.item_qty - item.sold),
            lowAt: Number(item.lowat),
            available: item.available,
            subId: String(item.sub_id),
            url: item.file_url
        }));

        render();
    }
}

const seedTree = [
    {
        id: "cat-1",
        name: "Grocery & Staples",
        subcategories: [
            { id: "sub-1", name: "Rice" },
            { id: "sub-2", name: "Atta & Flour" },
            { id: "sub-3", name: "Pulses & Dal" },
            { id: "sub-4", name: "Sugar & Salt" },
            { id: "sub-5", name: "Edible Oils & Ghee" },
            { id: "sub-6", name: "Dry Fruits" }
        ]
    },
    {
        id: "cat-2",
        name: "Spices & Masalas",
        subcategories: [
            { id: "sub-7", name: "Whole Spices" },
            { id: "sub-8", name: "Powder Spices" },
            { id: "sub-9", name: "Blended Masalas" }
        ]
    },
    {
        id: "cat-3",
        name: "Beverages",
        subcategories: [
            { id: "sub-10", name: "Tea & Coffee" },
            { id: "sub-11", name: "Soft Drinks" },
            { id: "sub-12", name: "Juices" }
        ]
    }
];

const seedItems = [
    {
        id: "SKU-1001",
        name: "India Gate Basmati Rice",
        subId: "sub-1",
        unit: "5 kg bag",
        price: 549,
        stock: 28,
        lowAt: 10,
        available: true,
        desc: "Aged long-grain basmati rice.",
        url: "https://drive.google.com/thumbnail?id=1RWYdWg-vzwMi5P048a7RVKdxyoA5mye3&sz=w1000"
    },
    {
        id: "SKU-1002",
        name: "Sona Masoori Rice",
        subId: "sub-1",
        unit: "10 kg bag",
        price: 620,
        stock: 6,
        lowAt: 8,
        available: true,
        desc: "Everyday medium-grain rice.",
        url: "https://drive.google.com/thumbnail?id=1RWYdWg-vzwMi5P048a7RVKdxyoA5mye3&sz=w1000"
    },
    {
        id: "SKU-1011",
        name: "Aashirvaad Atta",
        subId: "sub-2",
        unit: "5 kg bag",
        price: 249,
        stock: 32,
        lowAt: 10,
        available: true,
        desc: "Whole wheat flour, stone-ground.",
        url: "https://drive.google.com/thumbnail?id=1RWYdWg-vzwMi5P048a7RVKdxyoA5mye3&sz=w1000"
    }
];

const state = {
    tree: structuredClone(seedTree),
    items: structuredClone(seedItems),

    expanded: {
        "cat-1": true
    },

    activeSub: null,
    activeCat: null, // selected category (shows all items in its subcategories)
    query: "",
    stockFilter: "all",

    editingItem: null,
    drawerOpen: false,
    subcategoryDrawerOpen: false,
    activeCategory: null,
    categoryDrawerOpen: false
};

function openSubcategoryDrawer(cat) {
    state.activeCategory = cat.id;
    state.subcategoryDrawerOpen = true;

    const drawerOverlay = document.getElementById("subcategoryDrawer");
    drawerOverlay.classList.add("open");

    const input = drawerOverlay.querySelector("#subcatName");
    input.value = "";
    input.focus();

    const title = drawerOverlay.querySelector("#subDrawerTitle");
    title.textContent = `Add subcategory to ${cat.name}`;
}

function closeSubcategoryDrawer() {
    state.subcategoryDrawerOpen = false;
    state.activeCategory = null;
    document.getElementById("subcategoryDrawer").classList.remove("open");
}

function openItemDrawer(item = null) {
    hideNameDropdown();
    state.editingItem = item;
    state.drawerOpen = true;

    const drawer = document.getElementById("itemDrawer");
    drawer.classList.remove("hidden");

    document.getElementById("drawerTitle").textContent = item ? "Edit Item" : "Add Item";

    document.getElementById("itemName").value = item?.name || "";
    document.getElementById("itemDesc").value = item?.desc || "";
    setUnitFields(item?.unit || "");
    document.getElementById("itemPrice").value = item?.price || "";
    document.getElementById("itemStock").value = item?.stock || "";
    document.getElementById("itemLow").value = item?.lowAt || 10;
    document.getElementById("itemListed").checked = item?.available ?? true;

    // barcode scanner: only show "Scan barcode" when ADDING, reset photo/status
    scanWrap.style.display = item ? "none" : "block";
    setScanStatus("");
    resetPhotoUi();

    const select = document.getElementById("itemSub");
    select.innerHTML = "";

    state.tree.forEach(cat => {
        const group = document.createElement("optgroup");
        group.label = cat.name;

        cat.subcategories.forEach(sub => {
            const option = document.createElement("option");
            option.value = sub.id;
            option.textContent = sub.name;
            group.appendChild(option);
        });

        select.appendChild(group);
    });

    select.value =
        item?.subId ||
        state.activeSub ||
        state.tree[0].subcategories[0].id;
}

function closeDrawer() {
    state.drawerOpen = false;
    document.getElementById("itemDrawer").classList.add("hidden");
}

async function saveItem() {
    const file = document.getElementById("photo").files[0];
    const item = {
        id: state.editingItem?.id || `SKU-${Date.now()}`,
        name: document.getElementById("itemName").value,
        desc: document.getElementById("itemDesc").value,
        unit: getUnitString(),
        price: Number(document.getElementById("itemPrice").value),
        stock: Number(document.getElementById("itemStock").value),
        lowAt: Number(document.getElementById("itemLow").value),
        subId: document.getElementById("itemSub").value,
        available: document.getElementById("itemListed").checked,
        url: state.editingItem?.url || null // keep existing image when editing
    };
    console.log(item.subId);

    const formData = new FormData();

    formData.append("res_id", resId);
    formData.append("sub_id", item.subId);
    formData.append("desc", item.desc);
    formData.append("itm_name", item.name);
    formData.append("unit", item.unit);
    formData.append("price", item.price);
    formData.append("itm_qty", item.stock);
    formData.append("lowat", item.lowAt);
    formData.append("available", item.available);
    formData.append("sold", 0);
    if (file) {
        formData.append("photo", file);
    }

    if (state.editingItem) {
        formData.append("item_id", item.id);
        formData.append("name", item.name);
        formData.append("unit", item.unit);
        formData.append("price", item.price);
        formData.append("lowAt", item.lowAt);
        formData.append("desc", item.desc);
        formData.append("subId", item.subId);
        formData.append("stock", item.stock);
        formData.append("available", item.available);
        if (file) {
            formData.append("photo", file);
        }

        const res = await fetch("/update_item_details", {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        console.log(data);

        if (data.success) {
            if (data.img_url) item.url = data.img_url;
            state.items = state.items.map(i => (i.id === item.id ? item : i));
        }
    } else {
        const res = await fetch("/add_res_items", {
            method: "POST",
            body: formData
        });
        const data = await res.json();
        if (data.success) {
            console.log(data);
            item.id = data.id;
            item.url = data.img_url;
            state.items.unshift(item);
        }
    }

    state.editingItem = null;
    closeDrawer();
    render();
}

function deleteItem(id) {
    state.items = state.items.filter(i => i.id !== id);
    render();
}

function renderTree() {
    const tree = document.getElementById("categoryTree");
    tree.innerHTML = "";

    const allBtn = document.getElementById("allItemsBtn");
    allBtn.classList.toggle(
        "active",
        state.activeSub === null && state.activeCat === null
    );

    state.tree.forEach((cat, index) => {
        const wrapper = document.createElement("div");
        const btn = document.createElement("button");

        btn.style.cssText = `
      width:100%;
      text-align:left;
      padding:10px 20px;
      border:none;
      background:${state.activeCat === cat.id ? "#EAE6D9" : "none"};
      cursor:pointer;
      display:flex;
      align-items:center;
      gap:8px;
      font-family:Fraunces;
      font-size:14px;
      font-weight:600;
    `;

        btn.innerHTML = `
      <span>
        ${state.expanded[cat.id] ? "▼" : "▶"}
      </span>

      <span>
        ${index + 1}.
        ${cat.name}
      </span>
    `;

        // Category click: toggle expand + select category (shows all its items)
        btn.onclick = () => {
            state.expanded[cat.id] = !state.expanded[cat.id];
            state.activeCat = cat.id;
            state.activeSub = null;
            render();
        };

        wrapper.appendChild(btn);

        if (state.expanded[cat.id]) {
            cat.subcategories.forEach(sub => {
                const count = state.items.filter(i => i.subId === sub.id).length;

                const subBtn = document.createElement("button");

                subBtn.style.cssText = `
          width:100%;
          border:none;
          background:${state.activeSub === sub.id ? "#EAE6D9" : "transparent"};
          cursor:pointer;
          padding:8px 20px 8px 42px;
          display:flex;
          justify-content:space-between;
          align-items:center;
        `;

                subBtn.innerHTML = `
          <span>
            ${sub.name}
          </span>

          <span
            style="
              font-family:'JetBrains Mono';
              font-size:11px;
              color:#87897F;
            "
          >
            ${count}
          </span>
        `;

                subBtn.onclick = () => {
                    state.activeSub = sub.id;
                    state.activeCat = null;
                    render();
                    if (window.innerWidth <= 768) {
                        closeCatalogueSidebar();
                    }
                };

                wrapper.appendChild(subBtn);
            });

            // Add Subcategory button
            const addBtn = document.createElement("button");

            addBtn.style.cssText = `
        width:100%;
        border:none;
        background:transparent;
        cursor:pointer;
        padding:10px 20px 10px 42px;
        text-align:left;
        color:#2E6F4E;
        font-weight:600;
      `;
            addBtn.className = "tree-add-sub";
            addBtn.innerHTML = "+ Add subcategory";

            addBtn.onclick = () => {
                openSubcategoryDrawer(cat);
            };

            wrapper.appendChild(addBtn);
        }

        tree.appendChild(wrapper);
    });
}

function getSubLookup() {
    const map = {};

    state.tree.forEach(cat => {
        cat.subcategories.forEach(sub => {
            map[sub.id] = {
                ...sub,
                catId: cat.id,
                catName: cat.name
            };
        });
    });

    return map;
}

// Returns items belonging to the currently selected category (all subcategories)
function getCategoryItems(catId) {
    const catObj = state.tree.find(c => c.id === catId);
    if (!catObj) return [];
    const subIds = catObj.subcategories.map(s => s.id);
    return state.items.filter(i => subIds.includes(i.subId));
}

async function renderCards() {
    const grid = document.getElementById("itemsGrid");
    grid.innerHTML = "";

    const catObj = state.tree.find(c => c.id === state.activeCat);
    const catSubIds = catObj ? catObj.subcategories.map(s => s.id) : [];

    let items = state.items.filter(item => {
        const subMatch = state.activeSub
            ? item.subId === state.activeSub
            : state.activeCat
                ? catSubIds.includes(item.subId)
                : true;

        const searchMatch =
            item.name.toLowerCase().includes(state.query.toLowerCase()) ||
            item.id.toLowerCase().includes(state.query.toLowerCase());

        const stockMatch =
            state.stockFilter === "all" ||
            (state.stockFilter === "low" &&
                item.stock > 0 &&
                item.stock <= item.lowAt) ||
            (state.stockFilter === "out" && item.stock === 0);

        return subMatch && searchMatch && stockMatch;
    });

    if (!items.length) {
        grid.innerHTML = `
      <div
        style="
          padding:60px;
          text-align:center;
          color:#87897F;
          grid-column:1/-1;
        "
      >
        No items match here yet.
      </div>
    `;
        return;
    }

    items.forEach(item => {
        const low = item.stock > 0 && item.stock <= item.lowAt;
        const out = item.stock === 0;

        const card = document.createElement("div");
        card.className = "card";
        card.style.position = "relative";

        let badge = "";

        if (low) {
            badge = `
        <div
          style="
            position:absolute;
            top:12px;
            right:12px;
            background:#FCEFDE;
            color:#C97A1F;
            padding:4px 8px;
            border-radius:20px;
            font-size:11px;
            font-weight:600;
          "
        >
          Low stock
        </div>
      `;
        }

        if (out) {
            badge = `
        <div
          style="
            position:absolute;
            top:12px;
            right:12px;
            background:#FBEAE7;
            color:#B23B30;
            padding:4px 8px;
            border-radius:20px;
            font-size:11px;
            font-weight:600;
          "
        >
          Out of stock
        </div>
      `;
        }

        card.innerHTML = `
      ${badge}

      <div
        style="
          font-family:
          'JetBrains Mono';
          font-size:11px;
          color:#87897F;
          margin-bottom:10px;
          overflow-wrap: anywhere;
        "
      >
        ${item.id}
      </div>
      <img src="${item.url}" alt="food" style="
        position: absolute;
        right: 18px;
        top: 48px;
        height: 86px;
        border-radius: 20px;
        object-fit: cover;
        width: 86px;
      ">
      <h3 style="display: block;word-wrap: anywhere;width: 60%;">
        ${item.name}
      </h3>

      <div>
        ${item.unit}
      </div>

      <p>
        ${item.desc}
      </p>

      <div
        class="card-price"
      >
        ₹${item.price}
      </div>

      <div
        class="card-stock"
        style="
          color:
            ${out ? "#B23B30" : low ? "#C97A1F" : "#2E6F4E"};
        "
      >
        ${out ? "Out of stock" : `${item.stock} in stock`}
      </div>
    `;

        const controls = document.createElement("div");
        controls.className = "controlsContainer";
        controls.style.cssText = `
display:flex;
justify-content:flex-end;
gap:10px;
margin-top:15px;
`;

        const edit = document.createElement("button");
        edit.textContent = "Edit";
        edit.style.cssText = `
padding:6px 10px;
border:1px solid #E1DED2;
background:white;
border-radius:6px;
cursor:pointer;
`;
        edit.onclick = async () => openItemDrawer(item);

        const del = document.createElement("button");
        del.textContent = "Delete";
        del.style.cssText = `
padding:6px 10px;
border:1px solid #E1DED2;
background:white;
border-radius:6px;
cursor:pointer;
color:#B23B30;
`;
        del.onclick = async () => {
            const res = await fetch("/remove_items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ item_id: item.id })
            });
            const data = await res.json();
            if (data.success) {
                deleteItem(item.id);
            }
        };

        controls.appendChild(edit);
        controls.appendChild(del);
        card.appendChild(controls);
        grid.appendChild(card);
    });
}

function closeCategoryDrawer() {
    state.categoryDrawerOpen = false;
    document.getElementById("categoryDrawer").classList.add("hidden");
}

function showCategoryDrawer() {
    state.categoryDrawerOpen = true;
    document.getElementById("categoryDrawer").classList.remove("hidden");
}

function renderStats() {
    document.getElementById("totalItems").textContent = state.items.length;

    document.getElementById("listedItems").textContent = state.items.filter(
        i => i.available
    ).length;

    document.getElementById("lowItems").textContent = state.items.filter(
        i => i.stock > 0 && i.stock <= i.lowAt
    ).length;

    document.getElementById("outItems").textContent = state.items.filter(
        i => i.stock === 0
    ).length;
}

function render() {
    renderTree();
    renderCards();
    renderStats();
    renderHeader();
}

function renderHeader() {
    const lookup = getSubLookup();
    const title = document.getElementById("headerTitle");
    const crumb = document.getElementById("breadcrumb");

    // Category selected: show category name
    if (state.activeCat) {
        const cat = state.tree.find(c => c.id === state.activeCat);
        if (cat) {
            title.textContent = cat.name;
            return;
        }
    }

    if (!state.activeSub) {
        title.textContent = "All items";
        crumb.textContent = "Every category";
        return;
    }

    const sub = lookup[state.activeSub];

    title.textContent = sub.name;
    crumb.textContent = `${sub.catName} / ${sub.name}`;
}

document.getElementById("searchInput").addEventListener("input", e => {
    state.query = e.target.value;
    render();
});

document.getElementById("allItemsBtn").onclick = () => {
    state.activeSub = null;
    state.activeCat = null;
    render();
    if (window.innerWidth <= 768) {
        closeCatalogueSidebar();
    }
};

document.getElementById("stockFilter").addEventListener("change", e => {
    state.stockFilter = e.target.value;
    render();
});

document.getElementById("hideCatalogueBtn").addEventListener("click", closeCatalogueSidebar);

document.getElementById("addItemBtn").onclick = () => openItemDrawer();
document.getElementById("cancelSubBtn").onclick = closeSubcategoryDrawer;
document.getElementById("closeDrawer").onclick = closeDrawer;
document.getElementById("closeCategoryDrawer").onclick = closeCategoryDrawer;
document.getElementById("addCategoryBtn").onclick = showCategoryDrawer;
document.getElementById("saveItemBtn").onclick = saveItem;
document.getElementById("menuToggleInventory").onclick = openCatalogueSidebar;
document.getElementById("sidebarOverlay").onclick = closeCatalogueSidebar;

render();

// Catalogue (category tree) sidebar — separate from the nav sidebar
function openCatalogueSidebar() {
    state.sidebarOpen = true;
    document.querySelector(".catalogue-sidebar").classList.add("open");
    document.getElementById("sidebarOverlay").classList.remove("hidden");
}

function closeCatalogueSidebar() {
    state.sidebarOpen = false;
    document.querySelector(".catalogue-sidebar").classList.remove("open");
    document.getElementById("sidebarOverlay").classList.add("hidden");
}

const saveCategoryBtn = document.getElementById("saveCategoryBtn");
saveCategoryBtn.addEventListener("click", async () => {
    const cat = document.querySelector("#categoryDrawer");
    const drawer = cat.querySelector(".drawer");
    const catName = drawer.querySelector("#catName").value;
    const subNames = drawer
        .querySelector("#subNames")
        .value.split("\n")
        .map(item => item.trim())
        .filter(item => item !== "");
    console.log(catName);
    console.log(subNames);

    if (!catName.trim() || !subNames.length) {
        return;
    }

    const res = await fetch("/save_categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            res_id: resId,
            cat_name: catName,
            subcats: subNames
        })
    });
    const data = await res.json();
    console.log(data);

    if (data.success) {
        console.log("updated");
        const cat = data.category;
        state.tree.push({
            id: String(cat._id),
            name: cat.name,
            subcategories: cat.subcategories.map(sub => ({
                id: String(sub._id),
                name: sub.name
            }))
        });

        render();
        closeCategoryDrawer();
    } else {
        console.log("not updated");
    }
});

document.getElementById("saveSubBtn").onclick = async () => {
    const subName = document.getElementById("subcatName").value.trim();

    if (!subName) return;

    const res = await fetch("/save_subcategory", {
        method: "POST",
        headers: {
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            res_id: resId,
            category_id: state.activeCategory,
            name: subName
        })
    });

    const data = await res.json();
    console.log(data);
    if (!data.success) return;

    const category = state.tree.find(
        c => c.id === String(state.activeCategory)
    );

    category.subcategories.push({
        id: String(data.subcategory._id),
        name: data.subcategory.name
    });

    render();
    closeSubcategoryDrawer();
};


/* ---------- Item name dropdown (Add / Edit item drawer) ----------
   Click the item name box -> shows all existing items in the same
   category as the selected subcategory. Click one to fill the name. */
const itemNameInput = document.getElementById("itemName");
const itemSubSelect = document.getElementById("itemSub");

const nameWrap = document.createElement("div");
nameWrap.style.position = "relative";
itemNameInput.parentNode.insertBefore(nameWrap, itemNameInput);
nameWrap.appendChild(itemNameInput);

const nameDropdown = document.createElement("div");
nameDropdown.style.cssText = `
  display:none;
  position:absolute;
  left:0;
  right:0;
  top:100%;
  margin-top:4px;
  z-index:50;
  max-height:220px;
  overflow-y:auto;
  background:#fff;
  border:1px solid #E1DED2;
  border-radius:8px;
  box-shadow:0 8px 20px rgba(0,0,0,.12);
`;
nameWrap.appendChild(nameDropdown);

function hideNameDropdown() {
    nameDropdown.style.display = "none";
}

function renderNameDropdown() {
    const info = getSubLookup()[itemSubSelect.value];
    if (!info) return hideNameDropdown();

    const q = itemNameInput.value.trim().toLowerCase();
    const subLookup = getSubLookup();
    const list = getCategoryItems(info.catId).filter(i =>
        i.name.toLowerCase().includes(q)
    );

    nameDropdown.innerHTML = "";

    if (!list.length) {
        const empty = document.createElement("div");
        empty.textContent = "No items in this category yet";
        empty.style.cssText = "padding:10px 12px;color:#87897F;font-size:13px;";
        nameDropdown.appendChild(empty);
    }

    list.forEach(i => {
        const row = document.createElement("div");
        row.style.cssText = `
      padding:8px 12px;
      cursor:pointer;
      display:flex;
      justify-content:space-between;
      gap:10px;
      font-size:14px;
    `;

        const label = document.createElement("span");
        label.textContent = i.name;

        const subLabel = document.createElement("span");
        subLabel.textContent = subLookup[i.subId]?.name || "";
        subLabel.style.cssText = "color:#87897F;font-size:11px;white-space:nowrap;";

        row.appendChild(label);
        row.appendChild(subLabel);

        row.onmouseenter = () => (row.style.background = "#F4F1E8");
        row.onmouseleave = () => (row.style.background = "transparent");
        row.onmousedown = e => e.preventDefault(); // keep input focused
        row.onclick = () => {
            itemNameInput.value = i.name;
            document.getElementById("itemDesc").value = i.desc || "";
            setUnitFields(i.unit || "");
            document.getElementById("itemPrice").value = i.price || "";
            document.getElementById("itemLow").value = i.lowAt || 10;
            document.getElementById("itemListed").checked = i.available ?? true;
            itemSubSelect.value = i.subId;

            // stock is left empty on purpose -> blink it so the user fills it
            const stockInput = document.getElementById("itemStock");
            stockInput.value = "";
            hideNameDropdown();
            blinkInput(stockInput);
        };

        nameDropdown.appendChild(row);
    });

    nameDropdown.style.display = "block";
}

itemNameInput.addEventListener("focus", renderNameDropdown);
itemNameInput.addEventListener("click", renderNameDropdown);
itemNameInput.addEventListener("input", renderNameDropdown);
itemSubSelect.addEventListener("change", () => {
    if (nameDropdown.style.display === "block") renderNameDropdown();
});
document.addEventListener("click", e => {
    if (!nameWrap.contains(e.target)) hideNameDropdown();
});


/* ---------- Blink effect for the stock input ---------- */
const blinkStyle = document.createElement("style");
blinkStyle.textContent = `
  @keyframes inputBlink {
    0%, 100% { box-shadow: 0 0 0 0 rgba(46,111,78,0); border-color: #E1DED2; background: inherit; }
    50% { box-shadow: 0 0 0 4px rgba(46,111,78,.35); border-color: #2E6F4E; background: #EAF4EE; }
  }
  .input-blink { animation: inputBlink .6s ease-in-out 3; }
`;
document.head.appendChild(blinkStyle);

function blinkInput(el) {
    el.classList.remove("input-blink");
    void el.offsetWidth; // restart animation
    el.classList.add("input-blink");
    el.focus();
    el.addEventListener("animationend", () => el.classList.remove("input-blink"), { once: true });
}


/* ---------- Pack size helpers (quantity input + unit select) ----------
   Stored/sent as one string, e.g. "5 kg". Existing values like "5 kg bag"
   are split into quantity "5" and unit "kg bag" (added to the select if new). */
function getUnitString() {
    const val = document.getElementById("itemUnitValue").value.trim();
    const unit = document.getElementById("itemUnit").value;
    return val ? `${val} ${unit}` : unit;
}

function setUnitFields(str) {
    const valInput = document.getElementById("itemUnitValue");
    const unitSelect = document.getElementById("itemUnit");

    const m = String(str || "").trim().match(/^([\d.]+)\s*(.*)$/);
    const val = m ? m[1] : "";
    const unit = m ? m[2].trim() : String(str || "").trim();

    valInput.value = val;

    if (!unit) {
        unitSelect.value = "kg";
        return;
    }

    let opt = Array.from(unitSelect.options).find(
        o => o.value.toLowerCase() === unit.toLowerCase()
    );
    if (!opt) {
        opt = document.createElement("option");
        opt.value = unit;
        opt.textContent = unit;
        unitSelect.appendChild(opt);
    }
    unitSelect.value = opt.value;
}


/* =====================================================================
   BARCODE SCANNER (Add item drawer)
   Scan button -> camera -> barcode number -> POST /get_item_details
   -> autofill name / pack size / photo, or "not found, enter manually".
   (Renamed from scanner/openScanner/closeScanner so it can't clash with
   the order QR scanner in section 5.)
===================================================================== */
const scanStyle = document.createElement("style");
scanStyle.textContent = `
  .scan-btn {
    width: 100%;
    padding: 12px;
    margin: 4px 0 6px;
    border: 1.5px dashed #2E6F4E;
    background: #EAF4EE;
    color: #2E6F4E;
    font-weight: 600;
    font-size: 14px;
    border-radius: 10px;
    cursor: pointer;
  }
  .scan-btn:disabled { opacity: .6; cursor: default; }
  .scan-status {
    display: none;
    font-size: 13px;
    padding: 8px 12px;
    border-radius: 8px;
    margin-bottom: 8px;
  }
  .scan-status.info { display: block; background: #EEF2F7; color: #34506E; }
  .scan-status.ok   { display: block; background: #EAF4EE; color: #2E6F4E; }
  .scan-status.warn { display: block; background: #FCEFDE; color: #C97A1F; }
  .scan-status.err  { display: block; background: #FBEAE7; color: #B23B30; }

  .photo-status {
    display: none;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    padding: 10px 12px;
    margin-top: 10px;
    border-radius: 10px;
  }
  .photo-status.loading { display: flex; background: #EEF2F7; color: #34506E; }
  .photo-status.failed  { display: flex; background: #FBEAE7; color: #B23B30; }
  .photo-spinner {
    width: 18px;
    height: 18px;
    border: 3px solid rgba(52, 80, 110, .25);
    border-top-color: #34506E;
    border-radius: 50%;
    animation: photoSpin .8s linear infinite;
    flex-shrink: 0;
  }
  .photo-status.failed .photo-spinner { display: none; }
  @keyframes photoSpin { to { transform: rotate(360deg); } }

  .scanner-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, .85);
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px;
    gap: 14px;
  }
  .scanner-overlay.open { display: flex; }
  .scanner-box {
    width: 100%;
    max-width: 420px;
    background: #000;
    border-radius: 14px;
    overflow: hidden;
  }
  .scanner-hint { color: #fff; font-size: 14px; text-align: center; }
  .scanner-cancel {
    padding: 10px 28px;
    border: none;
    border-radius: 8px;
    background: #fff;
    font-weight: 600;
    cursor: pointer;
  }
`;
document.head.appendChild(scanStyle);

// Scan button + status line, placed right under the drawer header
const scanWrap = document.createElement("div");
scanWrap.id = "scanWrap";
scanWrap.innerHTML = `
  <button type="button" id="scanBarcodeBtn" class="scan-btn">📷 Scan barcode</button>
  <div id="scanStatus" class="scan-status"></div>
`;
document.querySelector("#itemDrawer .drawer-header").after(scanWrap);

// Fullscreen camera overlay
const scannerOverlay = document.createElement("div");
scannerOverlay.className = "scanner-overlay";
scannerOverlay.innerHTML = `
  <div class="scanner-box"><div id="barcodeReader"></div></div>
  <div class="scanner-hint">Point the camera at the product barcode</div>
  <button type="button" class="scanner-cancel" id="scannerCancel">Cancel</button>
`;
document.body.appendChild(scannerOverlay);

const scanBtn = document.getElementById("scanBarcodeBtn");
const scanStatusEl = document.getElementById("scanStatus");

function setScanStatus(msg, kind = "info") {
    scanStatusEl.textContent = msg;
    scanStatusEl.className = "scan-status " + (msg ? kind : "");
}

let barcodeScanner = null;
let scanHandled = false;
let scanLibPromise = null;

function loadScannerLib() {
    if (window.Html5Qrcode) return Promise.resolve();
    if (scanLibPromise) return scanLibPromise;
    scanLibPromise = new Promise((resolve, reject) => {
        const s = document.createElement("script");
        s.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
        s.onload = resolve;
        s.onerror = () => {
            scanLibPromise = null;
            reject(new Error("scanner library failed to load"));
        };
        document.head.appendChild(s);
    });
    return scanLibPromise;
}

async function stopBarcodeScanner() {
    if (!barcodeScanner) return;
    try {
        if (barcodeScanner.isScanning) await barcodeScanner.stop();
        barcodeScanner.clear();
    } catch (e) {
        console.log("scanner stop:", e);
    }
    barcodeScanner = null;
}

async function closeBarcodeScanner() {
    await stopBarcodeScanner();
    scannerOverlay.classList.remove("open");
}

async function openBarcodeScanner() {
    setScanStatus("");

    try {
        await loadScannerLib();
    } catch (e) {
        setScanStatus("Scanner could not load. Please enter the details manually.", "err");
        return;
    }

    scanHandled = false;
    scannerOverlay.classList.add("open");

    barcodeScanner = new Html5Qrcode("barcodeReader", {
        formatsToSupport: [
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.CODE_128
        ],
        experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        verbose: false
    });

    try {
        await barcodeScanner.start(
            { facingMode: "environment" },
            { fps: 10, qrbox: { width: 280, height: 140 } },
            async decodedText => {
                if (scanHandled) return;
                scanHandled = true;
                await closeBarcodeScanner();
                lookupBarcode(decodedText);
            },
            () => { } // per-frame "no code found", ignore
        );
    } catch (err) {
        console.log("camera error:", err);
        await closeBarcodeScanner();
        setScanStatus(
            "Could not open the camera (check permission / HTTPS). Please enter the details manually.",
            "err"
        );
    }
}

scanBtn.addEventListener("click", openBarcodeScanner);
document.getElementById("scannerCancel").addEventListener("click", closeBarcodeScanner);

/* ---------- Image block: spinner while loading, message if it fails ---------- */
const photoStatusEl = document.createElement("div");
photoStatusEl.className = "photo-status";
photoStatusEl.innerHTML = `<div class="photo-spinner"></div><span id="photoStatusText"></span>`;
document.getElementById("preview").after(photoStatusEl);

const photoStatusText = document.getElementById("photoStatusText");
let imageToken = 0; // lets us ignore a slow image if the seller moved on

function showImageLoading() {
    photoStatusText.textContent = "Loading image…";
    photoStatusEl.className = "photo-status loading";
    // Save is disabled while the image loads so the photo is never silently lost
    document.getElementById("saveItemBtn").disabled = true;
}

function showImageFailed() {
    photoStatusText.textContent = "Failed to fetch the image. Please upload a photo manually.";
    photoStatusEl.className = "photo-status failed";
    document.getElementById("saveItemBtn").disabled = false;
}

function hideImageStatus() {
    photoStatusEl.className = "photo-status";
    document.getElementById("saveItemBtn").disabled = false;
}

function resetPhotoUi() {
    imageToken++; // cancels any image still loading
    hideImageStatus();
    document.getElementById("photo").value = "";
    const previewImg = document.getElementById("preview");
    previewImg.style.display = "none";
    previewImg.removeAttribute("src");
}

// Seller picks their own photo: stop the barcode image and show their choice
document.getElementById("photo").addEventListener("change", e => {
    imageToken++;
    hideImageStatus();
    const previewImg = document.getElementById("preview");
    const f = e.target.files[0];
    if (f) {
        previewImg.src = URL.createObjectURL(f);
        previewImg.style.display = "block";
    } else {
        previewImg.style.display = "none";
        previewImg.removeAttribute("src");
    }
});

/* ---------- Barcode lookup + autofill ---------- */
async function lookupBarcode(barcode) {
    resetPhotoUi();
    setScanStatus(`Barcode ${barcode} scanned. Looking up item…`, "info");
    scanBtn.disabled = true;

    try {
        const res = await fetch("/get_item_details", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ barcode })
        });

        if (res.status === 401) {
            alert("unauthorized,Please Log in");
            window.location.href = "/login/seller";
            return;
        }

        if (res.status === 404) {
            setScanStatus("Item not found. Please enter the details manually.", "warn");
            return;
        }

        const data = await res.json();
        if (!res.ok || !data.success) {
            setScanStatus(
                data.message || "Something went wrong. Please enter the details manually.",
                "err"
            );
            return;
        }

        // Text fields are filled immediately; the image loads in the background
        fillFromBarcodeDetails(data.details);
        setScanStatus("Item found. Details filled in, please check and add price & stock.", "ok");
    } catch (e) {
        console.log("lookup error:", e);
        setScanStatus("Network error. Please enter the details manually.", "err");
    } finally {
        scanBtn.disabled = false;
    }
}

function fillFromBarcodeDetails(d) {
    if (d.product_name) {
        document.getElementById("itemName").value = d.product_name.trim();
        document.getElementById("itemDesc").value =
            `${(d.product_name || "").trim()} ${d.product_quantity || ""} ${d.product_units || ""} pack`
                .trim()
                .replace(/\s+/g, " ");
    }

    // Pack size: "500" + "g" -> setUnitFields("500 g")
    if (d.product_quantity) {
        let prod_quantity = d.product_units === "g"
            ? d.product_quantity / 1000
            : d.product_quantity;

        let prod_units = d.product_units === "g"
            ? "kg"
            : d.product_units;
        setUnitFields(`${prod_quantity} ${prod_units || ""}`.trim());
    }

    hideNameDropdown();

    // price & stock are never in the barcode database -> make the seller fill them
    blinkInput(document.getElementById("itemPrice"));

    // not awaited on purpose: the form is usable while the image loads
    if (d.image_url) attachBarcodeImage(d.image_url);
}

async function attachBarcodeImage(url) {
    const myToken = ++imageToken;
    showImageLoading();

    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 10000); // give up after 10 s

    try {
        const resp = await fetch(url, { signal: ctrl.signal });
        if (!resp.ok) throw new Error("image http " + resp.status);

        const blob = await resp.blob();
        if (!blob.type.startsWith("image/")) throw new Error("not an image");

        if (myToken !== imageToken) return; // seller moved on, ignore

        const file = new File([blob], "product.jpg", { type: blob.type });
        const dt = new DataTransfer();
        dt.items.add(file);
        document.getElementById("photo").files = dt.files; // uploaded when Save is pressed

        const previewImg = document.getElementById("preview");
        previewImg.src = URL.createObjectURL(blob);
        previewImg.style.display = "block";
        hideImageStatus();
    } catch (e) {
        console.log("could not load image:", e);
        if (myToken !== imageToken) return;
        showImageFailed();
    } finally {
        clearTimeout(timer);
    }
}

/* =====================================================================
   5. ORDERS  (was seller_orders.js)
===================================================================== */
const filterDropdown = document.getElementById("filterDropdown");
filterDropdown.addEventListener("change", applyFilter);

// Latest orders from the server. The QR scanner matches tokens against this,
// not against the DOM, so it works whatever the filter is showing.
let sellerOrders = [];

function updateActiveCount() {
    const active = sellerOrders.filter(o => o.status === "placed").length;
    const el = document.getElementById("active_orders");
    if (el) el.textContent = active;
}

function applyFilter() {
    const selected = filterDropdown.value.toLowerCase();
    const cards = document.querySelectorAll(".order-card");
    const noOrdersMessage = document.getElementById("noOrdersMessage");
    let hasVisibleCards = false;

    cards.forEach(card => {
        const statusText = card.querySelector(".order-status")
            .textContent
            .trim()
            .toLowerCase();
        const show = selected === "all" || statusText === selected;

        card.style.display = show ? "block" : "none";

        if (show) {
            hasVisibleCards = true;
        }
        const buttons = card.querySelectorAll(".statusBtn");

        buttons.forEach(btn => {
            const enable = selected === "placed";
            btn.disabled = !enable;
            btn.style.opacity = enable ? "1" : "0.5";
            btn.style.cursor = enable ? "pointer" : "not-allowed";
            btn.style.visibility = enable ? "visible" : "hidden";
            btn.style.display = enable ? "inline-block" : "none";
        });
    });
    if (hasVisibleCards) {
        noOrdersMessage.style.display = "none";
    } else {
        noOrdersMessage.style.display = "block";

        if (selected === "pending") {
            noOrdersMessage.textContent = "No pending orders.";
        } else if (selected === "completed") {
            noOrdersMessage.textContent = "No completed orders.";
        } else if (selected === "placed") {
            noOrdersMessage.textContent = "No placed orders.";
        } else {
            noOrdersMessage.textContent = "No orders found.";
        }
    }
}

const ordersList = document.getElementById("orders-list");

// ----- live updates (uses the shared socket from section 1) -----
socket.on("connect", () => {
    console.log("Connected:", socket.id);

    socket.emit("join_seller_room", {
        seller_id: resId
    });
});

socket.on("new_order", () => {
    console.log("New order received → reloading...");
    loadOrders();
});

socket.on("seller_order_cancelled", (data) => {
    console.log("User cancelled order:", data.token_no);

    const cards = document.querySelectorAll(".order-card");
    cards.forEach(card => {
        const cardToken = card.querySelector(".token-no").textContent.split(": ")[1].trim();

        if (cardToken === String(data.token_no)) {
            card.style.backgroundColor = "#ffebee";
            setTimeout(() => card.remove(), 1500);
        }
    });

    // keep the scanner's data in sync
    sellerOrders.forEach(o => {
        if (String(o.token_no) === String(data.token_no)) o.status = "canceled";
    });
    updateActiveCount();
});

async function loadOrders() {
    const res = await fetch(`/seller/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "res_id": resId })
    });
    if (res.status == 401) {
        alert("unauthorized,Please Log in");
        window.location.href = "/login/seller";
        return;
    }
    const data = await res.json();
    console.log(data);
    if (!data.success) {
        ordersList.innerHTML = `<p>Error loading orders - ${data.message}</p>`;
        return;
    }

    sellerOrders = data.orders || [];
    ordersList.innerHTML = "";

    data.orders.forEach(order => {
        let total = 0;

        let restaurantsHTML = "";

        Object.entries(order.items).forEach(([itemName, detail]) => {
            const itemTotal = detail.price * detail.qty;
            total += itemTotal;

            restaurantsHTML += `
                    <div class="item" item_id="${escapeSellerHtml(itemName)}">
                        <span>${escapeSellerHtml(detail.name)} x ${escapeSellerHtml(detail.qty)}</span>
                        <span>₹${itemTotal}</span>
                    </div>
                `;
        });

        const orderHTML = `
            <div class="order-card" user_id="${escapeSellerHtml(order.user_id)}">
                <div class="order-header">
                    <span class="order-id">#${escapeSellerHtml(order.order_id)}</span>
                    <span class="order-status status-${escapeSellerHtml(order.status)}">
                        ${escapeSellerHtml(order.status)}
                    </span>
                </div>
                <div class="token-no">Token No: ${escapeSellerHtml(order.token_no)}</div>
                <div class="order-date">${escapeSellerHtml(order.time)}</div>
                <div class="order-date">Pickup Time: ${escapeSellerHtml(order.pickup_time)}</div>
                ${restaurantsHTML}

                <div class="total">Total: ₹${total}</div>
                <button class="completeBtn statusBtn" style="
                    background: green;
                    color: white;
                    padding: 5px 11px;
                    border-radius: 7px;
                    border: none;
                    cursor: pointer;
                ">Completed</button>
                <button class="cancelBtn statusBtn" style="
                    background: red;
                    cursor: pointer;
                    color: white;
                    padding: 5px 11px;
                    border-radius: 7px;
                    border: none;
                ">Cancel Order</button>
            </div>
        `;

        ordersList.innerHTML += orderHTML;
    });
    updateActiveCount();
    applyFilter();
}

// ---------------------------------------------------------------
// Change an order's status (used by the card buttons AND the QR scanner)
// order = { order_id, user_id, token_no }
// ---------------------------------------------------------------
async function setOrderStatus(order, status) {
    const res = await fetch("/update_order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            order_id: order.order_id,
            status: status,
            user_id: order.user_id
        })
    });
    const data = await res.json();
    if (!data.success) {
        alert("failed updating status");
        return false;
    }

    socket.emit("order_completed", {
        order_id: order.order_id,
        userid: order.user_id,
        token_no: order.token_no,
        res_id: resId,
        status: status
    });

    const known = sellerOrders.find(o => String(o.order_id) === String(order.order_id));
    if (known) known.status = status;

    document.querySelectorAll(".order-card").forEach(card => {
        const id = card.querySelector(".order-id").textContent.replace("#", "");
        if (id === String(order.order_id)) card.remove();
    });

    updateActiveCount();
    applyFilter();
    console.log(status, "sent:", order.order_id, order.token_no);
    return true;
}

document.addEventListener("click", async (e) => {
    const isComplete = e.target.classList.contains("completeBtn");
    const isCancel = e.target.classList.contains("cancelBtn");
    if (!isComplete && !isCancel) return;

    const card = e.target.closest(".order-card");

    await setOrderStatus({
        order_id: card.querySelector(".order-id").textContent.replace("#", ""),
        token_no: card.querySelector(".token-no").textContent.split(": ")[1],
        user_id: card.getAttribute("user_id")
    }, isComplete ? "completed" : "canceled");
});

// ===============================================================
// QR SCANNER  (full-screen in-app camera, square scan frame in the centre)
// Renamed from scanner/openScanner/closeScanner/stopCamera so it can't
// clash with the barcode scanner in section 4.
// ===============================================================

const JSQR_URL = "https://unpkg.com/jsqr@1.4.0/dist/jsQR.js";
let jsQRPromise = null;

const qr = {
    stream: null,
    raf: 0,
    running: false,
    last: 0,
    current: null,   // the order currently shown in the result sheet
    canvas: document.createElement("canvas"),
};
qr.ctx = qr.canvas.getContext("2d", { willReadFrequently: true });

// Loads the QR decoder on demand
function ensureJsQR() {
    if (typeof jsQR !== "undefined") return Promise.resolve(true);
    if (jsQRPromise) return jsQRPromise;
    jsQRPromise = new Promise((resolve) => {
        const el = document.createElement("script");
        el.src = JSQR_URL;
        el.onload = () => resolve(typeof jsQR !== "undefined");
        el.onerror = () => { jsQRPromise = null; resolve(false); };
        document.head.appendChild(el);
    });
    return jsQRPromise;
}

// Built once, reused every time
function ensureScannerUI() {
    let root = document.getElementById("qrScanner");
    if (root) return root;

    const style = document.createElement("style");
    style.id = "qrScannerStyle";
    style.textContent = `
        #qrScanner {
            --s: min(70vw, 70vh, 320px);
            position: fixed;
            inset: 0;
            z-index: 3000;
            background: #000;
            overflow: hidden;
            display: none;
        }
        #qrScanner.show { display: block; }

        #qrScanner video {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            object-fit: cover;
            background: #000;
        }

        #qrScanner .scanTop {
            position: absolute;
            top: 0; left: 0; right: 0;
            z-index: 3;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: calc(14px + env(safe-area-inset-top, 0px)) 16px 24px;
            color: #fff;
            background: linear-gradient(rgba(0,0,0,0.65), transparent);
        }
        #qrScanner .scanTitle { font-size: 16px; font-weight: 700; }
        #qrScanner .scanClose {
            width: 38px; height: 38px;
            border: none;
            border-radius: 50%;
            background: rgba(255,255,255,0.18);
            color: #fff;
            font-size: 20px;
            line-height: 1;
            cursor: pointer;
        }

        /* the square: the huge box-shadow darkens everything outside it */
        #qrScanner .scanFrame {
            position: absolute;
            top: 50%; left: 50%;
            width: var(--s);
            height: var(--s);
            transform: translate(-50%, -50%);
            border-radius: 18px;
            box-shadow: 0 0 0 100vmax rgba(0,0,0,0.62);
            z-index: 2;
        }
        #qrScanner .scanFrame i {
            position: absolute;
            width: 34px; height: 34px;
            border: 4px solid #E8491D;
        }
        #qrScanner .scanFrame i:nth-child(1) { top: -2px; left: -2px; border-right: none; border-bottom: none; border-top-left-radius: 18px; }
        #qrScanner .scanFrame i:nth-child(2) { top: -2px; right: -2px; border-left: none; border-bottom: none; border-top-right-radius: 18px; }
        #qrScanner .scanFrame i:nth-child(3) { bottom: -2px; left: -2px; border-right: none; border-top: none; border-bottom-left-radius: 18px; }
        #qrScanner .scanFrame i:nth-child(4) { bottom: -2px; right: -2px; border-left: none; border-top: none; border-bottom-right-radius: 18px; }

        #qrScanner .scanLine {
            position: absolute;
            left: 8%; right: 8%;
            height: 3px;
            border-radius: 3px;
            background: #E8491D;
            box-shadow: 0 0 12px #E8491D;
            animation: scanMove 2s ease-in-out infinite alternate;
        }
        @keyframes scanMove { from { top: 6%; } to { top: 94%; } }

        #qrScanner .scanHint {
            position: absolute;
            left: 0; right: 0;
            top: calc(50% + var(--s) / 2 + 20px);
            z-index: 3;
            text-align: center;
            color: #fff;
            font-size: 14px;
            padding: 0 24px;
        }

        /* result bottom sheet */
        #scanResult {
            position: fixed;
            left: 0; right: 0; bottom: 0;
            margin: 0 auto;
            width: 100%;
            max-width: 480px;
            max-height: 80vh;
            overflow-y: auto;
            background: #FFFDF9;
            color: #241C1A;
            border-radius: 20px 20px 0 0;
            padding: 12px 20px calc(22px + env(safe-area-inset-bottom, 0px));
            box-shadow: 0 -14px 40px -18px rgba(36,28,26,0.6);
            transform: translateY(100%);
            transition: transform 0.35s cubic-bezier(0.22, 0.8, 0.3, 1);
            z-index: 3001;
        }
        #scanResult.show { transform: translateY(0); }
        #scanResult .srHandle { width: 40px; height: 4px; background: #E7D8C3; border-radius: 999px; margin: 0 auto 14px; }
        #scanResult .srBadge { display: inline-block; padding: 6px 12px; border-radius: 999px; font-size: 13px; font-weight: 700; margin-bottom: 10px; }
        #scanResult .srBadge.ok { background: #E3F4EA; color: #1F8A4C; }
        #scanResult .srBadge.warn { background: #FFF1D6; color: #9A6200; }
        #scanResult .srBadge.bad { background: #FDE8E2; color: #C23A15; }
        #scanResult .srMeta { margin: 2px 0; font-size: 13px; color: #6b5f58; }
        #scanResult .srToken { margin: 0 0 6px; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 18px; }
        #scanResult .srItems { margin: 12px 0 6px; border-top: 1px dashed #E7D8C3; }
        #scanResult .srItem { display: flex; justify-content: space-between; padding: 9px 0; border-bottom: 1px dashed #E7D8C3; font-size: 14px; }
        #scanResult .srTotal { display: flex; justify-content: space-between; font-weight: 700; font-size: 16px; padding: 10px 0 14px; }
        #scanResult button { width: 100%; border: none; border-radius: 12px; padding: 14px 0; font-weight: 700; font-size: 15px; cursor: pointer; margin-top: 8px; }
        #scanResult .srPrimary { background: #1F8A4C; color: #fff; }
        #scanResult .srGhost { background: transparent; color: #6b5f58; border: 1px solid #E7D8C3; }

        #qrScanner .cameraLoading {
            position: absolute;
            inset: 0;
            z-index: 5;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 14px;
            background: #101010;
            color: #fff;
            font-size: 14px;
        }
        #qrScanner .cameraLoading .spinner {
            width: 30px;
            height: 30px;
            border: 3px solid #444;
            border-top-color: #E8491D;
            border-radius: 50%;
            animation: cameraSpin 0.8s linear infinite;
        }
        @keyframes cameraSpin { to { transform: rotate(360deg); } }

        #qrScanner.camera-ready .cameraLoading { display: none; }

        #qrScanner:not(.camera-ready) .scanFrame,
        #qrScanner:not(.camera-ready) .scanTop,
        #qrScanner:not(.camera-ready) .scanHint {
            visibility: hidden;
        }
    `;
    document.head.appendChild(style);

    root = document.createElement("div");
    root.id = "qrScanner";
    root.innerHTML = `
        <video playsinline muted autoplay></video>
        <div class="cameraLoading">
            <div class="spinner"></div>
            <span>Starting camera...</span>
        </div>
        <div class="scanTop">
            <span class="scanTitle">Scan customer QR</span>
            <button type="button" class="scanClose" aria-label="Close scanner">✕</button>
        </div>
        <div class="scanFrame">
            <i></i><i></i><i></i><i></i>
            <div class="scanLine"></div>
        </div>
        <div class="scanHint">Align the QR code inside the square</div>
    `;

    const result = document.createElement("div");
    result.id = "scanResult";
    result.setAttribute("role", "dialog");
    result.setAttribute("aria-label", "Scanned order");

    document.body.appendChild(root);
    document.body.appendChild(result);

    root.querySelector(".scanClose").addEventListener("click", closeQrScanner);
    result.addEventListener("click", onScanResultClick);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeQrScanner(); });
    // never leave the camera running in the background
    document.addEventListener("visibilitychange", () => { if (document.hidden) closeQrScanner(); });

    return root;
}

function setScanHint(text) {
    const hint = document.querySelector("#qrScanner .scanHint");
    if (hint) hint.textContent = text;
}

async function openQrScanner() {
    const root = ensureScannerUI();
    root.classList.remove("camera-ready");
    const video = root.querySelector("video");

    hideScanResult();
    root.classList.add("show");
    document.body.style.overflow = "hidden";
    setScanHint("Starting camera...");

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        setScanHint("Camera is not available here. Open this page over HTTPS in a browser that supports the camera.");
        return;
    }

    try {
        // ask for the camera and load the decoder at the same time
        const [stream, libOk] = await Promise.all([
            navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: false
            }),
            ensureJsQR()
        ]);

        // user closed the scanner while we were waiting
        if (!root.classList.contains("show")) {
            stream.getTracks().forEach(t => t.stop());
            return;
        }
        if (!libOk) {
            stream.getTracks().forEach(t => t.stop());
            setScanHint("Couldn't load the scanner. Check your connection and try again.");
            return;
        }

        qr.stream = stream;
        video.srcObject = stream;
        video.muted = true;
        await video.play();

        // Wait until the camera provides actual video frames
        if (video.readyState < 2) {
            await new Promise((resolve, reject) => {
                video.addEventListener("loadeddata", resolve, { once: true });
                video.addEventListener("error", reject, { once: true });
            });
        }

        if (!root.classList.contains("show")) {
            stopQrCamera();
            return;
        }

        root.classList.add("camera-ready");
        setScanHint("Align the QR code inside the square");
        startScanLoop();
    } catch (err) {
        console.error("camera error", err);
        if (err && (err.name === "NotAllowedError" || err.name === "SecurityError")) {
            setScanHint("Camera permission was denied. Allow camera access in your browser settings and try again.");
        } else if (err && err.name === "NotFoundError") {
            setScanHint("No camera found on this device.");
        } else {
            setScanHint("Couldn't start the camera. Close other apps using it and try again.");
        }
    }
}

function stopQrCamera() {
    qr.running = false;
    cancelAnimationFrame(qr.raf);
    if (qr.stream) {
        qr.stream.getTracks().forEach(t => t.stop());
        qr.stream = null;
    }
    const video = document.querySelector("#qrScanner video");
    if (video) video.srcObject = null;
}

function closeQrScanner() {
    const root = document.getElementById("qrScanner");
    if (!root) return;
    stopQrCamera();
    hideScanResult();
    root.classList.remove("show");
    document.body.style.overflow = "";
}

function startScanLoop() {
    qr.running = true;
    qr.last = 0;
    cancelAnimationFrame(qr.raf);
    qr.raf = requestAnimationFrame(scanTick);
}

function scanTick(ts) {
    if (!qr.running) return;
    qr.raf = requestAnimationFrame(scanTick);

    if (ts - qr.last < 120) return; // ~8 decodes per second is plenty
    qr.last = ts;

    const video = document.querySelector("#qrScanner video");
    const frame = document.querySelector("#qrScanner .scanFrame");
    if (!video || !frame || video.readyState < 2 || !video.videoWidth) return;

    // Decode ONLY what is inside the square: map the on-screen square back to
    // video pixels (the video is shown with object-fit: cover).
    const vr = video.getBoundingClientRect();
    const fr = frame.getBoundingClientRect();
    const scale = Math.max(vr.width / video.videoWidth, vr.height / video.videoHeight);
    const offX = (video.videoWidth * scale - vr.width) / 2;
    const offY = (video.videoHeight * scale - vr.height) / 2;
    const sx = (fr.left - vr.left + offX) / scale;
    const sy = (fr.top - vr.top + offY) / scale;
    const ss = fr.width / scale;

    const size = Math.max(120, Math.min(400, Math.round(ss)));
    qr.canvas.width = size;
    qr.canvas.height = size;
    qr.ctx.drawImage(video, sx, sy, ss, ss, 0, 0, size, size);

    const img = qr.ctx.getImageData(0, 0, size, size);
    const code = jsQR(img.data, size, size, { inversionAttempts: "dontInvert" });

    if (code && code.data && code.data.trim()) {
        handleScan(code.data.trim());
    }
}

// Pending ("placed") order with this token, falling back to any order with it
function matchToken(token) {
    const t = String(token).trim().toUpperCase();
    const matches = sellerOrders.filter(o => String(o.token_no).trim().toUpperCase() === t);
    return {
        active: matches.find(o => o.status === "placed") || null,
        any: matches[0] || null
    };
}

async function handleScan(token) {
    // pause scanning while we show the result
    qr.running = false;
    cancelAnimationFrame(qr.raf);
    if (navigator.vibrate) navigator.vibrate(60);

    let match = matchToken(token);

    // not found? the list may be stale (new order just came in) - refresh once and retry
    if (!match.any) {
        setScanHint("Checking orders...");
        try { await loadOrders(); } catch (e) { console.error(e); }
        match = matchToken(token);
    }

    if (match.active) {
        showScanResult("ok", match.active, token);
    } else if (match.any) {
        showScanResult("warn", match.any, token);
    } else {
        showScanResult("bad", null, token);
    }
}

function showScanResult(kind, order, token) {
    const sheet = document.getElementById("scanResult");
    qr.current = kind === "ok" ? order : null;

    let html = "";

    if (kind === "ok") {
        let total = 0;
        const rows = Object.values(order.items || {}).map(it => {
            const line = (Number(it.price) || 0) * (Number(it.qty) || 0);
            total += line;
            return `<div class="srItem"><span>${escapeSellerHtml(it.name)} x ${escapeSellerHtml(it.qty)}</span><span>₹${line}</span></div>`;
        }).join("");

        let fulfil;
        if (order.order_type === "delivery" && order.delivery_address) {
            const a = order.delivery_address;
            fulfil = `Delivery to: ${escapeSellerHtml(a.adrs_type)} - ${escapeSellerHtml(a.address)}`;
        } else {
            fulfil = `Pickup time: ${escapeSellerHtml(order.pickup_time || "-")}`;
        }

        html = `
            <div class="srHandle"></div>
            <span class="srBadge ok">✓ Pending order found</span>
            <p class="srToken">Token ${escapeSellerHtml(order.token_no)}</p>
            <p class="srMeta">Order #${escapeSellerHtml(order.order_id)}</p>
            <p class="srMeta">${fulfil}</p>
            <div class="srItems">${rows}</div>
            <div class="srTotal"><span>Total</span><span>₹${total}</span></div>
            <button type="button" class="srPrimary" data-act="complete">Mark as Completed</button>
            <button type="button" class="srGhost" data-act="again">Scan another</button>
        `;
    } else if (kind === "warn") {
        html = `
            <div class="srHandle"></div>
            <span class="srBadge warn">Order is not pending</span>
            <p class="srToken">Token ${escapeSellerHtml(order.token_no)}</p>
            <p class="srMeta">This order is already ${escapeSellerHtml(order.status)}, so it can't be handed over again.</p>
            <button type="button" class="srPrimary" data-act="again" style="background:#E8491D;">Scan again</button>
            <button type="button" class="srGhost" data-act="close">Close</button>
        `;
    } else {
        html = `
            <div class="srHandle"></div>
            <span class="srBadge bad">No matching order</span>
            <p class="srToken">${escapeSellerHtml(token)}</p>
            <p class="srMeta">No order with this token was found for your shop. Check that the customer is showing the right QR.</p>
            <button type="button" class="srPrimary" data-act="again" style="background:#E8491D;">Scan again</button>
            <button type="button" class="srGhost" data-act="close">Close</button>
        `;
    }

    sheet.innerHTML = html;
    void sheet.offsetHeight; // make sure the slide-up transition always plays
    sheet.classList.add("show");
}

function hideScanResult() {
    const sheet = document.getElementById("scanResult");
    if (!sheet) return;
    sheet.classList.remove("show");
    qr.current = null;
}

async function onScanResultClick(e) {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;

    if (act === "again") {
        hideScanResult();
        setScanHint("Align the QR code inside the square");
        startScanLoop();
    } else if (act === "close") {
        closeQrScanner();
    } else if (act === "complete" && qr.current) {
        btn.disabled = true;
        const ok = await setOrderStatus({
            order_id: qr.current.order_id,
            user_id: qr.current.user_id,
            token_no: qr.current.token_no
        }, "completed");
        if (ok) {
            closeQrScanner();
        } else {
            btn.disabled = false;
        }
    }
}

const scanQrBtn = document.getElementById("scanQrBtn");
if (scanQrBtn) scanQrBtn.addEventListener("click", openQrScanner);

/* =====================================================================
   6. BOOT  (wiring that crosses sections)
===================================================================== */
lucide.createIcons();

// Dashboard quick actions -> inventory
document.getElementById("quickAddItemBtn").addEventListener("click", () => {
    showView("inventory", false);
    openItemDrawer();
});
document.getElementById("updateStockBtn").addEventListener("click", () => {
    // "Restock low items": jump to inventory with the low-stock filter on
    showView("inventory", false);
    state.stockFilter = "low";
    document.getElementById("stockFilter").value = "low";
    render();
});

// Inventory "home" icon -> dashboard
document.getElementById("homeBtn").addEventListener("click", () => showView("dashboard"));

// Initial data for all three views
applyFilter();
loadDashboard();
loadInventory();
loadOrders();

// Open the view from the URL hash if present (e.g. /seller/Ramesh/123#orders);
// otherwise keep the one Flask marked active via `page`.
const hashView = location.hash.slice(1);
if (VIEWS.includes(hashView)) showView(hashView, false);