/* =====================================================================
   seller.js  —  merged from:
     base.js + sidebar.js + seller_dashboard.js + menu_seller.js + seller_orders.js

   Sections
     1. Shared setup (URL params, socket, helpers)
     2. Navigation (views, nav sidebar, catalogue sidebar, logout)
     3. Dashboard
     4. Inventory (catalogue, items, barcode scanner)
     5. Orders (order cards, edit items, QR scanner)
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

/* ----- Nav sidebar (Dashboard / Orders / Inventory ...) -----
   Phone: opens as a drawer from the ☰ button. Visibility is controlled by
   CSS only (.show class), never by inline styles, so the icon rail on the
   Inventory page can't get stuck hidden. */
const navSidebar = document.querySelector("aside.sidebar");
const navOverlay = document.getElementById("overlayContainer");

function openNavSidebar() {
    navSidebar.classList.add("show");
    navOverlay.classList.add("show");
}

function closeNavSidebar() {
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

    // leaving Inventory: tuck the catalogue drawer away
    if (name !== "inventory") closeCatalogueSidebar();

    document.querySelectorAll(".view").forEach(v =>
        v.classList.toggle("active", v.id === "view-" + name));
    document.querySelectorAll(".nav-item[data-view], .nav-btn[data-view]").forEach(b =>
        b.classList.toggle("active", b.dataset.view === name));

    history.replaceState(null, "", "#" + name);

    // only close the mobile drawer; on desktop the sidebar stays put
    if (navOverlay.classList.contains("show")) closeNavSidebar();
    window.scrollTo(0, 0);

    if (name === "orders") markOrdersSeen();

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
let newOrdersList = []; // pending orders newer than the last Orders visit (shown in the bell sheet)

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

        // New orders = pending orders created after the Orders view was last opened
        const lastAccessedOrders = localStorage.getItem("lastAccessedOrders");
        const newOrders = (statsData.recent_orders || []).filter(order =>
            order.status === "placed" &&
            order.created_at &&
            (!lastAccessedOrders ||
                parseServerDate(order.created_at) > new Date(lastAccessedOrders))
        );
        console.log(`${newOrders.length} new orders`);
        newOrdersList = newOrders;
        setNotifDot(newOrders.length > 0);

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
// Server timestamps have no timezone and are UTC -> parse them as UTC
function parseServerDate(iso) {
    if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(iso)) {
        iso += "Z";
    }
    return new Date(iso);
}

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
                    // phone: the catalogue is a drawer, close it after picking
                    if (window.innerWidth <= 720) {
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
    // phone: the catalogue is a drawer, close it after picking
    if (window.innerWidth <= 720) {
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

// Catalogue (category tree) sidebar — separate from the nav sidebar.
// Phone only: it is a slide-out drawer there; on desktop it's always visible.
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
        const buttons = card.querySelectorAll(".statusBtn, .editOrderBtn");

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
    if (!document.getElementById("view-orders").classList.contains("active")) setNotifDot(true);
    if (notifSheetOpen()) loadDashboard().then(() => { if (notifSheetOpen()) renderNotifSheet(); });
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

// Red dot on the dashboard bell: visible only while there are unseen new orders
function setNotifDot(show) {
    const dot = document.getElementById("notifDot");
    if (dot) dot.hidden = !show;
}

// Remember when the seller last looked at the Orders view
function markOrdersSeen() {
    localStorage.setItem("lastAccessedOrders", new Date().toISOString());
    setNotifDot(false);
}

/* =====================================================================
   Notifications bottom sheet (opens from the bell)
   Lists the new orders: token no, items, customer, amount, "2 hr ago".
   Built once on first open (same approach as the QR scanner UI).
===================================================================== */
function notifSheetOpen() {
    const el = document.getElementById("notifSheet");
    return !!el && el.classList.contains("show");
}

function ensureNotifSheet() {
    let sheet = document.getElementById("notifSheet");
    if (sheet) return sheet;

    const style = document.createElement("style");
    style.id = "notifSheetStyle";
    style.textContent = `
        #notifBackdrop {
            position: fixed; inset: 0;
            background: rgba(32, 35, 31, .45);
            z-index: 2000;
            opacity: 0; pointer-events: none;
            transition: opacity .25s ease;
        }
        #notifBackdrop.show { opacity: 1; pointer-events: auto; }

        #notifSheet {
            position: fixed; left: 0; right: 0; bottom: 0;
            margin: 0 auto;
            width: 100%; max-width: 480px; max-height: 80vh;
            display: flex; flex-direction: column;
            background: var(--card, #FFFFFB);
            color: var(--ink, #20231F);
            border-radius: 20px 20px 0 0;
            box-shadow: 0 -14px 40px -18px rgba(0, 0, 0, .45);
            padding-bottom: env(safe-area-inset-bottom, 0px);
            transform: translateY(100%);
            transition: transform .32s cubic-bezier(.22, .8, .3, 1);
            z-index: 2001;
        }
        #notifSheet.show { transform: translateY(0); }

        #notifSheet .nt-handle { width: 40px; height: 4px; border-radius: 999px; background: var(--line, #E1DED2); margin: 10px auto 4px; flex-shrink: 0; }
        #notifSheet .nt-head { display: flex; align-items: center; justify-content: space-between; padding: 8px 20px 12px; flex-shrink: 0; }
        #notifSheet .nt-title { font-size: 17px; font-weight: 700; display: flex; align-items: center; gap: 8px; }
        #notifSheet .nt-count { display: none; min-width: 22px; padding: 2px 8px; border-radius: 999px; background: var(--danger, #B23B30); color: #fff; font-size: 12px; font-weight: 600; text-align: center; }
        #notifSheet .nt-close { width: 34px; height: 34px; border: none; border-radius: 50%; background: rgba(0, 0, 0, .06); color: inherit; font-size: 16px; cursor: pointer; }

        #notifSheet .nt-list { overflow-y: auto; padding: 0 20px; flex: 1; min-height: 0; }
        #notifSheet .nt-item { display: flex; align-items: center; gap: 12px; padding: 14px 0; border-top: 1px solid var(--line, #E1DED2); }
        #notifSheet .nt-token { flex-shrink: 0; min-width: 58px; padding: 8px 10px; border-radius: 10px; background: var(--blue-lt, #EBF0F6); color: var(--blue, #2C4A6E); text-align: center; font-family: var(--font-mono, 'JetBrains Mono', monospace); font-weight: 700; font-size: 15px; line-height: 1.1; }
        #notifSheet .nt-token small { display: block; margin-bottom: 2px; font-family: inherit; font-size: 9px; font-weight: 600; letter-spacing: .06em; text-transform: uppercase; opacity: .75; }
        #notifSheet .nt-body { flex: 1; min-width: 0; }
        #notifSheet .nt-items { font-size: 13.5px; font-weight: 600; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow-wrap: anywhere; }
        #notifSheet .nt-meta { margin-top: 3px; font-size: 12px; color: var(--muted, #87897F); }
        #notifSheet .nt-side { flex-shrink: 0; text-align: right; }
        #notifSheet .nt-amt { font-weight: 700; font-size: 14px; }
        #notifSheet .nt-time { margin-top: 3px; font-size: 11.5px; color: var(--muted, #87897F); white-space: nowrap; }
        #notifSheet .nt-empty { padding: 36px 0 30px; text-align: center; font-size: 14px; color: var(--muted, #87897F); }

        #notifSheet .nt-foot { padding: 12px 20px 18px; flex-shrink: 0; border-top: 1px solid var(--line, #E1DED2); }
        #notifSheet .nt-primary { width: 100%; border: none; border-radius: 12px; padding: 13px 0; background: var(--blue, #2C4A6E); color: #fff; font-size: 14px; font-weight: 600; cursor: pointer; }
    `;
    document.head.appendChild(style);

    const backdrop = document.createElement("div");
    backdrop.id = "notifBackdrop";

    sheet = document.createElement("div");
    sheet.id = "notifSheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "New orders");
    sheet.innerHTML = `
        <div class="nt-handle"></div>
        <div class="nt-head">
            <div class="nt-title">New orders <span class="nt-count" id="ntCount"></span></div>
            <button type="button" class="nt-close" aria-label="Close">✕</button>
        </div>
        <div class="nt-list" id="ntList"></div>
        <div class="nt-foot"><button type="button" class="nt-primary" id="ntViewAll">View all orders</button></div>
    `;

    document.body.appendChild(backdrop);
    document.body.appendChild(sheet);

    backdrop.addEventListener("click", closeNotifSheet);
    sheet.querySelector(".nt-close").addEventListener("click", closeNotifSheet);
    sheet.querySelector("#ntViewAll").addEventListener("click", () => {
        closeNotifSheet();
        showView("orders"); // opening Orders also marks everything as seen
    });
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && notifSheetOpen()) closeNotifSheet(); });

    return sheet;
}

