// Socket connects ONCE, the first time this script loads, and stays alive
// across all SPA navigation (this script tag is only ever injected once —
// see spa-router.js's ensureScriptLoaded).
const socket = io("https://general-online.onrender.com");

function escapeOrderHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

// ---------------------------------------------------------------
// Complaints / "Report a problem"
// ---------------------------------------------------------------
const HELP_WINDOW_MS = 24 * 60 * 60 * 1000;

function orderHelpOpen(order) {
    const raw = order.completed_at || order.status_updated_at || order.updated_at || order.date;
    const t = Date.parse(raw);
    if (Number.isNaN(t)) return true;
    return Date.now() - t <= HELP_WINDOW_MS;
}

function orderCanGetHelp(order) {
    if (order.status === "placed") return true; // pending: always allowed
    if (order.status === "completed" || order.status === "canceled") return orderHelpOpen(order);
    return false;
}

function helpButtonLabel(status) {
    return status === "placed" ? "Report a problem" : "Get help with this order";
}

function helpButtonHTML(info) {
    return `<button type="button" class="order-help-btn"
                data-order-id="${escapeOrderHtml(info.orderId)}"
                data-store="${escapeOrderHtml(info.storeName)}"
                data-status="${escapeOrderHtml(info.status)}"
                data-order-type="${escapeOrderHtml(info.orderType)}"
                data-res-ids="${escapeOrderHtml((info.resIds || []).join(","))}">${escapeOrderHtml(helpButtonLabel(info.status))}</button>`;
}

function ensureHelpButton(card, status) {
    if (!card) return;
    const orderId = (card.querySelector(".order-id")?.textContent || "").replace("#", "").trim();
    if (!orderId) return;

    let btn = card.querySelector(".order-help-btn");
    if (!btn) {
        const store = Array.from(card.querySelectorAll(".restaurant-name"))
            .map((r) => r.textContent.trim()).filter(Boolean).join(", ");
        const resIds = Array.from(card.querySelectorAll(".restaurant-name"))
            .map((r) => r.getAttribute("res_id")).filter(Boolean);
        card.insertAdjacentHTML("beforeend", helpButtonHTML({
            orderId, storeName: store, status, orderType: card.dataset.orderType || "pickup", resIds
        }));
        return;
    }
    btn.dataset.status = status;
    btn.textContent = helpButtonLabel(status);
}

// ---------------------------------------------------------------
// Shared state for edit / cancel
// ---------------------------------------------------------------
let ordersById = {};                 // checkout_id -> order (filled by renderOrders)
let ordersCtx = { userId: null };    // set by initOrdersPage

function findCard(orderId) {
    return Array.from(document.querySelectorAll(".order-card"))
        .find((c) => c.dataset.orderId === String(orderId)) || null;
}

function editDeadlineMs(order) {
    if (!order || !order.edit_deadline) return null;
    const t = Date.parse(order.edit_deadline);
    return Number.isNaN(t) ? null : t;
}

function canEditNow(order) {
    if (!order || order.status !== "placed") return false;
    const d = editDeadlineMs(order);
    return d !== null && Date.now() < d;
}

function fmtDeadline(ms) {
    const d = new Date(ms);
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    const sameDay = d.toDateString() === new Date().toDateString();
    return sameDay ? time : `${d.toLocaleDateString([], { day: "numeric", month: "short" })}, ${time}`;
}

