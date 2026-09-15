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

function navigateToMenu(resName, address, resId, userId) {
    try {
        sessionStorage.setItem("menuParams", JSON.stringify({ resName, address, resId, userId }));
    } catch (e) {
        console.warn("Could not persist menu params", e);
    }
    goToPage("menu");
}

// Cache of already-fetched preview items, keyed by res_id. renderRestaurants()
// re-runs on every cache-hit → fresh-fetch cycle and on every distance-filter
// change, which would otherwise wipe already-loaded product rows back to a
// skeleton and re-fetch them from scratch. Reusing the cache means a card
// only ever shows the skeleton once, the first time it's seen.
const previewItemsCache = new Map();

function productThumbsMarkup(items) {
    if (!items || items.length === 0) {
        return `<div class="product-thumb empty-thumb"><p>No items listed yet</p></div>`;
    }
    return items.map(item => `
        <div class="product-thumb" data-item-id="${escapeHtml(item.id)}">
            <img src="${escapeHtml(item.file_url)}" alt="${escapeHtml(item.name)}">
            <p class="p-name">${escapeHtml(item.name)}</p>
            <div class="p-row">
                <span class="p-price">₹${escapeHtml(item.price)}</span>
                <span class="p-add">Add</span>
            </div>
        </div>
    `).join("");
}