function renderNotifSheet() {
    const list = document.getElementById("ntList");
    const count = document.getElementById("ntCount");
    if (!list || !count) return;

    // newest first
    const orders = [...newOrdersList].sort(
        (a, b) => parseServerDate(b.created_at) - parseServerDate(a.created_at)
    );

    count.textContent = orders.length;
    count.style.display = orders.length ? "inline-block" : "none";

    if (!orders.length) {
        list.innerHTML = `<div class="nt-empty">No new orders — you're all caught up.</div>`;
        return;
    }

    list.innerHTML = orders.map(o => `
        <div class="nt-item">
            <div class="nt-token"><small>Token</small>${escapeSellerHtml(o.tokenNo)}</div>
            <div class="nt-body">
                <div class="nt-items">${escapeSellerHtml(o.items_summary || "—")}</div>
                <div class="nt-meta">Customer #${escapeSellerHtml(String(o.customer_id).slice(-6))}</div>
            </div>
            <div class="nt-side">
                <div class="nt-amt">₹${Number(o.total_amount || 0).toLocaleString('en-IN')}</div>
                <div class="nt-time">${timeAgo(o.created_at)}</div>
            </div>
        </div>`).join("");
}

function openNotifSheet() {
    ensureNotifSheet();
    renderNotifSheet();
    document.getElementById("notifBackdrop").classList.add("show");
    document.getElementById("notifSheet").classList.add("show");
    document.body.style.overflow = "hidden";
    // pick up orders that arrived since the dashboard last loaded
    loadDashboard().then(() => { if (notifSheetOpen()) renderNotifSheet(); });
}

function closeNotifSheet() {
    const sheet = document.getElementById("notifSheet");
    const backdrop = document.getElementById("notifBackdrop");
    if (sheet) sheet.classList.remove("show");
    if (backdrop) backdrop.classList.remove("show");
    document.body.style.overflow = "";
}

async function loadOrders() {
    const res = await fetch(`/seller/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "res_id": resId })
    });
    console.log("loadOrders response:", res.status, res.statusText);
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
                <div class="token-no">Token No: ${escapeSellerHtml(order.token_no)}${order.edited ? '<span class="edited-tag">Edited</span>' : ''}</div>
                <div class="order-date">${escapeSellerHtml(order.time)}</div>
                <div class="order-date">Pickup Time: ${escapeSellerHtml(order.pickup_time)}</div>
                ${restaurantsHTML}

                <div class="total">Total: ₹${total}</div>
                <button class="editOrderBtn" data-order-id="${escapeSellerHtml(order.order_id)}">✎ Edit items</button>
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
    // orders just loaded while the Orders view is open -> they have been seen
    if (document.getElementById("view-orders").classList.contains("active")) markOrdersSeen();
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

/* =====================================================================
   EDIT ORDER ITEMS
   Seller can reduce / remove items he doesn't have, then Save ->
   POST /seller/edit_order. Server restores stock and notifies the customer.
===================================================================== */
const edSheet = document.getElementById("edSheet");
const edBackdrop = document.getElementById("edBackdrop");
const edList = document.getElementById("edList");
const edSave = document.getElementById("edSave");

const edit = { order: null, orig: {}, qtys: {}, saving: false, error: "" };

function edOpen() { return edSheet.classList.contains("show"); }

function openEditOrder(orderId) {
    const order = sellerOrders.find(o => String(o.order_id) === String(orderId));
    if (!order || order.status !== "placed") return;

    edit.order = order;
    edit.orig = order.items || {};
    edit.qtys = {};
    edit.saving = false;
    edit.error = "";
    Object.entries(edit.orig).forEach(([id, it]) => { edit.qtys[id] = Number(it.qty) || 0; });

    renderEditSheet();
    edBackdrop.classList.add("show");
    edSheet.classList.add("show");
    document.body.style.overflow = "hidden";
}

function closeEditSheet() {
    edSheet.classList.remove("show");
    edBackdrop.classList.remove("show");
    document.body.style.overflow = "";
    edit.order = null;
}

function editHasChanges() {
    return Object.keys(edit.orig).some(id => edit.qtys[id] !== Number(edit.orig[id].qty));
}

function renderEditSheet() {
    const o = edit.order;
    if (!o) return;

    document.getElementById("edSub").textContent = `Token ${o.token_no} · Order #${o.order_id}`;

    let total = 0;
    let kept = 0;

    edList.innerHTML = Object.entries(edit.orig).map(([id, it]) => {
        const orig = Number(it.qty) || 0;
        const q = edit.qtys[id];
        const price = Number(it.price) || 0;
        total += price * q;
        if (q > 0) kept++;

        const right = q === 0
            ? `<button type="button" class="ed-undo" data-act="undo" data-id="${escapeSellerHtml(id)}">Undo</button>`
            : `<div class="ed-step">
                   <button type="button" data-act="dec" data-id="${escapeSellerHtml(id)}" aria-label="Decrease">−</button>
                   <span>${q}</span>
                   <button type="button" data-act="inc" data-id="${escapeSellerHtml(id)}" aria-label="Increase" ${q >= orig ? "disabled" : ""}>+</button>
               </div>
               <button type="button" class="ed-del" data-act="remove" data-id="${escapeSellerHtml(id)}" aria-label="Remove item">🗑</button>`;

        return `
            <div class="ed-row ${q === 0 ? "removed" : ""}">
                <div class="ed-info">
                    <div class="ed-name">${escapeSellerHtml(it.name)}</div>
                    <div class="ed-price">₹${price} each${q !== orig ? ` · ordered ${orig}` : ""}</div>
                </div>
                ${right}
            </div>`;
    }).join("");

    document.getElementById("edTotal").textContent = "₹" + total.toLocaleString("en-IN");

    const err = document.getElementById("edError");
    err.textContent = edit.error ||
        (kept === 0 ? "At least one item must remain. To drop the whole order, cancel it instead." : "");

    edSave.disabled = edit.saving || kept === 0 || !editHasChanges();
    edSave.textContent = edit.saving ? "Saving…" : "Save changes";
}

edList.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-act]");
    if (!btn || edit.saving) return;
    const id = btn.dataset.id;
    const orig = Number(edit.orig[id]?.qty) || 0;

    if (btn.dataset.act === "dec") edit.qtys[id] = Math.max(0, edit.qtys[id] - 1);
    else if (btn.dataset.act === "inc") edit.qtys[id] = Math.min(orig, edit.qtys[id] + 1);
    else if (btn.dataset.act === "remove") edit.qtys[id] = 0;
    else if (btn.dataset.act === "undo") edit.qtys[id] = orig;

    edit.error = "";
    renderEditSheet();
});