async function refreshOrdersView() {
    const userId = ordersCtx.userId;
    const list = document.getElementById("orders-list");
    if (!userId || !list) return;
    await loadOrders(userId, { background: true });
    const dd = document.getElementById("filterDropdown");
    const empty = document.getElementById("No_orders_container");
    if (dd && empty) applyFilterFor(dd, empty);
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
            if (["placed", "completed", "canceled"].includes(data.status)) ensureHelpButton(card, data.status);

            // QR, edit and cancel only make sense while the order is still active
            if (data.status !== "placed") {
                const actions = card.querySelector(".order-actions");
                if (actions) actions.style.display = "none";
                const editNote = card.querySelector(".edit-note");
                if (editNote) editNote.style.display = "none";
                const qrBtn = card.querySelector(".qrBtn");
                if (qrBtn) qrBtn.style.display = "none";
                const openSheet = document.getElementById("qrSheet");
                if (openSheet && openSheet.dataset.token === card.dataset.token) closeQRSheet();
                if (actionSheetState && actionSheetState.orderId === card.dataset.orderId) closeActionSheet();
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

// The shop trimmed this customer's order -> reload so quantities / totals are right
socket.on("order_items_updated", () => {
    if (actionSheetState && actionSheetState.mode === "edit") closeActionSheet();
    refreshOrdersView();
});

// ---------------------------------------------------------------
// QR bottom sheet (slides up from the bottom edge of the screen)
// ---------------------------------------------------------------

const QR_LIB_URL = "https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js";
let qrLibPromise = null;

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
    if (sheet.dataset.token !== token || !sheet.classList.contains("show")) return;

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
// Action bottom sheet — used for "Edit items" and "Cancel order"
// ---------------------------------------------------------------

const CANCEL_REASONS = [
    "Ordered by mistake",
    "Changed my mind",
    "Want to change the items or time",
    "Found a better price elsewhere",
    "Shop is taking too long / not responding",
    "Something else"
];
const OTHER_REASON = "Something else";

let actionSheetState = null;   // { mode: "edit" | "cancel", orderId, ... }
let sheetBusy = false;

function ensureActionSheet() {
    let sheet = document.getElementById("osSheet");
    if (sheet) return sheet;

    const style = document.createElement("style");
    style.id = "osStyle";
    style.textContent = `
        .order-actions { display: flex; justify-content: flex-end; align-items: center; gap: 10px; margin-top: 14px; flex-wrap: wrap; }
        .order-actions .cancelBtn { margin: 0 !important; }
        .editBtn {
            background: var(--white, #FFFDF9); color: var(--flame-dark, #C23A15);
            border: 1.5px solid var(--flame, #E8491D); border-radius: 8px; padding: 8px 16px;
            font-family: var(--font-body, 'DM Sans', sans-serif); font-weight: 700; font-size: 12.5px;
            letter-spacing: .03em; cursor: pointer; transition: background .12s ease, color .12s ease;
        }
        .editBtn:hover { background: var(--flame, #E8491D); color: var(--white, #FFFDF9); }
        .editBtn:focus-visible { outline: 2px solid var(--flame, #E8491D); outline-offset: 2px; }
        .edit-note { font-size: 12px; color: var(--ink-soft, #6b5f58); margin-top: 12px; text-align: right; }

        #osOverlay { position: fixed; inset: 0; background: rgba(36,28,26,.5); opacity: 0; pointer-events: none; transition: opacity .3s ease; z-index: 2100; }
        #osOverlay.show { opacity: 1; pointer-events: auto; }
        #osSheet {
            position: fixed; left: 0; right: 0; bottom: 0; margin: 0 auto; width: 100%; max-width: 520px;
            max-height: 88vh; display: flex; flex-direction: column;
            background: #FFFDF9; color: #241C1A; border-radius: 20px 20px 0 0;
            box-shadow: 0 -14px 40px -18px rgba(36,28,26,.5);
            font-family: 'DM Sans', sans-serif; text-align: left;
            transform: translateY(100%); transition: transform .35s cubic-bezier(.22,.8,.3,1);
            will-change: transform; z-index: 2101;
        }
        #osSheet.show { transform: translateY(0); }
        #osSheet .osHandle { width: 40px; height: 4px; background: #E7D8C3; border-radius: 999px; margin: 12px auto 10px; flex-shrink: 0; }
        #osSheet .osHead { display: flex; align-items: center; gap: 10px; padding: 0 20px 12px; border-bottom: 1px dashed #E7D8C3; flex-shrink: 0; }
        #osSheet .osTitle { font-family: 'Anton', sans-serif; font-weight: 400; text-transform: uppercase; font-size: 22px; letter-spacing: .01em; margin: 0; flex: 1; }
        #osSheet .osX { background: none; border: none; font-size: 20px; line-height: 1; cursor: pointer; color: #6b5f58; padding: 4px 6px; }
        #osSheet .osBody { overflow-y: auto; padding: 14px 20px calc(22px + env(safe-area-inset-bottom, 0px)); -webkit-overflow-scrolling: touch; }
        #osSheet .osSub { font-size: 13px; color: #6b5f58; margin: 0 0 12px; line-height: 1.5; }
        #osSheet .osStore { font-size: 12.5px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; color: #C23A15; margin: 14px 0 6px; }
        #osSheet .osItem { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 9px 0; border-bottom: 1px dashed #E7D8C3; }
        #osSheet .osItemInfo { display: flex; flex-direction: column; min-width: 0; }
        #osSheet .osItemName { font-size: 14px; font-weight: 700; overflow-wrap: anywhere; }
        #osSheet .osItemPrice { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #6b5f58; }
        #osSheet .osItem.osRemoved .osItemName { text-decoration: line-through; opacity: .55; }
        #osSheet .osItem.osLocked { opacity: .6; }
        #osSheet .osStepper { display: flex; align-items: center; gap: 4px; flex-shrink: 0; }
        #osSheet .osStepper button {
            width: 30px; height: 30px; border-radius: 8px; border: 1.5px solid #E8491D; background: #FFFDF9;
            color: #C23A15; font-size: 18px; font-weight: 700; line-height: 1; cursor: pointer; padding: 0;
        }
        #osSheet .osStepper button:hover { background: #E8491D; color: #FFFDF9; }
        #osSheet .osQty { min-width: 28px; text-align: center; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 14px; }
        #osSheet .osTotal { display: flex; justify-content: flex-end; gap: 8px; font-family: 'JetBrains Mono', monospace; font-weight: 700; font-size: 15px; margin-top: 14px; }
        #osSheet .osError { color: #C23A15; font-size: 13px; font-weight: 700; margin: 10px 0 0; min-height: 0; }
        #osSheet .osReasons { display: flex; flex-direction: column; gap: 8px; }
        #osSheet .osReason {
            text-align: left; width: 100%; background: #FFF1DE; border: 1.5px solid #E7D8C3; border-radius: 12px;
            padding: 12px 14px; font-family: inherit; font-size: 14px; font-weight: 700; color: #241C1A; cursor: pointer;
        }
        #osSheet .osReason:hover { border-color: #E8491D; }
        #osSheet .osReason.selected { border-color: #E8491D; background: #FFE6C7; }
        #osSheet textarea {
            display: none; width: 100%; min-height: 80px; margin-top: 10px; font-family: inherit; font-size: 14px;
            color: #241C1A; background: #fff; border: 1px solid #E7D8C3; border-radius: 10px; padding: 10px 12px; resize: vertical;
            -webkit-user-select: text; user-select: text;
        }
        #osSheet textarea.show { display: block; }
        #osSheet textarea:focus { outline: 2px solid #E8491D; outline-offset: 1px; }
        #osSheet .osActions { display: flex; gap: 10px; margin-top: 16px; }
        #osSheet .osPrimary, #osSheet .osSecondary {
            flex: 1; border-radius: 12px; padding: 13px 0; font-weight: 700; font-size: 14px; cursor: pointer; font-family: inherit;
        }
        #osSheet .osPrimary { background: #E8491D; color: #FFFDF9; border: none; }
        #osSheet .osPrimary.osDanger { background: #C23A15; }
        #osSheet .osPrimary:disabled { opacity: .45; cursor: not-allowed; }
        #osSheet .osSecondary { background: #FFFDF9; color: #241C1A; border: 1.5px solid #E7D8C3; }
    `;
    document.head.appendChild(style);

    const overlay = document.createElement("div");
    overlay.id = "osOverlay";

    sheet = document.createElement("div");
    sheet.id = "osSheet";
    sheet.setAttribute("role", "dialog");
    sheet.innerHTML = `
        <div class="osHandle"></div>
        <div class="osHead"><h2 class="osTitle"></h2><button type="button" class="osX" data-os="close" aria-label="Close">✕</button></div>
        <div class="osBody"></div>
    `;
    document.body.appendChild(overlay);
    document.body.appendChild(sheet);

    overlay.addEventListener("click", () => { if (!sheetBusy) closeActionSheet(); });
    sheet.addEventListener("click", (e) => {
        const t = e.target.closest("[data-os]");
        if (t) handleSheetAction(t.dataset.os, t);
    });
    sheet.addEventListener("input", (e) => {
        if (e.target.id === "osReasonText") updateCancelButton();
    });
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && !sheetBusy) closeActionSheet();
    });
    return sheet;
}

