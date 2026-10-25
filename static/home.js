/* ============================================================
   kirana_utils.js  (load BEFORE home.js and cart.js)

   Shared helpers, exposed as window.KiranaUtils:
   - etaRange(km)            real delivery ETA from distance + prep time
   - refreshHeaderPill()     header "N mins delivery" pill from the store cards on Home
   - renderMenuInfo(p, items) menu page: ETA / cost-for-two / distance line
   - buildSlots(now)         delivery time slots for today + tomorrow
   - isSlotAvailable(slot)   is a previously picked slot still bookable
   ============================================================ */
(function () {
    "use strict";

    // ---- Tuning knobs -------------------------------------------------
    const PREP_MINUTES = 10;      // typical time a shop needs to pack an order
    const SLOT_START_HOUR = 8;    // first delivery slot starts at 8:00
    const SLOT_END_HOUR = 22;     // last delivery slot ends at 22:00
    const SLOT_MINUTES = 30;      // slot length
    const MIN_LEAD_MINUTES = 45;  // earliest a slot can start, counted from now
    // -------------------------------------------------------------------

    function esc(str) {
        return String(str ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[c]);
    }

    function minutesPerKm(km) {
        if (km < 3) return 3.0;
        if (km < 7) return 2.5;
        return 2.0;
    }

    // Prep time + travel time, shown as a 5-minute window, e.g. { label: "20-25" }.
    function etaRange(distanceKm) {
        const km = Number(distanceKm);
        const travel = Number.isFinite(km) && km > 0 ? km * minutesPerKm(km) : 0;
        const total = PREP_MINUTES + travel;
        const lower = Math.max(10, Math.floor(total / 5) * 5);
        const upper = lower + 5;
        return { lower, upper, label: `${lower}-${upper}` };
    }

    // Reads the rendered store cards (data-distance / data-delivery / data-radius)
    // and shows the fastest ETA among stores that are open AND deliver to you.
    // Only acts while the Home list is mounted, so the pill keeps its last value
    // on Orders / Cart / Menu.
    function refreshHeaderPill() {
        const pill = document.getElementById("deliveryEtaPill");
        if (!pill || !document.getElementById("resturants_container")) return;

        let nearest = null;
        document.querySelectorAll(".store-card").forEach((card) => {
            if (card.classList.contains("is-offline")) return;
            if (card.dataset.delivery !== "true") return;

            const km = parseFloat(card.dataset.distance);
            const radius = parseFloat(card.dataset.radius);
            if (!Number.isFinite(km)) return;
            if (Number.isFinite(radius) && km > radius) return;

            if (nearest === null || km < nearest) nearest = km;
        });

        if (nearest === null) {
            pill.style.display = "none";
            return;
        }
        pill.style.display = "";
        pill.innerHTML = `<i class="fa-solid fa-bolt"></i> ${esc(etaRange(nearest).label)} mins delivery`;
    }

    function median(nums) {
        if (!nums.length) return null;
        const s = nums.slice().sort((a, b) => a - b);
        const mid = Math.floor(s.length / 2);
        return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
    }

    // Average spend for two diners, rounded to the nearest ₹50. Restaurants only.
    function costForTwo(items) {
        const prices = items
            .filter((i) => i.item_qty > 0 && i.price > 0)
            .map((i) => i.price);
        const m = median(prices);
        if (m === null) return null;
        return Math.max(50, Math.round((m * 2) / 50) * 50);
    }

    // params = the menuParams stashed by navigateToMenu (distanceKm, type, delivery, radius)
    function renderMenuInfo(params, items) {
        const box = document.querySelector(".res-delivery-info");
        if (!box) return;

        const p = params || {};
        const km = parseFloat(p.distanceKm);
        const delivery = p.delivery === true || String(p.delivery) === "true";
        const parts = [];

        if (delivery && Number.isFinite(km)) {
            parts.push(`<span><i class="fa-solid fa-clock"></i> ${esc(etaRange(km).label)} MINS</span>`);
        } else if (!delivery) {
            parts.push(`<span><i class="fa-solid fa-store"></i> PICKUP ONLY &middot; READY IN ~${PREP_MINUTES}-${PREP_MINUTES + 5} MINS</span>`);
        }

        if (p.type === "restaurant") {
            const two = costForTwo(items || []);
            if (two !== null) {
                parts.push(`<span><i class="fa-solid fa-indian-rupee-sign"></i> ₹${esc(two)} for two</span>`);
            }
        } else {
            const inStock = (items || []).filter((i) => i.item_qty > 0).length;
            parts.push(`<span><i class="fa-solid fa-box"></i> ${esc(inStock)} item${inStock === 1 ? "" : "s"} in stock</span>`);
        }

        if (Number.isFinite(km)) {
            parts.push(`<span><i class="fa-solid fa-location-dot"></i> ${esc(km.toFixed(1))} km away</span>`);
        }

        box.innerHTML = parts.join("");
    }

    // ---------------- Delivery slots ----------------
    function pad(n) { return String(n).padStart(2, "0"); }

    function ymd(d) {
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function fmt12(totalMinutes) {
        const h = Math.floor(totalMinutes / 60);
        const m = totalMinutes % 60;
        return `${h % 12 || 12}:${pad(m)} ${h >= 12 ? "PM" : "AM"}`;
    }

    function daySlots(day, earliestMs) {
        const out = [];
        for (let mins = SLOT_START_HOUR * 60; mins + SLOT_MINUTES <= SLOT_END_HOUR * 60; mins += SLOT_MINUTES) {
            const start = new Date(day.getFullYear(), day.getMonth(), day.getDate(), 0, mins);
            if (start.getTime() < earliestMs) continue;
            out.push({
                date: ymd(start),
                time: `${pad(Math.floor(mins / 60))}:${pad(mins % 60)}`,
                label: `${fmt12(mins)} - ${fmt12(mins + SLOT_MINUTES)}`
            });
        }
        return out;
    }

    // Returns { today: [...], tomorrow: [...] }; each slot is { date, time, label }.
    function buildSlots(now) {
        const base = now instanceof Date ? now : new Date();
        const earliest = base.getTime() + MIN_LEAD_MINUTES * 60000;
        const tomorrow = new Date(base.getFullYear(), base.getMonth(), base.getDate() + 1);
        return { today: daySlots(base, earliest), tomorrow: daySlots(tomorrow, earliest) };
    }

    function isSlotAvailable(slot, now) {
        if (!slot) return false;
        const lists = buildSlots(now);
        return lists.today.concat(lists.tomorrow).some((s) => s.date === slot.date && s.time === slot.time);
    }

    window.KiranaUtils = {
        PREP_MINUTES,
        etaRange,
        refreshHeaderPill,
        costForTwo,
        renderMenuInfo,
        buildSlots,
        isSlotAvailable
    };
})();

/* ============================================================
   support.js  (load AFTER user_navbar.js, at the end of <body>)

   Help & Support sheet: FAQ, "Report an issue" form, policies.
   Built entirely in JS, so no template changes are needed.

   Open it from anywhere:
     - any element with   data-open-support            -> FAQ tab
                          data-open-support="policies" -> Policies tab
     - JS:  KiranaSupport.open("report", { orderId: "abc123", storeName: "Shop" })
                          (the report form only opens for a specific order,
                           it is launched from "Get help with this order" on Orders)
   ============================================================ */
(function () {
    "use strict";

    // ---- Edit these -----------------------------------------------------
    const SUPPORT_EMAIL = "";               // e.g. "help@yourdomain.com" (leave "" to hide)
    const SUPPORT_PHONE = "";               // e.g. "+91 98765 43210"      (leave "" to hide)
    const TICKET_ENDPOINT = "/support_ticket";

    const CATEGORIES = [
        ["item", "Missing or wrong item"],
        ["quality", "Item quality"],
        ["late", "Late delivery or pickup"],
        ["payment", "Payment or refund"],
        ["other", "Something else"]
    ];

    const FAQ = [
        {
            q: "How do I place an order?",
            a: "Open a store, add items, then go to your cart. Choose Pickup or Delivery, review the bill and tap Place Order."
        },
        {
            q: "Why can't I add items from a store?",
            a: "The store may be offline (closed or paused). You can still browse its menu and items already in your cart stay saved. You will see a message when the store is back online."
        },
        {
            q: "Can I order from two stores at once?",
            a: "A cart holds items from one store at a time. If you add an item from another store, we ask whether you want to replace your cart."
        },
        {
            q: "What is the difference between Pickup and Delivery?",
            a: "With Pickup you choose a time and collect your order from the shop. Delivery is offered only by some stores and only within the delivery radius shown on the store card. Your delivery address must be inside that radius."
        },
        {
            q: "Can I schedule my delivery for later?",
            a: "Yes. In your cart, under Delivery Time, choose Schedule for later and pick a 30-minute slot for today or tomorrow."
        },
        {
            q: "How are delivery times estimated?",
            a: "We add the shop's usual packing time to the travel time from the shop to you. It is an estimate, not a guarantee."
        },
        {
            q: "How do I change my delivery address?",
            a: "In your cart, tap Change next to the address. You can also manage saved addresses from your profile."
        },
        {
            q: "My order has a problem. What should I do?",
            a: "Go to Orders, find the order that had the problem and tap Get help with this order. Help is available for 24 hours after an order is completed or canceled."
        }
    ];

    // TODO: replace with your final, reviewed legal text before launch.
    const POLICIES = [
        {
            title: "Terms of use",
            body: [
                "Stores set their own prices, stock and opening hours. Prices and availability can change, and an item can sell out while it is in your cart.",
                "Please place genuine orders and give correct address and contact details so the store can reach you."
            ]
        },
        {
            title: "Privacy",
            body: [
                "We use your location to show stores near you and to check whether a store can deliver to your address.",
                "Your name, phone number and saved addresses are used to fulfil your orders and are shared with the store you order from."
            ]
        },
        {
            title: "Cancellations and refunds",
            body: [
                "Orders are prepared and fulfilled by the store, so cancellations and refunds depend on the order status.",
                "If something went wrong, open the order in Orders and tap Get help with this order within 24 hours of it being completed or canceled."
            ]
        },
        {
            title: "Delivery and pickup",
            body: [
                "Delivery is available only where a store offers it and only inside its delivery radius.",
                "For pickup, please collect your order at the time you selected."
            ]
        }
    ];
    // ---------------------------------------------------------------------

    let overlay = null;
    let sheet = null;
    let lastFocus = null;

    function esc(str) {
        return String(str ?? "").replace(/[&<>"']/g, (c) => ({
            "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
        })[c]);
    }

    function currentUserId() {
        const parts = window.location.pathname.split("/").filter(Boolean);
        return window.APP_USER_ID || parts[parts.length - 1] || "";
    }

    function normalizePhone(phone) {
        const cleaned = (phone || "").replace(/[\s-]/g, "");
        return cleaned.replace(/^(?:\+?91|0)(?=\d{10}$)/, "");
    }

    function accordion(items, textKey) {
        return items.map((it) => {
            const paragraphs = Array.isArray(it[textKey]) ? it[textKey] : [it[textKey]];
            return `
                <details class="support-item">
                    <summary>${esc(it.q || it.title)}</summary>
                    ${paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}
                </details>`;
        }).join("");
    }

    function contactMarkup() {
        const bits = [];
        if (SUPPORT_PHONE) bits.push(`<a href="tel:${esc(SUPPORT_PHONE.replace(/[^\d+]/g, ""))}"><i class="fa-solid fa-phone"></i> ${esc(SUPPORT_PHONE)}</a>`);
        if (SUPPORT_EMAIL) bits.push(`<a href="mailto:${esc(SUPPORT_EMAIL)}"><i class="fa-regular fa-envelope"></i> ${esc(SUPPORT_EMAIL)}</a>`);
        return bits.length ? `<div class="support-contact">${bits.join("")}</div>` : "";
    }

    function build() {
        if (sheet && document.body.contains(sheet)) return;

        overlay = document.createElement("div");
        overlay.className = "support-overlay";
        overlay.addEventListener("click", close);

        sheet = document.createElement("section");
        sheet.className = "support-sheet";
        sheet.setAttribute("role", "dialog");
        sheet.setAttribute("aria-modal", "true");
        sheet.setAttribute("aria-labelledby", "supportTitle");

        sheet.innerHTML = `
            <header class="support-head">
                <h2 id="supportTitle">Help &amp; support</h2>
                <button type="button" class="support-close" aria-label="Close">&times;</button>
            </header>

            <div class="support-tabs" role="tablist">
                <button type="button" role="tab" class="support-tab active" data-tab="faq" aria-selected="true">FAQ</button>
                <button type="button" role="tab" class="support-tab" data-tab="report" aria-selected="false" hidden>Get help with this order</button>
                <button type="button" role="tab" class="support-tab" data-tab="policies" aria-selected="false">Policies</button>
            </div>

            <div class="support-body">
                <div class="support-panel active" data-panel="faq">${accordion(FAQ, "a")}</div>

                <div class="support-panel" data-panel="report">
                    <form class="support-form" novalidate>
                        <label>What is this about?
                            <select name="category">
                                ${CATEGORIES.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join("")}
                            </select>
                        </label>
                        <div class="support-order" aria-live="polite"></div>
                        <input name="order_id" type="hidden">
                        <label>Tell us what happened
                            <textarea name="message" maxlength="1000" placeholder="Describe the problem..."></textarea>
                        </label>
                        <label>Phone number <span class="opt">(optional, so we can call you)</span>
                            <input name="phone" type="tel" maxlength="13" autocomplete="tel">
                        </label>
                        <p class="support-error" role="alert"></p>
                        <button type="submit" class="support-submit">Send</button>
                    </form>

                    <div class="support-done" hidden>
                        <div class="icon">✅</div>
                        <h3>Request sent</h3>
                        <p class="support-done-text">Thanks, we have received your request.</p>
                        <button type="button" class="support-again">Report another issue</button>
                    </div>
                </div>

                <div class="support-panel" data-panel="policies">${accordion(POLICIES, "body")}</div>
            </div>
            ${contactMarkup()}
        `;

        sheet.querySelector(".support-close").addEventListener("click", close);

        sheet.querySelector(".support-tabs").addEventListener("click", (e) => {
            const tab = e.target.closest(".support-tab");
            if (tab) selectTab(tab.dataset.tab);
        });

        sheet.querySelector(".support-form").addEventListener("submit", onSubmit);
        sheet.querySelector(".support-again").addEventListener("click", () => showForm());

        document.body.appendChild(overlay);
        document.body.appendChild(sheet);
    }

    function selectTab(name) {
        sheet.querySelectorAll(".support-tab").forEach((t) => {
            const on = t.dataset.tab === name;
            t.classList.toggle("active", on);
            t.setAttribute("aria-selected", on ? "true" : "false");
        });
        sheet.querySelectorAll(".support-panel").forEach((p) => {
            p.classList.toggle("active", p.dataset.panel === name);
        });
    }

    function showForm() {
        sheet.querySelector(".support-form").hidden = false;
        sheet.querySelector(".support-done").hidden = true;
        showError("");
    }

    function showDone(ticketId) {
        sheet.querySelector(".support-form").hidden = true;
        const done = sheet.querySelector(".support-done");
        done.hidden = false;
        done.querySelector(".support-done-text").textContent = ticketId
            ? `Thanks, we have received your request. Your reference is ${ticketId}.`
            : "Thanks, we have received your request.";
    }

    // html=true only for strings built here from escaped parts.
    function showError(message, html) {
        const el = sheet.querySelector(".support-error");
        if (!message) {
            el.textContent = "";
            el.classList.remove("show");
            return;
        }
        if (html) el.innerHTML = message; else el.textContent = message;
        el.classList.add("show");
    }

    function mailtoFallback(data) {
        if (!SUPPORT_EMAIL) return "";
        const subject = `Support request: ${data.category}`;
        const body = `Order ID: ${data.order_id || "-"}\nPhone: ${data.phone || "-"}\n\n${data.message}`;
        const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        return ` <a href="${esc(href)}">Email us instead</a>`;
    }

    async function onSubmit(e) {
        e.preventDefault();
        const form = e.currentTarget;
        const btn = form.querySelector(".support-submit");

        const data = {
            user_id: currentUserId(),
            category: form.elements.category.value,
            order_id: form.elements.order_id.value.trim(),
            message: form.elements.message.value.trim(),
            phone: normalizePhone(form.elements.phone.value),
            page: document.body.dataset.page || ""
        };

        if (!data.order_id) {
            showError("Please open this form from an order in Orders.");
            return;
        }
        if (data.message.length < 10) {
            showError("Please describe the problem in a few words (at least 10 characters).");
            return;
        }
        if (data.phone && !/^[6-9]\d{9}$/.test(data.phone)) {
            showError("Please enter a valid 10-digit phone number, or leave it empty.");
            return;
        }

        showError("");
        btn.disabled = true;
        btn.textContent = "Sending...";

        try {
            const res = await fetch(TICKET_ENDPOINT, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(data)
            });

            if (res.status === 401) {
                alert("Unauthorized user. Please log in");
                window.location.href = "/login/user";
                return;
            }

            let body = null;
            try { body = await res.json(); } catch (err) { /* non-JSON error page */ }

            if (res.ok && body && body.success) {
                form.reset();
                showDone(body.ticket_id);
            } else {
                const msg = (body && body.message) || "We couldn't send your request right now.";
                showError(esc(msg) + mailtoFallback(data), true);
            }
        } catch (err) {
            console.error("support ticket failed", err);
            showError(esc("Network error. Please try again.") + mailtoFallback(data), true);
        } finally {
            btn.disabled = false;
            btn.textContent = "Send";
        }
    }

    function open(tab, opts) {
        build();
        lastFocus = document.activeElement;

        const orderId = opts && opts.orderId ? String(opts.orderId) : "";
        const form = sheet.querySelector(".support-form");
        const reportTab = sheet.querySelector('.support-tab[data-tab="report"]');

        // The report form only exists in the context of one order.
        reportTab.hidden = !orderId;
        if (orderId) {
            if (form.elements.order_id.value !== orderId) form.reset();
            form.elements.order_id.value = orderId;
            const store = opts.storeName ? ` \u00b7 ${opts.storeName}` : "";
            sheet.querySelector(".support-order").textContent = `Order #${orderId}${store}`;
        }

        const wanted = tab === "report" && !orderId ? "faq" : (tab || "faq");
        selectTab(wanted);
        showForm();

        overlay.classList.add("show");
        sheet.classList.add("show");
        document.body.classList.add("support-open");
        sheet.querySelector(".support-close").focus();
    }

    function close() {
        if (!sheet) return;
        overlay.classList.remove("show");
        sheet.classList.remove("show");
        document.body.classList.remove("support-open");
        if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    }

    function isOpen() {
        return !!(sheet && sheet.classList.contains("show"));
    }

    // Open from any [data-open-support] element (header button, profile link, orders page...)
    document.addEventListener("click", (e) => {
        const trigger = e.target.closest("[data-open-support]");
        if (!trigger) return;
        e.preventDefault();
        open(trigger.dataset.openSupport || "faq");
    });

    document.addEventListener("keydown", (e) => {
        if (!isOpen()) return;

        if (e.key === "Escape") {
            close();
            return;
        }

        // Keep Tab focus inside the sheet while it is open
        if (e.key === "Tab") {
            const focusable = Array.from(sheet.querySelectorAll(
                "button, [href], input, select, textarea, summary, [tabindex]:not([tabindex='-1'])"
            )).filter((el) => !el.disabled && el.offsetParent !== null);
            if (!focusable.length) return;

            const first = focusable[0];
            const last = focusable[focusable.length - 1];
            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        }
    });

    window.KiranaSupport = { open, close };
})();