// Store cards start with skeleton item-thumbs (unless we already have that
// restaurant's items cached from an earlier render) and get their real
// products filled in by loadPreviewItems() right after, via a single
// batched /preview_items call (see database.py's get_preview_items). Rating,
// "open now", and delivery-time stay as presentational placeholders since
// /list_resturants doesn't return them — same as before.
function renderRestaurants(results, containers) {
    const { display_resturants, no_results_container } = containers;

    if (!results || Object.keys(results).length === 0) {
        display_resturants.innerHTML = "";
        no_results_container.style.display = "block";
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
        let distance_km = parseFloat(detail.distance_km);
        let minutes_per_km = 2.5; // default value
        if (distance_km < 3) {
            minutes_per_km = 3.0
        }
        else if (distance_km < 7) {
            minutes_per_km = 2.5
        }
        else{
            minutes_per_km = 2.0
        }

       let eta = distance_km * minutes_per_km
       let lower = Math.floor(eta / 5) * 5;
        let upper = lower + 5;

        let displayEta = `${lower}-${upper}`;

        console.log("ETA", eta)
        return `
        <div class="store-card" id=${escapeHtml(id)} data-type="${escapeHtml(detail.type || "")}" style="--i:${index}">
            <div class="store-head">
                <div>
                    <h3 class="store-name resturant_name">${escapeHtml(detail.res_name)}</h3>
                    <div class="store-badges">
                        <span class="badge-verified"><i class="fa-solid fa-circle-check"></i> Verified Partner</span>
                        <span class="badge-open">Open Now</span>
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

    try {
        const fetchlocation = JSON.parse(localStorage.getItem("userLocation"));
        if (fetchlocation === null) {
            // await getLocation();
            const position=await getPosition()
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
            renderRestaurants(data.results, renderContainers);
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(data.results));
        } else if (!cachedRestaurants) {
            alert("error loading resturants");
        }

        addListenerOnce(display_resturants, "click", function (e) {
            const favBtn = e.target.closest(".store-fav");
            if (favBtn) {
                e.stopPropagation();
                const isNowFavorite = toggleFavoriteId(userId, favBtn.dataset.favId);
                favBtn.classList.toggle("active", isNowFavorite);
                showToast(isNowFavorite ? "Added to favorites" : "Removed from favorites");
                return;
            }

            const card = e.target.closest(".store-card");
            if (card) {
                const name = card.querySelector(".resturant_name").textContent;
                const addresss = card.querySelector(".area").textContent;
                const res_id = card.getAttribute("id");
                // Was a full page navigation to /menu/... — now routes inside
                // the SPA so the header/map/session state never gets torn down.
                navigateToMenu(name, addresss, res_id, userId);
            }
        });
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

function scheduleMenuCartUpdate(itemId, resId, userId, delta, onSuccess, onFailure) {

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

            if (!response.ok) throw new Error(`update_cart failed: ${response.status}`);
            const data = await response.json();

            if (data.success) {
                onSuccess(data);
            } else {
                onFailure(data.message || "Failed updating cart");
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

    let activeCategoryId = "all";
    let activeSubcategoryId = "all";
    let sortMode = "default";
    let stockOnly = false;

    const wishlist = new Set();

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
                controls = `
                    <button class="add-btn" data-item-id="${escapeHtml(item.id)}" type="button">
                        ADD
                    </button>
                `;
            } else {
                controls = `
                    <div class="quantity-control">
                        <button class="qty-btn reduce" type="button">-</button>
                        <span class="item_qty">${escapeHtml(item.qty)}</span>
                        <button class="qty-btn increase" type="button">+</button>
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
                    class="menu-item"
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

    let pendingCartItem = null;

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
            alert("This item is currently out of stock");
            return;
        }

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

            if (!response.ok) throw new Error("add_to_cart failed");

            const data = await response.json();

            if (data.success) {

                addButton.outerHTML = `
                    <div class="quantity-control">
                        <button class="qty-btn reduce" type="button">-</button>
                        <span class="item_qty">1</span>
                        <button class="qty-btn increase" type="button">+</button>
                    </div>
                `;

                footer.classList.add("show");
                totalAmount.textContent = data.Total ?? data.total ?? 0;

            } else {

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
            }

        } catch (error) {
            console.error("Add cart error:", error);
            alert("Something went wrong adding this item.");
        }
    });

    yesBtn.addEventListener("click", async () => {

        if (!pendingCartItem) return;

        try {

            const response = await fetch("/add_to_cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...pendingCartItem, replace: true })
            });

            if (response.status === 401) {
                alert("Unauthorized user. Please log in");
                window.location.href = "/login/user";
                return;
            }

            const data = await response.json();

            if (data.success) {

                footer.classList.add("show");
                totalAmount.textContent = data.Total ?? data.total ?? 0;

                replaceContainer.classList.remove("show");
                overlay.classList.remove("show");

                const item = document.getElementById(pendingCartItem.item_id);

                if (item) {

                    const addButton = item.querySelector(".add-btn");

                    if (addButton) {

                        addButton.outerHTML = `
                            <div class="quantity-control">
                                <button class="qty-btn reduce" type="button">-</button>
                                <span class="item_qty">1</span>
                                <button class="qty-btn increase" type="button">+</button>
                            </div>
                        `;
                    }
                }

            } else {
                alert(data.message || "Failed to replace cart");
            }

        } catch (error) {
            console.error("Replace cart error:", error);
            alert("Something went wrong.");
        } finally {
            pendingCartItem = null;
        }
    });

    noBtn.addEventListener("click", () => {
        replaceContainer.classList.remove("show");
        overlay.classList.remove("show");
        pendingCartItem = null;
    });

    menuContainer.addEventListener("click", event => {

        const item = event.target.closest(".menu-item");
        if (!item) return;

        const itemId = item.dataset.itemId;
        const availableRaw = item.getAttribute("available");

        const available = availableRaw !== null && availableRaw !== ""
            ? parseInt(availableRaw)
            : Infinity;

        if (event.target.classList.contains("increase")) {

            const qtyEl = item.querySelector(".item_qty");
            const previousQty = Number(qtyEl.textContent);

            if (previousQty + 1 > available) {
                alert(`Only ${available} in stock`);
                return;
            }

            qtyEl.textContent = previousQty + 1;

            scheduleMenuCartUpdate(itemId, resId, userId, 1,
                (data) => {
                    const total = data.total ?? data.Total ?? 0;
                    if (total > 0) {
                        footer.classList.add("show");
                        totalAmount.textContent = total;
                    }
                },
                (errorMessage) => {
                    qtyEl.textContent = previousQty;
                    alert(errorMessage);
                }
            );

        } else if (event.target.classList.contains("reduce")) {

            const qtyEl = item.querySelector(".item_qty");
            const previousQty = Number(qtyEl.textContent);
            const newQty = Math.max(0, previousQty - 1);

            qtyEl.textContent = newQty;

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

                        const control = item.querySelector(".quantity-control");

                        if (control) {
                            control.outerHTML = `
                                <button class="add-btn" data-item-id="${escapeHtml(itemId)}" type="button">
                                    ADD
                                </button>
                            `;
                        }
                    }
                },
                (errorMessage) => {
                    qtyEl.textContent = previousQty;
                    alert(errorMessage);
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