function showActionSheet(title, bodyHTML) {
    const sheet = ensureActionSheet();
    const overlay = document.getElementById("osOverlay");
    sheet.querySelector(".osTitle").textContent = title;
    sheet.querySelector(".osBody").innerHTML = bodyHTML;
    void sheet.offsetHeight;
    overlay.classList.add("show");
    sheet.classList.add("show");
    document.body.style.overflow = "hidden";
}

function closeActionSheet() {
    const sheet = document.getElementById("osSheet");
    const overlay = document.getElementById("osOverlay");
    actionSheetState = null;
    sheetBusy = false;
    if (!sheet) return;
    sheet.classList.remove("show");
    overlay?.classList.remove("show");
    document.body.style.overflow = "";
}

function sheetEl(id) { return document.getElementById(id); }

function setSheetError(msg) {
    const el = sheetEl("osError");
    if (el) el.textContent = msg || "";
}

// ------------------------- EDIT ITEMS --------------------------

function openEditSheet(orderId) {
    const order = ordersById[orderId];
    if (!order) return;
    if (!canEditNow(order)) {
        alert("Editing is closed. Items can only be changed up to 30 minutes before your scheduled time.");
        refreshEditButtons();
        return;
    }

    const state = { mode: "edit", orderId, deadline: editDeadlineMs(order), qty: {}, orig: {}, price: {} };
    let html = `<p class="osSub">You can change quantities until <b>${escapeOrderHtml(fmtDeadline(state.deadline))}</b>. Set an item to 0 to remove it.</p>`;

    Object.entries(order.resturants.cart).forEach(([resId, store]) => {
        const locked = store.status !== "placed";
        html += `<div class="osStore">${escapeOrderHtml(store.name)}${locked ? " (can't be edited)" : ""}</div>`;
        Object.entries(store.items || {}).forEach(([itemId, item]) => {
            const qty = Number(item.qty) || 0;
            state.orig[itemId] = qty;
            state.qty[itemId] = qty;
            state.price[itemId] = Number(item.price) || 0;
            html += `
                <div class="osItem ${locked ? "osLocked" : ""}" data-item="${escapeOrderHtml(itemId)}" data-locked="${locked ? 1 : 0}">
                    <div class="osItemInfo">
                        <span class="osItemName">${escapeOrderHtml(item.name)}</span>
                        <span class="osItemPrice">₹${escapeOrderHtml(item.price)} each</span>
                    </div>
                    <div class="osStepper">
                        ${locked ? `<span class="osQty">x ${qty}</span>` : `
                            <button type="button" data-os="dec" aria-label="Decrease">−</button>
                            <span class="osQty">${qty}</span>
                            <button type="button" data-os="inc" aria-label="Increase">+</button>`}
                    </div>
                </div>`;
        });
    });

    html += `
        <div class="osTotal"><span>New total:</span><span id="osTotalVal">₹0</span></div>
        <p class="osError" id="osError"></p>
        <div class="osActions">
            <button type="button" class="osSecondary" data-os="close">Keep order as is</button>
            <button type="button" class="osPrimary" id="osSave" data-os="save" disabled>Save changes</button>
        </div>`;

    actionSheetState = state;
    showActionSheet("Edit items", html);
    updateEditTotals();
}