async function saveEditedOrder() {
    if (edit.saving || !edit.order) return;
    edit.saving = true;
    edit.error = "";
    renderEditSheet();

    try {
        const res = await fetch("/seller/edit_order", {
            method: "POST",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: edit.order.order_id, items: edit.qtys })
        });

        if (res.status === 401) {
            alert("unauthorized,Please Log in");
            window.location.href = "/login/seller";
            return;
        }

        const data = await res.json().catch(() => null);
        if (!res.ok || !data || !data.success) {
            throw new Error((data && data.message) || "Couldn't save changes");
        }

        closeEditSheet();
        await loadOrders();      // card re-renders with the new items/total + "Edited" tag
    } catch (err) {
        console.error("edit order failed", err);
        edit.error = err.message || "Couldn't save changes. Please try again.";
        // order may have been cancelled meanwhile -> refresh list in the background
        loadOrders().catch(() => { });
    } finally {
        edit.saving = false;
        if (edOpen()) renderEditSheet();
    }
}

edSave.addEventListener("click", saveEditedOrder);
document.getElementById("edClose").addEventListener("click", closeEditSheet);
document.getElementById("edCancel").addEventListener("click", closeEditSheet);
edBackdrop.addEventListener("click", closeEditSheet);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && edOpen()) closeEditSheet(); });