let map;
let marker;
let userLatt = null;
let userLong = null;
let scrollTopHandler = null; // re-bound each initHomePage() run — see wiring below
let toastTimer = null;

function getRestaurantCacheKey(userId) {
    return `cachedRestaurants_${userId}`;
}

function currentUserId() {
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    return window.APP_USER_ID || pathParts[pathParts.length - 1];
}

// ---- Favorites (client-side only, persisted per user in localStorage) ----
function getFavoriteIds(userId) {
    try {
        const raw = localStorage.getItem(`favoriteRestaurants_${userId}`);
        return new Set(raw ? JSON.parse(raw) : []);
    } catch (e) {
        return new Set();
    }
}

function toggleFavoriteId(userId, id) {
    const favorites = getFavoriteIds(userId);
    const isNowFavorite = !favorites.has(id);
    if (isNowFavorite) favorites.add(id); else favorites.delete(id);
    localStorage.setItem(`favoriteRestaurants_${userId}`, JSON.stringify([...favorites]));
    return isNowFavorite;
}

// ---- Toast: small, short-lived confirmation message ----
function showToast(message) {
    const toast = document.getElementById("toast");
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("show"), 2600);
}

// Basic HTML-escaping so restaurant/address/suggestion/menu data from the
// API can never break out of the markup it's injected into (XSS guard).
function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Normalizes Mongo-style ids ({ $oid: "..." }), nested { _id } / { id }
// wrappers, and plain strings/numbers down to a single string. Used by the
// menu page to compare category/subcategory ids consistently.
function normalizeId(value) {
    if (value === null || value === undefined) return null;

    if (typeof value === "object") {
        if (value.$oid !== undefined) return String(value.$oid);
        if (value._id !== undefined) return normalizeId(value._id);
        if (value.id !== undefined) return normalizeId(value.id);
    }

    return String(value).trim();
}

// addListenerOnce(): prevents the same handler from being bound multiple
// times when initHomePage() re-runs (SPA re-navigation, request_location
// click, etc.) without the DOM node being recreated.
function addListenerOnce(el, event, handler) {
    if (!el) return;
    const key = `bound_${event}`;
    if (el.dataset[key]) return;
    el.dataset[key] = "true";
    el.addEventListener(event, handler);
}

// spa_router.js only recognizes exact page names ("home", "orders", "menu",
// "cart", "profile") — it doesn't parse extra hash segments, and it never
// listens for hashchange (only .nav-item clicks and popstate). So menu
// params can't ride along in the URL hash; they're stashed in
// sessionStorage instead, and navigation goes through the router's own
// renderPage() (a plain top-level function in spa_router.js, so it's
// reachable as window.renderPage) rather than by touching location.hash.
function goToPage(page) {
    if (typeof window.renderPage === "function") {
        window.renderPage(page);
    } else {
        // Fallback if spa_router.js hasn't loaded for some reason.
        window.location.hash = page;
    }
}

function navigateToMenu(resName, address, resId, userId, extra = {}) {
    try {
        sessionStorage.setItem("menuParams", JSON.stringify({ resName, address, resId, userId, ...extra }));
    } catch (e) {
        console.warn("Could not persist menu params", e);
    }
    goToPage("menu");
}

/* ============================================================
   STORE ONLINE / OFFLINE — shared state + realtime

   Source of truth is the server. The client keeps:
   - storeStatus:   resId -> boolean, last known state
   - a socket that joins "store:{resId}" rooms (server: watch_store) and
     receives "store_status" pushes the moment a seller toggles
   - a resync (on socket reconnect and when the tab becomes visible again),
     because mobile browsers suspend sockets and pushes sent while
     disconnected are lost
   ============================================================ */