function updateEditTotals() {
    const st = actionSheetState;
    if (!st || st.mode !== "edit") return;
    let total = 0, changed = false;
    Object.keys(st.qty).forEach((id) => {
        total += st.qty[id] * st.price[id];
        if (st.qty[id] !== st.orig[id]) changed = true;
    });
    sheetEl("osTotalVal").textContent = `₹${total}`;
    sheetEl("osSave").disabled = !changed || sheetBusy;
    document.querySelectorAll("#osSheet .osItem").forEach((row) => {
        const id = row.dataset.item;
        row.classList.toggle("osRemoved", st.qty[id] === 0);
        const q = row.querySelector(".osStepper button ~ .osQty");
        if (q) q.textContent = st.qty[id];
    });
}

async function saveEdit() {
    const st = actionSheetState;
    if (!st || st.mode !== "edit" || sheetBusy) return;
    setSheetError("");

    if (Date.now() >= st.deadline) {
        setSheetError("Editing just closed. Items can only be changed up to 30 minutes before your scheduled time.");
        sheetEl("osSave").disabled = true;
        return;
    }
    const remaining = Object.values(st.qty).reduce((a, b) => a + b, 0);
    if (remaining === 0) {
        setSheetError("Keep at least one item, or cancel the whole order instead.");
        return;
    }

    // only send items the user can edit
    const items = {};
    document.querySelectorAll("#osSheet .osItem").forEach((row) => {
        if (row.dataset.locked === "1") return;
        items[row.dataset.item] = st.qty[row.dataset.item];
    });

    sheetBusy = true;
    const btn = sheetEl("osSave");
    btn.disabled = true;
    btn.textContent = "Saving...";
    try {
        const res = await fetch("/edit_order_user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: st.orderId, items })
        });
        if (res.status === 401) {
            alert("unauthorized User,Please Log in");
            window.location.href = "/login/user";
            return;
        }
        const data = await res.json();
        if (data.success) {
            sheetBusy = false;
            closeActionSheet();
            await refreshOrdersView();
        } else {
            sheetBusy = false;
            btn.textContent = "Save changes";
            btn.disabled = false;
            setSheetError(data.message || "Couldn't save your changes. Please try again.");
            if (res.status === 403) { btn.disabled = true; refreshEditButtons(); }
        }
    } catch (err) {
        sheetBusy = false;
        btn.textContent = "Save changes";
        btn.disabled = false;
        setSheetError("Network error. Please try again.");
    }
}