// "Edit items" button on an order card
document.addEventListener("click", (e) => {
    const btn = e.target.closest(".editOrderBtn");
    if (btn) openEditOrder(btn.dataset.orderId);
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

// Bell -> new-orders bottom sheet
const bellBtn = document.querySelector('.icon-btn[aria-label="Notifications"]');
if (bellBtn) bellBtn.addEventListener("click", openNotifSheet);

// Inventory "home" icon -> dashboard (button is hidden by CSS; kept so nothing breaks)
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

/* =====================================================================
   7. EXTRA PAGES — Customers, Sales Report, Analytics, Payouts,
      Offers & Coupons, Settings
===================================================================== */
(function () {
    const H = escapeSellerHtml;
    const money = n => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");
    const $ = (s, r = document) => r.querySelector(s);
    const DAY = 864e5;

    /* ---------------- helpers ---------------- */
    function toast(msg, kind) {
        let el = document.getElementById("sdToast");
        if (!el) {
            el = document.createElement("div");
            el.id = "sdToast"; el.className = "sd-toast";
            document.body.appendChild(el);
        }
        el.textContent = msg;
        el.dataset.kind = kind || "info";
        el.classList.add("show");
        clearTimeout(toast.t);
        toast.t = setTimeout(() => el.classList.remove("show"), 3000);
    }

    async function api(url, body) {
        const opts = { credentials: "same-origin", headers: { "Content-Type": "application/json" } };
        if (body !== undefined) { opts.method = "POST"; opts.body = JSON.stringify(body); }
        const res = await fetch(url, opts);
        if (res.status === 401) {
            alert("unauthorized,Please Log in");
            window.location.href = "/login/seller";
            throw new Error("unauthorized");
        }
        const data = await res.json().catch(() => null);
        if (!res.ok || !data || !data.success) {
            throw new Error((data && data.message) || `Request failed (${res.status})`);
        }
        return data;
    }

    function downloadCSV(name, rows) {
        const csv = rows.map(r => r.map(c => {
            const s = String(c ?? "");
            return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
        }).join(",")).join("\n");
        const a = document.createElement("a");
        a.href = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv" }));
        a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
    }

    // ----- order accessors (tolerant of the payload shape) -----
    const allOrders = () => sellerOrders || [];
    const oItems = o => Object.values(o.items || {}).filter(i => Number(i.qty) > 0);
    function oTotal(o) {
        if (o.total_amount != null && !isNaN(o.total_amount)) return Number(o.total_amount);
        return oItems(o).reduce((s, i) => s + (Number(i.price) || 0) * (Number(i.qty) || 0), 0);
    }
    // Uses created_at (UTC) when the API sends it, otherwise the `time` string.
    function oDate(o) {
        const raw = o.created_at || o.time;
        if (!raw) return null;
        const d = o.created_at ? parseServerDate(o.created_at) : new Date(raw);
        return isNaN(d) ? null : d;
    }
    const done = o => o.status === "completed";
    const fmtDay = d => d.toLocaleDateString("en-CA"); // yyyy-mm-dd, local
    const custName = id => "Customer #" + String(id ?? "").slice(-6);

    const noDateNote = () => allOrders().some(o => !oDate(o))
        ? `<div class="pg-note">Some orders have no readable date, so they are left out of date-based figures. Send <code>created_at</code> in /seller/orders to include them.</div>` : "";

    const table = (heads, rows, empty) => rows.length
        ? `<table class="pg-table"><thead><tr>${heads.map(h => `<th class="${h[1] || ""}">${h[0]}</th>`).join("")}</tr></thead><tbody>${rows.join("")}</tbody></table>`
        : `<div class="pg-empty">${empty}</div>`;

    const kpi = (v, l) => `<div class="pg-kpi"><div class="v">${v}</div><div class="l">${l}</div></div>`;
    const bar = (label, pct, val) => `<div class="bar-row"><span class="bl" title="${H(label)}">${H(label)}</span><span class="bt"><span class="bf" style="display:block;width:${pct}%"></span></span><span class="bv">${val}</span></div>`;

    /* ---------------- page registry ---------------- */
    const PAGES = {};
    function page(name, title, sub, actions, body, load) {
        PAGES[name] = { title, sub, actions, body, load };
    }

    /* ===== CUSTOMERS ===== */
    page("customers", "Customers", "Everyone who has ordered from your store", "",
        `<div class="pg-kpis" id="cu-kpis"></div>
         <div class="pg-filters"><input id="cu-search" placeholder="Search customer ID" style="width:260px;max-width:100%"></div>
         <div class="widget" id="cu-table"></div>`,
        () => {
            const map = {};
            allOrders().forEach(o => {
                const c = map[o.user_id] ||= { id: o.user_id, orders: 0, spent: 0, last: null };
                c.orders++;
                if (done(o)) c.spent += oTotal(o);
                const d = oDate(o);
                if (d && (!c.last || d > c.last)) c.last = d;
            });
            const list = Object.values(map).sort((a, b) => b.spent - a.spent);
            const repeat = list.filter(c => c.orders > 1).length;
            $("#cu-kpis").innerHTML =
                kpi(list.length, "Total customers") +
                kpi(repeat, "Repeat customers") +
                kpi(list.length ? Math.round(repeat / list.length * 100) + "%" : "0%", "Repeat rate");
            const draw = () => {
                const q = $("#cu-search").value.trim().toLowerCase();
                const rows = list.filter(c => custName(c.id).toLowerCase().includes(q) || String(c.id).includes(q)).map(c => `
                    <tr><td>${H(custName(c.id))}</td><td class="num">${c.orders}</td><td class="num">${money(c.spent)}</td>
                    <td>${c.last ? timeAgo(c.last.toISOString()) : "—"}</td></tr>`);
                $("#cu-table").innerHTML = table([["Customer"], ["Orders", "num"], ["Spent", "num"], ["Last order"]], rows, "No customers yet.");
            };
            $("#cu-search").oninput = draw;
            draw();
        });

    /* ===== SALES REPORT ===== */
    const sr = { from: null, to: null };
    function setRange(days) {
        const t = new Date(); t.setHours(23, 59, 59, 999);
        const f = new Date(); f.setHours(0, 0, 0, 0); f.setTime(f.getTime() - (days - 1) * DAY);
        sr.from = f; sr.to = t;
        $("#sr-from").value = fmtDay(f); $("#sr-to").value = fmtDay(t);
    }
    const srOrders = () => allOrders().filter(o => { const d = oDate(o); return d && d >= sr.from && d <= sr.to; });

    page("sales", "Sales report", "Revenue counts completed orders only",
        `<button class="btn-outline" id="sr-export"><i data-lucide="download" width="14" height="14"></i> Export CSV</button>`,
        `<div class="pg-filters">
            <button class="chip" data-days="1">Today</button><button class="chip" data-days="7">7 days</button>
            <button class="chip active" data-days="30">30 days</button><button class="chip" data-days="90">90 days</button>
            <input type="date" id="sr-from"> <span style="color:var(--muted)">to</span> <input type="date" id="sr-to">
         </div>
         <div id="sr-note"></div>
         <div class="pg-kpis" id="sr-kpis"></div>
         <div class="pg-grid">
            <div class="widget"><div class="widget-head"><span class="widget-title">Daily sales</span></div><div id="sr-daily"></div></div>
            <div class="widget"><div class="widget-head"><span class="widget-title">Items sold</span></div><div id="sr-items"></div></div>
         </div>`,
        () => {
            if (!sr.from) {
                setRange(30);
                document.querySelectorAll("#view-sales .chip").forEach(ch => ch.onclick = () => {
                    document.querySelectorAll("#view-sales .chip").forEach(c => c.classList.toggle("active", c === ch));
                    setRange(+ch.dataset.days); drawSales();
                });
                const custom = () => {
                    sr.from = new Date($("#sr-from").value + "T00:00:00");
                    sr.to = new Date($("#sr-to").value + "T23:59:59");
                    document.querySelectorAll("#view-sales .chip").forEach(c => c.classList.remove("active"));
                    drawSales();
                };
                $("#sr-from").onchange = custom; $("#sr-to").onchange = custom;
                $("#sr-export").onclick = () => {
                    const rows = [["Token", "Order ID", "Date", "Status", "Items", "Total"]];
                    srOrders().forEach(o => rows.push([o.token_no, o.order_id, o.time || o.created_at, o.status,
                        oItems(o).map(i => `${i.name} x${i.qty}`).join("; "), oTotal(o)]));
                    downloadCSV(`sales_${fmtDay(sr.from)}_${fmtDay(sr.to)}.csv`, rows);
                };
            }
            drawSales();
        });

    function drawSales() {
        if (!sr.from || isNaN(sr.from) || isNaN(sr.to)) return;
        const list = srOrders(), comp = list.filter(done);
        const rev = comp.reduce((s, o) => s + oTotal(o), 0);
        $("#sr-note").innerHTML = noDateNote();
        $("#sr-kpis").innerHTML =
            kpi(money(rev), "Revenue") + kpi(list.length, "Orders placed") + kpi(comp.length, "Completed") +
            kpi(list.filter(o => o.status === "canceled").length, "Canceled") +
            kpi(money(comp.length ? rev / comp.length : 0), "Avg order value");

        const days = {};
        list.forEach(o => {
            const k = fmtDay(oDate(o)); const r = days[k] ||= { n: 0, rev: 0 };
            r.n++; if (done(o)) r.rev += oTotal(o);
        });
        $("#sr-daily").innerHTML = table([["Date"], ["Orders", "num"], ["Revenue", "num"]],
            Object.keys(days).sort().reverse().map(k => `<tr><td>${k}</td><td class="num">${days[k].n}</td><td class="num">${money(days[k].rev)}</td></tr>`),
            "No orders in this range.");

        const items = {};
        comp.forEach(o => oItems(o).forEach(i => {
            const r = items[i.name] ||= { qty: 0, rev: 0 };
            r.qty += Number(i.qty); r.rev += (Number(i.price) || 0) * Number(i.qty);
        }));
        $("#sr-items").innerHTML = table([["Item"], ["Qty", "num"], ["Revenue", "num"]],
            Object.entries(items).sort((a, b) => b[1].rev - a[1].rev).map(([n, r]) =>
                `<tr><td>${H(n)}</td><td class="num">${r.qty}</td><td class="num">${money(r.rev)}</td></tr>`),
            "Nothing sold in this range.");
    }

    /* ===== ANALYTICS ===== */
    page("analytics", "Analytics", "Based on all your orders", "",
        `<div id="an-note"></div><div class="pg-kpis" id="an-kpis"></div>
         <div class="pg-grid">
            <div class="widget"><div class="widget-head"><span class="widget-title">Orders by hour</span></div><div id="an-hours"></div></div>
            <div class="widget"><div class="widget-head"><span class="widget-title">Orders by weekday</span></div><div id="an-week"></div></div>
         </div>
         <div class="pg-grid">
            <div class="widget"><div class="widget-head"><span class="widget-title">Top items (by quantity)</span></div><div id="an-top"></div></div>
            <div class="widget"><div class="widget-head"><span class="widget-title">Order status</span></div><div id="an-status"></div></div>
         </div>`,
        () => {
            const list = allOrders(), n = list.length;
            const comp = list.filter(done), canc = list.filter(o => o.status === "canceled");
            const custs = {}; list.forEach(o => custs[o.user_id] = (custs[o.user_id] || 0) + 1);
            const cu = Object.values(custs);
            $("#an-note").innerHTML = noDateNote();
            $("#an-kpis").innerHTML =
                kpi(n, "Total orders") +
                kpi(n ? Math.round(comp.length / n * 100) + "%" : "0%", "Completion rate") +
                kpi(n ? Math.round(canc.length / n * 100) + "%" : "0%", "Cancellation rate") +
                kpi(cu.length ? Math.round(cu.filter(c => c > 1).length / cu.length * 100) + "%" : "0%", "Repeat customers") +
                kpi(money(comp.length ? comp.reduce((s, o) => s + oTotal(o), 0) / comp.length : 0), "Avg order value");

            const hrs = Array(24).fill(0), wk = Array(7).fill(0);
            list.forEach(o => { const d = oDate(o); if (d) { hrs[d.getHours()]++; wk[d.getDay()]++; } });
            const hm = Math.max(...hrs, 1);
            $("#an-hours").innerHTML = `<div class="hours">${hrs.map((v, h) =>
                `<div class="hc" title="${h}:00 — ${v} orders"><div class="hb" style="height:${v / hm * 100}%"></div><div class="hl">${h % 6 === 0 ? h : ""}</div></div>`).join("")}</div>`;
            const wm = Math.max(...wk, 1), names = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
            $("#an-week").innerHTML = wk.map((v, i) => bar(names[i], v / wm * 100, v)).join("");

            const items = {};
            list.filter(o => o.status !== "canceled").forEach(o => oItems(o).forEach(i => items[i.name] = (items[i.name] || 0) + Number(i.qty)));
            const top = Object.entries(items).sort((a, b) => b[1] - a[1]).slice(0, 8), tm = top.length ? top[0][1] : 1;
            $("#an-top").innerHTML = top.length ? top.map(([nm, q]) => bar(nm, q / tm * 100, q)).join("") : `<div class="pg-empty">No sales yet.</div>`;

            const st = { Pending: list.filter(o => o.status === "placed").length, Completed: comp.length, Canceled: canc.length };
            $("#an-status").innerHTML = Object.entries(st).map(([k, v]) => bar(k, n ? v / n * 100 : 0, v)).join("");
        });

    /* ===== PAYOUTS ===== */
    page("payouts", "Payouts", "Your earnings and transfers to your bank", "",
        `<div class="pg-kpis" id="po-kpis"></div><div id="po-note"></div>
         <div class="widget"><div class="widget-head"><span class="widget-title">Payout history</span></div><div id="po-table"></div></div>`,
        async () => {
            const comp = allOrders().filter(done);
            const total = comp.reduce((s, o) => s + oTotal(o), 0);
            const cut = Date.now() - 30 * DAY;
            const m30 = comp.filter(o => { const d = oDate(o); return d && d.getTime() >= cut; }).reduce((s, o) => s + oTotal(o), 0);
            const draw = (extra, rows, msg) => {
                $("#po-kpis").innerHTML = kpi(money(total), "Lifetime earnings") + kpi(money(m30), "Last 30 days") + extra;
                $("#po-table").innerHTML = table([["Date"], ["Reference"], ["Amount", "num"], ["Status"]], rows, msg);
            };
            draw("", [], "Loading…");
            try {
                const d = await api(`/seller/payouts?res_id=${encodeURIComponent(resId)}`);
                $("#po-note").innerHTML = "";
                draw(kpi(money(d.balance), "Pending payout"), (d.payouts || []).map(p => `
                    <tr><td>${H(p.date)}</td><td class="coupon">${H(p.id)}</td><td class="num">${money(p.amount)}</td>
                    <td><span class="tag ${p.status === "paid" ? "ok" : "warn"}">${H(p.status)}</span></td></tr>`), "No payouts yet.");
            } catch (e) {
                $("#po-note").innerHTML = `<div class="pg-note">Payout history isn't available yet (${H(e.message)}). Earnings above are calculated from completed orders.</div>`;
                draw("", [], "No payout data.");
            }
        });

    /* ===== OFFERS & COUPONS ===== */
    let offers = [];
    page("offers", "Offers & coupons", "Create discount codes for your customers",
        `<button class="btn-primary" id="of-new">+ New offer</button>`,
        `<div id="of-note"></div><div class="widget" id="of-table"></div>`,
        async () => {
            $("#of-new").onclick = () => openOffer();
            $("#of-table").innerHTML = `<div class="pg-empty">Loading…</div>`;
            try {
                offers = (await api(`/seller/offers?res_id=${encodeURIComponent(resId)}`)).offers || [];
                $("#of-note").innerHTML = "";
            } catch (e) {
                offers = [];
                $("#of-note").innerHTML = `<div class="pg-note">Couldn't load offers (${H(e.message)}).</div>`;
            }
            drawOffers();
        });

    function drawOffers() {
        const rows = offers.map(o => `
            <tr><td class="coupon">${H(o.code)}</td>
            <td>${o.type === "percent" ? H(o.value) + "% off" : money(o.value) + " off"}</td>
            <td class="num">${o.min_order ? money(o.min_order) : "—"}</td>
            <td>${H(o.expires || "No expiry")}</td>
            <td><span class="tag ${o.active ? "ok" : "off"}">${o.active ? "Active" : "Paused"}</span></td>
            <td class="num"><button class="btn-outline btn-sm" data-of="toggle" data-id="${H(o.id)}">${o.active ? "Pause" : "Activate"}</button>
            <button class="btn-outline btn-sm" data-of="edit" data-id="${H(o.id)}">Edit</button>
            <button class="btn-outline btn-sm btn-danger" data-of="del" data-id="${H(o.id)}">Delete</button></td></tr>`);
        $("#of-table").innerHTML = table([["Code"], ["Discount"], ["Min order", "num"], ["Expires"], ["Status"], [""]], rows, "No offers yet. Click “New offer” to create one.");
    }

    let modal;
    function openOffer(o) {
        if (!modal) {
            modal = document.createElement("div");
            modal.className = "pg-modal-bg";
            modal.innerHTML = `<div class="pg-modal pg-form">
                <h3 id="om-title">New offer</h3>
                <label>Coupon code<input id="om-code" placeholder="WELCOME10" style="text-transform:uppercase"></label>
                <div class="two">
                    <label>Type<select id="om-type"><option value="percent">Percent (%)</option><option value="flat">Flat (₹)</option></select></label>
                    <label>Value<input id="om-value" type="number" min="1" step="any"></label>
                </div>
                <div class="two">
                    <label>Min order (₹)<input id="om-min" type="number" min="0" value="0"></label>
                    <label>Expires<input id="om-exp" type="date"></label>
                </div>
                <label class="check"><input id="om-active" type="checkbox" checked> Active</label>
                <div class="row-btns"><button class="btn-outline" id="om-cancel">Cancel</button><button class="btn-primary" id="om-save">Save</button></div>
            </div>`;
            document.body.appendChild(modal);
            $("#om-cancel").onclick = () => modal.classList.remove("show");
            modal.addEventListener("click", e => { if (e.target === modal) modal.classList.remove("show"); });
            $("#om-save").onclick = saveOffer;
        }
        modal.dataset.id = o ? o.id : "";
        $("#om-title").textContent = o ? "Edit offer" : "New offer";
        $("#om-code").value = o?.code || "";
        $("#om-type").value = o?.type || "percent";
        $("#om-value").value = o?.value || "";
        $("#om-min").value = o?.min_order || 0;
        $("#om-exp").value = o?.expires || "";
        $("#om-active").checked = o ? !!o.active : true;
        modal.classList.add("show");
    }

    async function saveOffer() {
        const offer = {
            id: modal.dataset.id || undefined, res_id: resId,
            code: $("#om-code").value.trim().toUpperCase(),
            type: $("#om-type").value, value: Number($("#om-value").value),
            min_order: Number($("#om-min").value) || 0,
            expires: $("#om-exp").value || null, active: $("#om-active").checked
        };
        if (!offer.code || !(offer.value > 0)) return toast("Enter a code and a discount value", "warn");
        if (offer.type === "percent" && offer.value > 100) return toast("Percent can't exceed 100", "warn");
        try {
            await api("/seller/offers/save", offer);
            modal.classList.remove("show");
            toast("Offer saved", "success");
            PAGES.offers.load();
        } catch (e) { toast(e.message, "error"); }
    }

    async function offerAction(act, id) {
        const o = offers.find(x => String(x.id) === String(id));
        if (!o) return;
        if (act === "edit") return openOffer(o);
        try {
            if (act === "toggle") await api("/seller/offers/save", { ...o, res_id: resId, active: !o.active });
            if (act === "del") {
                if (!confirm(`Delete offer ${o.code}?`)) return;
                await api("/seller/offers/delete", { id, res_id: resId });
            }
            PAGES.offers.load();
        } catch (e) { toast(e.message, "error"); }
    }

    /* ===== SETTINGS ===== */
    const SET_FIELDS = ["store_name", "phone", "address", "opens", "closes", "prep_time", "min_order"];
    page("settings", "Settings", "Store profile and preferences", "",
        `<div id="se-note"></div>
         <div class="widget" style="margin-bottom:20px"><div class="widget-head"><span class="widget-title">Store profile</span></div>
            <div class="pg-form">
                <label>Store name<input id="se-store_name"></label>
                <label>Phone<input id="se-phone" type="tel"></label>
                <label>Address<input id="se-address"></label>
                <div class="two"><label>Opens<input id="se-opens" type="time"></label><label>Closes<input id="se-closes" type="time"></label></div>
                <div class="two"><label>Prep time (minutes)<input id="se-prep_time" type="number" min="0"></label><label>Minimum order (₹)<input id="se-min_order" type="number" min="0"></label></div>
                <div><button class="btn-primary" id="se-save">Save changes</button></div>
            </div></div>
         <div class="widget"><div class="widget-head"><span class="widget-title">Account</span></div>
            <p style="font-size:13px;color:var(--muted);margin-bottom:12px">Store online/offline can be switched from the Dashboard.</p>
            <button class="btn-outline btn-danger" id="se-logout">Log out</button></div>`,
        async () => {
            $("#se-logout").onclick = () => document.getElementById("Logout").click();
            $("#se-save").onclick = async () => {
                const settings = {}; SET_FIELDS.forEach(f => settings[f] = $("#se-" + f).value.trim());
                if (!settings.store_name) return toast("Store name is required", "warn");
                const btn = $("#se-save"); btn.disabled = true;
                try {
                    await api("/seller/settings", { res_id: resId, settings });
                    toast("Settings saved", "success");
                    const n = document.querySelector(".seller-name"); if (n) n.textContent = settings.store_name;
                } catch (e) { toast(e.message, "error"); }
                btn.disabled = false;
            };
            try {
                const s = (await api(`/seller/settings?res_id=${encodeURIComponent(resId)}`)).settings || {};
                SET_FIELDS.forEach(f => $("#se-" + f).value = s[f] ?? "");
                $("#se-note").innerHTML = "";
            } catch (e) {
                $("#se-note").innerHTML = `<div class="pg-note">Couldn't load saved settings (${H(e.message)}).</div>`;
            }
        });

    /* ---------------- build the views ---------------- */
    const host = $(".main-content");
    const anchor = $("#edBackdrop");
    Object.entries(PAGES).forEach(([name, p]) => {
        if (!VIEWS.includes(name)) VIEWS.push(name);
        const v = document.createElement("div");
        v.className = "view"; v.id = "view-" + name;
        v.innerHTML = `<div class="pg">
            <div class="pg-head">
                <button class="menu-toggle" aria-label="Menu">☰</button>
                <div><div class="pg-title">${p.title}</div><div class="pg-sub">${p.sub}</div></div>
                <div class="pg-head-actions">${p.actions}</div>
            </div>${p.body}</div>`;
        host.insertBefore(v, anchor);
        $(".menu-toggle", v).onclick = openNavSidebar;
    });
    if (window.lucide) lucide.createIcons();

    // Offer table buttons (delegated)
    document.addEventListener("click", e => {
        const b = e.target.closest("[data-of]");
        if (b) offerAction(b.dataset.of, b.dataset.id);
    });

    /* ---------------- hook into showView ---------------- */
    const baseShowView = showView;
    showView = function (name, refresh = true) {
        baseShowView(name, refresh);
        if (PAGES[name]) {
            const run = () => PAGES[name].load();
            if (refresh || !allOrders().length) loadOrders().then(run).catch(run); else run();
        }
    };

    // Dashboard shortcuts
    const exportBtn = $(".topbar-right .btn-outline");
    if (exportBtn) exportBtn.addEventListener("click", () => showView("sales"));
    const offerBtn = document.getElementById("createOfferBtn");
    if (offerBtn) offerBtn.addEventListener("click", () => showView("offers"));
    const exportOrders = Array.from(document.querySelectorAll(".action-btn"))
        .find(b => /export orders/i.test(b.textContent));
    if (exportOrders) exportOrders.addEventListener("click", () => {
        const rows = [["Token", "Order ID", "Date", "Status", "Items", "Total"]];
        allOrders().forEach(o => rows.push([o.token_no, o.order_id, o.time || o.created_at, o.status,
            oItems(o).map(i => `${i.name} x${i.qty}`).join("; "), oTotal(o)]));
        downloadCSV("orders.csv", rows);
    });

    // Opened directly on one of the new pages (e.g. #payouts)
    const h = location.hash.slice(1);
    if (PAGES[h]) showView(h, false);
})();


/* =====================================================================
   seller-extras.js  — load AFTER seller.js
   (original order flow: placed -> completed / canceled)

   Adds / fixes:
     1. New-order sound + vibration, with a mute toggle
     2. Cancel reason (sent to server + customer)
     3. Bulk stock update (Dashboard > Update stock)
     4. Quick "Listed" switch on every item card
     5. Delete confirmation
     6. Print order slip
     7. Fixes: escaped dashboard renders, single-pass order render,
        orders re-render after a status change so filters stay correct

   BACKEND NOTES
     /update_order accepts status "completed" / "canceled" and an
     optional "reason" field. Socket emitted: order_completed (+ reason).
===================================================================== */
(function () {
  "use strict";

  const H = escapeSellerHtml;
  const $ = (s, r = document) => r.querySelector(s);
  const money = n => "₹" + Math.round(Number(n) || 0).toLocaleString("en-IN");

  /* ---------- toast (reuses the .sd-toast styles) ---------- */
  let toastTimer;
  function toast(msg, kind) {
    let el = document.getElementById("sdToast");
    if (!el) {
      el = document.createElement("div");
      el.id = "sdToast";
      el.className = "sd-toast";
      document.body.appendChild(el);
    }
    el.textContent = msg;
    el.dataset.kind = kind || "info";
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 3000);
  }

  /* =====================================================================
     1. NEW-ORDER SOUND
  ===================================================================== */
  let audioCtx = null;
  let muted = false;
  try { muted = localStorage.getItem("sellerMuted") === "1"; } catch (e) { }

  function unlockAudio() {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (audioCtx.state === "suspended") audioCtx.resume();
    } catch (e) { }
  }
  ["pointerdown", "keydown", "touchstart"].forEach(ev =>
    document.addEventListener(ev, unlockAudio, { passive: true }));

  function beep() {
    if (navigator.vibrate && !muted) navigator.vibrate([200, 100, 200]);
    if (muted) return;
    if (!audioCtx || audioCtx.state !== "running") {
      toast("New order! Tap anywhere on the page once to enable sound.", "warn");
      return;
    }
    const t = audioCtx.currentTime;
    [0, 0.22, 0.44].forEach((d, i) => {
      const o = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      o.type = "sine";
      o.frequency.value = i === 2 ? 1175 : 880;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.4, t + d + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
      o.connect(g);
      g.connect(audioCtx.destination);
      o.start(t + d);
      o.stop(t + d + 0.2);
    });
  }
  socket.on("new_order", beep);

  const muteBtn = document.createElement("button");
  muteBtn.className = "icon-btn";
  muteBtn.id = "muteBtn";
  muteBtn.type = "button";
  function paintMute() {
    muteBtn.textContent = muted ? "🔕" : "🔔";
    muteBtn.title = muted ? "Order sound is off" : "Order sound is on";
    muteBtn.setAttribute("aria-label", muteBtn.title);
  }
  muteBtn.addEventListener("click", () => {
    unlockAudio();
    muted = !muted;
    try { localStorage.setItem("sellerMuted", muted ? "1" : "0"); } catch (e) { }
    paintMute();
    toast(muted ? "Order sound off" : "Order sound on", "info");
    if (!muted) beep();
  });
  paintMute();
  const topRight = $(".topbar-right");
  if (topRight) topRight.prepend(muteBtn);

  /* =====================================================================
     ORDERS (original flow: placed -> completed / canceled)
  ===================================================================== */
  window.loadOrders = async function () {
    const res = await fetch("/seller/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ res_id: resId })
    });
    if (res.status == 401) {
      alert("unauthorized,Please Log in");
      window.location.href = "/login/seller";
      return;
    }
    const data = await res.json();
    if (!data.success) {
      ordersList.innerHTML = `<p>Error loading orders - ${H(data.message)}</p>`;
      return;
    }

    sellerOrders = data.orders || [];

    // build everything once, assign once
    const html = sellerOrders.map(order => {
      let total = 0;
      const rows = Object.entries(order.items).map(([key, d]) => {
        const line = d.price * d.qty;
        total += line;
        return `<div class="item" item_id="${H(key)}">
                  <span>${H(d.name)} x ${H(d.qty)}</span><span>₹${line}</span></div>`;
      }).join("");

      const placed = order.status === "placed";
      return `
        <div class="order-card" user_id="${H(order.user_id)}">
          <div class="order-header">
            <span class="order-id">#${H(order.order_id)}</span>
            <span class="order-status status-${H(order.status)}">${H(order.status)}</span>
          </div>
          <div class="token-no">Token No: ${H(order.token_no)}${order.edited ? '<span class="edited-tag">Edited</span>' : ""}</div>
          <div class="order-date">${H(order.time)}</div>
          ${order.pickup_time!== null ? `<div class="order-date">Pickup Time: ${H(order.pickup_time)}</div>`:`<div class="order-date">Delivery to: ${H(order.delivery_address.adrs_type)} - ${H(order.delivery_address.address)}</div>`}
          ${order.pickup_time!==null ? "":`<div class="order-date">Phone: ${H(order.delivery_address.phone)}</div>`}
          ${rows}
          <div class="total">Total: ₹${total}</div>
          ${order.cancel_reason ? `<div class="cancel-reason">Reason: ${H(order.cancel_reason)}</div>` : ""}
          <button class="editOrderBtn" data-order-id="${H(order.order_id)}">✎ Edit items</button>
          <button class="printBtn" data-order-id="${H(order.order_id)}">🖨 Print slip</button>
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
              
                    position:absolute;
                    right:5px;
          ">Cancel Order</button>
        </div>`;
    }).join("");

    ordersList.innerHTML = html;
    updateActiveCount();
    applyFilter();
    if (document.getElementById("view-orders").classList.contains("active")) markOrdersSeen();
  };

  window.setOrderStatus = async function (order, status, reason) {
    let data = null;
    try {
      const res = await fetch("/update_order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          order_id: order.order_id,
          status,
          user_id: order.user_id,
          reason: reason || ""
        })
      });
      data = await res.json();
    } catch (e) { console.error(e); }

    if (!data || !data.success) {
      toast("Couldn't update the order. Try again.", "error");
      return false;
    }

    socket.emit("order_completed", {
      order_id: order.order_id,
      userid: order.user_id,
      token_no: order.token_no,
      res_id: resId,
      status,
      reason: reason || ""
    });

    const known = sellerOrders.find(o => String(o.order_id) === String(order.order_id));
    if (known) { known.status = status; if (reason) known.cancel_reason = reason; }
    updateActiveCount();
    await loadOrders();            // re-render so every filter stays correct
    return true;
  };

  function orderFromCard(card) {
    return {
      order_id: card.querySelector(".order-id").textContent.replace("#", ""),
      token_no: card.querySelector(".token-no").textContent.split(": ")[1].replace("Edited", "").trim(),
      user_id: card.getAttribute("user_id")
    };
  }

  // Completed button (capture: replaces seller.js handler, strips the "Edited" tag from the token)
  document.addEventListener("click", async e => {
    const b = e.target.closest(".completeBtn");
    if (!b) return;
    e.stopImmediatePropagation();
    b.disabled = true;
    const ok = await setOrderStatus(orderFromCard(b.closest(".order-card")), "completed");
    if (ok) toast("Order completed", "success");
    else b.disabled = false;
  }, true);

  /* =====================================================================
     2. CANCEL REASON
  ===================================================================== */
  const REASONS = ["Item out of stock", "Shop is closing", "Too busy right now", "Customer not reachable", "Other"];
  let reasonModal, reasonDone;

  function askReason() {
    return new Promise(resolve => {
      if (!reasonModal) {
        reasonModal = document.createElement("div");
        reasonModal.className = "pg-modal-bg";
        reasonModal.innerHTML = `
          <div class="pg-modal pg-form">
            <h3>Why are you canceling?</h3>
            <div class="reason-chips">${REASONS.map(r => `<button type="button" class="chip" data-r="${H(r)}">${H(r)}</button>`).join("")}</div>
            <label>Add a note (optional)<input id="rsNote" maxlength="120" placeholder="Shown to the customer"></label>
            <div class="row-btns">
              <button type="button" class="btn-outline" id="rsBack">Keep order</button>
              <button type="button" class="btn-primary btn-danger-fill" id="rsGo" disabled>Cancel order</button>
            </div>
          </div>`;
        document.body.appendChild(reasonModal);

        reasonModal.addEventListener("click", ev => {
          const chip = ev.target.closest(".chip");
          if (chip) {
            reasonModal.querySelectorAll(".chip").forEach(c => c.classList.toggle("active", c === chip));
            $("#rsGo").disabled = false;
          }
          if (ev.target === reasonModal || ev.target.id === "rsBack") finish(null);
          if (ev.target.id === "rsGo") {
            const chosen = $(".chip.active", reasonModal)?.dataset.r || "";
            const note = $("#rsNote").value.trim();
            finish(note ? `${chosen} — ${note}` : chosen);
          }
        });
      }
      reasonModal.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      $("#rsNote").value = "";
      $("#rsGo").disabled = true;
      reasonDone = resolve;
      reasonModal.classList.add("show");
    });
  }
  function finish(v) {
    reasonModal.classList.remove("show");
    if (reasonDone) { reasonDone(v); reasonDone = null; }
  }

  // capture phase: runs before seller.js's own cancel handler and replaces it
  document.addEventListener("click", async e => {
    const b = e.target.closest(".cancelBtn");
    if (!b) return;
    e.stopImmediatePropagation();
    const order = orderFromCard(b.closest(".order-card"));
    const reason = await askReason();
    if (reason === null) return;
    const ok = await setOrderStatus(order, "canceled", reason);
    if (ok) toast("Order canceled", "warn");
  }, true);

  /* =====================================================================
     6. PRINT SLIP
  ===================================================================== */
  function printSlip(orderId) {
    const o = sellerOrders.find(x => String(x.order_id) === String(orderId));
    if (!o) return;
    let total = 0;
    const rows = Object.values(o.items || {}).filter(i => Number(i.qty) > 0).map(i => {
      const line = (Number(i.price) || 0) * (Number(i.qty) || 0);
      total += line;
      return `<tr><td>${H(i.name)} x ${H(i.qty)}</td><td style="text-align:right">₹${line}</td></tr>`;
    }).join("");

    const store = document.querySelector(".seller-name")?.textContent || "Store";
    const doc = `<html><head><title>Order ${H(o.token_no)}</title>
      <style>
        body{font-family:monospace;width:280px;margin:0 auto;padding:10px;color:#000}
        h2,h3,p{margin:4px 0;text-align:center} table{width:100%;border-collapse:collapse;margin:8px 0}
        td{padding:3px 0;font-size:13px} hr{border:none;border-top:1px dashed #000}
        .t{font-weight:700;font-size:15px}
      </style></head><body>
      <h2>${H(store)}</h2><hr>
      <h3>TOKEN ${H(o.token_no)}</h3>
      <p>Order #${H(o.order_id)}</p><p>${H(o.time || "")}</p><p>Pickup: ${H(o.pickup_time || "-")}</p><hr>
      <table>${rows}</table><hr>
      <table><tr class="t"><td>Total</td><td style="text-align:right">₹${total}</td></tr></table>
      <p>Thank you!</p></body></html>`;

    const frame = document.createElement("iframe");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;";
    document.body.appendChild(frame);
    frame.contentDocument.open();
    frame.contentDocument.write(doc);
    frame.contentDocument.close();
    setTimeout(() => {
      frame.contentWindow.focus();
      frame.contentWindow.print();
      setTimeout(() => frame.remove(), 1500);
    }, 200);
  }
  document.addEventListener("click", e => {
    const b = e.target.closest(".printBtn");
    if (b) printSlip(b.dataset.orderId);
  });

  /* =====================================================================
     INVENTORY helpers (3, 4, 5)
  ===================================================================== */
  async function pushItem(item) {
    const fd = new FormData();
    fd.append("res_id", resId);
    fd.append("sub_id", item.subId);
    fd.append("desc", item.desc);
    fd.append("itm_name", item.name);
    fd.append("unit", item.unit);
    fd.append("price", item.price);
    fd.append("itm_qty", item.stock);
    fd.append("lowat", item.lowAt);
    fd.append("available", item.available);
    fd.append("sold", 0);
    fd.append("item_id", item.id);
    fd.append("name", item.name);
    fd.append("lowAt", item.lowAt);
    fd.append("subId", item.subId);
    fd.append("stock", item.stock);
    const res = await fetch("/update_item_details", { method: "POST", body: fd });
    const data = await res.json();
    if (!data.success) throw new Error(data.message || "Update failed");
  }

  /* ----- 4 + 5: decorate item cards ----- */
  const baseRenderCards = renderCards;
  window.renderCards = function () {
    const p = baseRenderCards.apply(this, arguments);
    decorateCards();
    return p;
  };

  function decorateCards() {
    document.querySelectorAll("#itemsGrid .card").forEach(card => {
      const idEl = card.querySelector('div[style*="JetBrains"]');
      const controls = card.querySelector(".controlsContainer");
      if (!idEl || !controls) return;
      const item = state.items.find(i => i.id === idEl.textContent.trim());
      if (!item) return;

      // 5. confirm before delete
      const del = Array.from(controls.querySelectorAll("button")).find(b => b.textContent.trim() === "Delete");
      if (del) {
        const original = del.onclick;
        del.onclick = () => { if (confirm(`Delete "${item.name}"? This can't be undone.`)) original(); };
      }

      // 4. quick Listed switch
      const wrap = document.createElement("label");
      wrap.className = "avail-toggle";
      wrap.innerHTML = `<input type="checkbox" ${item.available ? "checked" : ""}><span>${item.available ? "Listed" : "Hidden"}</span>`;
      const box = wrap.querySelector("input");
      box.addEventListener("change", async () => {
        const next = box.checked;
        box.disabled = true;
        item.available = next;
        wrap.querySelector("span").textContent = next ? "Listed" : "Hidden";
        try {
          await pushItem(item);
          renderStats();
          toast(next ? `${item.name} is listed` : `${item.name} hidden from customers`, next ? "success" : "warn");
        } catch (err) {
          item.available = !next;
          box.checked = !next;
          wrap.querySelector("span").textContent = !next ? "Listed" : "Hidden";
          toast("Couldn't update. Try again.", "error");
        }
        box.disabled = false;
      });
      controls.prepend(wrap);
    });
  }
  render();   // redraw once so the first paint is decorated

  /* ----- 3: bulk stock update ----- */
  let stockModal;
  function openBulkStock() {
    const list = state.items.filter(i => i.stock <= i.lowAt)
      .sort((a, b) => a.stock - b.stock);

    if (!stockModal) {
      stockModal = document.createElement("div");
      stockModal.className = "pg-modal-bg";
      stockModal.innerHTML = `<div class="pg-modal pg-form" style="max-width:520px">
          <h3>Restock low items</h3>
          <div id="bsList" class="bs-list"></div>
          <div class="row-btns">
            <button type="button" class="btn-outline" id="bsCancel">Close</button>
            <button type="button" class="btn-primary" id="bsSave">Save all</button>
          </div></div>`;
      document.body.appendChild(stockModal);
      stockModal.addEventListener("click", e => { if (e.target === stockModal || e.target.id === "bsCancel") stockModal.classList.remove("show"); });
      $("#bsSave", stockModal).addEventListener("click", saveBulk);
    }

    $("#bsList", stockModal).innerHTML = list.length ? list.map(i => `
      <div class="bs-row" data-id="${H(i.id)}">
        <div class="bs-info"><div class="bs-name">${H(i.name)}</div>
          <div class="bs-meta">${H(i.unit)} · ${i.stock === 0 ? "Out of stock" : i.stock + " left"}</div></div>
        <input type="number" min="0" placeholder="New qty" data-cur="${i.stock}">
      </div>`).join("") : `<div class="pg-empty">All stocked up 🎉</div>`;

    $("#bsSave", stockModal).disabled = !list.length;
    stockModal.classList.add("show");
  }

  async function saveBulk() {
    const btn = $("#bsSave", stockModal);
    const rows = Array.from(stockModal.querySelectorAll(".bs-row"))
      .map(r => ({ id: r.dataset.id, v: r.querySelector("input").value }))
      .filter(r => r.v !== "" && Number(r.v) >= 0);
    if (!rows.length) return toast("Type a new quantity for at least one item", "warn");

    btn.disabled = true;
    btn.textContent = "Saving…";
    let ok = 0, fail = 0;
    for (const r of rows) {
      const item = state.items.find(i => i.id === r.id);
      if (!item) continue;
      const prev = item.stock;
      item.stock = Number(r.v);
      try { await pushItem(item); ok++; }
      catch (e) { item.stock = prev; fail++; }
    }
    btn.disabled = false;
    btn.textContent = "Save all";
    render();
    if (typeof loadDashboard === "function") loadDashboard();
    stockModal.classList.remove("show");
    toast(fail ? `${ok} updated, ${fail} failed` : `${ok} item${ok === 1 ? "" : "s"} restocked`, fail ? "warn" : "success");
  }

  // capture: replaces the old "just filter low items" behaviour
  document.addEventListener("click", e => {
    if (!e.target.closest("#updateStockBtn")) return;
    e.stopImmediatePropagation();
    showView("inventory", false);
    openBulkStock();
  }, true);

  /* =====================================================================
     7. ESCAPED DASHBOARD RENDERS
  ===================================================================== */
  window.renderOrders = function (orders) {
    const tbody = document.getElementById("ordersBody");
    if (!orders || !orders.length) {
      tbody.innerHTML = `<tr><td colspan="5" style="padding:20px;color:var(--muted);">No orders yet</td></tr>`;
      return;
    }
    tbody.innerHTML = orders.slice(0, 5).map(o => {
      const s = statusMap[o.status] || { cls: "new", label: o.status || "Unknown" };
      return `<tr>
        <td><span class="order-id">${H(o.tokenNo)}</span></td>
        <td><div class="order-details">
          <div class="order-name">Customer #${H(String(o.customer_id).slice(-6))}</div>
          <div class="order-items">${H(o.items_summary || "—")}</div></div></td>
        <td><span class="order-price">${money(o.total_amount)}</span></td>
        <td><span class="status-pill ${s.cls}"><span class="status-dot"></span>${H(s.label)}</span></td>
        <td style="font-size:12px;color:var(--muted);">${timeAgo(o.created_at)}</td></tr>`;
    }).join("");
  };

  window.renderTopProducts = function (products) {
    const el = document.getElementById("topProducts");
    if (!products || !products.length) {
      el.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px;">No sales yet</div>`;
      return;
    }
    const maxSold = Math.max(...products.map(p => p.sold), 1);
    el.innerHTML = products.map((p, i) => `
      <div class="product-row">
        <span class="prod-rank">${i + 1}</span>
        <div class="prod-icon">📦</div>
        <div class="prod-info"><div class="prod-name">${H(p.item_name)}</div><div class="prod-sub">${H(p.unit || "")}</div></div>
        <div style="flex:1;min-width:60px;padding:0 10px;"><div class="prod-bar-track"><div class="prod-bar-fill" style="width:${Math.round(p.sold / maxSold * 100)}%"></div></div></div>
        <div style="text-align:right;"><div class="prod-revenue">${money(p.revenue)}</div><div class="prod-sold">${H(p.sold)} sold</div></div>
      </div>`).join("");
  };

  window.renderStockAlerts = function (alerts) {
    const el = document.getElementById("stockAlerts");
    if (!alerts || !alerts.length) {
      el.innerHTML = `<div style="padding:12px;color:var(--muted);font-size:13px;">All stocked up</div>`;
      return;
    }
    el.innerHTML = alerts.map(s => `
      <div class="stock-item"><div>
        <div class="stock-name">${H(s.item_name)}</div>
        <div class="stock-cat">${s.sub_id != null ? "Category #" + H(s.sub_id) : ""}</div></div>
        <span class="stock-count ${s.status === "out" ? "out" : "low"}">${s.status === "out" ? "Out of stock" : H(s.stock) + " left"}</span>
      </div>`).join("");
  };

  window.renderActivity = function (stats) {
    const el = document.getElementById("activityFeed");
    const items = [];
    (stats.recent_orders || []).slice(0, 4).forEach(o => {
      const c = o.status === "canceled";
      items.push({
        color: c ? "var(--danger)" : "var(--green)",
        msg: c ? `<strong>Order #${H(o.tokenNo)}</strong> was cancelled`
          : `<strong>Order #${H(o.tokenNo)}</strong> placed — ${money(o.total_amount)}`,
        time: timeAgo(o.created_at),
        sortKey: parseServerDate(o.created_at).getTime()   // was new Date(): wrong timezone
      });
    });
    (stats.stock_alerts || []).slice(0, 3).forEach(s => items.push({
      color: s.status === "out" ? "var(--danger)" : "var(--amber)",
      msg: s.status === "out" ? `<strong>${H(s.item_name)}</strong> is out of stock`
        : `<strong>${H(s.item_name)}</strong> is running low — ${H(s.stock)} left`,
      time: "", sortKey: 0
    }));
    items.sort((a, b) => b.sortKey - a.sortKey);
    el.innerHTML = items.length ? items.map(a => `
      <div class="feed-item"><div class="feed-dot" style="background:${a.color};"></div>
        <div><div class="feed-msg">${a.msg}</div>${a.time ? `<div class="feed-time">${a.time}</div>` : ""}</div></div>`).join("")
      : `<div style="padding:12px;color:var(--muted);font-size:13px;">No recent activity</div>`;
  };

  // redraw with the new renderers
  loadOrders();
  loadDashboard();
})();