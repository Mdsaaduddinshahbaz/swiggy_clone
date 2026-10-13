// =====================================================================
// Cart page
// =====================================================================

const pendingUpdates = new Map();  // itemId -> { timer, accumulatedDelta, resId, userId, onSuccess, onFailure }
const inFlightRequests = new Map(); // itemId -> Promise (requests per item are serialized, never aborted)
let activeInit = null;              // AbortController of the currently active page init

// ---------------------------------------------------------------
// Generic helpers
// ---------------------------------------------------------------

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

function scheduleCartUpdate(itemId, resId, userId, delta, onSuccess, onFailure) {
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

                if (!res.ok) throw new Error(`update_cart failed: ${res.status}`);
                const data = await res.json();

                if (data.success) {
                    onSuccess(data);
                } else {
                    onFailure(data.message || "Failed updating cart");
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

    const no_order_container = document.getElementById("No_orders_container");
    const cartContainer = document.querySelector(".cart-container");

    const CART_CACHE_KEY = `cachedCart_${userId}`;
    const SELECTED_ADDR_KEY = `selectedAddress_${userId}`;

    /*
        restaurants = {
            "<res_id>": {
                name: "New kirana",
                items: { "<item_id>": { name, price, qty, available_qty } }
            }
        }
    */
    let restaurants = {};
    let newAddrCoords = null; // { lat, long }
    let editingIdx = null;    // index into `addresses` when editing, else null
    let addresses = [];       // [{ _id, adrs_type, address, phone, coordinates: { long, latt } }]
    let selectedAddressId = null;

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
            return 0;
        }

        if (cl) cl.style.display = "";
        if (cr) cr.style.display = "";
        if (no_order_container) no_order_container.classList.remove("show");

        let total = 0;

        const html = Object.entries(cart).map(([res_id, r]) => {
            const items = r?.items || {};
            if (Object.keys(items).length === 0) return "";

            const itemsHtml = Object.entries(items).map(([item_id, detail]) => {
                const price = Number(detail.price) || 0;
                const qty = Number(detail.qty) || 0;
                total += price * qty;

                const atMax = detail.available_qty != null && qty >= detail.available_qty;

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
                        <button type="button" class="qty-btn increase" ${atMax ? "disabled" : ""}>+</button>
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

        return total;
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
                restaurants = data.results?.cart || {};
                persistCart();
                renderCart(restaurants);
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
        safeStorageSet(localStorage, SELECTED_ADDR_KEY, JSON.stringify(addr));
    }

    function clearSelectedAddress() {
        selectedAddressId = null;
        safeStorageRemove(localStorage, SELECTED_ADDR_KEY);
        if (typeaddrs) typeaddrs.innerText = "";
        if (deliveryAdrs) {
            deliveryAdrs.textContent = "No address selected";
            deliveryAdrs.dataset.long = "";
            deliveryAdrs.dataset.lat = "";
            deliveryAdrs.dataset.phone = "";
            deliveryAdrs.dataset.type = "";
        }
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
    // Place order (pickup)
    // ---------------------------------------------------------------

    on(placeorder, "click", () => {
        if (isCartEmpty(restaurants)) {
            alert("Your cart is empty");
            return;
        }

        pickupError?.classList.remove("show");
        pickupSheet?.classList.add("show");
        overlay?.classList.add("show");
    });

    on(confirmPickupBtn, "click", async () => {
        const pickupTime = pickupTimeInput.value; // "HH:MM" 24hr, or "" if unset

        if (!pickupTime) {
            pickupError?.classList.add("show");
            return;
        }
        pickupError?.classList.remove("show");

        // Pickup time can't be in the past (today)
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

        confirmPickupBtn.disabled = true;

        try {
            const orderRes = await fetch("/store_orders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, items: restaurants, pickup_time: pickupTime })
            });

            if (orderRes.status === 401) {
                alert("Unauthorized user, please log in");
                window.location.href = "/login/user";
                return;
            }

            const orderData = await orderRes.json();

            if (orderData.success) {
                closePickupSheet();
                overlay?.classList.remove("show");
                safeStorageRemove(sessionStorage, CART_CACHE_KEY);
                safeStorageRemove(sessionStorage, `cachedOrders_${userId}`);
                alert("Order placed");
                goToPage("orders");
            } else {
                alert(orderData.message || "Error while placing order");
                await loadCart(); // resync (stock may have changed) without re-initialising the page
            }
        } catch (err) {
            console.error("place order failed", err);
            alert("Network error while placing order. Please try again.");
        } finally {
            confirmPickupBtn.disabled = false;
        }
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