// ------------------------- CANCEL ORDER ------------------------

function openCancelSheet(orderId) {
    const order = ordersById[orderId];
    if (!order) return;
    actionSheetState = { mode: "cancel", orderId, reason: null };

    const html = `
        <p class="osSub">Please tell us why you're cancelling. This helps the shop and us improve.</p>
        <div class="osReasons">
            ${CANCEL_REASONS.map((r) => `<button type="button" class="osReason" data-os="reason" data-reason="${escapeOrderHtml(r)}">${escapeOrderHtml(r)}</button>`).join("")}
        </div>
        <textarea id="osReasonText" maxlength="250" placeholder="Tell us a bit more (at least 3 characters)"></textarea>
        <p class="osError" id="osError"></p>
        <div class="osActions">
            <button type="button" class="osSecondary" data-os="close">Keep order</button>
            <button type="button" class="osPrimary osDanger" id="osConfirmCancel" data-os="confirmCancel" disabled>Cancel order</button>
        </div>`;
    showActionSheet("Cancel order", html);
}

function currentCancelReason() {
    const st = actionSheetState;
    if (!st || st.mode !== "cancel" || !st.reason) return null;
    if (st.reason === OTHER_REASON) {
        const txt = (sheetEl("osReasonText")?.value || "").trim();
        return txt.length >= 3 ? `Other: ${txt}` : null;
    }
    return st.reason;
}

function updateCancelButton() {
    const btn = sheetEl("osConfirmCancel");
    if (btn) btn.disabled = sheetBusy || !currentCancelReason();
}

