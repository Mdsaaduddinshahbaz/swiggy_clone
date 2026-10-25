// =====================================================================
// Cart page
// =====================================================================

const pendingUpdates = new Map();  // itemId -> { timer, accumulatedDelta, resId, userId, onSuccess, onFailure }
const inFlightRequests = new Map(); // itemId -> Promise (requests per item are serialized, never aborted)
let activeInit = null;              // AbortController of the currently active page init

// ---------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------
function haversineKm(lat1, lon1, lat2, lon2) {
    const toRad = (d) => (d * Math.PI) / 180;
    const R = 6371;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
}
function escapeHtml(str) {
    return String(str ?? "").replace(/[&<>"']/g, (c) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[c]);
}

function safeStorageGet(storage, key) {
    try { return storage.getItem(key); } catch (e) { return null; }
}
function safeStorageSet(storage, key, value) {
    try { storage.setItem(key, value); } catch (e) { /* storage full / blocked */ }
}
function safeStorageRemove(storage, key) {
    try { storage.removeItem(key); } catch (e) { /* ignore */ }
}

// Parses a response body without throwing (503/400 bodies carry the message we want).
async function cartJson(response) {
    try { return await response.json(); } catch (e) { return null; }
}

// Prefer the app's toast (defined in home.js); fall back to alert if it isn't there.
function notify(message) {
    if (typeof showToast === "function" && document.getElementById("toast")) {
        showToast(message);
    } else {
        alert(message);
    }
}

function goToPage(page) {
    // spa_router.js declares renderPage() at top level, so it is global.
    // Calling it directly is the same thing the nav links do on click.
    if (typeof window.renderPage === "function") {
        window.renderPage(page);
        return;
    }
    const link = document.querySelector(`.app-navbar .nav-item[data-page="${page}"]`);
    if (link) link.click();
    else window.location.hash = `#${page}`;
}

function getPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation is not supported by your browser"));
            return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 15000,
            maximumAge: 60000
        });
    });
}

