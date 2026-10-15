const pathParts = window.location.pathname.split("/");

const resId = pathParts[pathParts.length - 1];
const type = pathParts[pathParts.length - 4];
const resname = pathParts[pathParts.length - 2]
console.log(resId, name, type);
const filterDropdown = document.getElementById("filterDropdown");

filterDropdown.addEventListener("change", applyFilter);

// Latest orders from the server. The QR scanner matches tokens against this,
// not against the DOM, so it works whatever the filter is showing.
let sellerOrders = [];

function escapeSellerHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

function updateActiveCount() {
    const active = sellerOrders.filter(o => o.status === "placed").length;
    const el = document.getElementById("active_orders");
    if (el) el.textContent = active;
}

// Initial filter when the page loads
applyFilter();

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

console.log(resId)
const socket = io();

socket.on("connect", () => {
    console.log("Connected:", socket.id);

    socket.emit("join_seller_room", {
        seller_id: resId
    });
});
socket.on("new_order", () => {
    console.log("New order received → reloading...");
    loadOrders();   // 🔥 call your API again
});
socket.on("seller_order_cancelled", (data) => {
    console.log("User cancelled order:", data.token_no);

    const cards = document.querySelectorAll(".order-card");
    cards.forEach(card => {
        const cardToken = card.querySelector(".token-no").textContent.split(": ")[1].trim();

        if (cardToken === String(data.token_no)) {
            // Optional: Show a "User Cancelled" overlay before removing
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
        alert("unauthorized,Please Log in")
        window.location.href = "/login/seller";
        return;
    }
    const data = await res.json();
    console.log(data)
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
    applyFilter()
}
function renderSingleOrder(order, prepend = false) {
    let total = 0;
    let restaurantsHTML = "";

    Object.entries(order.items).forEach(([itemName, detail]) => {
        const itemTotal = detail.price * detail.qty;
        total += itemTotal;

        restaurantsHTML += `
            <div class="item">
                <span>${itemName} x ${detail.qty}</span>
                <span>₹${itemTotal}</span>
            </div>
        `;
    });

    const orderHTML = `
        <div class="order-card">
            <div class="order-header">
                <span class="order-id">#${order.order_id}</span>
                <span class="order-status status-${order.status}">
                    ${order.status}
                </span>
            </div>

            <div class="order-date">${order.time}</div>

            ${restaurantsHTML}

            <div class="total">Total: ₹${total}</div>
        </div>
    `;

    if (prepend) {
        ordersList.innerHTML = orderHTML + ordersList.innerHTML;
    } else {
        ordersList.innerHTML += orderHTML;
    }
}

loadOrders();

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
    })
    const data = await res.json()
    if (!data.success) {
        alert("failed updating status")
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
// ===============================================================

const JSQR_URL = "https://cdnjs.cloudflare.com/ajax/libs/jsQR/1.4.0/jsQR.min.js";
let jsQRPromise = null;

const scanner = {
    stream: null,
    raf: 0,
    running: false,
    last: 0,
    current: null,   // the order currently shown in the result sheet
    canvas: document.createElement("canvas"),
};
scanner.ctx = scanner.canvas.getContext("2d", { willReadFrequently: true });

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
    `;
    document.head.appendChild(style);

    root = document.createElement("div");
    root.id = "qrScanner";
    root.innerHTML = `
        <video playsinline muted autoplay></video>
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

    root.querySelector(".scanClose").addEventListener("click", closeScanner);
    result.addEventListener("click", onScanResultClick);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeScanner(); });
    // never leave the camera running in the background
    document.addEventListener("visibilitychange", () => { if (document.hidden) closeScanner(); });

    return root;
}

function setScanHint(text) {
    const hint = document.querySelector("#qrScanner .scanHint");
    if (hint) hint.textContent = text;
}

async function openScanner() {
    const root = ensureScannerUI();
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

        scanner.stream = stream;
        video.srcObject = stream;
        video.muted = true;
        await video.play();

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

function stopCamera() {
    scanner.running = false;
    cancelAnimationFrame(scanner.raf);
    if (scanner.stream) {
        scanner.stream.getTracks().forEach(t => t.stop());
        scanner.stream = null;
    }
    const video = document.querySelector("#qrScanner video");
    if (video) video.srcObject = null;
}

function closeScanner() {
    const root = document.getElementById("qrScanner");
    if (!root) return;
    stopCamera();
    hideScanResult();
    root.classList.remove("show");
    document.body.style.overflow = "";
}

function startScanLoop() {
    scanner.running = true;
    scanner.last = 0;
    cancelAnimationFrame(scanner.raf);
    scanner.raf = requestAnimationFrame(scanTick);
}

function scanTick(ts) {
    if (!scanner.running) return;
    scanner.raf = requestAnimationFrame(scanTick);

    if (ts - scanner.last < 120) return; // ~8 decodes per second is plenty
    scanner.last = ts;

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
    scanner.canvas.width = size;
    scanner.canvas.height = size;
    scanner.ctx.drawImage(video, sx, sy, ss, ss, 0, 0, size, size);

    const img = scanner.ctx.getImageData(0, 0, size, size);
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
    scanner.running = false;
    cancelAnimationFrame(scanner.raf);
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
    scanner.current = kind === "ok" ? order : null;

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
    scanner.current = null;
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
        closeScanner();
    } else if (act === "complete" && scanner.current) {
        btn.disabled = true;
        const ok = await setOrderStatus({
            order_id: scanner.current.order_id,
            user_id: scanner.current.user_id,
            token_no: scanner.current.token_no
        }, "completed");
        if (ok) {
            closeScanner();
        } else {
            btn.disabled = false;
        }
    }
}

const scanQrBtn = document.getElementById("scanQrBtn");
if (scanQrBtn) scanQrBtn.addEventListener("click", openScanner);

// ===============================================================
// Sidebar
// ===============================================================

const overlay = document.querySelector(".overlay")
document.getElementById("menuToggle").onclick = function () {
    const sidebar = document.querySelector(".sidebar")
    sidebar.classList.add("show")
    sidebar.style.display = "block"
    overlay.classList.add("show")
};

document.getElementById("hideCategoryBtn").addEventListener("click", function () {
    const sidebar = document.querySelector(".sidebar")
    sidebar.style.display = "none"
    overlay.classList.remove("show")
});
overlay.addEventListener("click", () => {
    const sidebar = document.querySelector(".sidebar")
    overlay.classList.remove("show")
    sidebar.style.display = "none"
    sidebar.classList.remove("show")
})