async function confirmCancel() {
    const st = actionSheetState;
    if (!st || st.mode !== "cancel" || sheetBusy) return;
    const reason = currentCancelReason();
    if (!reason) return;

    const order = ordersById[st.orderId];
    const userId = ordersCtx.userId;
    const tokenNo = order ? order.token_no : "";
    const resIds = order ? Object.keys(order.resturants.cart) : [];

    sheetBusy = true;
    const btn = sheetEl("osConfirmCancel");
    btn.disabled = true;
    btn.textContent = "Cancelling...";
    setSheetError("");

    try {
        const res = await fetch("/update_order_user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: st.orderId, status: "canceled", user_id: userId, reason })
        });
        const data = await res.json();
        if (data.success) {
            socket.emit("user_cancelled_order", {
                order_id: st.orderId, token_no: tokenNo, res_ids: resIds, user_id: userId, status: "canceled", reason
            });
            const card = findCard(st.orderId);
            if (card) {
                const statusSpan = card.querySelector(".order-status");
                statusSpan.textContent = "canceled";
                statusSpan.className = "order-status status-canceled";
                const actions = card.querySelector(".order-actions");
                if (actions) actions.style.display = "none";
                const note = card.querySelector(".edit-note");
                if (note) note.style.display = "none";
                const qrBtn = card.querySelector(".qrBtn");
                if (qrBtn) qrBtn.style.display = "none";
                ensureHelpButton(card, "canceled");
            }
            sheetBusy = false;
            closeActionSheet();
            await refreshOrdersView();
        } else {
            sheetBusy = false;
            btn.textContent = "Cancel order";
            updateCancelButton();
            setSheetError(data.message || "Couldn't cancel the order. Please try again.");
        }
    } catch (err) {
        sheetBusy = false;
        btn.textContent = "Cancel order";
        updateCancelButton();
        setSheetError("Network error. Please try again.");
    }
}

// ------------------------- sheet click router ------------------

function handleSheetAction(action, el) {
    if (action === "close") { if (!sheetBusy) closeActionSheet(); return; }

    const st = actionSheetState;
    if (!st) return;

    if (st.mode === "edit") {
        if (action === "dec" || action === "inc") {
            const id = el.closest(".osItem").dataset.item;
            const next = st.qty[id] + (action === "inc" ? 1 : -1);
            if (next < 0 || next > 99) return;
            st.qty[id] = next;
            setSheetError("");
            updateEditTotals();
        } else if (action === "save") {
            saveEdit();
        }
        return;
    }

    if (st.mode === "cancel") {
        if (action === "reason") {
            st.reason = el.dataset.reason;
            document.querySelectorAll("#osSheet .osReason").forEach((b) => b.classList.toggle("selected", b === el));
            const ta = sheetEl("osReasonText");
            ta.classList.toggle("show", st.reason === OTHER_REASON);
            if (st.reason === OTHER_REASON) ta.focus();
            updateCancelButton();
        } else if (action === "confirmCancel") {
            confirmCancel();
        }
    }
}

// Removes Edit buttons whose 30-minutes-before cutoff has passed
function refreshEditButtons() {
    document.querySelectorAll(".order-card").forEach((card) => {
        const order = ordersById[card.dataset.orderId];
        if (canEditNow(order)) return;
        card.querySelector(".editBtn")?.remove();
        card.querySelector(".edit-note")?.remove();
    });
    const st = actionSheetState;
    if (st && st.mode === "edit" && Date.now() >= st.deadline) {
        setSheetError("Editing just closed. Items can only be changed up to 30 minutes before your scheduled time.");
        const save = sheetEl("osSave");
        if (save) save.disabled = true;
    }
}

// ---------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------