async function reverseGeocode(lat, lon) {
    const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}`
    );
    if (!response.ok) throw new Error(`reverse geocode failed: ${response.status}`);

    const data = await response.json();
    const a = data.address || {};

    const parts = [
        a.suburb || a.neighbourhood || a.road,
        a.city || a.town || a.village || a.county
    ].filter(Boolean);

    return parts.length ? parts.join(", ") : (data.display_name || "");
}

function isValidPhone(phone) {
    // 10-digit Indian mobile number, optionally prefixed with +91 / 91 / 0
    return /^(?:\+?91|0)?[6-9]\d{9}$/.test((phone || "").trim());
}

function normalizePhone(phone) {
    // Strip spaces/dashes first, then the country / trunk prefix
    const cleaned = (phone || "").replace(/[\s-]/g, "");
    return cleaned.replace(/^(?:\+?91|0)(?=\d{10}$)/, "");
}

// ---------------------------------------------------------------
// Debounced, serialized cart updates
// ---------------------------------------------------------------

// onOffline is optional: called instead of onFailure when the server answers
// 503 STORE_OFFLINE (increments are blocked while the store is offline).
function scheduleCartUpdate(itemId, resId, userId, delta, onSuccess, onFailure, onOffline) {
    let entry = pendingUpdates.get(itemId);

    if (entry) {
        entry.accumulatedDelta += delta;
        clearTimeout(entry.timer);
    } else {
        entry = { accumulatedDelta: delta, timer: null };
        pendingUpdates.set(itemId, entry);
    }

    // The latest call's callbacks win, since only the last timer ever fires.
    entry.timer = setTimeout(() => {
        const netDelta = entry.accumulatedDelta;
        pendingUpdates.delete(itemId); // new clicks now start a fresh batch

        // Clicks cancelled out (+1 then -1): UI is already correct.
        if (netDelta === 0) return;

        // Chain after any earlier request for this item so the server always
        // sees updates in order. (Aborting a request does NOT stop the server
        // from processing it, which could silently lose or double-apply deltas.)
        const previous = inFlightRequests.get(itemId) || Promise.resolve();

        const current = previous.then(async () => {
            try {
                const res = await fetch("/update_cart", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        user_id: userId,
                        res_id: resId,
                        item_id: itemId,
                        qty: netDelta
                    })
                });

                const data = await cartJson(res);

                if (res.status === 503 && data && data.code === "STORE_OFFLINE") {
                    if (onOffline) onOffline(); else onFailure(data.message);
                    return;
                }

                if (!res.ok && !data) throw new Error(`update_cart failed: ${res.status}`);

                if (data && data.success) {
                    onSuccess(data);
                } else {
                    onFailure((data && data.message) || "Failed updating cart");
                }
            } catch (err) {
                console.error("cart update failed", err);
                onFailure("Network error");
            }
        });

        inFlightRequests.set(itemId, current);
        current.finally(() => {
            if (inFlightRequests.get(itemId) === current) inFlightRequests.delete(itemId);
        });
    }, 400);
}

// ---------------------------------------------------------------
// Page init
// ---------------------------------------------------------------

async function initCartPage() {

    const cart_items_container = document.getElementById("cart_items");
    if (!cart_items_container) return;

    // Tear down any previous init so listeners are never attached twice
    if (activeInit) activeInit.abort();
    const ac = new AbortController();
    activeInit = ac;
    const { signal } = ac;
    const on = (el, type, fn) => { if (el) el.addEventListener(type, fn, { signal }); };

    const pathParts = window.location.pathname.split("/").filter(Boolean);
    const userId = window.APP_USER_ID || pathParts[pathParts.length - 1];

    const heading = document.querySelector(".res-info h4");
    if (heading) heading.innerText = "Order List";

    const placeorder = document.getElementById("placeorder");
    const orderBtn = document.getElementById("orderBtn");
    const totalPrice = document.getElementById("totalPrice");
    const toPay = document.getElementById("toPay");

    const addressChgBtn = document.getElementById("ChangeAdrs");
    const deliveryAdrs = document.getElementById("Deliveryaddress");
    const typeaddrs = document.getElementById("type");

    const box = document.getElementById("addressOptions");
    const overlay = document.getElementById("locationOverlay");
    const savedAddressList = document.getElementById("savedAddressList");
    const addAddressBtn = document.getElementById("addAddressBtn");
    const addAddressForm = document.getElementById("addAddressForm");
    const newAddrType = document.getElementById("newAddrType");
    const newAddrText = document.getElementById("newAddrText");
    const newAddrPhone = document.getElementById("newAddrPhone");
    const useLocationForNewAddr = document.getElementById("useLocationForNewAddr");
    const saveAddressBtn = document.getElementById("saveAddressBtn");
    const cancelAddressBtn = document.getElementById("cancelAddressBtn");

    const pickupSheet = document.getElementById("pickupSheet");
    const pickupTimeInput = document.getElementById("pickupTimeInput");
    const pickupError = document.getElementById("pickupError");
    const confirmPickupBtn = document.getElementById("confirmPickupBtn");

    const addressCard = document.getElementById("addressCard");
    const deliveryWarning = document.getElementById("deliveryWarning");
    const orderTypeBox = document.getElementById("orderTypeOptions");
    const optDelivery = document.getElementById("optDelivery");
    const deliveryNote = document.getElementById("deliveryNote");
    const cashLabel = document.getElementById("cashLabel");
    const deliveryRadio = document.querySelector('input[name="orderType"][value="delivery"]');
    const pickupRadio = document.querySelector('input[name="orderType"][value="pickup"]');
    const no_order_container = document.getElementById("No_orders_container");
    const cartContainer = document.querySelector(".cart-container");

    const deliveryTimeCard = document.getElementById("deliveryTimeCard");
    const deliveryNowEta = document.getElementById("deliveryNowEta");
    const slotPicker = document.getElementById("slotPicker");
    const slotDayTabs = document.getElementById("slotDayTabs");
    const slotGrid = document.getElementById("slotGrid");
    const slotError = document.getElementById("slotError");

    const CART_CACHE_KEY = `cachedCart_${userId}`;
    const SELECTED_ADDR_KEY = `selectedAddress_${userId}`;
    const ORDER_TYPE_KEY = `orderType_${userId}`;

    /*
        restaurants = {
            "<res_id>": {
                name: "New kirana",
                items: { "<item_id>": { name, price, qty, available_qty } },
                delivery: { delivery_available, delivery_radius, long, latt, is_online }
            }
        }
    */
    let restaurants = {};
    let newAddrCoords = null; // { lat, long }
    let editingIdx = null;    // index into `addresses` when editing, else null
    let addresses = [];       // [{ _id, adrs_type, address, phone, coordinates: { long, latt } }]
    let selectedAddressId = null;
    let selectedAddress = null;
    let preferredOrderType = safeStorageGet(localStorage, ORDER_TYPE_KEY) === "delivery" ? "delivery" : "pickup";
    let deliveryMode = "now";     // "now" | "scheduled"
    let slotDay = "today";        // "today" | "tomorrow"
    let selectedSlot = null;      // { date: "YYYY-MM-DD", time: "HH:MM", label }

    // ---------------------------------------------------------------
    // Cart helpers
    // ---------------------------------------------------------------

    function isCartEmpty(cart) {
        if (!cart) return true;
        return Object.values(cart).every(
            (r) => !r || !r.items || Object.keys(r.items).length === 0
        );
    }

    // Returns { resId, res, item } or null
    function findItem(itemId, resId) {
        if (resId && restaurants[resId]?.items?.[itemId]) {
            return { resId, res: restaurants[resId], item: restaurants[resId].items[itemId] };
        }
        for (const [rid, r] of Object.entries(restaurants)) {
            if (r?.items?.[itemId]) return { resId: rid, res: r, item: r.items[itemId] };
        }
        return null;
    }

    function persistCart() {
        safeStorageSet(sessionStorage, CART_CACHE_KEY, JSON.stringify(restaurants));
    }

    // ---------------------------------------------------------------
    // Store online / offline
    //
    // The server sends the live state in cart[res_id].delivery.is_online
    // (never from a stale cache). After that it's kept fresh by:
    //   - "store:status" events (dispatched by home.js's socket handler)
    //   - "store:resync"  events (socket reconnect / tab visible again)
    //   - a 503 STORE_OFFLINE from /update_cart or /store_orders
    // Increments and Place Order are blocked while offline; reducing and
    // removing items stays allowed so the user can clean up their cart.
    // ---------------------------------------------------------------

    let cartBanner = null;
    let bannerTimer = null;
    let backOnlineUntil = 0;   // timestamp: show the green "back online" banner until then

    function getStoreId() {
        return Object.keys(restaurants)[0] || null;   // cart is single-restaurant
    }

    function getStoreName() {
        const id = getStoreId();
        return (id && restaurants[id]?.name) || "This store";
    }

    // Unknown (no delivery info) counts as online; the server enforces it anyway.
    function isStoreOnline() {
        const d = getDeliveryInfo();
        return !d || d.is_online !== false;
    }

    function ensureBanner() {
        if (cartBanner && document.body.contains(cartBanner)) return cartBanner;
        document.getElementById("cartStoreBanner")?.remove();

        cartBanner = document.createElement("div");
        cartBanner.id = "cartStoreBanner";
        cartBanner.className = "store-banner";
        cartBanner.hidden = true;
        cartBanner.setAttribute("role", "status");
        cartBanner.setAttribute("aria-live", "polite");
        cartContainer.parentNode.insertBefore(cartBanner, cartContainer);
        return cartBanner;
    }

    function renderStoreBanner() {
        if (!cartContainer) return;
        const banner = ensureBanner();
        clearTimeout(bannerTimer);

        const hide = () => {
            banner.hidden = true;
            banner.className = "store-banner";
            banner.innerHTML = "";
        };

        if (isCartEmpty(restaurants)) { hide(); return; }

        const name = escapeHtml(getStoreName());

        if (!isStoreOnline()) {
            banner.hidden = false;
            banner.className = "store-banner is-offline";
            banner.innerHTML = `
                <div class="store-banner-icon"><i class="fa-solid fa-store-slash"></i></div>
                <div class="store-banner-text">
                    <strong>${name} is currently offline</strong>
                    <span>You can't place this order right now. Your items are saved — come back when they're open, or remove items below.</span>
                </div>`;
        } else if (Date.now() < backOnlineUntil) {
            banner.hidden = false;
            banner.className = "store-banner is-online";
            banner.innerHTML = `
                <div class="store-banner-icon"><i class="fa-solid fa-circle-check"></i></div>
                <div class="store-banner-text">
                    <strong>${name} is back online</strong>
                    <span>You can place your order now.</span>
                </div>`;
            bannerTimer = setTimeout(renderStoreBanner, backOnlineUntil - Date.now() + 50);
        } else {
            hide();
        }
    }

    // Single place that applies a status change to the cart page.
    function applyOnlineState(online, live) {
        const id = getStoreId();
        if (!id) return;

        const restaurant = restaurants[id];
        if (!restaurant.delivery) restaurant.delivery = {};

        const was = restaurant.delivery.is_online !== false;
        restaurant.delivery.is_online = online;
        persistCart();

        if (was === online) return;

        if (online) {
            backOnlineUntil = Date.now() + 5000;
            if (live) notify(`${getStoreName()} is back online`);
        } else {
            backOnlineUntil = 0;
            // Don't leave a checkout sheet open over an order that can't go through.
            closePickupSheet();
            if (!box?.classList.contains("show")) overlay?.classList.remove("show");
            if (live) notify(`${getStoreName()} just went offline`);
        }

        renderCart(restaurants);
    }

    // ---------------------------------------------------------------
    // Order type (pickup / delivery) + delivery range check
    // ---------------------------------------------------------------

    // Delivery info comes from /get_cart_items (cart is single-restaurant)
    function getDeliveryInfo() {
        const first = Object.values(restaurants)[0];
        return first?.delivery || null;
    }

    function isDeliveryOffered() {
        const d = getDeliveryInfo();
        return !!(d && d.delivery_available);
    }

    // Delivery is only effective if the shop offers it
    function getOrderType() {
        return preferredOrderType === "delivery" && isDeliveryOffered() ? "delivery" : "pickup";
    }

    // Returns { ok, message }
    function checkDelivery() {
        if (getOrderType() !== "delivery") return { ok: true, message: "" };

        const d = getDeliveryInfo();
        if (!selectedAddress || !selectedAddress.coordinates) {
            return { ok: false, message: "Please select a delivery address." };
        }
        if (d.long == null || d.latt == null) {
            return { ok: false, message: "Couldn't verify the shop's location. Please select pickup." };
        }

        const km = haversineKm(
            Number(selectedAddress.coordinates.latt), Number(selectedAddress.coordinates.long),
            Number(d.latt), Number(d.long)
        );

        if (km > Number(d.delivery_radius)) {
            return {
                ok: false,
                message: `Your location is ${km.toFixed(1)} km away, which is outside this shop's ${d.delivery_radius} km delivery range. Please try changing the location or select pickup.`
            };
        }
        return { ok: true, message: "" };
    }

    function updateOrderTypeUI() {
        const offered = isDeliveryOffered();
        const type = getOrderType();
        const d = getDeliveryInfo();

        if (cashLabel) {
            cashLabel.textContent = type === "delivery" ? "💵 Cash on Delivery" : "🏪 Pay at shop";
        }

        if (deliveryRadio) deliveryRadio.disabled = !offered;
        optDelivery?.classList.toggle("disabled", !offered);
        if (deliveryNote) {
            deliveryNote.textContent = offered
                ? `(within ${d.delivery_radius} km)`
                : "(not offered by this shop)";
        }
        if (deliveryRadio) deliveryRadio.checked = type === "delivery";
        if (pickupRadio) pickupRadio.checked = type === "pickup";

        if (addressCard) addressCard.style.display = type === "delivery" ? "" : "none";
        updateDeliveryTimeUI();

        const check = checkDelivery();
        if (deliveryWarning) {
            deliveryWarning.textContent = check.message;
            deliveryWarning.classList.toggle("show", !check.ok);
        }

        const online = isStoreOnline();
        if (placeorder) {
            // Remember the button's original markup so we can restore it.
            if (placeorder.dataset.origHtml === undefined) placeorder.dataset.origHtml = placeorder.innerHTML;
            placeorder.innerHTML = online ? placeorder.dataset.origHtml : "Store is offline";
            placeorder.disabled = !check.ok || !online;
        }
    }

    // ---------------------------------------------------------------
    // Cart rendering
    // ---------------------------------------------------------------

    function renderCart(cart) {
        if (!cartContainer) return 0;

        const cl = cartContainer.querySelector(".cart-left");
        const cr = cartContainer.querySelector(".cart-right");

        if (isCartEmpty(cart)) {
            cart_items_container.innerHTML = "";

            // Hide (don't destroy) the panels so later renders still work
            if (cl) cl.style.display = "none";
            if (cr) cr.style.display = "none";

            cartContainer.style.display = "block";
            if (no_order_container) no_order_container.classList.add("show");

            if (totalPrice) totalPrice.innerText = 0;
            if (toPay) toPay.innerText = 0;
            renderStoreBanner();
            renderStoreHeader();
            return 0;
        }

        if (cl) cl.style.display = "";
        if (cr) cr.style.display = "";
        if (no_order_container) no_order_container.classList.remove("show");

        const storeOnline = isStoreOnline();
        let total = 0;

        const html = Object.entries(cart).map(([res_id, r]) => {
            const items = r?.items || {};
            if (Object.keys(items).length === 0) return "";

            const itemsHtml = Object.entries(items).map(([item_id, detail]) => {
                const price = Number(detail.price) || 0;
                const qty = Number(detail.qty) || 0;
                total += price * qty;

                const atMax = detail.available_qty != null && qty >= detail.available_qty;
                const disableIncrease = atMax || !storeOnline;

                return `
                <div class="cart-item" id="${escapeHtml(item_id)}" data-res-id="${escapeHtml(res_id)}">
                    <span class="veg-icon">
                        <i class="fa-regular fa-circle-stop"></i>
                    </span>

                    <span class="item-name">
                        ${escapeHtml(detail.name)} x ${escapeHtml(qty)}
                    </span>

                    <div class="quantity-control">
                        <button type="button" class="qty-btn reduce">-</button>
                        <span class="item_qty">${escapeHtml(qty)}</span>
                        <button type="button" class="qty-btn increase${storeOnline ? "" : " is-store-offline"}" ${disableIncrease ? "disabled" : ""}>+</button>
                    </div>

                    <span class="unit-price">${escapeHtml(price)}</span>
                    <span class="item-price">${escapeHtml(price * qty)}</span>
                </div>
                `;
            }).join("");

            return `
                <div class="cart-restaurant" data-res-id="${escapeHtml(res_id)}">
                    <div class="cart-restaurant-name">${escapeHtml(r.name || "Store")}</div>
                    <hr>
                    ${itemsHtml}
                </div>
            `;
        }).join("");

        cart_items_container.innerHTML = html;
        if (totalPrice) totalPrice.innerText = total;
        if (toPay) toPay.innerText = total;
        renderStoreBanner();
        renderStoreHeader();
        updateOrderTypeUI();
        return total;
    }

    // ---------------------------------------------------------------
    // Store header (real store name instead of a placeholder)
    // ---------------------------------------------------------------

    function renderStoreHeader() {
        const nameEl = document.getElementById("cartStoreName");
        const initialEl = document.getElementById("cartStoreInitial");
        const name = isCartEmpty(restaurants) ? "" : getStoreName();
        if (nameEl) nameEl.textContent = name || "Your order";
        if (initialEl) initialEl.textContent = (name || "O").trim().charAt(0).toUpperCase();
    }

    // ---------------------------------------------------------------
    // Delivery time: deliver now (with a real ETA) or pick a slot
    // ---------------------------------------------------------------

    // Straight-line distance from the shop to the selected address, or null.
    function deliveryDistanceKm() {
        const d = getDeliveryInfo();
        if (!d || !selectedAddress || !selectedAddress.coordinates) return null;
        if (d.long == null || d.latt == null) return null;
        return haversineKm(
            Number(selectedAddress.coordinates.latt), Number(selectedAddress.coordinates.long),
            Number(d.latt), Number(d.long)
        );
    }

    function showSlotError(message) {
        if (!slotError) return;
        slotError.textContent = message || "";
        slotError.classList.toggle("show", !!message);
    }

    function renderSlotPicker() {
        if (!slotPicker || !slotGrid || !window.KiranaUtils) return;

        const scheduled = deliveryMode === "scheduled";
        slotPicker.style.display = scheduled ? "" : "none";
        if (!scheduled) return;

        const lists = KiranaUtils.buildSlots(new Date());

        // Late in the evening there are no slots left today: jump to tomorrow.
        if (slotDay === "today" && lists.today.length === 0) slotDay = "tomorrow";

        slotDayTabs?.querySelectorAll(".slot-day-tab").forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.day === slotDay);
            if (btn.dataset.day === "today") btn.disabled = lists.today.length === 0;
        });

        // Forget a pick whose time has passed in the meantime.
        const all = lists.today.concat(lists.tomorrow);
        if (selectedSlot && !all.some((s) => s.date === selectedSlot.date && s.time === selectedSlot.time)) {
            selectedSlot = null;
        }

        const slots = lists[slotDay] || [];
        slotGrid.innerHTML = slots.length
            ? slots.map((s) => {
                const sel = selectedSlot && selectedSlot.date === s.date && selectedSlot.time === s.time;
                return `<button type="button" class="slot-chip${sel ? " selected" : ""}"
                            data-date="${escapeHtml(s.date)}" data-time="${escapeHtml(s.time)}"
                            data-label="${escapeHtml(s.label)}">${escapeHtml(s.label)}</button>`;
            }).join("")
            : `<p class="slot-empty">No slots available.</p>`;
    }

    function updateDeliveryTimeUI() {
        if (!deliveryTimeCard) return;

        const show = getOrderType() === "delivery" && !!window.KiranaUtils;
        deliveryTimeCard.style.display = show ? "" : "none";
        if (!show) {
            showSlotError("");
            return;
        }

        const km = deliveryDistanceKm();
        if (deliveryNowEta) {
            deliveryNowEta.textContent = km == null ? "" : `(about ${KiranaUtils.etaRange(km).label} mins)`;
        }

        deliveryTimeCard.querySelectorAll('input[name="deliveryMode"]').forEach((r) => {
            r.checked = r.value === deliveryMode;
        });
        renderSlotPicker();
    }

    // Returns { ok, message }
    function validateDeliverySlot() {
        if (getOrderType() !== "delivery" || deliveryMode !== "scheduled") return { ok: true, message: "" };
        if (!selectedSlot) return { ok: false, message: "Please pick a delivery slot." };

        if (!window.KiranaUtils || !KiranaUtils.isSlotAvailable(selectedSlot, new Date())) {
            selectedSlot = null;
            renderSlotPicker();
            return { ok: false, message: "That slot is no longer available. Please pick another one." };
        }
        return { ok: true, message: "" };
    }

    // Load the cart from the server (source of truth)
    async function loadCart() {
        try {
            const res = await fetch("/get_cart_items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ userid: userId })
            });

            if (signal.aborted) return;

            if (res.status === 401) {
                alert("Unauthorized user, please log in");
                window.location.href = "/login/user";
                return;
            }

            const data = await res.json();

            if (signal.aborted) return;

            if (data.success) {
                const hadCart = !isCartEmpty(restaurants);
                const wasOnline = isStoreOnline();

                restaurants = data.results?.cart || {};
                persistCart();

                // Notice status changes we missed (e.g. while the tab was in the background).
                const nowOnline = isStoreOnline();
                if (hadCart && wasOnline && !nowOnline) {
                    notify(`${getStoreName()} just went offline`);
                } else if (!wasOnline && nowOnline && !isCartEmpty(restaurants)) {
                    backOnlineUntil = Date.now() + 5000;
                }

                renderCart(restaurants);

                // Join the store's realtime room so we hear about status changes instantly.
                const storeId = getStoreId();
                if (storeId && typeof watchStores === "function") watchStores([storeId]);
            } else if (isCartEmpty(restaurants)) {
                renderCart({});
            }
        } catch (err) {
            console.error("could not load cart", err);
            if (!signal.aborted && isCartEmpty(restaurants)) renderCart({});
        }
    }

    // Optimistic qty change; the server call is debounced.
    function changeQty(itemId, resId, delta) {
        const found = findItem(itemId, resId);
        if (!found) return;

        const { res: restaurant, item } = found;
        resId = found.resId;

        if (delta > 0 && !isStoreOnline()) {
            notify(`${restaurant.name || "This store"} is currently offline`);
            return;
        }

        if (delta > 0 && item.available_qty != null && item.qty + delta > item.available_qty) {
            alert(`Only ${item.available_qty} in stock`);
            return;
        }

        const newQty = item.qty + delta;

        if (newQty <= 0) {
            delete restaurant.items[itemId];
            // Drop the restaurant group entirely once its last item is gone
            if (Object.keys(restaurant.items).length === 0) delete restaurants[resId];
        } else {
            item.qty = newQty;
        }

        renderCart(restaurants);
        persistCart();

        scheduleCartUpdate(itemId, resId, userId, delta,
            (data) => {
                if (signal.aborted) return;
                // Server is the source of truth for remaining stock
                const stillHere = findItem(itemId, resId);
                if (data.available_qty != null && stillHere) {
                    stillHere.item.available_qty = data.available_qty;
                    renderCart(restaurants);
                    persistCart();
                }
            },
            async (msg) => {
                if (signal.aborted) return;
                // Several clicks may have been batched, so resync with the
                // server instead of trying to undo a single click.
                await loadCart();
                alert(msg || "Something went wrong updating your cart, please try again.");
            },
            async () => {
                if (signal.aborted) return;
                // Server refused the increment because the store is offline.
                // Resync: this undoes the optimistic +1 and flips the page to
                // its offline state (banner, disabled controls).
                await loadCart();
                notify(`${getStoreName()} is currently offline. Your cart is saved.`);
            }
        );
    }

    // ---------------------------------------------------------------
    // Initial cart load (cache first, then server)
    // ---------------------------------------------------------------

    const cachedCart = safeStorageGet(sessionStorage, CART_CACHE_KEY);
    if (cachedCart) {
        try {
            restaurants = JSON.parse(cachedCart) || {};
            renderCart(restaurants);
        } catch (e) {
            console.warn("bad cart cache, ignoring", e);
            restaurants = {};
        }
    }

    on(document.getElementById("shopBtn"), "click", () => goToPage("home"));

    on(cartContainer, "click", (e) => {
        if (!e.target.classList.contains("qty-btn") || e.target.disabled) return;

        const itemRow = e.target.closest(".cart-item");
        if (!itemRow) return;

        const itemId = itemRow.id;
        const resId = itemRow.dataset.resId;

        if (e.target.classList.contains("increase")) {
            changeQty(itemId, resId, +1);
        } else if (e.target.classList.contains("reduce")) {
            changeQty(itemId, resId, -1);
        }
    });

    on(orderTypeBox, "change", (e) => {
        if (e.target.name !== "orderType") return;
        preferredOrderType = e.target.value === "delivery" ? "delivery" : "pickup";
        safeStorageSet(localStorage, ORDER_TYPE_KEY, preferredOrderType);
        updateOrderTypeUI();
    });

    on(deliveryTimeCard, "change", (e) => {
        if (e.target.name !== "deliveryMode") return;
        deliveryMode = e.target.value === "scheduled" ? "scheduled" : "now";
        showSlotError("");
        renderSlotPicker();
    });

    on(deliveryTimeCard, "click", (e) => {
        const dayBtn = e.target.closest(".slot-day-tab");
        if (dayBtn) {
            if (!dayBtn.disabled) {
                slotDay = dayBtn.dataset.day === "tomorrow" ? "tomorrow" : "today";
                renderSlotPicker();
            }
            return;
        }

        const chip = e.target.closest(".slot-chip");
        if (chip) {
            selectedSlot = { date: chip.dataset.date, time: chip.dataset.time, label: chip.dataset.label };
            showSlotError("");
            renderSlotPicker();
        }
    });

    // Live store status. These events are dispatched by home.js (socket push,
    // reconnect, tab becoming visible); removed automatically when this init is torn down.
    on(document, "store:status", (e) => {
        const detail = e.detail || {};
        if (String(detail.resId) !== String(getStoreId())) return;
        applyOnlineState(detail.online !== false, !!detail.live);
    });
    on(document, "store:resync", () => { loadCart(); });

    await loadCart();
    if (signal.aborted) return;

    // ---------------------------------------------------------------
    // Address management
    // ---------------------------------------------------------------

    function applySelectedAddress(addr) {
        if (typeaddrs) typeaddrs.innerText = `${addr.adrs_type} -`;
        if (deliveryAdrs) {
            deliveryAdrs.textContent = `${addr.adrs_type} - ${addr.address}`;
            deliveryAdrs.dataset.long = addr.coordinates?.long ?? "";
            deliveryAdrs.dataset.lat = addr.coordinates?.latt ?? "";
            deliveryAdrs.dataset.phone = addr.phone ?? "";
            deliveryAdrs.dataset.type = addr.adrs_type ?? "";
        }

        selectedAddressId = addr._id ?? null;
        selectedAddress = addr;
        safeStorageSet(localStorage, SELECTED_ADDR_KEY, JSON.stringify(addr));
        updateOrderTypeUI();
    }

    function clearSelectedAddress() {
        selectedAddressId = null;
        selectedAddress = null;
        safeStorageRemove(localStorage, SELECTED_ADDR_KEY);
        if (typeaddrs) typeaddrs.innerText = "";
        if (deliveryAdrs) {
            deliveryAdrs.textContent = "No address selected";
            deliveryAdrs.dataset.long = "";
            deliveryAdrs.dataset.lat = "";
            deliveryAdrs.dataset.phone = "";
            deliveryAdrs.dataset.type = "";
        }
        updateOrderTypeUI();
    }

    function renderAddressList() {
        if (!savedAddressList) return;
        savedAddressList.innerHTML = addresses.map((addr, idx) => `
            <div class="address-option" data-idx="${idx}">
                <div class="address-option-main">
                    <span class="address-type">${escapeHtml(addr.adrs_type)}</span>
                    <span class="address-text">${escapeHtml(addr.address)}</span>
                    <span class="address-phone ${addr.phone ? "" : "missing"}" data-idx="${idx}">
                        ${addr.phone ? `📞 ${escapeHtml(addr.phone)}` : "⚠️ Add a phone number"}
                    </span>
                </div>
                <div class="address-option-actions">
                    <button type="button" class="address-edit-btn" data-idx="${idx}" title="Edit address">✎</button>
                    <button type="button" class="address-delete-btn" data-idx="${idx}" title="Remove address">✕</button>
                </div>
            </div>
        `).join("");
    }

    function resetAddressForm() {
        editingIdx = null;
        newAddrCoords = null;
        if (newAddrType) newAddrType.value = "Home";
        if (newAddrText) newAddrText.value = "";
        if (newAddrPhone) newAddrPhone.value = "";
        if (saveAddressBtn) saveAddressBtn.textContent = "Save Address";
    }

    function openEditForm(idx) {
        const addr = addresses[idx];
        if (!addr) return;

        editingIdx = idx;
        newAddrType.value = addr.adrs_type || "Home";
        newAddrText.value = addr.address || "";
        newAddrPhone.value = addr.phone || "";
        newAddrCoords = addr.coordinates
            ? { lat: addr.coordinates.latt, long: addr.coordinates.long }
            : null;

        saveAddressBtn.textContent = "Update Address";
        addAddressForm.classList.add("show");
        newAddrPhone.focus();
    }

    function openAddressPanel() {
        box?.classList.add("show");
        overlay?.classList.add("show");
    }

    function closeAddressPanel() {
        box?.classList.remove("show");
        overlay?.classList.remove("show");
        addAddressForm?.classList.remove("show");
    }

    function closePickupSheet() {
        pickupSheet?.classList.remove("show");
    }

    on(savedAddressList, "click", async (e) => {
        const phoneSpan = e.target.closest(".address-phone.missing");
        if (phoneSpan) {
            openEditForm(Number(phoneSpan.dataset.idx));
            return;
        }

        const editBtn = e.target.closest(".address-edit-btn");
        if (editBtn) {
            openEditForm(Number(editBtn.dataset.idx));
            return;
        }

        const delBtn = e.target.closest(".address-delete-btn");
        if (delBtn) {
            const idx = Number(delBtn.dataset.idx);
            const addr = addresses[idx];
            if (!addr) return;
            if (!confirm("Remove this address?")) return;

            try {
                const delRes = await fetch("/delete_address", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ user_id: userId, address_id: addr._id })
                });
                const delData = await delRes.json();
                if (!delData.success) {
                    alert(delData.message || "Could not remove address");
                    return;
                }
            } catch (err) {
                console.error(err);
                alert("Network error while removing address");
                return;
            }

            // Re-find by id: the list may have changed while the request ran
            const currentIdx = addresses.findIndex((a) => a._id === addr._id);
            if (currentIdx !== -1) addresses.splice(currentIdx, 1);

            if (addr._id === selectedAddressId) {
                if (addresses.length) applySelectedAddress(addresses[0]);
                else clearSelectedAddress();
            }

            renderAddressList();
            return;
        }

        const option = e.target.closest(".address-option");
        if (!option) return;

        const addr = addresses[Number(option.dataset.idx)];
        if (!addr) return;

        applySelectedAddress(addr);
        closeAddressPanel();
    });

    // One overlay handler closes whichever panel is open
    on(overlay, "click", () => {
        closeAddressPanel();
        closePickupSheet();
    });

    on(addressChgBtn, "click", openAddressPanel);

    on(addAddressBtn, "click", () => {
        resetAddressForm();
        addAddressForm.classList.add("show");
    });

    on(cancelAddressBtn, "click", () => {
        resetAddressForm();
        addAddressForm.classList.remove("show");
    });

    on(useLocationForNewAddr, "click", async () => {
        try {
            useLocationForNewAddr.disabled = true;
            useLocationForNewAddr.textContent = "Locating...";

            const pos = await getPosition();
            const lat = pos.coords.latitude;
            const long = pos.coords.longitude;

            // Coordinates are valid even if reverse-geocoding fails
            newAddrCoords = { lat, long };

            try {
                const address = await reverseGeocode(lat, long);
                if (address) newAddrText.value = address;
            } catch (geoErr) {
                console.error("Reverse geocode error:", geoErr);
                alert("Got your location, but couldn't look up the address name. Please type it in.");
            }
        } catch (error) {
            console.error("Location error:", error);
            alert("Unable to get your location. Please allow location access and try again.");
        } finally {
            useLocationForNewAddr.disabled = false;
            useLocationForNewAddr.textContent = "📍 Use Current Location";
        }
    });

    on(saveAddressBtn, "click", async () => {
        const adrs_type = newAddrType.value;
        const address = newAddrText.value.trim();
        const phone = normalizePhone(newAddrPhone.value);

        if (!address) {
            alert("Please enter an address");
            return;
        }
        if (!isValidPhone(phone)) {
            alert("Please enter a valid 10-digit phone number for this address");
            return;
        }
        if (!newAddrCoords) {
            alert("Please tap \"Use Current Location\" so we can pinpoint this address");
            return;
        }

        const coordinates = { long: newAddrCoords.long, latt: newAddrCoords.lat };
        const isEditing = editingIdx !== null && addresses[editingIdx];
        const existingAddr = isEditing ? addresses[editingIdx] : null;

        const payload = isEditing
            ? { user_id: userId, address_id: existingAddr._id, address_type: adrs_type, address, phone, coordinates }
            : { user_id: userId, address_type: adrs_type, address, phone, coordinates };

        const endpoint = isEditing ? "/update_address" : "/save_address";

        saveAddressBtn.disabled = true;
        try {
            const saveRes = await fetch(endpoint, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const saveData = await saveRes.json();

            if (!saveData.success) {
                alert(saveData.message || "Could not save address");
                return;
            }

            const savedAddr = saveData.address || {
                _id: isEditing ? existingAddr._id : `local_${Date.now()}`,
                adrs_type, address, phone, coordinates
            };

            if (isEditing) {
                const i = addresses.findIndex((a) => a._id === existingAddr._id);
                if (i !== -1) addresses[i] = savedAddr; else addresses.push(savedAddr);
            } else {
                addresses.push(savedAddr);
            }
            renderAddressList();

            // New address, or the currently selected one was edited -> refresh display
            if (!isEditing || existingAddr._id === selectedAddressId) {
                applySelectedAddress(savedAddr);
            }

            resetAddressForm();
            closeAddressPanel();

        } catch (err) {
            console.error(err);
            alert("Network error while saving address");
        } finally {
            saveAddressBtn.disabled = false;
        }
    });

    // Fetch saved addresses (failure here must not break the rest of the page)
    try {
        const addressRes = await fetch("/fetch_address", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId })
        });
        const addressData = await addressRes.json();

        if (addressData.success && addressData.address?.length) {
            addresses = addressData.address;
            renderAddressList();
        }
    } catch (err) {
        console.error("could not fetch addresses", err);
    }

    if (signal.aborted) return;

    // Restore previously selected address if it still exists, else first saved one
    let restoredSelection = null;
    try {
        restoredSelection = JSON.parse(safeStorageGet(localStorage, SELECTED_ADDR_KEY));
    } catch (e) {
        restoredSelection = null;
    }

    const stillSaved = restoredSelection
        ? addresses.find((a) => a._id === restoredSelection._id)
        : null;

    if (stillSaved) {
        applySelectedAddress(stillSaved); // use fresh server data, not the stale copy
    } else if (addresses.length) {
        applySelectedAddress(addresses[0]);
    } else if (restoredSelection) {
        clearSelectedAddress();
    }

    // ---------------------------------------------------------------
    // Place order (pickup or delivery)
    // ---------------------------------------------------------------

    async function submitOrder(pickupTime) {
        const type = getOrderType();
        const body = {
            user_id: userId,
            items: restaurants,
            pickup_time: type === "pickup" ? pickupTime : null,
            order_type: type
        };
        if (type === "delivery") {
            body.address_id = selectedAddress?._id;
            body.delivery_mode = deliveryMode;
            body.delivery_date = deliveryMode === "scheduled" ? (selectedSlot?.date ?? null) : null;
            body.delivery_time = deliveryMode === "scheduled" ? (selectedSlot?.time ?? null) : null;
            body.delivery_slot = deliveryMode === "scheduled" ? (selectedSlot?.label ?? null) : null;
        }

        if (placeorder) placeorder.disabled = true;
        if (confirmPickupBtn) confirmPickupBtn.disabled = true;

        try {
            const orderRes = await fetch("/store_orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });

            if (orderRes.status === 401) {
                alert("Unauthorized user, please log in");
                window.location.href = "/login/user";
                return;
            }

            const orderData = await cartJson(orderRes);
            if (!orderData) throw new Error(`store_orders failed: ${orderRes.status}`);

            if (orderRes.status === 503 && orderData.code === "STORE_OFFLINE") {
                // The store went offline between the page load and this click.
                // No alert: close the sheet and show the offline state in the page itself.
                closePickupSheet();
                if (!box?.classList.contains("show")) overlay?.classList.remove("show");
                applyOnlineState(false, false);
                renderCart(restaurants);
                notify(orderData.message || `${getStoreName()} is currently offline. Your order wasn't placed.`);
                return;
            }

            if (orderData.success) {
                closePickupSheet();
                overlay?.classList.remove("show");
                safeStorageRemove(sessionStorage, CART_CACHE_KEY);
                safeStorageRemove(sessionStorage, `cachedOrders_${userId}`);
                alert("Order placed");
                goToPage("orders");
            } else {
                alert(orderData.message || "Error while placing order");
                await loadCart(); // resync (stock may have changed)
            }
        } catch (err) {
            console.error("place order failed", err);
            alert("Network error while placing order. Please try again.");
        } finally {
            if (confirmPickupBtn) confirmPickupBtn.disabled = false;
            updateOrderTypeUI(); // re-evaluates whether Place Order should be enabled
        }
    }

    on(placeorder, "click", () => {
        if (isCartEmpty(restaurants)) {
            alert("Your cart is empty");
            return;
        }

        if (!isStoreOnline()) {
            notify(`${getStoreName()} is currently offline`);
            return;
        }

        if (getOrderType() === "delivery") {
            const check = checkDelivery();
            if (!check.ok) {
                alert(check.message);
                return;
            }
            const slotCheck = validateDeliverySlot();
            if (!slotCheck.ok) {
                showSlotError(slotCheck.message);
                deliveryTimeCard?.scrollIntoView({ behavior: "smooth", block: "center" });
                return;
            }
            submitOrder(null); // delivery uses a slot (or "now"), not the pickup-time sheet
            return;
        }

        pickupError?.classList.remove("show");
        pickupSheet?.classList.add("show");
        overlay?.classList.add("show");
    });

    on(confirmPickupBtn, "click", async () => {
        if (!isStoreOnline()) {
            closePickupSheet();
            overlay?.classList.remove("show");
            notify(`${getStoreName()} is currently offline`);
            return;
        }

        const pickupTime = pickupTimeInput.value; // "HH:MM" 24hr, or "" if unset

        if (!pickupTime) {
            pickupError?.classList.add("show");
            return;
        }
        pickupError?.classList.remove("show");

        const [hh, mm] = pickupTime.split(":").map(Number);
        const pickupDate = new Date();
        pickupDate.setHours(hh, mm, 0, 0);
        if (pickupDate < new Date()) {
            alert("Please choose a pickup time that is later than now");
            return;
        }

        if (isCartEmpty(restaurants)) {
            alert("Your cart is empty");
            return;
        }

        await submitOrder(pickupTime);
    });

    on(orderBtn, "click", () => goToPage("orders"));
}

// Run on this page's first real load...
initCartPage();

// ...and re-run every time the SPA router swaps Cart back into view
document.addEventListener("spa:pageload", (e) => {
    if (e.detail && e.detail.page === "cart") {
        initCartPage();
    }
});