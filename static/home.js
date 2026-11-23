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

   Help & Support sheet: FAQ, "Report a problem" (complaint) form, policies.
   Built entirely in JS, so no template changes are needed.

   Open it from anywhere:
     - any element with   data-open-support            -> FAQ tab
                          data-open-support="policies" -> Policies tab
     - JS:  KiranaSupport.open("report", {
                orderId: "abc123",
                storeName: "Shop",
                status: "placed" | "completed" | "canceled",
                orderType: "pickup" | "delivery",
                resIds: ["..."]
            })
   ============================================================ */
(function () {
    "use strict";

    // ---- Edit these -----------------------------------------------------
    const SUPPORT_EMAIL = "";               // e.g. "help@yourdomain.com" (leave "" to hide)
    const SUPPORT_PHONE = "";               // e.g. "+91 98765 43210"      (leave "" to hide)
    const TICKET_ENDPOINT = "/support_ticket";

    // when: "active" = order still pending, "done" = completed/canceled, "any" = both
    // for:  "pickup" | "delivery" | "any"
    const CATEGORIES = [
        {
            id: "shop_closed", label: "Shop is closed", when: "active", for: "any", photoRequired: true,
            hint: "The shop is shut or nobody is there. We'll flag this order for review and contact the shop."
        },
        {
            id: "shop_not_responding", label: "Shop isn't responding / not preparing my order", when: "active", for: "any",
            hint: "The shop hasn't accepted or started on your order."
        },
        {
            id: "not_ready", label: "Order isn't ready at my pickup time", when: "active", for: "pickup",
            hint: "You reached the shop at your pickup time but the order wasn't ready."
        },
        {
            id: "qr_not_working", label: "QR / token not accepted at the shop", when: "active", for: "pickup",
            hint: "The shop couldn't find or scan your order. Tell us what they said."
        },
        {
            id: "delivery_late", label: "Delivery is taking too long", when: "active", for: "delivery",
            hint: "Your order is past its estimated delivery time."
        },
        {
            id: "rider_unreachable", label: "Can't reach the delivery person / shop", when: "active", for: "delivery",
            hint: "Nobody is picking up when you call."
        },
        {
            id: "wrong_address", label: "I need to fix my address or phone number", when: "active", for: "delivery",
            hint: "Tell us the correct address or number so the shop can be informed.", messageRequired: true
        },
        {
            id: "not_received", label: "Marked completed but I didn't get my order", when: "done", for: "any",
            hint: "The order shows completed, but you never received it."
        },
        {
            id: "item", label: "Missing or wrong item", when: "done", for: "any",
            hint: "Tell us which item was missing or wrong.", messageRequired: true
        },
        {
            id: "quality", label: "Item quality", when: "done", for: "any",
            hint: "Damaged, expired, stale or not as described.", messageRequired: true
        },
        {
            id: "price", label: "Charged more than the listed price", when: "any", for: "any",
            hint: "Tell us what you were charged and what the price should be.", messageRequired: true
        },
        {
            id: "payment", label: "Payment or refund", when: "any", for: "any",
            hint: "Double charge, refund not received, etc.", messageRequired: true
        },
        {
            id: "other", label: "Something else", when: "any", for: "any",
            hint: "", messageRequired: true
        }
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
            q: "I went to the shop but it was closed. What should I do?",
            a: "Go to Orders, find your pending order and tap Report a problem, then choose \"Shop is closed\". You don't need to type anything. We will review the order and you can also cancel it from the same card."
        },
        {
            q: "My order is still pending and the shop isn't responding.",
            a: "Open the order in Orders and tap Report a problem. You can report that the shop isn't responding, that the order isn't ready at pickup time, or that a delivery is late."
        },
        {
            q: "My order has a problem. What should I do?",
            a: "Go to Orders, find the order that had the problem and tap Report a problem (pending orders) or Get help with this order (finished orders). Help stays available for 24 hours after an order is completed or canceled."
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
                "If something went wrong, open the order in Orders and report it. Pending orders can be reported at any time; finished orders within 24 hours of being completed or canceled."
            ]
        },
        {
            title: "Complaints",
            body: [
                "Reports such as \"shop is closed\" are reviewed against the store's status and order history. Please report only genuine problems.",
                "Repeated false reports may limit your ability to place orders."
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
    let currentCtx = { orderId: "", storeName: "", status: "", orderType: "", resIds: [] };

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

    function categoriesFor(ctx) {
        const active = ctx.status === "placed";
        return CATEGORIES.filter((c) => {
            if (c.when === "active" && !active) return false;
            if (c.when === "done" && active) return false;
            if (c.for !== "any" && ctx.orderType && c.for !== ctx.orderType) return false;
            return true;
        });
    }

    function statusLabel(status) {
        if (status === "placed") return "Pending";
        if (status === "completed") return "Completed";
        if (status === "canceled") return "Canceled";
        return "";
    }

    // ---- duplicate reports: the SERVER is the source of truth ----
    const reportedByOrder = {};   // orderId -> { categoryId: ticketId }

    async function loadReported(orderId) {
        try {
            const res = await fetch("/support_ticket/reported", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ order_id: orderId })
            });
            if (!res.ok) return;
            const body = await res.json();
            if (body && body.success) reportedByOrder[orderId] = body.reported || {};
        } catch (e) { /* the server still blocks duplicates on submit */ }
    }

    function markReported(orderId, category, ticketId) {
        if (!reportedByOrder[orderId]) reportedByOrder[orderId] = {};
        reportedByOrder[orderId][category] = ticketId || "";
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

    // Tiny style for the only new element (the per-reason hint line).
    function ensureExtraStyle() {
        if (document.getElementById("supportExtraStyle")) return;
        const style = document.createElement("style");
        style.id = "supportExtraStyle";
        style.textContent = `
            .support-hint { margin: 0; font-size: 13px; line-height: 1.4; color: #6b5f58; }
            .support-hint:empty { display: none; }
            .support-cam-video, .support-cam-preview { width: 100%; max-height: 260px; object-fit: cover; border-radius: 12px; background: #000; }
            .support-cam-actions { display: flex; gap: 8px; margin-top: 8px; }
            .support-cam-title { margin: 0 0 8px; font-weight: 600; }
        `;
        document.head.appendChild(style);
    }
    // ---- live camera proof (no file picker) ----
    let camStream = null;
    let shot = null;   // { blob, lat, lng, accuracy }
    const qs = (sel) => sheet.querySelector(sel);

    function stopCamera() {
        if (camStream) { camStream.getTracks().forEach((t) => t.stop()); camStream = null; }
        const v = sheet && qs(".support-cam-video");
        if (v) { v.srcObject = null; v.hidden = true; }
    }

    function resetCamUI() {
        if (!sheet) return;
        stopCamera();
        shot = null;
        const p = qs(".support-cam-preview");
        if (p.src) URL.revokeObjectURL(p.src);
        p.removeAttribute("src");
        p.hidden = true;
        qs(".support-cam-open").hidden = false;
        qs(".support-cam-snap").hidden = true;
        qs(".support-cam-retake").hidden = true;
    }

    function getFix() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error("no geolocation"));
            navigator.geolocation.getCurrentPosition(resolve, reject,
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
        });
    }

    async function openCamera() {
        showError("");
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            showError("Camera isn't available here (the site must be opened over HTTPS).");
            return;
        }
        try {
            camStream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" } }, audio: false
            });
        } catch (e) {
            showError("Couldn't open the camera. Please allow camera access and try again.");
            return;
        }
        const v = qs(".support-cam-video");
        v.srcObject = camStream;
        try { await v.play(); } catch (e) { /* autoplay quirks */ }
        v.hidden = false;
        qs(".support-cam-preview").hidden = true;
        qs(".support-cam-open").hidden = true;
        qs(".support-cam-retake").hidden = true;
        qs(".support-cam-snap").hidden = false;
    }

    async function capturePhoto() {
        const v = qs(".support-cam-video");
        const snap = qs(".support-cam-snap");
        if (!v.videoWidth) return;
        snap.disabled = true;
        showError("");

        let fix;
        try { fix = await getFix(); }
        catch (e) {
            showError("Location is required. Please allow location access and try again.");
            snap.disabled = false;
            return;
        }

        const scale = Math.min(1, 1280 / v.videoWidth);
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(v.videoWidth * scale);
        canvas.height = Math.round(v.videoHeight * scale);
        canvas.getContext("2d").drawImage(v, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise((r) => canvas.toBlob(r, "image/jpeg", 0.85));
        snap.disabled = false;
        if (!blob) { showError("Couldn't capture the photo. Please try again."); return; }

        shot = { blob, lat: fix.coords.latitude, lng: fix.coords.longitude, accuracy: fix.coords.accuracy };
        stopCamera();
        const p = qs(".support-cam-preview");
        if (p.src) URL.revokeObjectURL(p.src);
        p.src = URL.createObjectURL(blob);
        p.hidden = false;
        snap.hidden = true;
        qs(".support-cam-retake").hidden = false;
    }
    function build() {
        if (sheet && document.body.contains(sheet)) return;
        ensureExtraStyle();

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
                <button type="button" role="tab" class="support-tab" data-tab="report" aria-selected="false" hidden>Report a problem</button>
                <button type="button" role="tab" class="support-tab" data-tab="policies" aria-selected="false">Policies</button>
            </div>

            <div class="support-body">
                <div class="support-panel active" data-panel="faq">${accordion(FAQ, "a")}</div>

                <div class="support-panel" data-panel="report">
                    <form class="support-form" novalidate>
                        <div class="support-order" aria-live="polite"></div>
                        <label>What went wrong?
                            <select name="category"></select>
                        </label>
                        <p class="support-hint" aria-live="polite"></p>
                        <input name="order_id" type="hidden">
                        <label><span class="support-msg-label">Tell us what happened</span>
                            <textarea name="message" maxlength="1000" placeholder="Describe the problem..."></textarea>
                        </label>
                                                <div class="support-cam" hidden>
                            <p class="support-cam-title">Photo of the shop <span class="opt">(required, live camera)</span></p>
                            <video class="support-cam-video" playsinline muted hidden></video>
                            <img class="support-cam-preview" alt="Shop photo" hidden>
                            <div class="support-cam-actions">
                                <button type="button" class="support-cam-open" style="font: inherit;font-size: 14px;font-weight: 500;color: var(--ink);background: var(--surface-2);border: 1px solid transparent;border-radius: var(--radius-sm);padding: 11px 12px;width: 100%;">Open camera</button>
                                <button type="button" class="support-cam-snap" hidden style="font: inherit;font-size: 14px;font-weight: 500;color: var(--ink);background: var(--surface-2);border: 1px solid transparent;border-radius: var(--radius-sm);padding: 11px 12px;width: 100%;">Capture</button>
                                <button type="button" class="support-cam-retake" hidden style="font: inherit;font-size: 14px;font-weight: 500;color: var(--ink);background: var(--surface-2);border: 1px solid transparent;border-radius: var(--radius-sm);padding: 11px 12px;width: 100%;">Retake</button>
                            </div>
                        </div>
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

        const form = sheet.querySelector(".support-form");
        form.addEventListener("submit", onSubmit);
        form.elements.category.addEventListener("change", onCategoryChange);
        sheet.querySelector(".support-cam-open").addEventListener("click", openCamera);
        sheet.querySelector(".support-cam-snap").addEventListener("click", capturePhoto);
        sheet.querySelector(".support-cam-retake").addEventListener("click", openCamera);
        sheet.querySelector(".support-again").addEventListener("click", () => showForm());

        document.body.appendChild(overlay);
        document.body.appendChild(sheet);
    }

    function selectedCategory() {
        const form = sheet.querySelector(".support-form");
        return CATEGORIES.find((c) => c.id === form.elements.category.value) || null;
    }

    // Updates the hint line + whether typing details is required.
    function onCategoryChange() {
        const cat = selectedCategory();
        const form = sheet.querySelector(".support-form");
        sheet.querySelector(".support-hint").textContent = cat ? cat.hint : "";
        const required = !!(cat && cat.messageRequired);
        sheet.querySelector(".support-msg-label").textContent = required
            ? "Tell us what happened"
            : "Anything else we should know? (optional)";
        form.elements.message.placeholder = required ? "Describe the problem..." : "Optional details...";
        const needPhoto = !!(cat && cat.photoRequired);
        sheet.querySelector(".support-cam").hidden = !needPhoto;
        if (!needPhoto) resetCamUI();
        showError("");
    }

    function fillCategories(ctx) {
        const form = sheet.querySelector(".support-form");
        const reported = reportedByOrder[ctx.orderId] || {};
        const isDone = (id) => Object.prototype.hasOwnProperty.call(reported, id);
        const list = categoriesFor(ctx);
        const previous = form.elements.category.value;

        form.elements.category.innerHTML = list
            .map((c) => `<option value="${esc(c.id)}"${isDone(c.id) ? " disabled" : ""}>${esc(c.label)}${isDone(c.id) ? " (already reported)" : ""}</option>`)
            .join("");

        const keep = list.find((c) => c.id === previous && !isDone(c.id));
        const firstFree = list.find((c) => !isDone(c.id));
        form.elements.category.value = keep ? keep.id : (firstFree ? firstFree.id : "");
        onCategoryChange();
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

    function showDone(ticketId, category) {
        sheet.querySelector(".support-form").hidden = true;
        const done = sheet.querySelector(".support-done");
        done.hidden = false;
        const ref = ticketId ? ` Your reference is ${ticketId}.` : "";
        const extra = category && category.id === "shop_closed"
            ? " We'll check with the shop. You can also cancel this order from the Orders page."
            : "";
        done.querySelector(".support-done-text").textContent =
            `Thanks, we have received your request.${ref}${extra}`;
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
        const subject = `Support request: ${data.category_label || data.category}`;
        const body = `Order ID: ${data.order_id || "-"}\nOrder status: ${data.status || "-"}\nPhone: ${data.phone || "-"}\n\n${data.message}`;
        const href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        return ` <a href="${esc(href)}">Email us instead</a>`;
    }

    async function onSubmit(e) {
        e.preventDefault();
        const form = e.currentTarget;
        const btn = form.querySelector(".support-submit");
        const cat = selectedCategory();

        if (!cat) {
            showError("Please choose what went wrong.");
            return;
        }

        const typed = form.elements.message.value.trim();
        const data = {
            user_id: currentUserId(),
            category: cat.id,
            category_label: cat.label,
            order_id: form.elements.order_id.value.trim(),
            order_type: currentCtx.orderType || "",
            status: currentCtx.status || "",
            res_ids: currentCtx.resIds || [],
            // If the reason alone says it all (e.g. "Shop is closed"), no typing needed.
            message: typed || cat.label,
            phone: normalizePhone(form.elements.phone.value),
            page: document.body.dataset.page || ""
        };

        if (!data.order_id) {
            showError("Please open this form from an order in Orders.");
            return;
        }
        if (cat.messageRequired && typed.length < 10) {
            showError("Please describe the problem in a few words (at least 10 characters).");
            return;
        }
        if (data.phone && !/^[6-9]\d{9}$/.test(data.phone)) {
            showError("Please enter a valid 10-digit phone number, or leave it empty.");
            return;
        }
        if (cat.photoRequired && !shot) {
            showError("Please capture a live photo of the shop first.");
            return;
        }

        showError("");
        btn.disabled = true;
        btn.textContent = "Sending...";

        try {
            const fd = new FormData();
            fd.append("order_id", data.order_id);
            fd.append("category", data.category);
            fd.append("message", data.message);
            fd.append("phone", data.phone);
            if (cat.photoRequired) {
                fd.append("photo", shot.blob, "shop.jpg");
                fd.append("lat", shot.lat);
                fd.append("lng", shot.lng);
                fd.append("accuracy", shot.accuracy);
            }
            const res = await fetch(TICKET_ENDPOINT, { method: "POST", body: fd });

            if (res.status === 401) {
                alert("Unauthorized user. Please log in");
                window.location.href = "/login/user";
                return;
            }

            let body = null;
            try { body = await res.json(); } catch (err) { /* non-JSON error page */ }

            if (res.ok && body && body.success) {
                resetCamUI();
                markReported(data.order_id, data.category, body.ticket_id);
                form.reset();
                fillCategories(currentCtx);
                showDone(body.ticket_id, cat);
            } else {
                if (res.status === 409 && body && body.ticket_id) {
                    // server says it's a duplicate: reflect that in the dropdown
                    markReported(data.order_id, data.category, body.ticket_id);
                    fillCategories(currentCtx);
                }
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

        const o = opts || {};
        const orderId = o.orderId ? String(o.orderId) : "";
        const form = sheet.querySelector(".support-form");
        const reportTab = sheet.querySelector('.support-tab[data-tab="report"]');

        // The report form only exists in the context of one order.
        reportTab.hidden = !orderId;
        if (orderId) {
            const ctx = {
                orderId,
                storeName: o.storeName || "",
                status: String(o.status || "").toLowerCase(),
                orderType: String(o.orderType || "").toLowerCase(),
                resIds: Array.isArray(o.resIds) ? o.resIds.map(String) : []
            };

            const changed = form.elements.order_id.value !== orderId
                || currentCtx.status !== ctx.status
                || currentCtx.orderType !== ctx.orderType;
            currentCtx = ctx;

            if (changed) { form.reset(); resetCamUI(); }
            form.elements.order_id.value = orderId;
            fillCategories(ctx);
            // pull which reasons were already reported from the server, then refresh the dropdown
            loadReported(orderId).then(() => {
                if (currentCtx.orderId === orderId) fillCategories(currentCtx);
            });
            const store = ctx.storeName ? ` \u00b7 ${ctx.storeName}` : "";
            const st = statusLabel(ctx.status) ? ` \u00b7 ${statusLabel(ctx.status)}` : "";
            sheet.querySelector(".support-order").textContent = `Order #${orderId}${store}${st}`;
            reportTab.textContent = ctx.status === "placed" ? "Report a problem" : "Get help with this order";
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
        stopCamera();
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

/* ---- Home page tuning knobs ---- */
const HOME_RADIUS_STEPS = [0.5, 1, 2, 5, 10];   // must match the slider (0-4) and the chips in home.html
const HOME_DEFAULT_RADIUS_KM = 2;               // radius used on first load
const HOME_FREE_DELIVERY_ABOVE = 199;           // ₹ — cart bar says "free delivery unlocked" above this. Set 0 to always show it.
const HOME_TYPE_LABELS = { restaurant: "Restaurant", medical: "Medical", general_store: "General Store" };
const HOME_HERO_BG = {
    restaurant: "linear-gradient(135deg,#B5461C,#E8863A)",
    medical: "linear-gradient(135deg,#0F6E5C,#3FA58F)",
    general_store: "linear-gradient(135deg,#1F5FA8,#5B8FD0)"
};
const HOME_HERO_BG_DEFAULT = "linear-gradient(135deg,#2A7F4B,#6BB37F)";

let homeRadiusKm = homeLoadRadius();
let homeSortMode = "nearest";   // "nearest" | "open"
let homeReloadId = 0;

function homeLoadRadius() {
    try {
        const v = parseFloat(localStorage.getItem("homeRadiusKm"));
        if (HOME_RADIUS_STEPS.includes(v)) return v;
    } catch (e) { /* ignore */ }
    return HOME_DEFAULT_RADIUS_KM;
}

function homeFormatKm(km) {
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km} km`;
}

function homeFormatCount(n) {
    n = Number(n);
    if (!Number.isFinite(n) || n <= 0) return "";
    return n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k` : String(Math.round(n));
}

function homeFormatMoney(n) {
    n = Number(n) || 0;
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

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

// Basic HTML-escaping so data from the API can never break out of the markup (XSS guard).
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
// wrappers, and plain strings/numbers down to a single string.
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
// times when initHomePage() re-runs without the DOM node being recreated.
function addListenerOnce(el, event, handler) {
    if (!el) return;
    const key = `bound_${event}`;
    if (el.dataset[key]) return;
    el.dataset[key] = "true";
    el.addEventListener(event, handler);
}

// spa_router.js only recognizes exact page names, so menu params are stashed
// in sessionStorage and navigation goes through the router's renderPage().
function goToPage(page) {
    if (typeof window.renderPage === "function") {
        window.renderPage(page);
    } else {
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
   RADIUS CARD, SHOP STATS, SORTING, EXPRESS BANNER
   ============================================================ */

// Paints slider, chips, big "2 km", heading and the empty-state text from homeRadiusKm.
function homePaintRadius() {
    const idx = Math.max(0, HOME_RADIUS_STEPS.indexOf(homeRadiusKm));
    const slider = document.getElementById("radiusSlider");
    if (slider) {
        slider.value = String(idx);
        slider.style.setProperty("--fill", `${(idx / (HOME_RADIUS_STEPS.length - 1)) * 100}%`);
    }
    const kmEl = document.getElementById("rcKm");
    if (kmEl) kmEl.textContent = homeFormatKm(homeRadiusKm);

    document.querySelectorAll("#radiusChips button").forEach((b) => {
        b.classList.toggle("active", parseFloat(b.dataset.km) === homeRadiusKm);
    });

    const note = document.getElementById("Note");
    if (note) note.textContent = `Shops in ${homeFormatKm(homeRadiusKm)}`;

    const sel = document.getElementById("distance_options");
    if (sel) sel.value = String(homeRadiusKm);

    const emptyText = document.querySelector("#no-results-container p");
    if (emptyText) {
        emptyText.textContent = `We don't have any partners within ${homeFormatKm(homeRadiusKm)} of your location. Try a wider radius or a different area.`;
    }
}

// "• 12 shops • 4 open now", "Live: 12 shops near you" and the average ETA chip.
function homeUpdateShopStats() {
    const cards = document.querySelectorAll("#resturants_container .store-card");
    const total = cards.length;
    let open = 0;
    const etas = [];

    cards.forEach((card) => {
        if (card.classList.contains("is-offline")) return;
        open += 1;
        if (card.dataset.delivery === "true") {
            const r = KiranaUtils.etaRange(card.dataset.distance);
            etas.push((r.lower + r.upper) / 2);
        }
    });

    const meta = document.getElementById("rcMeta");
    if (meta) meta.textContent = `• ${total} shop${total === 1 ? "" : "s"} • ${open} open now`;

    const live = document.getElementById("liveShopCount");
    if (live) live.textContent = String(total);

    const avg = document.getElementById("avgEta");
    if (avg && etas.length) avg.textContent = String(Math.round(etas.reduce((a, b) => a + b, 0) / etas.length));
}

function homeSortCards() {
    const grid = document.getElementById("resturants_container");
    if (!grid) return;
    const cards = Array.from(grid.querySelectorAll(".store-card"));
    const dist = (c) => parseFloat(c.dataset.distance) || 0;

    cards.sort((a, b) => {
        if (homeSortMode === "open") {
            const ao = a.classList.contains("is-offline") ? 1 : 0;
            const bo = b.classList.contains("is-offline") ? 1 : 0;
            if (ao !== bo) return ao - bo;
        }
        return dist(a) - dist(b);
    });
    cards.forEach((c) => grid.appendChild(c));
    homePlaceExpressBanner();
}

// "15-min Express Shelf" banner shown after the 2nd visible card.
function homePlaceExpressBanner() {
    const grid = document.getElementById("resturants_container");
    if (!grid) return;
    grid.querySelector(".express-banner")?.remove();

    const searchBox = document.getElementById("searchInput");
    const activeTab = document.querySelector("#typeTabs .pill-tab.active");
    const filtering = (searchBox && searchBox.value.trim() !== "") || (activeTab && activeTab.dataset.type !== "all");
    if (filtering) return;

    const cards = Array.from(grid.querySelectorAll(".store-card")).filter((c) => c.style.display !== "none");
    const near = cards.filter((c) => !c.classList.contains("is-offline") && parseFloat(c.dataset.distance) < 1).length;
    if (cards.length < 2 || near === 0) return;

    const banner = document.createElement("div");
    banner.className = "express-banner";
    banner.innerHTML = `
        <span class="express-ico"><i class="fa-solid fa-bolt"></i></span>
        <div class="express-text">
            <strong>15-min Express Shelf</strong>
            <span>Top items from shops under 1 km</span>
        </div>
        <button class="express-btn" type="button">Shop now</button>`;
    cards[1].after(banner);
}

function homeSetRadius(km) {
    if (!HOME_RADIUS_STEPS.includes(km)) return;
    homeRadiusKm = km;
    try { localStorage.setItem("homeRadiusKm", String(km)); } catch (e) { /* ignore */ }
    homePaintRadius();
    homeReloadRestaurants();
}

async function homeReloadRestaurants() {
    const display_resturants = document.getElementById("resturants_container");
    const no_results_container = document.getElementById("no-results-container");
    if (!display_resturants || !no_results_container) return;

    let loc = null;
    try { loc = JSON.parse(localStorage.getItem("userLocation")); } catch (e) { /* ignore */ }
    if (!loc) return;

    const myId = ++homeReloadId;
    const previous = display_resturants.innerHTML;
    showRestaurantSkeleton(display_resturants, no_results_container);

    try {
        const res = await fetch("/list_resturants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latt: loc.latt, long: loc.long, dist: homeRadiusKm })
        });
        if (!res.ok) throw new Error(`list_resturants failed: ${res.status}`);
        const data = await res.json();
        if (myId !== homeReloadId) return; // a newer radius pick is already loading
        if (!data.success) throw new Error("list_resturants returned success:false");

        Object.entries(data.results).forEach(([id, detail]) => storeStatus.set(id, detail.is_online !== false));
        renderRestaurants(data.results, { display_resturants, no_results_container });
        sessionStorage.setItem(getRestaurantCacheKey(currentUserId()), JSON.stringify(data.results));
    } catch (err) {
        if (myId !== homeReloadId) return;
        console.error("radius reload failed", err);
        display_resturants.innerHTML = previous;
        showToast("Couldn't load shops. Please try again.");
    }
}

/* ============================================================
   STORE ONLINE / OFFLINE — shared state + realtime

   Source of truth is the server. The client keeps:
   - storeStatus:   resId -> boolean, last known state
   - a socket that joins "store:{resId}" rooms (server: watch_store) and
     receives "store_status" pushes the moment a seller toggles
   - a resync (on socket reconnect and when the tab becomes visible again)
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
        if (!online) {
            badge.textContent = "Offline";
        } else if (card.dataset.delivery === "true" && card.dataset.eta) {
            badge.textContent = `Open • ${card.dataset.eta} min`;
        } else {
            badge.textContent = "Open • Pickup";
        }
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
    homeUpdateShopStats();

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

    const res = await fetch("/list_resturants", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ latt: loc.latt, long: loc.long, dist: homeRadiusKm })
    });
    if (!res.ok) return;
    const data = await res.json();
    if (!data.success) return;

    renderRestaurants(data.results, { display_resturants, no_results_container });
    sessionStorage.setItem(getRestaurantCacheKey(currentUserId()), JSON.stringify(data.results));
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

// Cache of already-fetched preview items, keyed by res_id, so a card only
// ever shows the skeleton once, the first time it's seen.
const previewItemsCache = new Map();

/* ============================================================
   HOME CARD "ADD" BUTTONS, "SEE MORE" TILE AND FLOATING CART BAR

   - "Add" calls /add_to_cart (optimistic: flips to a - qty + stepper
     immediately, reverts if the server says no)
   - the stepper uses the same debounced /update_cart as the menu page
   - the last tile ("See more") sits inside .store-card, so the card
     click opens that store's menu page
   homeCartQty mirrors the server cart: itemId -> qty.
   homeItemInfo remembers price + store per item so the floating cart bar
   can show a total instantly.
   ============================================================ */

const homeCartQty = new Map();      // itemId -> qty currently in the user's cart
const homeAdding = new Set();       // itemIds with an add_to_cart request in flight
const homeItemInfo = new Map();     // itemId -> { price, resId }
let homeCartServerTotal = NaN;
let homeCartRefresh = null;

function rememberHomeItem(itemId, price, resId) {
    itemId = String(itemId);
    const prev = homeItemInfo.get(itemId) || {};
    const p = Number(price);
    homeItemInfo.set(itemId, {
        price: Number.isFinite(p) && p > 0 ? p : (prev.price || 0),
        resId: resId ? String(resId) : (prev.resId || "")
    });
}

function updateHomeCartBar() {
    const bar = document.getElementById("homeCartBar");
    if (!bar) return;

    let count = 0;
    let total = 0;
    let allPriced = true;
    const shops = new Set();

    homeCartQty.forEach((qty, id) => {
        count += qty;
        const info = homeItemInfo.get(id);
        if (info && info.price > 0) {
            total += qty * info.price;
            if (info.resId) shops.add(info.resId);
        } else {
            allPriced = false;
        }
    });

    if (!allPriced && Number.isFinite(homeCartServerTotal)) total = homeCartServerTotal;

    if (count <= 0) {
        bar.hidden = true;
        return;
    }

    const shopCount = Math.max(1, shops.size);
    const countEl = document.getElementById("hcbCount");
    const titleEl = document.getElementById("hcbTitle");
    const subEl = document.getElementById("hcbSub");
    if (countEl) countEl.textContent = String(count);
    if (titleEl) titleEl.textContent = `${count} item${count === 1 ? "" : "s"} • ₹${homeFormatMoney(total)}`;
    if (subEl) {
        let tail = " • Free delivery unlocked";
        if (HOME_FREE_DELIVERY_ABOVE > 0 && total < HOME_FREE_DELIVERY_ABOVE) {
            tail = ` • Add ₹${homeFormatMoney(HOME_FREE_DELIVERY_ABOVE - total)} for free delivery`;
        }
        subEl.textContent = `from ${shopCount} shop${shopCount === 1 ? "" : "s"}${tail}`;
    }
    bar.hidden = false;
}

function thumbControlMarkup(qty) {
    if (qty > 0) {
        return `
            <div class="p-qty">
                <button class="p-minus" type="button" aria-label="Remove one">−</button>
                <span class="p-qty-num">${escapeHtml(qty)}</span>
                <button class="p-plus" type="button" aria-label="Add one">+</button>
            </div>`;
    }
    return `<button class="p-add" type="button">Add +</button>`;
}

// Update one item everywhere it's shown on the home page.
function setHomeQty(itemId, qty) {
    itemId = String(itemId);
    if (qty > 0) homeCartQty.set(itemId, qty); else homeCartQty.delete(itemId);
    document
        .querySelectorAll(`.product-thumb[data-item-id="${CSS.escape(itemId)}"] .p-control`)
        .forEach(el => { el.innerHTML = thumbControlMarkup(qty); });
    updateHomeCartBar();
}

function syncAllThumbControls() {
    document.querySelectorAll(".product-thumb[data-item-id]").forEach(thumb => {
        const ctl = thumb.querySelector(".p-control");
        if (ctl) ctl.innerHTML = thumbControlMarkup(homeCartQty.get(thumb.dataset.itemId) || 0);
    });
    updateHomeCartBar();
}

// Pull the real cart from the server so the strip shows correct quantities.
// Skipped while a local change is still settling (unless force).
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
            Object.entries(cart).forEach(([resKey, entry]) => {
                Object.entries(entry?.items || {}).forEach(([id, it]) => {
                    const q = Number(it?.qty || 0);
                    if (q > 0) {
                        homeCartQty.set(String(id), q);
                        rememberHomeItem(id, it?.price, resKey);
                    }
                });
            });
            const t = Number(data?.results?.total);
            homeCartServerTotal = Number.isFinite(t) ? t : NaN;
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
    refreshCartBadgeSoon();
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

    rememberHomeItem(itemId, payload.price, resId);
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

function productThumbsMarkup(items, resId) {
    if (!items || items.length === 0) {
        return `<div class="product-thumb empty-thumb"><p>No items listed yet</p></div>`;
    }

    const thumbs = items.map(item => {
        rememberHomeItem(item.id, item.price, resId);
        const qty = homeCartQty.get(String(item.id)) || 0;
        const price = Number(item.price) || 0;
        const mrp = Number(item.mrp ?? item.original_price ?? 0);
        const unit = item.unit || item.weight || item.unit_label || item.quantity_label || "";
        return `
        <div class="product-thumb"
             data-item-id="${escapeHtml(item.id)}"
             data-name="${escapeHtml(item.name)}"
             data-price="${escapeHtml(item.price)}"
             data-stock="${escapeHtml(item.item_qty ?? "")}">
            <div class="p-media"><img src="${escapeHtml(item.file_url)}" alt="${escapeHtml(item.name)}" loading="lazy"></div>
            <p class="p-name">${escapeHtml(item.name)}</p>
            <p class="p-unit">${escapeHtml(unit)}</p>
            <div class="p-price-row">
                <span class="p-price">₹${escapeHtml(item.price)}</span>
                ${mrp > price ? `<s class="p-mrp">₹${escapeHtml(mrp)}</s>` : ""}
            </div>
            <div class="p-control">${thumbControlMarkup(qty)}</div>
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

// ---- Skeleton loading helpers ----------------------------------------
function restaurantSkeletonMarkup(n = 4) {
    const card = `
        <div class="skeleton-card" data-kh-sk aria-hidden="true">
            <div class="skeleton-img"></div>
            <div class="skeleton-line w-70"></div>
            <div class="skeleton-line w-40"></div>
            <div class="skeleton-line w-55"></div>
        </div>`;
    return card.repeat(n);
}

function showRestaurantSkeleton(display_resturants, no_results_container) {
    if (!display_resturants) return;
    if (no_results_container) no_results_container.style.display = "none";
    display_resturants.innerHTML = restaurantSkeletonMarkup();
}

// Remove any skeleton left behind (error paths), keeping real content.
function clearKhSkeleton(el) {
    if (!el) return;
    el.querySelectorAll("[data-kh-sk], .skeleton-card").forEach(n => n.remove());
}

// Store cards start with skeleton item-thumbs (unless that restaurant's items
// are cached) and get real products from loadPreviewItems() via one batched
// /preview_items call.
//
// Optional fields read from /list_resturants when present (the card hides the
// matching piece when a field is missing):
//   image_url | res_image | banner_url | cover_url  -> hero photo
//   logo_url                                         -> logo tile
//   rating, rating_count                             -> amber rating pill
//   offer | offer_text                               -> dashed offer strip
//   weekly_orders                                    -> "4.2k bought this week"
// Optional fields read from /preview_items: unit | weight, mrp | original_price.
function renderRestaurants(results, containers) {
    const { display_resturants, no_results_container } = containers;

    if (!results || Object.keys(results).length === 0) {
        display_resturants.innerHTML = "";
        no_results_container.style.display = "block";
        KiranaUtils.refreshHeaderPill();
        homeUpdateShopStats();
        return;
    }

    no_results_container.style.display = "none";

    const userId = currentUserId();
    const favorites = getFavoriteIds(userId);

    const skeletonThumbs = `
        <div class="product-thumb skeleton-thumb"><div class="skeleton-img sq"></div><div class="skeleton-line w-70"></div><div class="skeleton-line w-40"></div></div>
        <div class="product-thumb skeleton-thumb"><div class="skeleton-img sq"></div><div class="skeleton-line w-70"></div><div class="skeleton-line w-40"></div></div>
        <div class="product-thumb skeleton-thumb"><div class="skeleton-img sq"></div><div class="skeleton-line w-70"></div><div class="skeleton-line w-40"></div></div>`;

    const html = Object.entries(results).map(([id, detail], index) => {
        const isFavorite = favorites.has(id);
        const cached = previewItemsCache.get(id);
        const productsMarkup = cached ? productThumbsMarkup(cached, id) : skeletonThumbs;
        const eta = KiranaUtils.etaRange(detail.distance_km).label;

        // Live status wins over a possibly stale list/cache value.
        const online = storeStatus.has(id) ? storeStatus.get(id) : detail.is_online !== false;
        storeStatus.set(id, online);

        // delivery_available can arrive as a boolean or a string — normalise.
        const hasDelivery = String(detail.delivery_available).toLowerCase() === "true";

        const km = Number(detail.distance_km);
        const kmText = Number.isFinite(km) ? km.toFixed(1) : String(detail.distance_km ?? "");
        const name = String(detail.res_name || "");
        const typeLabel = HOME_TYPE_LABELS[detail.type] || "Store";
        const sub = `${typeLabel} • ${hasDelivery ? `Delivery within ${detail.delivery_radius} km` : "Pickup only"}`;

        const statusText = !online ? "Offline" : (hasDelivery ? `Open • ${eta} min` : "Open • Pickup");

        const heroUrl = detail.image_url || detail.res_image || detail.banner_url || detail.cover_url || "";
        const heroImg = heroUrl ? `<img class="hero-img" src="${escapeHtml(heroUrl)}" alt="" loading="lazy">` : "";
        const logo = detail.logo_url
            ? `<img src="${escapeHtml(detail.logo_url)}" alt="">`
            : escapeHtml((name.trim()[0] || "S").toUpperCase());

        const rating = Number(detail.rating);
        const ratingCount = homeFormatCount(detail.rating_count);
        const ratingHtml = Number.isFinite(rating) && rating > 0
            ? `<span class="hero-rating"><i class="fa-solid fa-star"></i> ${rating.toFixed(1)}${ratingCount ? ` (${ratingCount})` : ""}</span>`
            : "";

        const offer = detail.offer || detail.offer_text || "";
        const offerHtml = offer
            ? `<div class="store-offer"><i class="fa-solid fa-tags"></i><span>${escapeHtml(offer)}</span><span class="offer-tc">T&amp;C</span></div>`
            : "";

        const bought = homeFormatCount(detail.weekly_orders);
        const boughtHtml = bought ? `<span class="bought">${escapeHtml(bought)} bought this week</span>` : "";

        return `
        <div class="store-card${online ? "" : " is-offline"}" id="${escapeHtml(id)}" data-type="${escapeHtml(detail.type || "")}" data-distance="${escapeHtml(detail.distance_km)}" data-delivery="${hasDelivery}" data-radius="${escapeHtml(detail.delivery_radius ?? "")}" data-eta="${escapeHtml(hasDelivery ? eta : "")}" data-address="${escapeHtml(detail.address)}" style="--i:${index}">
            <div class="store-hero" style="background:${HOME_HERO_BG[detail.type] || HOME_HERO_BG_DEFAULT}">
                ${heroImg}
                <div class="hero-top">
                    <span class="hero-chip store-status-badge ${online ? "badge-open" : "badge-closed"}">${escapeHtml(statusText)}</span>
                    <span class="hero-chip chip-dist"><i class="fa-solid fa-location-dot"></i> ${escapeHtml(kmText)} km</span>
                    <button class="store-fav${isFavorite ? " active" : ""}" type="button" data-fav-id="${escapeHtml(id)}" aria-label="Save to favorites">
                        <i class="fa-solid fa-heart"></i>
                    </button>
                </div>
                <div class="hero-bottom">
                    <span class="store-logo">${logo}</span>
                    <div class="hero-title">
                        <h3 class="store-name resturant_name">${escapeHtml(name)}</h3>
                        <p class="store-sub">${escapeHtml(sub)}</p>
                    </div>
                    ${ratingHtml}
                </div>
            </div>

            ${offerHtml}

            <div class="products-head"><strong>Quick add — bestsellers</strong>${boughtHtml}</div>
            <div class="store-products" data-res-id="${escapeHtml(id)}">${productsMarkup}</div>
        </div>`;
    }).join("");
    display_resturants.innerHTML = html;
    KiranaUtils.refreshHeaderPill();

    // Join the realtime rooms so these cards flip the moment a seller toggles.
    watchStores(Object.keys(results));

    homeSortCards();
    homeUpdateShopStats();
    if (typeof window.__applyHomeFilters === "function") window.__applyHomeFilters();

    // Only fetch for restaurants we don't already have cached items for.
    const idsNeedingFetch = Object.keys(results).filter(id => !previewItemsCache.has(id));
    loadPreviewItems(idsNeedingFetch);
}

// Batched fetch of a few real items per restaurant, for the store-card
// product strip. Pairs with POST /preview_items on the server.
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

        // Backend omits the key for a restaurant with zero in-stock items —
        // default missing ones to an empty list so nothing shimmers forever.
        resIds.forEach(resId => {
            const items = (data.items && data.items[resId]) || [];
            previewItemsCache.set(resId, items);
            const container = document.querySelector(`.store-products[data-res-id="${CSS.escape(resId)}"]`);
            if (container) container.innerHTML = productThumbsMarkup(items, resId);
        });
        updateHomeCartBar();
    } catch (e) {
        console.error("loadPreviewItems failed", e);
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
            return;
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
    return data.display_name.split(',').slice(0, 2).join(',');
}

// change(): re-fetches restaurants for a newly picked location.
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

        showRestaurantSkeleton(display_resturants, no_results_container);
        const res = await fetch("/list_resturants", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ latt: userLatt, long: userLong, dist: homeRadiusKm })
        });
        if (!res.ok) throw new Error(`list_resturants failed: ${res.status}`);
        const data = await res.json();
        console.log(data);
        if (data.success) {
            if (loading) loading.style.display = "none";
            if (Note) Note.style.display = "block";
            renderRestaurants(data.results, { display_resturants, no_results_container });
            sessionStorage.setItem(getRestaurantCacheKey(userId), JSON.stringify(data.results));
        } else {
            clearKhSkeleton(display_resturants);
            alert("error loading resturants");
        }
    } catch (e) {
        console.error("change() failed", e);
        clearKhSkeleton(display_resturants);
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

    const pathParts = window.location.pathname.split("/");
    const no_results_container = document.getElementById("no-results-container");
    const Note = document.getElementById("Note");
    const loading = document.getElementById("loading");
    const request_location = document.getElementById("requestlocation");
    const currentAddress = document.getElementById("currentAddress");
    const livelocationBtn = document.getElementById("liveLocationBtn");
    const loading_container = document.getElementById("loading_container");
    const savedAddress = document.getElementById("savedAddress");
    const userId = window.APP_USER_ID || pathParts[pathParts.length - 1];

    // Heading ("Shops in 2 km"), slider, chips and the big radius number.
    homePaintRadius();

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
    marker = null;
    map = L.map('map').setView([17.3850, 78.4867], 13);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    // ---- Radius card: slider + chips ----
    const radiusSlider = document.getElementById("radiusSlider");
    addListenerOnce(radiusSlider, "input", () => {
        const km = HOME_RADIUS_STEPS[Number(radiusSlider.value)];
        if (km === undefined) return;
        homeRadiusKm = km;
        homePaintRadius(); // live label while dragging; the fetch happens on release
    });
    addListenerOnce(radiusSlider, "change", () => {
        const km = HOME_RADIUS_STEPS[Number(radiusSlider.value)];
        if (km !== undefined) homeSetRadius(km);
    });
    addListenerOnce(document.getElementById("radiusChips"), "click", (e) => {
        const btn = e.target.closest("button[data-km]");
        if (!btn) return;
        homeSetRadius(parseFloat(btn.dataset.km));
    });

    // ---- Sort button: Nearest <-> Open first ----
    addListenerOnce(document.getElementById("sortNearestBtn"), "click", () => {
        const btn = document.getElementById("sortNearestBtn");
        homeSortMode = homeSortMode === "nearest" ? "open" : "nearest";
        btn.innerHTML = `<i class="fa-solid fa-arrow-up-wide-short"></i> ${homeSortMode === "nearest" ? "Nearest" : "Open first"}`;
        homeSortCards();
    });

    // ---- Floating cart bar ----
    addListenerOnce(document.getElementById("hcbView"), "click", () => goToPage("cart"));

    // Broken hero / logo photos fall back to the gradient.
    if (!display_resturants.dataset.imgErr) {
        display_resturants.dataset.imgErr = "1";
        display_resturants.addEventListener("error", (e) => {
            const t = e.target;
            if (t && t.matches && t.matches(".hero-img, .store-logo img")) t.remove();
        }, true);
    }

    // Bound up-front (not after the network calls below) so the Add buttons
    // on cached cards work immediately.
    addListenerOnce(display_resturants, "click", function (e) {
        // --- express banner ---
        if (e.target.closest(".express-btn")) {
            e.stopPropagation();
            if (homeRadiusKm > 1) {
                homeSetRadius(1);
            } else {
                const first = display_resturants.querySelector(".store-card");
                if (first) first.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            return;
        }

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
            const addresss = card.dataset.address || "";
            const res_id = card.getAttribute("id");
            // Offline stores are still browsable; the menu page shows the
            // offline banner and disables ordering.
            navigateToMenu(name, addresss, res_id, userId, {
                distanceKm: card.dataset.distance,
                type: card.dataset.type,
                delivery: card.dataset.delivery === "true",
                radius: card.dataset.radius
            });
        }
    });

    // Real cart quantities for the preview strip + cart bar (re-synced on every Home mount).
    refreshHomeCart();

    try {
        const fetchlocation = JSON.parse(localStorage.getItem("userLocation"));
        if (fetchlocation === null) {
            const position = await getPosition();
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
            clearKhSkeleton(savedAddress);

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

                // clear stale entries before rebuilding, or this list grows on every re-run
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
            body: JSON.stringify({ latt: userLatt, long: userLong, dist: homeRadiusKm })
        });
        if (!res.ok) throw new Error(`list_resturants failed: ${res.status}`);
        const data = await res.json();
        console.log(data);
        if (data.success) {
            if (loading) loading.style.display = "none";
            if (Note) Note.style.display = "block";
            // Fresh server data is newer than anything cached client-side.
            Object.entries(data.results).forEach(([id, detail]) => storeStatus.set(id, detail.is_online !== false));
            renderRestaurants(data.results, renderContainers);
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(data.results));
        } else if (!cachedRestaurants) {
            clearKhSkeleton(display_resturants);
            alert("error loading resturants");
        }

        // Re-apply filters against whatever just got rendered.
        if (typeof window.__applyHomeFilters === "function") window.__applyHomeFilters();
    } catch (e) {
        console.error("initHomePage location/restaurant load failed", e);
        clearKhSkeleton(savedAddress);
        if (!cachedRestaurants) clearKhSkeleton(display_resturants);
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

    // "Map view" link next to the live chips: open the full-screen shop map
    // (restaurants / medical / general stores, each with its own pin).
    addListenerOnce(document.getElementById("mapViewBtn"), "click", () => {
        if (window.KiranaShopMap && typeof window.KiranaShopMap.open === "function") {
            window.KiranaShopMap.open();
        } else {
            showToast("Map isn't ready yet. Please try again.");
        }
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

    // ---- Search box + store-type pill tabs, combined ----
    // Both act on the already-rendered .store-card elements: text search
    // matches the store name, the pill-tab filter matches data-type.
    // Exposed on window so re-renders can re-apply the active filters.
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
        homePlaceExpressBanner();
    }
    window.__applyHomeFilters = applyHomeFilters;

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
    // The window-level scroll listener is swapped each run so it never
    // toggles a detached element after navigating away and back.
    const scrollTopBtn = document.getElementById("scrollTopBtn");
    if (scrollTopBtn) {
        if (scrollTopHandler) window.removeEventListener("scroll", scrollTopHandler);
        scrollTopHandler = () => scrollTopBtn.classList.toggle("show", window.scrollY > 400);
        window.addEventListener("scroll", scrollTopHandler);
        addListenerOnce(scrollTopBtn, "click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    }

    // ---- Voice search / upload-handwritten-list buttons (stubs until a backend exists) ----
    addListenerOnce(document.getElementById("voiceSearchBtn"), "click", () => {
        showToast("Voice search coming soon");
    });
    addListenerOnce(document.getElementById("uploadListBtn"), "click", () => {
        showToast("Upload handwritten list coming soon");
    });
}

/* ============================================================
   MENU PAGE (merged from menu.js)

   An SPA page: routed via the router's renderPage("menu"), rendered into
   tpl-menu, params read from sessionStorage ("menuParams").
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
            refreshCartBadgeSoon();
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
        // No restaurant context to show — bounce home.
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

    // The menu template ships with skeleton rows; if loading fails we replace
    // them with a message instead of leaving them shimmering forever.
    function showMenuLoadError() {
        if (categoryTabs) categoryTabs.innerHTML = "";
        const info = document.querySelector(".res-delivery-info");
        if (info) info.innerHTML = "";
        menuContainer.innerHTML = `
            <div class="empty-menu">
                <h3>Couldn't load the menu</h3>
                <p>Please check your connection and try again.</p>
            </div>
        `;
    }

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
        showMenuLoadError();
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
        showMenuLoadError();
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

    // ---- Footer total: updated instantly, server value only reconciles ----
    let cartTotal = Number(cartData?.results?.total) || 0;

    function renderFooterTotal() {
        if (totalAmount) totalAmount.textContent = cartTotal;
        if (footer) footer.classList.toggle("show", cartTotal > 0);
    }

    function bumpTotal(delta) {
        cartTotal = Math.max(0, Math.round((cartTotal + delta) * 100) / 100);
        renderFooterTotal();
    }

    function priceOf(itemId) {
        const m = menuItems.find(i => i.id === String(itemId));
        return m ? Number(m.price) || 0 : 0;
    }

    // opts: { add: true } from an add_to_cart reply, { update: true } from an update_cart reply
    function syncTotal(serverTotal, opts = {}) {
        refreshCartBadgeSoon();
        if (serverTotal === undefined || serverTotal === null || serverTotal === "") return;
        const t = Number(serverTotal);
        if (!Number.isFinite(t)) return;

        const otherAdds = addingItems.size - (opts.add ? 1 : 0);
        const otherUpdates = pendingMenuUpdates.size + inFlightMenuControllers.size - (opts.update ? 1 : 0);
        if (otherAdds > 0 || otherUpdates > 0) return; // newer taps still settling

        cartTotal = t;
        renderFooterTotal();
    }

    const wishlist = new Set();

    // Keep menuItems in step with what the user has in their cart.
    function setLocalQty(id, qty) {
        const match = menuItems.find(i => i.id === String(id));
        if (match) match.qty = qty;
    }

    // Swap only one item's control (ADD <-> quantity stepper) in place.
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

        // Optimistic: show quantity 1 and the new total immediately
        const itemPrice = parseInt(price) || 0;
        setLocalQty(itemId, 1);
        setItemControls(itemId, 1);
        bumpTotal(itemPrice);
        adjustCartBadge(1);

        const revert = () => {
            setLocalQty(itemId, 0);
            setItemControls(itemId, 0); // back to ADD
            bumpTotal(-itemPrice);
            adjustCartBadge(-1);
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

                syncTotal(data.Total ?? data.total, { add: true });

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

        // The old cart is being replaced, so the total is just this item.
        const previousTotal = cartTotal;
        cartTotal = parseInt(cartItem.price) || 0;
        renderFooterTotal();
        setCartBadge(1);

        const revert = () => {
            setLocalQty(itemId, 0);
            setItemControls(itemId, 0); // back to ADD
            cartTotal = previousTotal;
            renderFooterTotal();
            refreshCartBadgeSoon();
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

                syncTotal(data.Total ?? data.total, { add: true });

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

            const unitPrice = priceOf(itemId);
            qtyEl.textContent = previousQty + 1;
            setLocalQty(itemId, previousQty + 1);
            bumpTotal(unitPrice);
            adjustCartBadge(1);

            scheduleMenuCartUpdate(itemId, resId, userId, 1,
                (data) => {
                    syncTotal(data.total ?? data.Total, { update: true });
                },
                (errorMessage) => {
                    setLocalQty(itemId, previousQty);
                    setItemControls(itemId, previousQty);
                    bumpTotal(-unitPrice);
                    adjustCartBadge(-1);
                    showToast(errorMessage);
                },
                () => {
                    // Server says the store is offline: undo the optimistic +1,
                    // then flip the whole page into its offline state.
                    setLocalQty(itemId, previousQty);
                    setItemControls(itemId, previousQty);
                    bumpTotal(-unitPrice);
                    adjustCartBadge(-1);
                    applyStoreStatus(resId, false, { live: true });
                }
            );

        } else if (event.target.classList.contains("reduce")) {

            const qtyEl = item.querySelector(".item_qty");
            const previousQty = Number(qtyEl.textContent);
            const newQty = Math.max(0, previousQty - 1);
            const unitPrice = priceOf(itemId);

            setLocalQty(itemId, newQty);
            if (previousQty > 0) { bumpTotal(-unitPrice); adjustCartBadge(-1); }

            if (newQty === 0) {
                setItemControls(itemId, 0); // shows ADD instead of "0"
            } else {
                qtyEl.textContent = newQty;
            }

            scheduleMenuCartUpdate(itemId, resId, userId, -1,
                (data) => {

                    syncTotal(data.total ?? data.Total, { update: true });

                    if (data.removed) {

                        setLocalQty(itemId, 0);
                        setItemControls(itemId, 0); // ADD (or CLOSED if offline)
                    }
                },
                (errorMessage) => {
                    setLocalQty(itemId, previousQty);
                    setItemControls(itemId, previousQty);
                    if (previousQty > 0) { bumpTotal(unitPrice); adjustCartBadge(1); }
                    showToast(errorMessage);
                }
            );
        }
    });

    goCartBtn.addEventListener("click", () => {
        goToPage("cart");
    });
}

// Keep the shared header's page-scoped chrome (search bar, live chips, pill
// tabs) in sync with whichever page is actually showing. The header never gets
// swapped out by the router, so body[data-page] drives what is visible.
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


/* ============================================================
   KIRANA CASH
   Header badge (#kiranaCashBadge) -> full-screen "how it works" page
   (#kcpPage in home.html).

   - Edit KIRANA_CASH_RULES below to change the numbers shown on the page.
   - The balance defaults to 0 and is read from localStorage
     ("kiranaCash_<userId>"). When you add an API, call
     KiranaCash.set(amount) with the real balance.
   - Earning and redeeming are NOT wired to orders/checkout yet.
============================================================ */
const KIRANA_CASH_RULES = {
    earnPercent: 5,     // % of the bill returned as Kirana Cash
    minOrder: 100,      // smallest order (₹) that earns cash
    maxPerOrder: 50,    // most cash (₹) one order can earn
    expiryDays: 90      // how long a credit stays valid
};

(function () {
    "use strict";

    const R = KIRANA_CASH_RULES;
    const fmt = (n) => Number(n || 0).toLocaleString("en-IN");

    function kcUserId() {
        const parts = window.location.pathname.split("/").filter(Boolean);
        return window.APP_USER_ID || parts[parts.length - 1] || "guest";
    }
    const storageKey = () => `kiranaCash_${kcUserId()}`;

    function getBalance() {
        try {
            const v = Number(localStorage.getItem(storageKey()));
            return Number.isFinite(v) && v > 0 ? Math.floor(v) : 0;
        } catch (e) { return 0; }
    }

    function paintBalance() {
        const bal = getBalance();
        const badge = document.getElementById("kiranaCashAmount");
        if (badge) badge.textContent = fmt(bal);
        const big = document.getElementById("kcpBalance");
        if (big) big.textContent = fmt(bal);
        const worth = document.getElementById("kcpBalanceValue");
        if (worth) worth.textContent = fmt(bal); // 1 Kirana Cash = ₹1
    }

    function setBalance(amount) {
        const v = Math.max(0, Math.floor(Number(amount) || 0));
        try { localStorage.setItem(storageKey(), String(v)); } catch (e) { /* storage blocked */ }
        paintBalance();
    }

    // Fill the rule numbers from KIRANA_CASH_RULES
    function paintRules() {
        document.querySelectorAll("[data-kc-rule]").forEach((el) => {
            const key = el.dataset.kcRule;
            const map = { percent: R.earnPercent, minOrder: R.minOrder, maxPerOrder: R.maxPerOrder, expiryDays: R.expiryDays };
            if (key in map) el.textContent = fmt(map[key]);
        });
    }

    function earnFor(orderValue) {
        const v = Number(orderValue) || 0;
        if (v < R.minOrder) return 0;
        return Math.min(Math.floor((v * R.earnPercent) / 100), R.maxPerOrder);
    }

    function paintCalc() {
        const input = document.getElementById("kcpCalcInput");
        const out = document.getElementById("kcpCalcOut");
        const note = document.getElementById("kcpCalcNote");
        if (!input || !out || !note) return;

        const v = Number(input.value);
        const earn = earnFor(v);
        out.textContent = `You earn ₹${fmt(earn)}`;

        if (!input.value || !Number.isFinite(v) || v <= 0) {
            note.textContent = "Enter an order value to see your Kirana Cash.";
        } else if (v < R.minOrder) {
            note.textContent = `Add ₹${fmt(R.minOrder - v)} more to reach the ₹${fmt(R.minOrder)} minimum.`;
        } else if (earn >= R.maxPerOrder) {
            note.textContent = `That's the most one order can earn (₹${fmt(R.maxPerOrder)}).`;
        } else {
            note.textContent = `${fmt(R.earnPercent)}% of ₹${fmt(v)}, credited after your order is completed.`;
        }
    }

    let lastFocus = null;

    function openPage() {
        const page = document.getElementById("kcpPage");
        if (!page) return;
        lastFocus = document.activeElement;
        paintBalance();
        paintRules();
        paintCalc();
        page.classList.add("show");
        page.setAttribute("aria-hidden", "false");
        document.body.classList.add("kcp-open");
        const scroller = page.querySelector(".kcp-scroll");
        if (scroller) scroller.scrollTop = 0;
        document.getElementById("kcpBack")?.focus();
    }

    function closePage() {
        const page = document.getElementById("kcpPage");
        if (!page || !page.classList.contains("show")) return;
        page.classList.remove("show");
        page.setAttribute("aria-hidden", "true");
        document.body.classList.remove("kcp-open");
        if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    }

    // Badge + page controls (delegated, so they survive any DOM swaps)
    document.addEventListener("click", (e) => {
        if (e.target.closest("#kiranaCashBadge")) { openPage(); return; }
        if (e.target.closest("#kcpBack")) { closePage(); return; }
        if (e.target.closest("#kcpShop")) {
            closePage();
            goToPage("home");
        }
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") { closePage(); return; }
        if ((e.key === "Enter" || e.key === " ") && e.target && e.target.id === "kiranaCashBadge") {
            e.preventDefault();
            openPage();
        }
    });

    document.addEventListener("input", (e) => {
        if (e.target && e.target.id === "kcpCalcInput") paintCalc();
    });

    // Navigating anywhere else in the app closes the page
    document.addEventListener("spa:pageload", closePage);
    window.addEventListener("hashchange", closePage);

    window.KiranaCash = { get: getBalance, set: setBalance, open: openPage, close: closePage, earnFor };

    paintBalance();
    paintRules();
})();


/* ============================================================
   CART COUNT BADGE (small circle on the raised Cart button in the bottom nav)
   Shows the total quantity of items in the cart. Source of truth is
   /get_cart_items; the menu adjusts it instantly on every tap and the
   server value reconciles it.
============================================================ */
var cartBadgeCount = 0;
var cartBadgeTimer = null;

function paintCartBadge() {
    const link = document.querySelector('.app-navbar .nav-item[data-page="cart"]');
    if (!link) return;

    let badge = link.querySelector(".cart-count-badge");
    if (!badge) {
        if (!document.getElementById("cartBadgeStyle")) {
            const st = document.createElement("style");
            st.id = "cartBadgeStyle";
            st.textContent = `
                .app-navbar .nav-item[data-page="cart"] { position: relative; }
                .cart-count-badge {
                    position: absolute; top: -20px; left: 50%; margin-left: 10px;
                    min-width: 20px; height: 20px; padding: 0 5px; box-sizing: border-box;
                    border-radius: 999px; background: #1B231F; color: #fff;
                    font-size: 11px; font-weight: 800; line-height: 20px; text-align: center;
                    box-shadow: 0 0 0 2px #fff; pointer-events: none;
                }
                .cart-count-badge[hidden] { display: none; }
            `;
            document.head.appendChild(st);
        }
        badge = document.createElement("span");
        badge.className = "cart-count-badge";
        badge.setAttribute("aria-hidden", "true");
        link.appendChild(badge);
    }

    const n = Math.max(0, cartBadgeCount);
    badge.hidden = n === 0;
    badge.textContent = n > 99 ? "99+" : String(n);
    link.setAttribute("aria-label", n ? `Cart, ${n} item${n === 1 ? "" : "s"}` : "Cart");
}

function setCartBadge(n) {
    cartBadgeCount = Math.max(0, Math.floor(Number(n) || 0));
    paintCartBadge();
}

function adjustCartBadge(delta) {
    setCartBadge(cartBadgeCount + delta);
}

async function refreshCartBadge() {
    try {
        const res = await fetch("/get_cart_items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userid: currentUserId() })
        });
        if (!res.ok) return;
        const data = await readJsonSafe(res);
        if (!data || !data.success) return;

        // Skip while taps are still settling, so a stale reply can't undo them.
        if (pendingMenuUpdates.size > 0 || inFlightMenuControllers.size > 0) return;

        let count = 0;
        Object.values((data.results && data.results.cart) || {}).forEach((r) => {
            Object.values((r && r.items) || {}).forEach((it) => { count += Number(it.qty) || 0; });
        });
        setCartBadge(count);
    } catch (e) {
        console.warn("cart badge refresh failed", e);
    }
}

function refreshCartBadgeSoon() {
    clearTimeout(cartBadgeTimer);
    cartBadgeTimer = setTimeout(refreshCartBadge, 350);
}

document.addEventListener("spa:pageload", refreshCartBadgeSoon);
document.addEventListener("visibilitychange", () => { if (!document.hidden) refreshCartBadgeSoon(); });
paintCartBadge();
refreshCartBadge();

/* ============================================================
   SHOP MAP  (paste at the very END of home.js)

   "Map view" in the live row opens a full-screen map with every shop
   from the Home list (restaurants, medical, general stores), each type
   with its own coloured pin. Tap a pin -> popup -> "View menu".

   Exposed as window.KiranaShopMap.open() / .close().
   Builds its own markup + CSS, so home.html needs no changes.

   Coordinates: reads them from the /list_resturants results if present
   (latt/lat/latitude + long/lng/lon/longitude, or coordinates / location
   as {latt,long} or GeoJSON). Shops without coordinates are looked up
   once from their address (OpenStreetMap) and cached in localStorage.
   ============================================================ */
(function () {
    "use strict";

    const PIN = {
        restaurant:    { label: "Restaurants",    icon: "🍽️", color: "#D2602A" },
        medical:       { label: "Medical",        icon: "💊", color: "#0F6E5C" },
        general_store: { label: "General stores", icon: "🛒", color: "#1F5FA8" }
    };
    const PIN_DEFAULT = { label: "Other", icon: "🏪", color: "#2A7F4B" };
    const pinOf = (type) => PIN[type] || PIN_DEFAULT;

    let overlay = null, shopMap = null, shopLayer = null, meLayer = null;
    let entries = [];            // { id, type, detail, marker }
    let activeType = "all";
    let runToken = 0;            // cancels an old geocode run when the map reopens/closes
    let unplaced = 0;
    let me = null;               // L.LatLng of the user
    let lastFocus = null;

    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

    function injectStyle() {
        if (document.getElementById("smapStyle")) return;
        const st = document.createElement("style");
        st.id = "smapStyle";
        st.textContent = `
            body.smap-open { overflow: hidden; }
            .smap-page { position: fixed; inset: 0; z-index: 4900; display: flex; flex-direction: column; background: #faf7f2; color: #1f2937; transform: translateY(100%); visibility: hidden; transition: transform .3s ease, visibility 0s linear .3s; }
            .smap-page.show { transform: none; visibility: visible; transition: transform .3s ease; }
            .smap-top { display: flex; align-items: center; gap: 12px; flex-shrink: 0; padding: calc(12px + env(safe-area-inset-top, 0px)) 16px 10px; background: #fff; }
            .smap-back { width: 38px; height: 38px; border: 0; border-radius: 50%; background: #f3f4f6; color: inherit; font-size: 15px; cursor: pointer; }
            .smap-top h1 { margin: 0; font-size: 18px; font-weight: 700; }
            .smap-top p { margin: 2px 0 0; font-size: 12px; color: #6b7280; }
            .smap-chips { display: flex; gap: 8px; flex-shrink: 0; padding: 0 16px 12px; background: #fff; border-bottom: 1px solid #eee; overflow-x: auto; scrollbar-width: none; }
            .smap-chips::-webkit-scrollbar { display: none; }
            .smap-chip { flex-shrink: 0; display: inline-flex; align-items: center; gap: 6px; padding: 7px 12px; border: 1px solid #e5e7eb; border-radius: 999px; background: #fff; font: inherit; font-size: 13px; font-weight: 600; color: #374151; cursor: pointer; }
            .smap-chip i { width: 10px; height: 10px; border-radius: 50%; background: var(--c, #2A7F4B); display: inline-block; }
            .smap-chip b { font-weight: 700; color: #6b7280; }
            .smap-chip.active { background: #1f2937; border-color: #1f2937; color: #fff; }
            .smap-chip.active b { color: #d1d5db; }
            .smap-map { flex: 1; min-height: 0; }
            .smap-note { position: absolute; left: 50%; bottom: calc(18px + env(safe-area-inset-bottom, 0px)); transform: translateX(-50%); z-index: 1000; max-width: calc(100% - 32px); padding: 8px 14px; border-radius: 999px; background: rgba(31, 41, 55, .92); color: #fff; font-size: 12.5px; text-align: center; pointer-events: none; }
            .smap-note:empty { display: none; }

            .smap-pin { width: 34px; height: 34px; border-radius: 50% 50% 50% 0; transform: rotate(-45deg); background: var(--c, #2A7F4B); border: 2px solid #fff; box-shadow: 0 3px 8px rgba(0, 0, 0, .35); display: flex; align-items: center; justify-content: center; }
            .smap-pin span { transform: rotate(45deg); font-size: 16px; line-height: 1; }
            .smap-pin.off { filter: grayscale(1); opacity: .65; }
            .smap-me { position: relative; width: 18px; height: 18px; border-radius: 50%; background: #2563eb; border: 3px solid #fff; box-shadow: 0 0 0 1px rgba(37, 99, 235, .4); }
            .smap-me::after { content: ""; position: absolute; inset: -10px; border-radius: 50%; background: rgba(37, 99, 235, .25); animation: smapPulse 1.8s ease-out infinite; }
            @keyframes smapPulse { from { transform: scale(.4); opacity: 1; } to { transform: scale(1.3); opacity: 0; } }
            @media (prefers-reduced-motion: reduce) { .smap-page, .smap-page.show { transition: none; } .smap-me::after { animation: none; } }

            .smap-pop { display: flex; flex-direction: column; gap: 4px; min-width: 150px; font-family: 'Inter', sans-serif; }
            .smap-pop strong { font-size: 14px; }
            .smap-pop span { font-size: 12px; color: #6b7280; }
            .smap-pop .on { color: #157a3a; font-weight: 600; }
            .smap-pop .off { color: #c2300a; font-weight: 600; }
            .smap-pop button { margin-top: 6px; border: 0; border-radius: 8px; padding: 8px 10px; background: #157a3a; color: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
        `;
        document.head.appendChild(st);
    }

    function build() {
        if (overlay) return;
        injectStyle();

        overlay = document.createElement("div");
        overlay.className = "smap-page";
        overlay.setAttribute("role", "dialog");
        overlay.setAttribute("aria-modal", "true");
        overlay.setAttribute("aria-label", "Shops near you");
        overlay.setAttribute("aria-hidden", "true");
        overlay.innerHTML = `
            <div class="smap-top">
                <button type="button" class="smap-back" aria-label="Back"><i class="fa-solid fa-arrow-left"></i></button>
                <div><h1>Shops near you</h1><p class="smap-sub"></p></div>
            </div>
            <div class="smap-chips" role="group" aria-label="Filter by shop type"></div>
            <div class="smap-map"></div>
            <div class="smap-note" role="status" aria-live="polite"></div>
        `;
        document.body.appendChild(overlay);

        shopMap = L.map(overlay.querySelector(".smap-map"), { zoomControl: false }).setView([17.385, 78.4867], 13);
        L.control.zoom({ position: "bottomright" }).addTo(shopMap);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { attribution: "© OpenStreetMap" }).addTo(shopMap);
        meLayer = L.layerGroup().addTo(shopMap);
        shopLayer = L.layerGroup().addTo(shopMap);

        overlay.querySelector(".smap-back").addEventListener("click", close);
        overlay.querySelector(".smap-chips").addEventListener("click", (e) => {
            const chip = e.target.closest(".smap-chip");
            if (!chip) return;
            activeType = chip.dataset.type;
            applyFilter();
            fit();
        });

        // popup "View menu" button
        shopMap.on("popupopen", (e) => {
            const btn = e.popup.getElement()?.querySelector(".smap-open-menu");
            if (!btn) return;
            btn.addEventListener("click", () => openShopMenu(btn.dataset.id));
        });
    }

    // ---------- data ----------
    function loadResults() {
        try {
            return JSON.parse(sessionStorage.getItem(getRestaurantCacheKey(currentUserId())) || "null") || {};
        } catch (e) { return {}; }
    }

    function pick() {
        for (const v of arguments) {
            const n = parseFloat(v);
            if (Number.isFinite(n)) return n;
        }
        return null;
    }

    function coordsOf(d) {
        const c = d.coordinates || d.location || d.coords || d.geo || {};
        const arr = Array.isArray(c) ? c : (Array.isArray(c.coordinates) ? c.coordinates : null);
        if (arr && arr.length >= 2) { // GeoJSON order: [lng, lat]
            const lng = parseFloat(arr[0]), lat = parseFloat(arr[1]);
            if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
        }
        const lat = pick(d.latt, d.lat, d.latitude, c.latt, c.lat, c.latitude);
        const lng = pick(d.long, d.lng, d.lon, d.longitude, c.long, c.lng, c.lon, c.longitude);
        return lat !== null && lng !== null ? { lat, lng } : null;
    }

    function isOnline(id, d) {
        return storeStatus.has(id) ? storeStatus.get(id) : d.is_online !== false;
    }

    // ---------- markers ----------
    function iconFor(type, online) {
        const p = pinOf(type);
        return L.divIcon({
            className: "",
            html: `<div class="smap-pin${online ? "" : " off"}" style="--c:${p.color}"><span>${p.icon}</span></div>`,
            iconSize: [34, 34],
            iconAnchor: [17, 41],
            popupAnchor: [0, -38]
        });
    }

    function popupHtml(id, d, online) {
        const p = pinOf(d.type);
        const km = Number(d.distance_km);
        const dist = Number.isFinite(km) ? `${km.toFixed(1)} km` : "";
        const hasDelivery = String(d.delivery_available).toLowerCase() === "true";
        const eta = KiranaUtils.etaRange(d.distance_km).label;
        const status = !online ? "Offline" : (hasDelivery ? `Open • ${eta} min` : "Open • Pickup only");
        return `
            <div class="smap-pop">
                <strong>${escapeHtml(d.res_name || "")}</strong>
                <span>${escapeHtml(p.label.replace(/s$/, ""))}${dist ? " • " + escapeHtml(dist) : ""}</span>
                <span class="${online ? "on" : "off"}">${escapeHtml(status)}</span>
                <button type="button" class="smap-open-menu" data-id="${escapeHtml(id)}">View menu</button>
            </div>`;
    }

    function addShop(id, d, pos) {
        if (entries.some((e) => e.id === id)) return;
        const online = isOnline(id, d);
        const marker = L.marker([pos.lat, pos.lng], { icon: iconFor(d.type, online), title: d.res_name || "" });
        marker.bindPopup(() => popupHtml(id, d, isOnline(id, d)));
        entries.push({ id, type: d.type || "other", detail: d, marker });
        applyFilter();
    }

    function visible(e) {
        return activeType === "all" || e.type === activeType;
    }

    function applyFilter() {
        entries.forEach((e) => {
            const show = visible(e);
            const on = shopLayer.hasLayer(e.marker);
            if (show && !on) shopLayer.addLayer(e.marker);
            if (!show && on) shopLayer.removeLayer(e.marker);
        });

        // legend chips with counts
        const counts = {};
        entries.forEach((e) => { counts[e.type] = (counts[e.type] || 0) + 1; });
        const chips = [`<button type="button" class="smap-chip${activeType === "all" ? " active" : ""}" data-type="all" style="--c:#1f2937"><i></i>All <b>${entries.length}</b></button>`];
        Object.keys(PIN).forEach((t) => {
            chips.push(`<button type="button" class="smap-chip${activeType === t ? " active" : ""}" data-type="${t}" style="--c:${PIN[t].color}"><i></i>${PIN[t].label} <b>${counts[t] || 0}</b></button>`);
        });
        overlay.querySelector(".smap-chips").innerHTML = chips.join("");

        const shown = entries.filter(visible).length;
        overlay.querySelector(".smap-sub").textContent =
            `${shown} shop${shown === 1 ? "" : "s"} within ${homeFormatKm(homeRadiusKm)}`;
    }

    function fit() {
        const pts = entries.filter(visible).map((e) => e.marker.getLatLng());
        if (me) pts.push(me);
        if (pts.length > 1) shopMap.fitBounds(L.latLngBounds(pts), { padding: [48, 48], maxZoom: 16 });
        else if (pts.length === 1) shopMap.setView(pts[0], 15);
    }

    function setNote(text) {
        const n = overlay && overlay.querySelector(".smap-note");
        if (n) n.textContent = text || "";
    }

    // Looks up shops that came without coordinates, one per ~1.1s (OSM limit), cached forever.
    async function geocodeMissing(list, token) {
        for (const item of list) {
            if (token !== runToken) return;
            const key = `shopGeo_${item.id}`;
            let pos = null;
            try { pos = JSON.parse(localStorage.getItem(key)); } catch (e) { /* ignore */ }

            if (!pos && item.detail.address) {
                await sleep(1100);
                if (token !== runToken) return;
                try {
                    const q = `${item.detail.address}, Hyderabad`;
                    const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=in&q=${encodeURIComponent(q)}`);
                    const j = r.ok ? await r.json() : [];
                    if (j[0]) {
                        pos = { lat: parseFloat(j[0].lat), lng: parseFloat(j[0].lon) };
                        try { localStorage.setItem(key, JSON.stringify(pos)); } catch (e) { /* ignore */ }
                    }
                } catch (e) { /* leave unplaced */ }
            }

            if (pos && Number.isFinite(pos.lat) && Number.isFinite(pos.lng)) addShop(item.id, item.detail, pos);
            else unplaced += 1;
        }
        if (token !== runToken) return;
        fit();
        setNote(unplaced ? `${unplaced} shop${unplaced === 1 ? "" : "s"} couldn't be placed on the map` : "");
    }

    function render() {
        runToken += 1;
        const token = runToken;
        entries = [];
        unplaced = 0;
        activeType = "all";
        shopLayer.clearLayers();
        meLayer.clearLayers();
        setNote("");

        // you + search radius
        me = null;
        try {
            const loc = JSON.parse(localStorage.getItem("userLocation"));
            if (loc && Number.isFinite(parseFloat(loc.latt)) && Number.isFinite(parseFloat(loc.long))) {
                me = L.latLng(parseFloat(loc.latt), parseFloat(loc.long));
                L.circle(me, { radius: homeRadiusKm * 1000, color: "#2563eb", weight: 1, fillColor: "#2563eb", fillOpacity: 0.06, interactive: false }).addTo(meLayer);
                L.marker(me, {
                    icon: L.divIcon({ className: "", html: '<div class="smap-me"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
                    interactive: false, keyboard: false
                }).addTo(meLayer);
            }
        } catch (e) { /* ignore */ }

        const results = loadResults();
        const missing = [];
        Object.entries(results).forEach(([id, d]) => {
            const pos = coordsOf(d);
            if (pos) addShop(id, d, pos); else missing.push({ id, detail: d });
        });

        applyFilter();
        fit();

        if (!Object.keys(results).length) setNote("No shops to show yet. Go back and wait for the list to load.");
        else if (missing.length) {
            setNote(`Placing ${missing.length} more shop${missing.length === 1 ? "" : "s"}…`);
            geocodeMissing(missing, token);
        }
    }

    function openShopMenu(id) {
        const e = entries.find((x) => x.id === id);
        if (!e) return;
        const d = e.detail;
        close();
        navigateToMenu(d.res_name || "", d.address || "", id, currentUserId(), {
            distanceKm: d.distance_km,
            type: d.type,
            delivery: String(d.delivery_available).toLowerCase() === "true",
            radius: d.delivery_radius
        });
    }

    function open() {
        if (typeof L === "undefined") { showToast("Map couldn't load. Please refresh."); return; }
        build();
        lastFocus = document.activeElement;
        overlay.classList.add("show");
        overlay.setAttribute("aria-hidden", "false");
        document.body.classList.add("smap-open");
        // Leaflet needs the container to have its final size before drawing
        setTimeout(() => { shopMap.invalidateSize(); render(); }, 320);
        overlay.querySelector(".smap-back").focus();
    }

    function close() {
        if (!overlay || !overlay.classList.contains("show")) return;
        runToken += 1; // stop any running address lookups
        overlay.classList.remove("show");
        overlay.setAttribute("aria-hidden", "true");
        document.body.classList.remove("smap-open");
        if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus();
    }

    // a seller toggled a shop while the map is open -> restyle its pin
    document.addEventListener("store:status", (e) => {
        if (!overlay || !overlay.classList.contains("show")) return;
        const entry = entries.find((x) => x.id === String(e.detail.resId));
        if (entry) entry.marker.setIcon(iconFor(entry.type, e.detail.online));
    });

    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
    document.addEventListener("spa:pageload", close);
    window.addEventListener("hashchange", close);

    window.KiranaShopMap = { open, close };
})();