const storeStatus = new Map();      // resId -> boolean
const watchedStores = new Set();    // rooms we've asked to join
let storeSocket = null;
let socketHasConnectedOnce = false;
let activeMenu = null;              // { resId, container, onChange } for the menu page currently mounted

function getStoreSocket() {
    if (storeSocket) return storeSocket;

    // Reuse an existing app-wide socket if the shell already created one.
    if (window.socket && typeof window.socket.on === "function") {
        storeSocket = window.socket;
    } else if (typeof io === "function") {
        storeSocket = io();
    } else {
        console.warn("socket.io client not loaded — store status will only update on refresh");
        return null;
    }

    storeSocket.on("connect", () => {
        // Rooms are lost on reconnect, so re-join everything we were watching.
        watchedStores.forEach(id => storeSocket.emit("watch_store", { res_id: id }));
        if (socketHasConnectedOnce) resyncStoreStatuses();
        socketHasConnectedOnce = true;
    });

    storeSocket.on("store_status", (payload) => {
        if (!payload || !payload.res_id) return;
        applyStoreStatus(String(payload.res_id), payload.is_online !== false, { live: true });
    });

    if (storeSocket.connected) socketHasConnectedOnce = true;
    return storeSocket;
}

function watchStores(ids) {
    const socket = getStoreSocket();
    ids.forEach(id => {
        id = String(id);
        const isNew = !watchedStores.has(id);
        watchedStores.add(id);
        if (isNew && socket && socket.connected) {
            socket.emit("watch_store", { res_id: id });
        }
    });
}

function patchCachedRestaurant(resId, online) {
    try {
        const key = getRestaurantCacheKey(currentUserId());
        const raw = sessionStorage.getItem(key);
        if (!raw) return;
        const cached = JSON.parse(raw);
        if (cached[resId]) {
            cached[resId].is_online = online;
            sessionStorage.setItem(key, JSON.stringify(cached));
        }
    } catch (e) { /* cache is best-effort */ }
}

function setCardOnline(card, online) {
    card.classList.toggle("is-offline", !online);
    const badge = card.querySelector(".store-status-badge");
    if (badge) {
        badge.classList.toggle("badge-open", online);
        badge.classList.toggle("badge-closed", !online);
        badge.textContent = online ? "Open Now" : "Currently Offline";
    }
}

// Single entry point for every status change (socket push, resync, or a
// 503 STORE_OFFLINE from the API). Updates home cards, the session cache,
// and the menu page if it's showing this store.
function applyStoreStatus(resId, online, opts = {}) {
    resId = String(resId);
    storeStatus.set(resId, online);
    patchCachedRestaurant(resId, online);

    const card = document.getElementById(resId);
    if (card && card.classList.contains("store-card")) setCardOnline(card, online);
    KiranaUtils.refreshHeaderPill();

    if (activeMenu && activeMenu.resId === resId && document.body.contains(activeMenu.container)) {
        activeMenu.onChange(online, opts);
    }

    // Let other pages (e.g. the cart) react without knowing about the socket.
    document.dispatchEvent(new CustomEvent("store:status", {
        detail: { resId, online, live: !!opts.live }
    }));
}

async function refreshRestaurantList() {
    const display_resturants = document.getElementById("resturants_container");
    const no_results_container = document.getElementById("no-results-container");
    if (!display_resturants || !no_results_container) return;

    let loc = null;
    try { loc = JSON.parse(localStorage.getItem("userLocation")); } catch (e) { /* ignore */ }
    if (!loc) return;

    const dist = document.getElementById("distance_options")?.value || 5;
    const res = await fetch("/list_resturants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latt: loc.latt, long: loc.long, dist })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success) return;

    renderRestaurants(data.results, { display_resturants, no_results_container });
    sessionStorage.setItem(getRestaurantCacheKey(currentUserId()), JSON.stringify(data.results));
    if (typeof window.__applyHomeFilters === "function") window.__applyHomeFilters();
}

// Catch up on anything missed while the socket was down / tab was hidden.
async function resyncStoreStatuses() {
    // The cart page listens for this and reloads itself from the server.
    document.dispatchEvent(new CustomEvent("store:resync"));
    try {
        if (activeMenu && document.body.contains(activeMenu.container)) {
            const res = await fetch(`/store_status/${encodeURIComponent(activeMenu.resId)}`);
            if (!res.ok) return;
            const data = await res.json();
            if (data.success) applyStoreStatus(activeMenu.resId, data.is_online !== false, { live: true });
        } else if (document.getElementById("resturants_container")) {
            await refreshRestaurantList();
            refreshHomeCart();
        }
    } catch (e) {
        console.warn("store status resync failed", e);
    }
}

document.addEventListener("visibilitychange", () => {
    if (!document.hidden) resyncStoreStatuses();
});

async function readJsonSafe(response) {
    try { return await response.json(); } catch (e) { return null; }
}

function isOfflineResponse(response, data) {
    return response.status === 503 && !!data && data.code === "STORE_OFFLINE";
}

// Cache of already-fetched preview items, keyed by res_id. renderRestaurants()
// re-runs on every cache-hit → fresh-fetch cycle and on every distance-filter
// change, which would otherwise wipe already-loaded product rows back to a
// skeleton and re-fetch them from scratch. Reusing the cache means a card
// only ever shows the skeleton once, the first time it's seen.
const previewItemsCache = new Map();

/* ============================================================
   HOME CARD "ADD" BUTTONS + "SEE MORE" TILE

   The preview strip on each store card is fully interactive:
   - "Add" calls /add_to_cart (optimistic: flips to a - qty + stepper
     immediately, reverts if the server says no)
   - the stepper uses the same debounced /update_cart as the menu page
   - the last tile ("See more") has no handler of its own: it sits inside
     the .store-card, so the card click opens that store's menu page
   homeCartQty mirrors the server cart: itemId -> qty.
   ============================================================ */

const homeCartQty = new Map();      // itemId -> qty currently in the user's cart
const homeAdding = new Set();       // itemIds with an add_to_cart request in flight
let homeCartRefresh = null;

function thumbControlMarkup(qty) {
    if (qty > 0) {
        return `
            <div class="p-qty">
                <button class="p-minus" type="button" aria-label="Remove one">-</button>
                <span class="p-qty-num">${escapeHtml(qty)}</span>
                <button class="p-plus" type="button" aria-label="Add one">+</button>
            </div>`;
    }
    return `<button class="p-add" type="button">Add</button>`;
}

// Update one item everywhere it's shown on the home page.
function setHomeQty(itemId, qty) {
    itemId = String(itemId);
    if (qty > 0) homeCartQty.set(itemId, qty); else homeCartQty.delete(itemId);
    document
        .querySelectorAll(`.product-thumb[data-item-id="${CSS.escape(itemId)}"] .p-control`)
        .forEach(el => { el.innerHTML = thumbControlMarkup(qty); });
}

function syncAllThumbControls() {
    document.querySelectorAll(".product-thumb[data-item-id]").forEach(thumb => {
        const ctl = thumb.querySelector(".p-control");
        if (ctl) ctl.innerHTML = thumbControlMarkup(homeCartQty.get(thumb.dataset.itemId) || 0);
    });
}

// Pull the real cart from the server so the strip shows correct quantities.
// Skipped while a local change is still settling (unless force), so an
// in-flight optimistic update never gets overwritten by a stale response.
function refreshHomeCart(force = false) {
    if (homeCartRefresh) return homeCartRefresh;
    homeCartRefresh = (async () => {
        try {
            const res = await fetch("/get_cart_items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userid: currentUserId() })
            });
            if (!res.ok) return;
            const data = await res.json();

            if (!force && (homeAdding.size > 0 || pendingMenuUpdates.size > 0)) return;

            homeCartQty.clear();
            const cart = data?.results?.cart || {};
            Object.values(cart).forEach(entry => {
                Object.entries(entry?.items || {}).forEach(([id, it]) => {
                    const q = Number(it?.qty || 0);
                    if (q > 0) homeCartQty.set(String(id), q);
                });
            });
            syncAllThumbControls();
        } catch (e) {
            console.warn("home cart refresh failed", e);
        } finally {
            homeCartRefresh = null;
        }
    })();
    return homeCartRefresh;
}

async function postAddToCart(payload) {
    const response = await fetch("/add_to_cart", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
    });
    const data = await readJsonSafe(response);
    return { response, data };
}

function thumbContext(thumb) {
    const storeEl = thumb && thumb.closest(".store-products");
    const card = thumb && thumb.closest(".store-card");
    if (!storeEl || !card) return null;
    return {
        itemId: thumb.dataset.itemId,
        resId: storeEl.dataset.resId,
        resName: card.querySelector(".resturant_name")?.textContent || "",
        userId: currentUserId()
    };
}

async function homeAddToCart(thumb) {
    const ctx = thumbContext(thumb);
    if (!ctx) return;
    const { itemId, resId, resName, userId } = ctx;

    if (storeStatus.get(resId) === false) {
        showToast(`${resName} is currently offline`);
        return;
    }

    // Ignore taps while a previous add / debounced update for this item is settling.
    if (homeAdding.has(itemId)) return;
    if (pendingMenuUpdates.has(itemId) || inFlightMenuControllers.has(itemId)) return;

    const stock = parseInt(thumb.dataset.stock);
    if (!Number.isNaN(stock) && stock <= 0) {
        showToast("This item is currently out of stock");
        return;
    }

    const payload = {
        resid: resId,
        userid: userId,
        item: thumb.dataset.name,
        ress_name: resName,
        qty: 1,
        item_id: itemId,
        price: parseInt(thumb.dataset.price)
    };

    homeAdding.add(itemId);
    setHomeQty(itemId, 1);              // optimistic

    // Returns true if the response was fully handled here (caller should stop).
    const handledAuthOrOffline = (response, data) => {
        if (response.status === 401) {
            alert("Unauthorized user. Please log in");
            window.location.href = "/login/user";
            return true;
        }
        if (isOfflineResponse(response, data)) {
            setHomeQty(itemId, 0);
            applyStoreStatus(resId, false, { live: true });
            return true;
        }
        return false;
    };

    try {
        let { response, data } = await postAddToCart({ ...payload, replace: false });
        if (handledAuthOrOffline(response, data)) return;

        // Cart already holds items from another store: ask before replacing.
        if (data && !data.success && /different store/i.test(data.message || "")) {
            setHomeQty(itemId, 0);
            const confirmed = window.confirm(
                data.message || "Your cart has items from another store. Replace them with this item?"
            );
            if (!confirmed) return;

            setHomeQty(itemId, 1);      // optimistic again
            ({ response, data } = await postAddToCart({ ...payload, replace: true }));
            if (handledAuthOrOffline(response, data)) return;

            if (data && data.success) {
                // The cart now holds only this item — wipe the other stores' steppers.
                homeCartQty.clear();
                homeCartQty.set(itemId, 1);
                syncAllThumbControls();
                return;
            }
        }

        if (!response.ok && !data) throw new Error("add_to_cart failed");

        if (!(data && data.success)) {
            setHomeQty(itemId, 0);
            showToast((data && data.message) || "Couldn't add this item. Please try again.");
        }
    } catch (error) {
        console.error("Home add cart error:", error);
        setHomeQty(itemId, 0);
        showToast("Something went wrong adding this item.");
    } finally {
        homeAdding.delete(itemId);
    }
}