function renderOrders(orders, ordersList, no_order_container) {
    ordersById = {};
    if (!orders || orders.length === 0) {
        no_order_container.classList.add("show");
        ordersList.innerHTML = "";
        return;
    }
    no_order_container.classList.remove("show");

    const html = orders.map(order => {
        ordersById[String(order.order_id)] = order;

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
        const canHelp = orderCanGetHelp(order);
        const canEdit = canEditNow(order);
        const storeLabel = Object.values(cart).map((r) => r && r.name).filter(Boolean).join(", ");
        const resIds = Object.keys(cart);

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
            <div class="order-card" data-order-id="${escapeOrderHtml(order.order_id)}" data-token="${escapeOrderHtml(order.token_no)}" data-order-type="${isDelivery ? "delivery" : "pickup"}">
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
                ${canEdit ? `<div class="edit-note">You can edit items until ${escapeOrderHtml(fmtDeadline(editDeadlineMs(order)))}</div>` : ""}
                ${isActive ? `
                <div class="order-actions" style="display: flex;
    justify-content: space-between;">
                    ${canEdit ? `<button type="button" class="editBtn" style="    background: var(--white, #FFFDF9);
    color: var(--flame-dark, #C23A15);
    border: 1.5px solid var(--flame, #E8491D);
    border-radius: 8px;
    padding: 8px 16px;
    font-family: var(--font-body);
    font-weight: 700;
    font-size: 12.5px;
    letter-spacing: .03em;
    cursor: pointer;
    transition: background .12s ease, color .12s ease;">Edit items</button>` : ""}
                    <button class="cancelBtn" style="
                        background: red;
                        color: white;
                        padding: 5px 11px;
                        border-radius: 7px;
                        border: none;
                    ">Cancel Order</button>
                </div>` : ""}
                ${canHelp ? helpButtonHTML({
            orderId: order.order_id,
            storeName: storeLabel,
            status: order.status,
            orderType: isDelivery ? "delivery" : "pickup",
            resIds
        }) : ""}
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
    closeActionSheet();
    if (ordersInit) ordersInit.abort();
    ordersInit = new AbortController();
    const { signal } = ordersInit;

    const pathParts = window.location.pathname.split("/");
    const userId = window.APP_USER_ID || pathParts[pathParts.length - 1];
    ordersCtx.userId = userId;
    const no_order_container = document.getElementById("No_orders_container");
    const filterDropdown = document.getElementById("filterDropdown");
    filterDropdown.addEventListener("change", () => applyFilterFor(filterDropdown, no_order_container), { signal });

    loadOrders(userId).then(() => applyFilterFor(filterDropdown, no_order_container));

    // hide Edit buttons the moment their cutoff passes
    const tick = setInterval(refreshEditButtons, 20000);
    signal.addEventListener("abort", () => clearInterval(tick));

    ordersList.addEventListener("click", async (e) => {
        const helpBtn = e.target.closest(".order-help-btn");
        if (helpBtn) {
            if (window.KiranaSupport) {
                const card = helpBtn.closest(".order-card");
                const liveStatus = (card?.querySelector(".order-status")?.textContent || helpBtn.dataset.status || "").trim().toLowerCase();
                KiranaSupport.open("report", {
                    orderId: helpBtn.dataset.orderId,
                    storeName: helpBtn.dataset.store,
                    status: liveStatus,
                    orderType: helpBtn.dataset.orderType || card?.dataset.orderType || "pickup",
                    resIds: (helpBtn.dataset.resIds || "").split(",").filter(Boolean)
                });
            } else {
                alert("Help isn't available right now. Please try again.");
            }
            return;
        }

        const qrBtn = e.target.closest(".qrBtn");
        if (qrBtn) {
            openQRSheet(qrBtn.closest(".order-card"));
            return;
        }

        const editBtn = e.target.closest(".editBtn");
        if (editBtn) {
            openEditSheet(editBtn.closest(".order-card").dataset.orderId);
            return;
        }

        const cancelBtn = e.target.closest(".cancelBtn");
        if (cancelBtn) {
            openCancelSheet(cancelBtn.closest(".order-card").dataset.orderId);
        }
    }, { signal });
}

// Run on this page's first real load...
initOrdersPage();
// ...and re-run every time the SPA router swaps Orders back into view
document.addEventListener("spa:pageload", (e) => {
    if (e.detail.page === "orders") initOrdersPage();
});