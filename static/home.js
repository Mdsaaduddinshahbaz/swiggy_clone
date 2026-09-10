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

// Basic HTML-escaping so restaurant/address/suggestion data from the API
// can never break out of the markup it's injected into (XSS guard).
function escapeHtml(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
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
                <span>25-30 mins</span>
                <span class="dot">•</span>
                <span>0.8 km away</span>
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
                window.location.href = `/menu/${encodeURIComponent(name)}/${encodeURIComponent(addresss)}/${encodeURIComponent(res_id)}/${encodeURIComponent(userId)}`;
            }
        });
        addListenerOnce(cartBtn, "click", () => { window.location.href = `/cart/${userId}`; });
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

// Keep the shared header's page-scoped chrome (search bar, category strip)
// in sync with whichever page is actually showing. The header never gets
// swapped out by the router, so without this it would stay visible on
// Orders/Cart/Profile too. Runs for every navigation, not just Home.
document.addEventListener("spa:pageload", (e) => {
    document.body.dataset.page = e.detail.page;
});

// Run on this page's first real load...
initHomePage();
// ...and re-run every time the SPA router swaps Home back into view
document.addEventListener("spa:pageload", (e) => {
    if (e.detail.page === "home") initHomePage();
});