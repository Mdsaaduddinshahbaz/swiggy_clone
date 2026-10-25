// Socket connects ONCE, the first time this script loads, and stays alive
// across all SPA navigation (this script tag is only ever injected once —
// see spa-router.js's ensureScriptLoaded).
const socket = io("https://general-online.onrender.com");

function escapeOrderHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

// "Get help with this order" is offered for 1 day after an order is completed or canceled.
const HELP_WINDOW_MS = 24 * 60 * 60 * 1000;

// Uses the first timestamp the server provides; if none can be parsed we show the
// button and let the server enforce the limit.
function orderHelpOpen(order) {
    const raw = order.completed_at || order.status_updated_at || order.updated_at || order.date;
    const t = Date.parse(raw);
    if (Number.isNaN(t)) return true;
    return Date.now() - t <= HELP_WINDOW_MS;
}

function helpButtonHTML(orderId, storeName) {
    return `<button type="button" class="order-help-btn"
                data-order-id="${escapeOrderHtml(orderId)}"
                data-store="${escapeOrderHtml(storeName)}">Get help with this order</button>`;
}

// Used when a status changes live while the Orders page is open.
function ensureHelpButton(card) {
    if (!card || card.querySelector(".order-help-btn")) return;
    const orderId = (card.querySelector(".order-id")?.textContent || "").replace("#", "").trim();
    const store = card.querySelector(".restaurant-name")?.textContent.trim() || "";
    if (!orderId) return;
    card.insertAdjacentHTML("beforeend", helpButtonHTML(orderId, store));
}

socket.on("connect", () => {
    console.log("Connected:", socket.id);
    const uid = window.APP_USER_ID || window.location.pathname.split("/").pop();
    socket.emit("join_user_room", { user_id: uid });
});

socket.on("order_status_updated", (data) => {
    const orderCards = document.querySelectorAll(".order-card");
    orderCards.forEach(card => {
        if (card.dataset.token === `${data.token_no}`) {
            const statusSpan = card.querySelector(".order-status");
            statusSpan.textContent = data.status;
            statusSpan.className = `order-status status-${data.status}`;
            if (data.status === "completed" || data.status === "canceled") ensureHelpButton(card);

            // QR + cancel only make sense while the order is still active
            if (data.status !== "placed") {
                const cancelBtn = card.querySelector(".cancelBtn");
                const qrBtn = card.querySelector(".qrBtn");
                if (cancelBtn) cancelBtn.style.display = "none";
                if (qrBtn) qrBtn.style.display = "none";
                const openSheet = document.getElementById("qrSheet");
                if (openSheet && openSheet.dataset.token === card.dataset.token) closeQRSheet();
            }
        }
    });
    // keep the cache in sync so a later revisit shows the updated status too
    const uid = window.APP_USER_ID || window.location.pathname.split("/").pop();
    const cacheKey = `cachedOrders_${uid}`;
    const cached = sessionStorage.getItem(cacheKey);
    if (cached) {
        try {
            const orders = JSON.parse(cached);
            const order = orders.find(o => `#${o.order_id}` === data.order_id || `${o.order_id}` === data.order_id.replace("#", ""));
            if (order) order.status = data.status;
            sessionStorage.setItem(cacheKey, JSON.stringify(orders));
        } catch (e) { }
    }
});

// ---------------------------------------------------------------
// QR bottom sheet (slides up from the bottom edge of the screen)
// ---------------------------------------------------------------

const QR_LIB_URL = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
let qrLibPromise = null;

// Loads the QR library on demand if the page didn't include it
function ensureQRLib() {
    if (typeof QRCode !== "undefined") return Promise.resolve(true);
    if (qrLibPromise) return qrLibPromise;
    qrLibPromise = new Promise((resolve) => {
        const el = document.createElement("script");
        el.src = QR_LIB_URL;
        el.onload = () => resolve(typeof QRCode !== "undefined");
        el.onerror = () => { qrLibPromise = null; resolve(false); };
        document.head.appendChild(el);
    });
    return qrLibPromise;
}