function homeChangeQty(thumb, delta) {
    const ctx = thumbContext(thumb);
    if (!ctx) return;
    const { itemId, resId, resName, userId } = ctx;

    if (homeAdding.has(itemId)) return; // wait for the initial add to settle

    const previousQty = homeCartQty.get(itemId) || 0;

    if (delta > 0) {
        if (storeStatus.get(resId) === false) {
            showToast(`${resName} is currently offline`);
            return;
        }
        const stock = parseInt(thumb.dataset.stock);
        if (!Number.isNaN(stock) && previousQty + 1 > stock) {
            showToast(`Only ${stock} in stock`);
            return;
        }
    } else if (previousQty <= 0) {
        return;
    }

    setHomeQty(itemId, Math.max(0, previousQty + delta)); // optimistic

    scheduleMenuCartUpdate(itemId, resId, userId, delta,
        (data) => {
            if (data.removed) setHomeQty(itemId, 0);
        },
        (errorMessage) => {
            showToast(errorMessage);
            refreshHomeCart(true);      // snap back to whatever the server really has
        },
        () => {
            applyStoreStatus(resId, false, { live: true });
            refreshHomeCart(true);
        }
    );
}

function productThumbsMarkup(items) {
    if (!items || items.length === 0) {
        return `<div class="product-thumb empty-thumb"><p>No items listed yet</p></div>`;
    }

    const thumbs = items.map(item => {
        const qty = homeCartQty.get(String(item.id)) || 0;
        return `
        <div class="product-thumb"
             data-item-id="${escapeHtml(item.id)}"
             data-name="${escapeHtml(item.name)}"
             data-price="${escapeHtml(item.price)}"
             data-stock="${escapeHtml(item.item_qty ?? "")}">
            <img src="${escapeHtml(item.file_url)}" alt="${escapeHtml(item.name)}">
            <p class="p-name">${escapeHtml(item.name)}</p>
            <div class="p-row">
                <span class="p-price">₹${escapeHtml(item.price)}</span>
                <div class="p-control">${thumbControlMarkup(qty)}</div>
            </div>
        </div>`;
    }).join("");

    // Last tile: opens the full menu (the card's click handler does the navigation).
    const seeMore = `
        <button class="product-thumb see-more-thumb" type="button">
            <span class="see-more-icon"><i class="fa-solid fa-arrow-right"></i></span>
            <span class="see-more-text">See more</span>
        </button>`;

    return thumbs + seeMore;
}

// Store cards start with skeleton item-thumbs (unless we already have that
// restaurant's items cached from an earlier render) and get their real
// products filled in by loadPreviewItems() right after, via a single
// batched /preview_items call (see database.py's get_preview_items). Rating,
// and delivery-time stay as presentational placeholders since
// /list_resturants doesn't return them — same as before.
function renderRestaurants(results, containers) {
    const { display_resturants, no_results_container } = containers;

    if (!results || Object.keys(results).length === 0) {
        display_resturants.innerHTML = "";
        no_results_container.style.display = "block";
        KiranaUtils.refreshHeaderPill();
        return;
    }

    no_results_container.style.display = "none";

    const userId = currentUserId();
    const favorites = getFavoriteIds(userId);

    const skeletonThumbs = `
        <div class="product-thumb skeleton-thumb"><div class="skeleton-img"></div></div>
        <div class="product-thumb skeleton-thumb"><div class="skeleton-img"></div></div>
        <div class="product-thumb skeleton-thumb"><div class="skeleton-img"></div></div>`;

    const html = Object.entries(results).map(([id, detail], index) => {
        const isFavorite = favorites.has(id);
        const cached = previewItemsCache.get(id);
        const productsMarkup = cached ? productThumbsMarkup(cached) : skeletonThumbs;
        const displayEta = KiranaUtils.etaRange(detail.distance_km).label;

        // Live status wins over a possibly stale list/cache value.
        const online = storeStatus.has(id) ? storeStatus.get(id) : detail.is_online !== false;
        storeStatus.set(id, online);

        // delivery_available can arrive as a boolean or a string depending on
        // how the restaurant was created — normalise before comparing.
        const hasDelivery = String(detail.delivery_available).toLowerCase() === "true";

        return `
        <div class="store-card${online ? "" : " is-offline"}" id="${escapeHtml(id)}" data-type="${escapeHtml(detail.type || "")}" data-distance="${escapeHtml(detail.distance_km)}" data-delivery="${hasDelivery}" data-radius="${escapeHtml(detail.delivery_radius ?? "")}" style="--i:${index}">
            <div class="store-head">
                <div>
                    <h3 class="store-name resturant_name">${escapeHtml(detail.res_name)}</h3>
                    <div class="store-badges">
                        <span class="badge-verified"><i class="fa-solid fa-circle-check"></i> Verified Partner</span>
                        <span class="store-status-badge ${online ? "badge-open" : "badge-closed"}">${online ? "Open Now" : "Currently Offline"}</span>
                        ${hasDelivery ? `
                            <span class="badge-delivery">
                                <i class="fa-solid fa-truck"></i>
                                Delivery within ${escapeHtml(detail.delivery_radius)} km
                            </span>
                        ` : `
                            <span class="badge-pickup">
                                <i class="fa-solid fa-store"></i>
                                Pickup only
                            </span>
                        `}
                    </div>
                </div>
                <button
                    class="store-fav${isFavorite ? " active" : ""}"
                    type="button"
                    data-fav-id="${escapeHtml(id)}"
                    aria-label="Save to favorites"
                >
                    <i class="fa-solid fa-heart"></i>
                </button>
            </div>

            <div class="store-meta">
                <span class="rating"><i class="fa-solid fa-star"></i> 4.2</span>
                <span class="dot">•</span>
                <span>${escapeHtml(displayEta)} mins</span>
                <span class="dot">•</span>
                <span>${escapeHtml(detail.distance_km)} km away</span>
            </div>

            <div class="store-products" data-res-id="${escapeHtml(id)}">${productsMarkup}</div>

            <div class="store-tags">
                <span class="tag-chip area">${escapeHtml(detail.address)}</span>
                <span class="tag-chip">Free Delivery</span>
                <span class="tag-chip">Local Prices</span>
            </div>
        </div>`;
    }).join("");
    display_resturants.innerHTML = html;
    KiranaUtils.refreshHeaderPill();

    // Join the realtime rooms so these cards flip the moment a seller toggles.
    watchStores(Object.keys(results));

    // Only fetch for restaurants we don't already have cached items for —
    // this is what stops a re-render from re-triggering the skeleton state.
    const idsNeedingFetch = Object.keys(results).filter(id => !previewItemsCache.has(id));
    loadPreviewItems(idsNeedingFetch);
}

// Batched fetch of a few real items per restaurant, for the store-card
// product strip. One request for the whole visible list instead of one
// per card. Pairs with POST /preview_items on the server (see
// get_preview_items in database.py).
async function loadPreviewItems(resIds) {
    if (!resIds || resIds.length === 0) return;
    try {
        const res = await fetch("/preview_items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ res_ids: resIds })
        });
        if (!res.ok) throw new Error(`preview_items failed: ${res.status}`);
        const data = await res.json();
        if (!data.success) throw new Error(data.message || "preview_items returned success:false");

        // Backend omits the key entirely for a restaurant with zero in-stock
        // items — treat every id we asked for as resolved, defaulting missing
        // ones to an empty list, so nothing is left shimmering forever.
        resIds.forEach(resId => {
            const items = (data.items && data.items[resId]) || [];
            previewItemsCache.set(resId, items);
            const container = document.querySelector(`.store-products[data-res-id="${CSS.escape(resId)}"]`);
            if (container) container.innerHTML = productThumbsMarkup(items);
        });
    } catch (e) {
        console.error("loadPreviewItems failed", e);
        // Don't leave every card shimmering forever if the request/route is broken —
        // show a clear "couldn't load" state instead so it's obvious something's wrong.
        // Deliberately NOT cached, so the next re-render retries the fetch.
        resIds.forEach(resId => {
            const container = document.querySelector(`.store-products[data-res-id="${CSS.escape(resId)}"]`);
            if (container) container.innerHTML = `<div class="product-thumb empty-thumb"><p>Couldn't load items</p></div>`;
        });
    }
}

function getPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject("Geolocation is not supported by your browser");
            return; // bugfix: without this, code fell through and called
            // navigator.geolocation.getCurrentPosition on undefined
        }
        navigator.geolocation.getCurrentPosition(resolve, reject);
    });
}

async function reverseGeocode(lat, lon) {
    const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
    );
    if (!response.ok) throw new Error(`reverseGeocode failed: ${response.status}`);
    const data = await response.json();
    // return data.display_name;
    return data.display_name.split(',').slice(0, 2).join(',');
}

// change(): re-fetches restaurants for a newly picked location. Kept at
// module scope (not inside initHomePage) since it's referenced by click
// handlers that get attached fresh each time initHomePage runs.
async function change(latt, long) {
    const display_resturants = document.getElementById("resturants_container");
    const pathParts = window.location.pathname.split("/");
    const userId = window.APP_USER_ID || pathParts[pathParts.length - 1];
    const no_results_container = document.getElementById("no-results-container");
    const access_denied_container = document.getElementById("deny");
    const Note = document.getElementById("Note");
    const loading = document.getElementById("loading");
    const currentAddress = document.getElementById("currentAddress");

    try {
        userLatt = latt;
        userLong = long;

        const address = await reverseGeocode(userLatt, userLong);

        currentAddress.dataset.long = userLong;
        currentAddress.dataset.lat = userLatt;
        currentAddress.textContent = address;
        const userLocation = { latt: userLatt, long: userLong };
        localStorage.setItem("currentAddress", address);
        localStorage.setItem("userLocation", JSON.stringify(userLocation));
        if (loading) loading.style.visibility = "visible";

        const res = await fetch("/list_resturants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latt: userLatt, long: userLong, dist: 5 })
        });
        if (!res.ok) throw new Error(`list_resturants failed: ${res.status}`);
        const data = await res.json();
        console.log(data);
        if (data.success) {
            if (loading) loading.style.display = "none";
            if (Note) Note.style.display = "block";
            renderRestaurants(data.results, { display_resturants, no_results_container });
            sessionStorage.setItem(getRestaurantCacheKey(userId), JSON.stringify(data.results));
            if (typeof window.__applyHomeFilters === "function") window.__applyHomeFilters();
        } else {
            alert("error loading resturants");
        }
    } catch (e) {
        console.error("change() failed", e);
        if (access_denied_container) access_denied_container.style.visibility = "visible";
        if (Note) Note.style.display = "none";
    }
}

async function getLocation() {
    const currentAddress = document.getElementById("currentAddress");
    if (!currentAddress || !map) return;
    if (!navigator.geolocation) return;

    navigator.geolocation.getCurrentPosition(
        async (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            try {
                const address = await reverseGeocode(lat, lng);
                currentAddress.dataset.long = lng;
                currentAddress.dataset.lat = lat;
                currentAddress.textContent = address;
                localStorage.setItem("currentAddress", address);
                const userLocation = { latt: lat, long: lng };
                localStorage.setItem("userLocation", JSON.stringify(userLocation));
                map.setView([lat, lng], 15);
                if (marker) marker.setLatLng([lat, lng]); else marker = L.marker([lat, lng]).addTo(map);
            } catch (e) {
                console.error("getLocation reverse geocode failed", e);
            }
        },
        () => alert("Location access denied")
    );
}

async function initHomePage() {
    const display_resturants = document.getElementById("resturants_container");
    if (!display_resturants) return; // safety: not actually on the home content

    const cartBtn = document.getElementById("CartBtn");
    const orderBtn = document.getElementById("OrdersBtn");
    const pathParts = window.location.pathname.split("/");
    const no_results_container = document.getElementById("no-results-container");
    const select_options = document.getElementById("distance_options");
    const access_denied_container = document.getElementById("deny");
    const Note = document.getElementById("Note");
    const loading = document.getElementById("loading");
    const request_location = document.getElementById("requestlocation");
    const currentAddress = document.getElementById("currentAddress");
    const livelocationBtn = document.getElementById("liveLocationBtn");
    const loading_container = document.getElementById("loading_container");
    const savedAddress = document.getElementById("savedAddress");
    const userId = window.APP_USER_ID || pathParts[pathParts.length - 1];

    // Small, purely cosmetic touch: greet by time of day instead of a
    // static heading. Safe to set unconditionally — nothing else in this
    // file reads Note's text, only its display/visibility.
    if (Note) {
        const hour = new Date().getHours();
        const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
        Note.textContent = `${greeting}! Restaurants with online delivery near you`;
    }
    const maps_btn = document.getElementById("map_btn");
    const cancelbtn = document.getElementById("closeModal");

    const CACHE_KEY = getRestaurantCacheKey(userId);
    const renderContainers = { display_resturants, no_results_container };

    // Show cached restaurants instantly — this is what makes tab-switching feel instant
    const cachedRestaurants = sessionStorage.getItem(CACHE_KEY);
    if (cachedRestaurants) {
        try {
            renderRestaurants(JSON.parse(cachedRestaurants), renderContainers);
            if (Note) Note.style.display = "block";
            if (loading) loading.style.display = "none";
        } catch (e) {
            console.warn("bad restaurant cache, ignoring", e);
        }
    }

    // (Re)create the Leaflet map fresh every time — its old DOM node was just
    // discarded by the router's content swap, so the old instance is dead anyway.
    if (map) { try { map.remove(); } catch (e) { } }
    marker = null; // bugfix: old marker belonged to the removed map instance
    map = L.map('map').setView([17.3850, 78.4867], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    addListenerOnce(select_options, "change", async (e) => {
        const storedLocation = JSON.parse(localStorage.getItem("userLocation"));
        try {
            const res = await fetch("/list_resturants", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ latt: storedLocation.latt, long: storedLocation.long, dist: e.target.value })
            });
            if (!res.ok) throw new Error(`list_resturants failed: ${res.status}`);
            const data = await res.json();
            console.log(data);
            if (data.success) {
                renderRestaurants(data.results, renderContainers);
                sessionStorage.setItem(CACHE_KEY, JSON.stringify(data.results));
                if (typeof window.__applyHomeFilters === "function") window.__applyHomeFilters();
            } else {
                alert("error loading resturants");
            }
        } catch (err) {
            console.error("distance filter failed", err);
            alert("error loading resturants");
        }
    });

    // Bound up-front (not after the network calls below) so the Add buttons
    // on cached cards work immediately.
    addListenerOnce(display_resturants, "click", function (e) {
        // --- preview strip: Add / - / + ---
        const addBtn = e.target.closest(".p-add");
        if (addBtn) {
            e.stopPropagation();
            homeAddToCart(addBtn.closest(".product-thumb"));
            return;
        }
        const plusBtn = e.target.closest(".p-plus");
        if (plusBtn) {
            e.stopPropagation();
            homeChangeQty(plusBtn.closest(".product-thumb"), 1);
            return;
        }
        const minusBtn = e.target.closest(".p-minus");
        if (minusBtn) {
            e.stopPropagation();
            homeChangeQty(minusBtn.closest(".product-thumb"), -1);
            return;
        }

        const favBtn = e.target.closest(".store-fav");
        if (favBtn) {
            e.stopPropagation();
            const isNowFavorite = toggleFavoriteId(userId, favBtn.dataset.favId);
            favBtn.classList.toggle("active", isNowFavorite);
            showToast(isNowFavorite ? "Added to favorites" : "Removed from favorites");
            return;
        }

        // Anything else on the card — including the "See more" tile — opens the menu.
        const card = e.target.closest(".store-card");
        if (card) {
            const name = card.querySelector(".resturant_name").textContent;
            const addresss = card.querySelector(".area").textContent;
            const res_id = card.getAttribute("id");
            // Routes inside the SPA so the header/map/session state never gets
            // torn down. Offline stores are still browsable; the menu page
            // shows the offline banner and disables ordering.
            navigateToMenu(name, addresss, res_id, userId, {
                distanceKm: card.dataset.distance,
                type: card.dataset.type,
                delivery: card.dataset.delivery === "true",
                radius: card.dataset.radius
            });
        }
    });

    // Real cart quantities for the preview strip (re-synced on every Home mount).
    refreshHomeCart();

    try {
        const fetchlocation = JSON.parse(localStorage.getItem("userLocation"));
        if (fetchlocation === null) {
            // await getLocation();
            const position = await getPosition()
            userLatt = position.coords.latitude;
            userLong = position.coords.longitude;
            const address = await reverseGeocode(userLatt, userLong);
            currentAddress.dataset.long = userLong;
            currentAddress.dataset.lat = userLatt;
            currentAddress.textContent = address;
            localStorage.setItem("currentAddress", address);
            const userLocation = { latt: userLatt, long: userLong };
            localStorage.setItem("userLocation", JSON.stringify(userLocation));
        } else {
            let locationFound = false;
            const previoussavedAddress = localStorage.getItem("currentAddress");

            // bugfix: was fetchlocation.lat (undefined) — the stored key is "latt"
            if (
                previoussavedAddress &&
                fetchlocation.latt !== null &&
                fetchlocation.long !== null
            ) {
                currentAddress.textContent = previoussavedAddress;
                currentAddress.dataset.long = fetchlocation.long;
                currentAddress.dataset.lat = fetchlocation.latt;
                userLatt = parseFloat(fetchlocation.latt);
                userLong = parseFloat(fetchlocation.long);
                locationFound = true;
            }

            const addressRes = await fetch("/fetch_address", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId })
            });
            if (addressRes.status === 401) {
                alert("Please log in.");
                localStorage.clear();
                window.location.href = "/login/user";
                return;
            }
            const data = await addressRes.json();

            if (data.success && data.address.length > 0) {
                if (locationFound === false) {
                    currentAddress.textContent = data.address[0].adrs_type + " - " + data.address[0].address;
                    currentAddress.dataset.long = data.address[0].coordinates.long;
                    currentAddress.dataset.lat = data.address[0].coordinates.latt;
                    userLatt = parseFloat(data.address[0].coordinates.latt);
                    userLong = parseFloat(data.address[0].coordinates.long);
                    localStorage.setItem("currentAddress", data.address[0].address);

                    const userLocation = { latt: userLatt, long: userLong };
                    localStorage.setItem("userLocation", JSON.stringify(userLocation));
                }

                // bugfix: clear stale entries before rebuilding, or this list
                // grows every time initHomePage() re-runs
                savedAddress.innerHTML = "";
                data.address.forEach((addr) => {
                    savedAddress.innerHTML += `
                        <div class="address" data-latt=${escapeHtml(addr.coordinates.latt)} data-long=${escapeHtml(addr.coordinates.long)}>
                            <span class="type">${escapeHtml(addr.adrs_type)}</span>
                            <span class="address-text">${escapeHtml(addr.address)}</span>
                        </div>
                    `;
                });
            } else {
                if (data.status === 404) {
                    savedAddress.innerHTML = "No saved Addresses";
                } else {
                    await getLocation();
                }
            }
        }

        if (!cachedRestaurants && loading) loading.style.visibility = "visible";
        const res = await fetch("/list_resturants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latt: userLatt, long: userLong, dist: 5 })
        });
        if (!res.ok) throw new Error(`list_resturants failed: ${res.status}`);
        const data = await res.json();
        console.log(data)
        if (data.success) {
            if (loading) loading.style.display = "none";
            if (Note) Note.style.display = "block";
            // Fresh server data is newer than anything cached client-side.
            Object.entries(data.results).forEach(([id, detail]) => storeStatus.set(id, detail.is_online !== false));
            renderRestaurants(data.results, renderContainers);
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(data.results));
        } else if (!cachedRestaurants) {
            alert("error loading resturants");
        }

        addListenerOnce(cartBtn, "click", () => { window.location.href = `/user/${userId}/#cart`; });
        addListenerOnce(orderBtn, "click", () => { window.location.href = `/orders/${userId}`; });

        // Type tabs may have loaded with a non-"all" active tab from a previous
        // page visit (dataset flags survive since these are shared header nodes),
        // so re-apply filters against whatever just got rendered.
        if (typeof window.__applyHomeFilters === "function") window.__applyHomeFilters();
    } catch (e) {
        console.error("initHomePage location/restaurant load failed", e);
        if (!cachedRestaurants && Note) Note.style.display = "none";
    }

    addListenerOnce(cancelbtn, "click", () => {
        document.getElementById("addressTagModal").classList.remove("show");
    });

    addListenerOnce(savedAddress, "click", async (e) => {
        const selected_address = e.target.closest(".address");
        if (!selected_address) return;
        const latt = parseFloat(selected_address.dataset.latt);
        const long = parseFloat(selected_address.dataset.long);
        await change(latt, long);
        const addressType = selected_address.querySelector(".type").textContent;
        const addressText = selected_address.querySelector(".address-text").textContent;
        currentAddress.textContent = addressType + " - " + addressText;
        const box = document.getElementById("locationBox");
        const overlay = document.getElementById("locationOverlay");
        if (box) box.classList.remove("show");
        if (overlay) overlay.classList.remove("show");
        showToast("Delivery location updated");
    });

    addListenerOnce(request_location, "click", async () => {
        try {
            await getLocation();
            initHomePage(); // re-run instead of a full reload
        } catch (err) {
            console.error("request_location failed", err);
        }
    });

    const indicator = document.querySelector(".active-indicator");
    function moveIndicator(btn) {
        if (!indicator || !btn) return;
        const x = btn.offsetLeft + (btn.offsetWidth - indicator.offsetWidth) / 2;
        indicator.style.transform = `translateX(${x}px)`;
    }
    document.querySelectorAll(".nav-btn").forEach(btn => {
        addListenerOnce(btn, "click", () => {
            document.querySelector(".nav-btn.active")?.classList.remove("active");
            btn.classList.add("active");
            moveIndicator(btn);
        });
    });
    moveIndicator(document.querySelector(".nav-btn.active"));

    const input = document.getElementById("addressInput");
    const suggestions = document.getElementById("suggestions");
    let timeout;
    let suggestAbortController = null;
    addListenerOnce(input, "input", () => {
        savedAddress.classList.remove("show");
        clearTimeout(timeout);
        timeout = setTimeout(async () => {
            const query = input.value.trim();
            if (query.length < 3) { suggestions.innerHTML = ""; return; }
            if (suggestAbortController) suggestAbortController.abort();
            suggestAbortController = new AbortController();
            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ", Hyderabad")}&countrycodes=in&addressdetails=1&limit=5`,
                    { signal: suggestAbortController.signal }
                );
                if (!response.ok) throw new Error(`suggest search failed: ${response.status}`);
                const results = await response.json();
                suggestions.innerHTML = results.map(place => {
                    const displayParts = place.display_name.split(",");
                    const title = displayParts[0].trim();
                    const subtitle = displayParts.slice(1, 3).join(", ");
                    return `
            <div class="suggestion-item" data-lat="${escapeHtml(place.lat)}" data-lon="${escapeHtml(place.lon)}" data-address="${escapeHtml(title + ", " + subtitle)}">
                <i class="fa-solid fa-location-dot"></i>
                <div>
                    <div class="location-title">${escapeHtml(title)}</div>
                    <div class="location-subtitle">${escapeHtml(subtitle)}</div>
                </div>
            </div>`;
                }).join("");
            } catch (err) {
                if (err.name === "AbortError") return;
                console.error(err);
                suggestions.innerHTML = "<div class='suggestion-item'>Unable to fetch locations</div>";
            }
        }, 300);
    });

    const trigger = document.getElementById("locationTrigger");
    const box = document.getElementById("locationBox");
    const overlay = document.getElementById("locationOverlay");
    addListenerOnce(trigger, "click", () => {
        box.classList.add("show");
        overlay.classList.add("show");
        savedAddress.classList.add("show");
        document.getElementById("addressInput").focus();
    });
    addListenerOnce(overlay, "click", () => {
        box.classList.remove("show");
        overlay.classList.remove("show");
    });

    addListenerOnce(suggestions, "click", (e) => {
        const item = e.target.closest(".suggestion-item");
        if (!item) return;
        document.getElementById("currentAddress").textContent = item.dataset.address;
        localStorage.setItem("selectedAddress", item.dataset.address);
        document.getElementById("addressTagModal").classList.add("show");
        box.classList.remove("show");
        overlay.classList.remove("show");
        change(parseFloat(item.dataset.lat), parseFloat(item.dataset.lon));
    });

    document.querySelectorAll(".tag-btn").forEach(btn => {
        addListenerOnce(btn, "click", async () => {
            const addressType = btn.dataset.tag;
            const address = document.getElementById("currentAddress").textContent;
            const address_latt = document.getElementById("currentAddress").dataset.lat;
            const address_long = document.getElementById("currentAddress").dataset.long;
            const cordinates = { latt: address_latt, long: address_long };
            document.getElementById("addressTagModal").classList.remove("show");
            let saved = false;
            try {
                const res = await fetch("/save_address", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ address: address, address_type: addressType, userId: userId, cordinates: cordinates })
                });
                if (!res.ok) throw new Error(`save_address failed: ${res.status}`);
                saved = true;
            } catch (err) {
                console.error("save_address failed", err);
            }
            currentAddress.textContent = addressType + " - " + address;
            showToast(saved ? "Address saved" : "Address set for this order (save failed)");
        });
    });

    // ---- Search box + category quick-filter strip, combined ----
    // Both act on the already-rendered .store-card elements: text search
    // matches the restaurant name, the pill-tab filter matches data-type.
    // Exposed on window so change()/distance-filter re-renders can re-apply
    // the currently active filters without needing to re-bind listeners.
    const searchInput = document.getElementById("searchInput");
    const typeTabs = document.getElementById("typeTabs");

    function applyHomeFilters() {
        const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";
        const activeTab = typeTabs ? typeTabs.querySelector(".pill-tab.active") : null;
        const activeType = activeTab ? activeTab.dataset.type : "all";

        const allCards = document.querySelectorAll(".store-card");
        let visibleCount = 0;

        allCards.forEach(card => {
            const nameEl = card.querySelector(".resturant_name");
            const restaurantName = nameEl ? nameEl.textContent.toLowerCase() : "";
            const cardType = card.dataset.type || "";
            const matchesSearch = restaurantName.includes(searchTerm);
            const matchesType = activeType === "all" || cardType === activeType;
            const isMatch = matchesSearch && matchesType;
            card.style.display = isMatch ? "block" : "none";
            if (isMatch) visibleCount += 1;
        });

        const noSearchMatches = document.getElementById("no-search-matches");
        if (noSearchMatches) {
            noSearchMatches.classList.toggle("show", allCards.length > 0 && visibleCount === 0);
        }
    }
    window.__applyHomeFilters = applyHomeFilters;

    // Each pill tab owns a full color theme (home.css reads it off
    // body[data-theme]). Set it once on load to match whichever tab is
    // already active, then keep it in sync on every tab click below.
    document.body.dataset.theme =
        (typeTabs?.querySelector(".pill-tab.active")?.dataset.type) || "all";

    addListenerOnce(searchInput, "input", applyHomeFilters);

    if (typeTabs) {
        addListenerOnce(typeTabs, "click", (e) => {
            const btn = e.target.closest(".pill-tab");
            if (!btn) return;
            typeTabs.querySelector(".pill-tab.active")?.classList.remove("active");
            btn.classList.add("active");
            applyHomeFilters();
            document.body.dataset.theme = btn.dataset.type || "all";
        });
    }

    addListenerOnce(livelocationBtn, "click", async () => {
        box.classList.remove("show");
        loading_container.classList.add("show");
        try {
            const livelctn = await getPosition();
            const userLocation = { latt: livelctn.coords.latitude, long: livelctn.coords.longitude };
            localStorage.setItem("userLocation", JSON.stringify(userLocation));
            await change(livelctn.coords.latitude, livelctn.coords.longitude);
            showToast("Using your current location");
        } catch (err) {
            console.error("live location failed", err);
            alert("Location access denied");
        } finally {
            document.getElementById("addressTagModal").classList.add("show");
            loading_container.classList.remove("show");
            overlay.classList.remove("show");
        }
    });

    const map_container = document.getElementById("map_container");
    map.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        try {
            const address = await reverseGeocode(lat, lng);
            currentAddress.dataset.long = userLong;
            currentAddress.dataset.lat = userLatt;
            currentAddress.textContent = address;
            await change(lat, lng);
            document.getElementById("addressTagModal").classList.add("show");
            showToast("Location updated");
        } catch (err) {
            console.error("map click reverse geocode failed", err);
        }
        if (marker) marker.setLatLng(e.latlng); else marker = L.marker(e.latlng).addTo(map);
        setTimeout(() => {
            box.classList.remove("show");
            overlay.classList.remove("show");
            maps_btn.setAttribute("is_active", false);
            map_container.style.display = "none";
            map_container.style.position = "absolute";
        }, 1000);
    });

    addListenerOnce(maps_btn, "click", async () => {
        if (maps_btn.getAttribute("is_active") === "false") {
            maps_btn.setAttribute("is_active", true);
            map_container.style.display = "block";
            map_container.style.position = "relative";
            savedAddress.classList.remove("show");
            setTimeout(() => { map.invalidateSize(); }, 100);
            await getLocation();
        } else {
            maps_btn.setAttribute("is_active", false);
            map_container.style.display = "none";
            map_container.style.position = "absolute";
        }
    });

    // ---- Scroll-to-top button ----
    // The button lives inside the Home template, so it's a fresh DOM node
    // every time the SPA router remounts Home. addListenerOnce handles the
    // click fine (it keys off the node itself), but the window-level
    // scroll listener needs to be swapped to point at the current node
    // each run, or it'd keep toggling a detached element after navigating
    // away and back.
    const scrollTopBtn = document.getElementById("scrollTopBtn");
    if (scrollTopBtn) {
        if (scrollTopHandler) window.removeEventListener("scroll", scrollTopHandler);
        scrollTopHandler = () => scrollTopBtn.classList.toggle("show", window.scrollY > 400);
        window.addEventListener("scroll", scrollTopHandler);
        addListenerOnce(scrollTopBtn, "click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    }

    // ---- Voice search / upload-handwritten-list buttons ----
    // No backend wired up yet for either — stubbed with a toast so the
    // buttons aren't dead ends, swap these for real handlers when ready.
    addListenerOnce(document.getElementById("voiceSearchBtn"), "click", () => {
        showToast("Voice search coming soon");
    });
    addListenerOnce(document.getElementById("uploadListBtn"), "click", () => {
        showToast("Upload handwritten list coming soon");
    });
}


/* ============================================================
   MENU PAGE (merged from menu.js)

   Was its own full page at /menu/:res_name/:address/:res_id/:userId.
   Now an SPA page: routed via #menu/<res_name>/<address>/<res_id>/<userId>,
   rendered into tpl-menu, params read from the hash instead of the path.
   ============================================================ */

const pendingMenuUpdates = new Map();
const inFlightMenuControllers = new Map();

// onOffline is optional: called instead of onFailure when the server
// answers 503 STORE_OFFLINE, so the caller can revert and flip the UI.
function scheduleMenuCartUpdate(itemId, resId, userId, delta, onSuccess, onFailure, onOffline) {

    let entry = pendingMenuUpdates.get(itemId);

    if (entry) {
        entry.accumulatedDelta += delta;
        clearTimeout(entry.timer);
    } else {
        entry = { accumulatedDelta: delta, timer: null };
        pendingMenuUpdates.set(itemId, entry);
    }

    entry.timer = setTimeout(async () => {

        const netDelta = entry.accumulatedDelta;
        pendingMenuUpdates.delete(itemId);

        if (netDelta === 0) return;

        if (inFlightMenuControllers.has(itemId)) {
            inFlightMenuControllers.get(itemId).abort();
        }

        const controller = new AbortController();
        inFlightMenuControllers.set(itemId, controller);

        try {
            const response = await fetch("/update_cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userId,
                    res_id: resId,
                    item_id: itemId,
                    qty: netDelta
                }),
                signal: controller.signal
            });

            const data = await readJsonSafe(response);

            if (isOfflineResponse(response, data)) {
                if (onOffline) onOffline(); else onFailure(data.message);
                return;
            }

            if (!response.ok && !data) throw new Error(`update_cart failed: ${response.status}`);

            if (data && data.success) {
                onSuccess(data);
            } else {
                onFailure((data && data.message) || "Failed updating cart");
            }

        } catch (error) {
            if (error.name !== "AbortError") {
                console.error("Menu cart update failed:", error);
                onFailure("Network error");
            }
        } finally {
            if (inFlightMenuControllers.get(itemId) === controller) {
                inFlightMenuControllers.delete(itemId);
            }
        }

    }, 400);
}

async function initMenuPage() {

    const menuContainer = document.getElementById("menu_container");
    if (!menuContainer) return; // not on the menu page

    let menuParams = null;
    try {
        menuParams = JSON.parse(sessionStorage.getItem("menuParams"));
    } catch (e) {
        menuParams = null;
    }

    if (!menuParams || !menuParams.resId) {
        // No restaurant context to show (e.g. a direct reload landed on the
        // menu template with nothing in sessionStorage) — bounce home.
        goToPage("home");
        return;
    }

    const decodedRestaurant = menuParams.resName || "";
    const decodedAddress = menuParams.address || "";
    const resId = menuParams.resId;
    const userId = menuParams.userId || currentUserId();

    const breadcrumbHome = document.querySelector(".breadcrumb-home");
    if (breadcrumbHome) {
        breadcrumbHome.addEventListener("click", (e) => {
            e.preventDefault();
            goToPage("home");
        });
    }

    const loading = document.getElementById("loading");
    const heading = document.querySelector(".res-info h1");
    const location_ = document.querySelector(".res-location");
    const menuAreaCrumb = document.getElementById("menuAreaCrumb");
    const menuNameCrumb = document.getElementById("menuNameCrumb");

    const footer = document.getElementById("menuFooter");
    const totalAmount = document.getElementById("amount");
    const goCartBtn = document.getElementById("GoCartBtn");

    const resultMeta = document.getElementById("resultMeta");

    const searchInput = document.getElementById("menuSearchInput");
    const searchClearBtn = document.getElementById("menuSearchClearBtn");
    const searchBackBtn = document.getElementById("menuSearchBackBtn");

    const categoryTabs = document.getElementById("categoryTabs");

    const sortSelect = document.getElementById("sortSelect");
    const stockToggle = document.getElementById("stockToggle");
    const subDivider = document.getElementById("subDivider");
    const subcategoryTabs = document.getElementById("subcategoryTabs");

    const replaceContainer = document.getElementById("ReplaceContainer");
    const overlay = document.getElementById("overlayContainer");
    const message = document.getElementById("message");
    const yesBtn = document.getElementById("YES");
    const noBtn = document.getElementById("NO");

    document.title = `${decodedRestaurant} | Swiggy Clone`;
    heading.textContent = decodedRestaurant;
    location_.textContent = decodedAddress;
    menuAreaCrumb.textContent = decodedAddress;
    menuNameCrumb.textContent = decodedRestaurant;

    // Reset any leftover UI state from a previous visit to a different menu
    if (searchInput) searchInput.value = "";
    if (searchClearBtn) searchClearBtn.classList.remove("show");
    if (stockToggle) stockToggle.classList.remove("active");
    if (sortSelect) sortSelect.value = "default";
    if (footer) footer.classList.remove("show");

    let cartData;

    try {
        const response = await fetch("/get_cart_items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userid: userId })
        });

        if (response.status === 401) {
            alert("Unauthorized user. Please log in");
            window.location.href = "/login/user";
            return;
        }
        if (!response.ok) throw new Error("Failed to load cart");

        cartData = await response.json();
        console.log(cartData);

        if (cartData?.results && cartData.results.total > 0) {
            footer.classList.add("show");
            totalAmount.textContent = cartData.results.total;
        }

    } catch (error) {
        console.error("Cart loading error:", error);
        alert("Error loading cart");
        return;
    }

    let menuData;

    try {
        const response = await fetch("/list_items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ res_id: resId, type: "user" })
        });

        if (response.status === 401) {
            alert("Unauthorized user. Please log in");
            window.location.href = "/login/user";
            return;
        }

        if (!response.ok) throw new Error("Failed to load menu");

        menuData = await response.json();

    } catch (error) {
        console.error("Menu loading error:", error);
        alert("Error loading menu");
        return;
    }

    const categories = Array.isArray(menuData?.categories?.categories)
        ? menuData.categories.categories
        : [];

    const subcategoryMap = new Map();

    categories.forEach(category => {

        const categoryId = normalizeId(category._id);
        const subcategories = Array.isArray(category.subcategories) ? category.subcategories : [];

        subcategories.forEach(subcategory => {

            const subId = normalizeId(subcategory._id);
            if (!subId) return;

            subcategoryMap.set(subId, {
                categoryId,
                subcategoryId: subId,
                subcategoryName: String(subcategory.name || "").trim().toLowerCase()
            });
        });
    });

    const menuItems = [];

    Object.entries(menuData.res || {}).forEach(([itemName, item]) => {

        if (!item) return;

        const itemId = normalizeId(item.id ?? item._id);
        if (!itemId) return;

        const subId = normalizeId(item.sub_id);
        const categoryInfo = subcategoryMap.get(subId);

        const cleanResId = normalizeId(resId);
        const restaurantCart = cartData?.results?.cart?.[cleanResId]?.items || {};
        const cartItem = restaurantCart[itemId];
        const qty = Number(cartItem?.qty || 0);

        menuItems.push({
            id: itemId,
            name: itemName,
            price: Number(item.price) || 0,
            file_url: item.file_url,
            item_qty: Number(item.item_qty ?? 0),
            qty,

            catId: categoryInfo?.categoryId || "uncategorized",
            subcatId: categoryInfo?.subcategoryId || subId || "uncategorized"
        });
    });

    if (loading) loading.style.display = "none";

    KiranaUtils.renderMenuInfo(menuParams, menuItems);

    let activeCategoryId = "all";
    let activeSubcategoryId = "all";
    let sortMode = "default";
    let stockOnly = false;
    let pendingCartItem = null;
    const addingItems = new Set(); // items with an add_to_cart request in flight

    const wishlist = new Set();

    // Keep menuItems in step with what the user has in their cart, so a
    // re-render (filter, search, offline flip) never shows stale quantities.
    function setLocalQty(id, qty) {
        const match = menuItems.find(i => i.id === String(id));
        if (match) match.qty = qty;
    }

    // Swap only one item's control (ADD <-> quantity stepper) in place,
    // instead of re-rendering the whole menu. qty <= 0 shows ADD.
    function setItemControls(itemId, qty) {
        const el = menuContainer.querySelector(
            `.menu-item[data-item-id="${CSS.escape(String(itemId))}"] .item-controls`
        );
        if (!el) return;

        if (qty > 0) {
            el.innerHTML = `
                <div class="quantity-control">
                    <button class="qty-btn reduce" type="button">-</button>
                    <span class="item_qty">${escapeHtml(qty)}</span>
                    <button class="qty-btn increase${storeOnline ? "" : " is-store-offline"}" type="button"${storeOnline ? "" : ' disabled aria-disabled="true"'}>+</button>
                </div>
            `;
        } else {
            el.innerHTML = storeOnline
                ? `<button class="add-btn" data-item-id="${escapeHtml(itemId)}" type="button">ADD</button>`
                : `<button class="add-btn is-store-offline" type="button" disabled>CLOSED</button>`;
        }
    }

    /* ---------- store online / offline state for this menu ---------- */

    let storeOnline = menuData.is_online !== false;
    storeStatus.set(String(resId), storeOnline);

    // Remove any banner left from a previous visit, then create a fresh one
    // directly above the item grid (no template change required).
    document.getElementById("storeOfflineBanner")?.remove();
    const banner = document.createElement("div");
    banner.id = "storeOfflineBanner";
    banner.className = "store-banner";
    banner.hidden = true;
    banner.setAttribute("role", "status");
    banner.setAttribute("aria-live", "polite");
    menuContainer.parentNode.insertBefore(banner, menuContainer);

    let bannerTimer = null;

    function showBanner(mode) {
        clearTimeout(bannerTimer);

        if (!mode) {
            banner.hidden = true;
            banner.className = "store-banner";
            banner.innerHTML = "";
            return;
        }

        banner.hidden = false;

        if (mode === "offline") {
            banner.className = "store-banner is-offline";
            banner.innerHTML = `
                <div class="store-banner-icon"><i class="fa-solid fa-store-slash"></i></div>
                <div class="store-banner-text">
                    <strong>${escapeHtml(decodedRestaurant)} is currently offline</strong>
                    <span>Ordering is paused. Items already in your cart are saved.</span>
                </div>`;
        } else {
            banner.className = "store-banner is-online";
            banner.innerHTML = `
                <div class="store-banner-icon"><i class="fa-solid fa-circle-check"></i></div>
                <div class="store-banner-text">
                    <strong>${escapeHtml(decodedRestaurant)} is back online</strong>
                    <span>You can add items again.</span>
                </div>`;
            bannerTimer = setTimeout(() => showBanner(null), 5000);
        }
    }

    function closeReplaceDialog() {
        replaceContainer.classList.remove("show");
        overlay.classList.remove("show");
        pendingCartItem = null;
    }

    // Called by applyStoreStatus() for socket pushes, resyncs, and 503s.
    function setStoreOnline(online, opts = {}) {
        if (online === storeOnline) return;
        storeOnline = online;

        if (online) {
            showBanner("online");
            if (opts.live) showToast(`${decodedRestaurant} is back online`);
        } else {
            showBanner("offline");
            closeReplaceDialog();
            if (opts.live) showToast(`${decodedRestaurant} just went offline`);
        }

        renderMenu();
    }

    activeMenu = {
        resId: String(resId),
        container: menuContainer,
        onChange: setStoreOnline
    };
    watchStores([resId]);

    if (!storeOnline) showBanner("offline");

    function findCategory(categoryId) {
        const id = normalizeId(categoryId);
        return categories.find(category => normalizeId(category._id) === id);
    }

    function findSubcategory(category, subcategoryId) {
        if (!category) return null;
        const id = normalizeId(subcategoryId);
        return category.subcategories?.find(sub => normalizeId(sub._id) === id) || null;
    }

    function thumbnailFor(categoryId) {
        const match = menuItems.find(item => item.catId === categoryId && item.file_url);
        return match ? match.file_url : null;
    }

    function renderCategoryRail() {

        categoryTabs.innerHTML = "";

        const allChip = document.createElement("button");
        allChip.type = "button";
        allChip.className = "category-chip active";
        allChip.dataset.catId = "all";
        allChip.innerHTML = `
            <span class="chip-avatar"><i class="fa-solid fa-bowl-food"></i></span>
            <span>All</span>
        `;
        categoryTabs.appendChild(allChip);

        categories.forEach(category => {

            const categoryId = normalizeId(category._id);
            if (!categoryId) return;

            const name = category.name || "";
            const thumb = thumbnailFor(categoryId);

            const chip = document.createElement("button");
            chip.type = "button";
            chip.className = "category-chip";
            chip.dataset.catId = categoryId;

            const avatarInner = thumb
                ? `<img src="${escapeHtml(thumb)}" alt="">`
                : escapeHtml((name[0] || "?").toUpperCase());

            chip.innerHTML = `
                <span class="chip-avatar">${avatarInner}</span>
                <span>${escapeHtml(name)}</span>
            `;

            categoryTabs.appendChild(chip);
        });
    }

    function renderSubcategoryChips(category) {

        subcategoryTabs.innerHTML = "";
        activeSubcategoryId = "all";

        const hasSubs = category
            && Array.isArray(category.subcategories)
            && category.subcategories.length > 0;

        if (!hasSubs) {
            subcategoryTabs.classList.remove("show");
            subDivider.style.display = "none";
            return;
        }

        subDivider.style.display = "block";
        subcategoryTabs.classList.add("show");

        const allButton = document.createElement("button");
        allButton.type = "button";
        allButton.className = "subcategory-tab active";
        allButton.dataset.subcatId = "all";
        allButton.textContent = "All";
        subcategoryTabs.appendChild(allButton);

        category.subcategories.forEach(subcategory => {
            const button = document.createElement("button");
            button.type = "button";
            button.className = "subcategory-tab";
            button.dataset.subcatId = normalizeId(subcategory._id);
            button.textContent = subcategory.name;
            subcategoryTabs.appendChild(button);
        });
    }

    function renderMenu() {

        const searchTerm = searchInput.value.trim().toLowerCase();

        const selectedCategory = activeCategoryId === "all" ? null : findCategory(activeCategoryId);
        const selectedSubcategory = activeSubcategoryId === "all"
            ? null
            : findSubcategory(selectedCategory, activeSubcategoryId);

        let filteredItems = menuItems.filter(item => {

            const matchesSearch = item.name.toLowerCase().includes(searchTerm);

            const matchesCategory = !selectedCategory
                || item.catId === normalizeId(selectedCategory._id);

            const matchesSubcategory = !selectedSubcategory
                || item.subcatId === normalizeId(selectedSubcategory._id);

            const matchesStock = !stockOnly || item.item_qty > 0;

            return matchesSearch && matchesCategory && matchesSubcategory && matchesStock;
        });

        filteredItems = filteredItems.slice();

        if (sortMode === "price-asc") {
            filteredItems.sort((a, b) => a.price - b.price);
        } else if (sortMode === "price-desc") {
            filteredItems.sort((a, b) => b.price - a.price);
        } else if (sortMode === "name-asc") {
            filteredItems.sort((a, b) => a.name.localeCompare(b.name));
        }

        resultMeta.textContent = `${filteredItems.length} item${filteredItems.length === 1 ? "" : "s"}`;

        if (filteredItems.length === 0) {

            menuContainer.innerHTML = `
                <div class="empty-menu">
                    <h3>No items found</h3>
                    <p>Try a different search term or filter.</p>
                </div>
            `;

            return;
        }

        menuContainer.innerHTML = filteredItems.map((item, index) => {

            const outOfStock = item.item_qty <= 0;
            const lowStock = !outOfStock && item.item_qty <= 3;

            let controls;

            if (outOfStock) {
                controls = `
                    <button class="add-btn" type="button" disabled>
                        SOLD OUT
                    </button>
                `;
            } else if (item.qty === 0) {
                controls = storeOnline
                    ? `
                    <button class="add-btn" data-item-id="${escapeHtml(item.id)}" type="button">
                        ADD
                    </button>
                `
                    : `
                    <button class="add-btn is-store-offline" type="button" disabled>
                        CLOSED
                    </button>
                `;
            } else {
                // Offline: the user can still reduce / remove, just not add more.
                controls = `
                    <div class="quantity-control">
                        <button class="qty-btn reduce" type="button">-</button>
                        <span class="item_qty">${escapeHtml(item.qty)}</span>
                        <button class="qty-btn increase${storeOnline ? "" : " is-store-offline"}" type="button"${storeOnline ? "" : ' disabled aria-disabled="true"'}>+</button>
                    </div>
                `;
            }

            const stockFlag = outOfStock
                ? `<span class="stock-flag">SOLD OUT</span>`
                : lowStock
                    ? `<span class="stock-flag">${escapeHtml(item.item_qty)} left</span>`
                    : "";

            const isWishlisted = wishlist.has(item.id);

            return `
                <div
                    class="menu-item${storeOnline ? "" : " store-offline"}"
                    id="${escapeHtml(item.id)}"
                    data-item-id="${escapeHtml(item.id)}"
                    data-cat-id="${escapeHtml(item.catId)}"
                    data-subcat-id="${escapeHtml(item.subcatId)}"
                    available="${escapeHtml(item.item_qty)}"
                    style="animation-delay:${index * 0.02}s"
                >

                    <div class="item-media">

                        ${stockFlag}

                        <img src="${escapeHtml(item.file_url)}" alt="${escapeHtml(item.name)}">

                        <button
                            class="wishlist-btn${isWishlisted ? " active" : ""}"
                            data-wishlist-id="${escapeHtml(item.id)}"
                            type="button"
                            aria-label="Save to wishlist"
                        >
                            <i class="fa-solid fa-heart"></i>
                        </button>

                        <div class="item-controls">
                            ${controls}
                        </div>

                    </div>

                    <div class="item-body">
                        <p class="price">${escapeHtml(item.price)}</p>
                        <h3>${escapeHtml(item.name)}</h3>
                        <p class="customisable">Customisable</p>
                    </div>

                </div>
            `;

        }).join("");
    }

    renderCategoryRail();
    renderMenu();

    categoryTabs.addEventListener("click", event => {

        const chip = event.target.closest(".category-chip");
        if (!chip) return;

        categoryTabs.querySelectorAll(".category-chip").forEach(el => el.classList.remove("active"));
        chip.classList.add("active");

        activeCategoryId = chip.dataset.catId;

        if (activeCategoryId === "all") {
            renderSubcategoryChips(null);
        } else {
            renderSubcategoryChips(findCategory(activeCategoryId));
        }

        renderMenu();
    });

    subcategoryTabs.addEventListener("click", event => {

        const button = event.target.closest(".subcategory-tab");
        if (!button) return;

        subcategoryTabs.querySelectorAll(".subcategory-tab").forEach(el => el.classList.remove("active"));
        button.classList.add("active");

        activeSubcategoryId = button.dataset.subcatId;

        renderMenu();
    });

    sortSelect.addEventListener("change", () => {
        sortMode = sortSelect.value;
        renderMenu();
    });

    stockToggle.addEventListener("click", () => {
        stockOnly = !stockOnly;
        stockToggle.classList.toggle("active", stockOnly);
        renderMenu();
    });

    searchInput.addEventListener("input", () => {
        searchClearBtn.classList.toggle("show", searchInput.value.length > 0);
        renderMenu();
    });

    searchClearBtn.addEventListener("click", () => {
        searchInput.value = "";
        searchClearBtn.classList.remove("show");
        searchInput.focus();
        renderMenu();
    });

    searchBackBtn.addEventListener("click", () => {
        goToPage("home");
    });

    menuContainer.addEventListener("click", event => {

        const wishlistBtn = event.target.closest(".wishlist-btn");
        if (!wishlistBtn) return;

        const id = wishlistBtn.dataset.wishlistId;

        if (wishlist.has(id)) {
            wishlist.delete(id);
            wishlistBtn.classList.remove("active");
        } else {
            wishlist.add(id);
            wishlistBtn.classList.add("active");
        }
    });

    // ADD button — optimistic: flips to quantity 1 immediately, reverts to
    // ADD if the server rejects it.
    menuContainer.addEventListener("click", async event => {

        const addButton = event.target.closest(".add-btn");
        if (!addButton || addButton.disabled) return;

        const item = addButton.closest(".menu-item");
        if (!item) return;

        const itemId = item.dataset.itemId;
        const itemName = item.querySelector("h3").textContent;
        const price = item.querySelector(".price").textContent;

        const available = parseInt(item.getAttribute("available"));

        if (!Number.isNaN(available) && available <= 0) {
            showToast("This item is currently out of stock");
            return;
        }

        if (!storeOnline) {
            showToast(`${decodedRestaurant} is currently offline`);
            return;
        }

        // Ignore taps while a previous add / debounced -1 for this item is
        // still settling, otherwise the requests can land out of order.
        if (addingItems.has(itemId)) return;
        if (pendingMenuUpdates.has(itemId) || inFlightMenuControllers.has(itemId)) return;

        addingItems.add(itemId);

        // Optimistic: show quantity 1 immediately
        setLocalQty(itemId, 1);
        setItemControls(itemId, 1);

        const revert = () => {
            setLocalQty(itemId, 0);
            setItemControls(itemId, 0); // back to ADD
        };

        try {
            const response = await fetch("/add_to_cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resid: resId,
                    userid: userId,
                    item: itemName,
                    ress_name: decodedRestaurant,
                    qty: 1,
                    item_id: itemId,
                    price: parseInt(price),
                    replace: false
                })
            });

            if (response.status === 401) {
                alert("Unauthorized user. Please log in");
                window.location.href = "/login/user";
                return;
            }

            const data = await readJsonSafe(response);

            // Store went offline between page load and this click.
            if (isOfflineResponse(response, data)) {
                revert();
                applyStoreStatus(resId, false, { live: true });
                return;
            }

            if (!response.ok && !data) throw new Error("add_to_cart failed");

            if (data && data.success) {

                footer.classList.add("show");
                totalAmount.textContent = data.Total ?? data.total ?? 0;

            } else if (data && /different store/i.test(data.message || "")) {

                revert();

                pendingCartItem = {
                    resid: resId,
                    userid: userId,
                    item: itemName,
                    ress_name: decodedRestaurant,
                    qty: 1,
                    item_id: itemId,
                    price: parseInt(price)
                };

                message.textContent = data.message || "Do you want to replace your existing cart?";

                replaceContainer.classList.add("show");
                overlay.classList.add("show");

            } else {
                revert();
                showToast((data && data.message) || "Couldn't add this item. Please try again.");
            }

        } catch (error) {
            console.error("Add cart error:", error);
            revert();
            showToast("Something went wrong adding this item.");
        } finally {
            addingItems.delete(itemId);
        }
    });

    // "Replace cart" confirmation — also optimistic.
    yesBtn.addEventListener("click", async () => {

        if (!pendingCartItem) return;

        const cartItem = pendingCartItem;
        const itemId = cartItem.item_id;

        if (addingItems.has(itemId)) return;
        addingItems.add(itemId);

        // Optimistic: close dialog and show 1 right away
        closeReplaceDialog();           // also clears pendingCartItem
        setLocalQty(itemId, 1);
        setItemControls(itemId, 1);

        const revert = () => {
            setLocalQty(itemId, 0);
            setItemControls(itemId, 0); // back to ADD
        };

        try {

            const response = await fetch("/add_to_cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...cartItem, replace: true })
            });

            if (response.status === 401) {
                alert("Unauthorized user. Please log in");
                window.location.href = "/login/user";
                return;
            }

            const data = await readJsonSafe(response);

            if (isOfflineResponse(response, data)) {
                revert();
                applyStoreStatus(resId, false, { live: true });
                return;
            }

            if (data && data.success) {

                footer.classList.add("show");
                totalAmount.textContent = data.Total ?? data.total ?? 0;

            } else {
                revert();
                showToast((data && data.message) || "Failed to replace cart");
            }

        } catch (error) {
            console.error("Replace cart error:", error);
            revert();
            showToast("Something went wrong.");
        } finally {
            addingItems.delete(itemId);
        }
    });

    noBtn.addEventListener("click", () => {
        closeReplaceDialog();
    });

    menuContainer.addEventListener("click", event => {

        const item = event.target.closest(".menu-item");
        if (!item) return;

        const itemId = item.dataset.itemId;

        if (addingItems.has(itemId)) return; // wait for the initial add to settle

        const availableRaw = item.getAttribute("available");

        const available = availableRaw !== null && availableRaw !== ""
            ? parseInt(availableRaw)
            : Infinity;

        if (event.target.classList.contains("increase")) {

            if (!storeOnline) {
                showToast(`${decodedRestaurant} is currently offline`);
                return;
            }

            const qtyEl = item.querySelector(".item_qty");
            const previousQty = Number(qtyEl.textContent);

            if (previousQty + 1 > available) {
                showToast(`Only ${available} in stock`);
                return;
            }

            qtyEl.textContent = previousQty + 1;
            setLocalQty(itemId, previousQty + 1);

            scheduleMenuCartUpdate(itemId, resId, userId, 1,
                (data) => {
                    const total = data.total ?? data.Total ?? 0;
                    if (total > 0) {
                        footer.classList.add("show");
                        totalAmount.textContent = total;
                    }
                },
                (errorMessage) => {
                    setLocalQty(itemId, previousQty);
                    setItemControls(itemId, previousQty);
                    showToast(errorMessage);
                },
                () => {
                    // Server says the store is offline: undo the optimistic +1,
                    // then flip the whole page into its offline state.
                    setLocalQty(itemId, previousQty);
                    setItemControls(itemId, previousQty);
                    applyStoreStatus(resId, false, { live: true });
                }
            );

        } else if (event.target.classList.contains("reduce")) {

            const qtyEl = item.querySelector(".item_qty");
            const previousQty = Number(qtyEl.textContent);
            const newQty = Math.max(0, previousQty - 1);

            setLocalQty(itemId, newQty);

            if (newQty === 0) {
                setItemControls(itemId, 0); // shows ADD instead of "0"
            } else {
                qtyEl.textContent = newQty;
            }

            scheduleMenuCartUpdate(itemId, resId, userId, -1,
                (data) => {

                    const total = data.total ?? data.Total ?? 0;

                    if (total > 0) {
                        footer.classList.add("show");
                        totalAmount.textContent = total;
                    } else {
                        footer.classList.remove("show");
                    }

                    if (data.removed) {

                        setLocalQty(itemId, 0);
                        setItemControls(itemId, 0); // ADD (or CLOSED if offline)
                    }
                },
                (errorMessage) => {
                    setLocalQty(itemId, previousQty);
                    setItemControls(itemId, previousQty);
                    showToast(errorMessage);
                }
            );
        }
    });

    goCartBtn.addEventListener("click", () => {
        goToPage("cart");
    });
}

// Keep the shared header's page-scoped chrome (search bar, category strip)
// in sync with whichever page is actually showing. The header never gets
// swapped out by the router, so without this it would stay visible on
// Orders/Cart/Profile/Menu too. Runs for every navigation, not just Home.
document.addEventListener("spa:pageload", (e) => {
    document.body.dataset.page = e.detail.page;
});

// Run on this page's first real load...
initHomePage();
initMenuPage();

// ...and re-run every time the SPA router swaps Home / Menu back into view
document.addEventListener("spa:pageload", (e) => {
    if (e.detail.page === "home") initHomePage();
    if (e.detail.page === "menu") initMenuPage();
});