// Built once, reused for every order
function ensureQRSheet() {
    let sheet = document.getElementById("qrSheet");
    if (sheet) return sheet;

    const style = document.createElement("style");
    style.id = "qrSheetStyle";
    style.textContent = `
        #qrSheetOverlay {
            position: fixed;
            inset: 0;
            background: rgba(36, 28, 26, 0.5);
            opacity: 0;
            pointer-events: none;
            transition: opacity 0.3s ease;
            z-index: 2000;
        }
        #qrSheetOverlay.show { opacity: 1; pointer-events: auto; }

        #qrSheet {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            margin: 0 auto;
            width: 100%;
            max-width: 480px;
            background: #FFFDF9;
            color: #241C1A;
            border-radius: 20px 20px 0 0;
            padding: 12px 20px calc(24px + env(safe-area-inset-bottom, 0px));
            box-shadow: 0 -14px 40px -18px rgba(36, 28, 26, 0.5);
            text-align: center;
            transform: translateY(100%);
            transition: transform 0.35s cubic-bezier(0.22, 0.8, 0.3, 1);
            will-change: transform;
            z-index: 2001;
        }
        #qrSheet.show { transform: translateY(0); }

        #qrSheet .qrHandle {
            width: 40px;
            height: 4px;
            background: #E7D8C3;
            border-radius: 999px;
            margin: 0 auto 14px;
        }
        #qrSheet .qrTitle { font-size: 15px; font-weight: 700; margin: 0 0 4px; }
        #qrSheet .qrToken {
            font-family: 'JetBrains Mono', monospace;
            font-size: 13px;
            color: #6b5f58;
            margin: 0 0 16px;
        }
        #qrSheet .qrBox {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 216px;
            margin: 0 auto 18px;
            padding: 8px;
            background: #fff;
            border: 1px solid #E7D8C3;
            border-radius: 14px;
            width: fit-content;
            font-size: 13px;
            color: #6b5f58;
        }
        #qrSheet .qrClose {
            width: 100%;
            background: #E8491D;
            color: #FFFDF9;
            border: none;
            border-radius: 12px;
            padding: 14px 0;
            font-weight: 700;
            font-size: 15px;
            cursor: pointer;
        }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "qrSheetOverlay";

    sheet = document.createElement("div");
    sheet.id = "qrSheet";
    sheet.setAttribute("role", "dialog");
    sheet.setAttribute("aria-label", "Order QR code");
    sheet.innerHTML = `
        <div class="qrHandle"></div>
        <p class="qrTitle">Show this QR at the shop</p>
        <p class="qrToken"></p>
        <div class="qrBox"></div>
        <button type="button" class="qrClose">Close</button>
    `;

    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    overlay.addEventListener("click", closeQRSheet);
    sheet.querySelector(".qrClose").addEventListener("click", closeQRSheet);
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeQRSheet();
    });

    return sheet;
}

async function openQRSheet(card) {
    const sheet = ensureQRSheet();
    const overlay = document.getElementById("qrSheetOverlay");
    const token = card.dataset.token;
    const box = sheet.querySelector(".qrBox");

    sheet.dataset.token = token;
    sheet.querySelector(".qrToken").textContent = `Token No: ${token}`;
    box.innerHTML = "Loading...";

    void sheet.offsetHeight; // force a reflow so the slide-up transition always plays
    overlay.classList.add("show");
    sheet.classList.add("show");
    document.body.style.overflow = "hidden";

    const ok = await ensureQRLib();
    if (sheet.dataset.token !== token || !sheet.classList.contains("show")) return; // closed / switched meanwhile

    box.innerHTML = "";
    if (!ok) {
        box.textContent = "Couldn't load the QR. Show the token number at the shop.";
        return;
    }

    new QRCode(box, {
        text: String(token),
        width: 200,
        height: 200,
        correctLevel: QRCode.CorrectLevel.M
    });
}

function closeQRSheet() {
    const sheet = document.getElementById("qrSheet");
    const overlay = document.getElementById("qrSheetOverlay");
    if (!sheet) return;
    sheet.classList.remove("show");
    overlay?.classList.remove("show");
    document.body.style.overflow = "";
    delete sheet.dataset.token;
}

// ---------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------

function renderOrders(orders, ordersList, no_order_container) {
    if (!orders || orders.length === 0) {
        no_order_container.classList.add("show");
        ordersList.innerHTML = "";
        return;
    }
    no_order_container.classList.remove("show");

    const html = orders.map(order => {
        const cart = order.resturants.cart;
        let total = 0;
        let restaurantsHTML = "";

        Object.entries(cart).forEach(([resId, blabla]) => {
            restaurantsHTML += `
        <div class="restaurant-name" res_id="${escapeOrderHtml(resId)}">
            ${escapeOrderHtml(blabla.name)}
        </div>
    `;
            Object.entries(blabla.items).forEach(([itemid, item]) => {
                const itemTotal = item.price * item.qty;
                total += itemTotal;
                restaurantsHTML += `
            <div class="item" item_id="${escapeOrderHtml(itemid)}">
                <span>${escapeOrderHtml(item.name)} x ${escapeOrderHtml(item.qty)}</span>
                <span>₹${itemTotal}</span>
            </div>
        `;
            });
        });

        const isActive = order.status === "placed";
        const isDelivery = order.order_type === "delivery";
        const canHelp = (order.status === "completed" || order.status === "canceled") && orderHelpOpen(order);
        const storeLabel = Object.values(cart).map((r) => r && r.name).filter(Boolean).join(", ");

        let fulfilmentHTML;
        if (isDelivery && order.delivery_address) {
            const a = order.delivery_address;
            fulfilmentHTML = `
                <div class="order-date">Delivery to: ${escapeOrderHtml(a.adrs_type)} - ${escapeOrderHtml(a.address)}</div>
                ${a.phone ? `<div class="order-date">Phone: ${escapeOrderHtml(a.phone)}</div>` : ""}
            `;
        } else {
            fulfilmentHTML = `<div class="order-date">Pickup Time: ${escapeOrderHtml(order.pickup_time || "-")}</div>`;
        }

        return `
            <div class="order-card" data-token="${escapeOrderHtml(order.token_no)}">
                <div class="order-header">
                    <span class="order-id">#${escapeOrderHtml(order.order_id)}</span>
                    <span class="order-status status-${escapeOrderHtml(order.status)}">
                        ${escapeOrderHtml(order.status)}
                    </span>
                </div>
                <div class="token-no">Token No: ${escapeOrderHtml(order.token_no)}</div>
                <button type="button" class="qrBtn" aria-label="Show QR code" style="
                    background: none;
                    border: none;
                    padding: 0;
                    margin: -11px 0;
                    cursor: pointer;
                    // display: flex;
                    // justify-self: flex-end;
                    position:absolute;
                    right:38px;
                    line-height: 0;
                    ${isActive ? "display:block;" : "display:none;"}
                ">
                    <img src="/static/qr-code.png" alt="Show QR code" style="width:23px; height:23px; display:block; pointer-events:none;">
                </button>
                <div class="order-date">${escapeOrderHtml(isDelivery ? "Delivery" : "Pickup")}</div>
                <div class="order-date">${escapeOrderHtml(order.date)}</div>
                ${fulfilmentHTML}
                ${restaurantsHTML}
                <div class="total">Total: ₹${total}</div>
                <button class="cancelBtn" style="
                    background: red;
                    color: white;
                    padding: 5px 11px;
                    border-radius: 7px;
                    border: none;
                    ${isActive ? "" : "display:none;"}
                ">Cancel Order</button>
                ${canHelp ? helpButtonHTML(order.order_id, storeLabel) : ""}
            </div>
        `;
    }).join("");

    ordersList.innerHTML = html;
}

function applyFilterFor(filterDropdown, no_order_container) {
    no_order_container.classList.remove("show");
    const cards = document.querySelectorAll(".order-card");
    let visibleCardss = 0;
    cards.forEach(card => {
        const statusText = card.querySelector(".order-status").textContent.trim().toLowerCase();
        if (filterDropdown.value.toLowerCase() === "all" || statusText === filterDropdown.value.toLowerCase()) {
            card.style.display = "block";
            visibleCardss++;
        } else {
            card.style.display = "none";
        }
    });
    no_order_container.classList.toggle("show", visibleCardss === 0);
}

async function loadOrders(userId, { background = false } = {}) {
    const ordersList = document.getElementById("orders-list");
    const no_order_container = document.getElementById("No_orders_container");
    if (!ordersList) return;
    const cacheKey = `cachedOrders_${userId}`;

    if (!background) {
        const cached = sessionStorage.getItem(cacheKey);
        if (cached) {
            try { renderOrders(JSON.parse(cached), ordersList, no_order_container); }
            catch (e) { console.warn("bad orders cache, ignoring", e); }
        }
    }

    const res = await fetch(`/get_orders/${userId}`, { method: "POST" });
    if (res.status == 401) {
        alert("unauthorized User,Please Log in")
        window.location.href = "/login/user";
        return;
    }
    const data = await res.json();
    console.log(data)
    if (!data.success) {
        if (!sessionStorage.getItem(cacheKey)) ordersList.innerHTML = "<p>Error loading orders</p>";
        return;
    }
    sessionStorage.setItem(cacheKey, JSON.stringify(data.orders || []));
    renderOrders(data.orders, ordersList, no_order_container);
}

let ordersInit = null; // AbortController of the active init, so listeners are never attached twice

function initOrdersPage() {
    const ordersList = document.getElementById("orders-list");
    if (!ordersList) return; // not actually on the orders content

    closeQRSheet();
    if (ordersInit) ordersInit.abort();
    ordersInit = new AbortController();
    const { signal } = ordersInit;

    const pathParts = window.location.pathname.split("/");
    const userId = window.APP_USER_ID || pathParts[pathParts.length - 1];
    const no_order_container = document.getElementById("No_orders_container");
    const filterDropdown = document.getElementById("filterDropdown");
    filterDropdown.addEventListener("change", () => applyFilterFor(filterDropdown, no_order_container), { signal });

    loadOrders(userId).then(() => applyFilterFor(filterDropdown, no_order_container));

    ordersList.addEventListener("click", async (e) => {
        const helpBtn = e.target.closest(".order-help-btn");
        if (helpBtn) {
            if (window.KiranaSupport) {
                KiranaSupport.open("report", { orderId: helpBtn.dataset.orderId, storeName: helpBtn.dataset.store });
            } else {
                alert("Help isn't available right now. Please try again.");
            }
            return;
        }

        // Open this card's QR sheet (the click may land on the <img> inside the button)
        const qrBtn = e.target.closest(".qrBtn");
        if (qrBtn) {
            openQRSheet(qrBtn.closest(".order-card"));
            return;
        }

        if (!e.target.classList.contains("cancelBtn")) return;
        const card = e.target.closest(".order-card");
        const orderId = card.querySelector(".order-id").textContent.replace("#", "");
        const tokenNo = card.dataset.token;
        let res_ids = []
        card.querySelectorAll(".restaurant-name").forEach(r => res_ids.push(r.getAttribute("res_id")));

        const res = await fetch("/update_order_user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: orderId, status: "canceled", user_id: userId })
        })
        const data = await res.json()
        if (data.success) {
            socket.emit("user_cancelled_order", {
                order_id: orderId, token_no: tokenNo, res_ids: res_ids, user_id: userId, status: "canceled"
            });
            const statusSpan = card.querySelector(".order-status");
            statusSpan.textContent = "canceled";
            statusSpan.className = "order-status status-canceled";
            e.target.style.display = "none";
            const qrBtn = card.querySelector(".qrBtn");
            if (qrBtn) qrBtn.style.display = "none";
            await loadOrders(userId, { background: true });
            applyFilterFor(filterDropdown, no_order_container);
        }
        else {
            alert("failed updating status")
        }
    }, { signal });
}

// Run on this page's first real load...
initOrdersPage();
// ...and re-run every time the SPA router swaps Orders back into view
document.addEventListener("spa:pageload", (e) => {
    if (e.detail.page === "orders") initOrdersPage();
});