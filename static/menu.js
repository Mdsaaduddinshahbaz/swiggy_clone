/* ============================================================
   CART UPDATE MANAGEMENT
   ============================================================ */

const pendingUpdates = new Map();
const inFlightControllers = new Map();


/* ============================================================
   HTML ESCAPE
   ============================================================ */

function escapeHtml(value) {
    if (value === null || value === undefined) {
        return "";
    }

    return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}


/* ============================================================
   NORMALIZE ID
   ============================================================ */

function normalizeId(value) {

    if (value === null || value === undefined) {
        return null;
    }

    if (typeof value === "object") {

        if (value.$oid !== undefined) {
            return String(value.$oid);
        }

        if (value._id !== undefined) {
            return normalizeId(value._id);
        }

        if (value.id !== undefined) {
            return normalizeId(value.id);
        }
    }

    return String(value).trim();
}


/* ============================================================
   CART UPDATE (debounced + coalesced, abortable)
   ============================================================ */

function scheduleCartUpdate(itemId, userId, delta, qtyEl, onSuccess, onFailure) {

    let entry = pendingUpdates.get(itemId);

    if (entry) {

        entry.accumulatedDelta += delta;
        clearTimeout(entry.timer);

    } else {

        entry = { accumulatedDelta: delta, timer: null };
        pendingUpdates.set(itemId, entry);
    }

    entry.timer = setTimeout(async () => {

        const netDelta = entry.accumulatedDelta;
        pendingUpdates.delete(itemId);

        if (netDelta === 0) {
            return;
        }

        if (inFlightControllers.has(itemId)) {
            inFlightControllers.get(itemId).abort();
        }

        const controller = new AbortController();
        inFlightControllers.set(itemId, controller);

        try {

            const response = await fetch("/update_cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    user_id: userId,
                    item_id: itemId,
                    qty: netDelta
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`update_cart failed: ${response.status}`);
            }

            const data = await response.json();

            if (data.success) {
                onSuccess(data);
            } else {
                onFailure(data.message || "Failed updating cart");
            }

        } catch (error) {

            if (error.name !== "AbortError") {
                console.error("Cart update failed:", error);
                onFailure("Network error");
            }

        } finally {

            if (inFlightControllers.get(itemId) === controller) {
                inFlightControllers.delete(itemId);
            }
        }

    }, 400);
}


/* ============================================================
   MAIN
   ============================================================ */

document.addEventListener("DOMContentLoaded", async () => {

    /* ========================================================
       URL

       Expected:
       /menu/:res_name/:address/:res_id/:userId
    ======================================================== */

    const path = window.location.pathname.split("/").filter(Boolean);

    const resName = path[1] || "";
    const address = path[2] || "";
    const resId = path[3] || "";
    const userId = path[4] || "";

    const decodedRestaurant = decodeURIComponent(resName);
    const decodedAddress = decodeURIComponent(address);


    /* ========================================================
       DOM ELEMENTS
    ======================================================== */

    const menuContainer = document.getElementById("menu_container");
    const loading = document.getElementById("loading");
    const heading = document.querySelector(".res-info h1");
    const location_ = document.querySelector(".res-location");
    const breadcrumbs = document.querySelector(".breadcrumbs");

    const footer = document.querySelector("footer");
    const totalAmount = document.getElementById("amount");
    const goCartBtn = document.getElementById("GoCartBtn");
    const cartBtn = document.getElementById("cartBtn");
    const orderBtn = document.getElementById("orderBtn");
    const navCartBadge = document.getElementById("navCartBadge");

    const resultMeta = document.getElementById("resultMeta");

    /* Search */

    const searchInput = document.getElementById("searchInput");
    const searchClearBtn = document.getElementById("searchClearBtn");
    const searchBackBtn = document.getElementById("searchBackBtn");

    /* Category rail */

    const categoryTabs = document.getElementById("categoryTabs");

    /* Filters */

    const sortSelect = document.getElementById("sortSelect");
    const stockToggle = document.getElementById("stockToggle");
    const subDivider = document.getElementById("subDivider");
    const subcategoryTabs = document.getElementById("subcategoryTabs");

    /* Replace cart modal */

    const replaceContainer = document.getElementById("ReplaceContainer");
    const overlay = document.getElementById("overlayContainer");
    const message = document.getElementById("message");
    const yesBtn = document.getElementById("YES");
    const noBtn = document.getElementById("NO");


    /* ========================================================
       HEADER
    ======================================================== */

    heading.textContent = decodedRestaurant;
    location_.textContent = decodedAddress;

    breadcrumbs.innerHTML =
        `Home / ${escapeHtml(decodedAddress)} / <span>${escapeHtml(decodedRestaurant)}</span>`;


    /* ========================================================
       GET CART
    ======================================================== */

    let cartData;
    let cartCount = 0;

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

        if (!response.ok) {
            throw new Error("Failed to load cart");
        }

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


    /* ========================================================
       GET MENU
    ======================================================== */

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

        if (!response.ok) {
            throw new Error("Failed to load menu");
        }

        menuData = await response.json();

    } catch (error) {
        console.error("Menu loading error:", error);
        alert("Error loading menu");
        return;
    }


    /* ========================================================
       CATEGORIES
    ======================================================== */

    const categories = Array.isArray(menuData?.categories?.categories)
        ? menuData.categories.categories
        : [];


    /* ========================================================
       BUILD sub_id -> subcategory -> category MAP
    ======================================================== */

    const subcategoryMap = new Map();

    categories.forEach(category => {

        const categoryId = normalizeId(category._id);
        const categoryName = String(category.name || "").trim().toLowerCase();
        const subcategories = Array.isArray(category.subcategories) ? category.subcategories : [];

        subcategories.forEach(subcategory => {

            const subId = normalizeId(subcategory._id);

            if (!subId) {
                return;
            }

            subcategoryMap.set(subId, {
                categoryId,
                categoryName,
                subcategoryId: subId,
                subcategoryName: String(subcategory.name || "").trim().toLowerCase()
            });
        });
    });


    /* ========================================================
       MERGE MENU ITEMS

       menuData.res is a map of { itemName: item }
    ======================================================== */

    const menuItems = [];

    Object.entries(menuData.res || {}).forEach(([itemName, item]) => {

        if (!item) {
            return;
        }

        const itemId = normalizeId(item.id ?? item._id);

        if (!itemId) {
            return;
        }

        const subId = normalizeId(item.sub_id);
        const categoryInfo = subcategoryMap.get(subId);

        const cleanResId = normalizeId(resId);
        const restaurantCart = cartData?.results?.cart?.[cleanResId]?.items || {};
        const cartItem = restaurantCart[itemId];
        const qty = Number(cartItem?.qty || 0);

        cartCount += qty;

        menuItems.push({
            id: itemId,
            name: itemName,
            price: Number(item.price) || 0,
            file_url: item.file_url,
            item_qty: Number(item.item_qty ?? 0),
            qty,

            catId: categoryInfo?.categoryId || "uncategorized",
            catName: categoryInfo?.categoryName || "",

            subcatId: categoryInfo?.subcategoryId || subId || "uncategorized",
            subcatName: categoryInfo?.subcategoryName || "",

            original: item
        });
    });

    loading.style.display = "none";
    updateCartBadge();


    /* ========================================================
       ACTIVE FILTER / SORT STATE
    ======================================================== */

    let activeCategoryId = "all";
    let activeSubcategoryId = "all";
    let sortMode = "default";
    let stockOnly = false;

    const wishlist = new Set();


    /* ========================================================
       LOOKUPS
    ======================================================== */

    function findCategory(categoryId) {

        const id = normalizeId(categoryId);

        return categories.find(category => normalizeId(category._id) === id);
    }

    function findSubcategory(category, subcategoryId) {

        if (!category) {
            return null;
        }

        const id = normalizeId(subcategoryId);

        return category.subcategories?.find(sub => normalizeId(sub._id) === id) || null;
    }

    function thumbnailFor(categoryId) {

        const match = menuItems.find(
            item => item.catId === categoryId && item.file_url
        );

        return match ? match.file_url : null;
    }

    function updateCartBadge() {

        if (cartCount > 0) {
            navCartBadge.textContent = cartCount;
            navCartBadge.classList.add("show");
        } else {
            navCartBadge.classList.remove("show");
        }
    }


    /* ========================================================
       RENDER CATEGORY RAIL
    ======================================================== */

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

            if (!categoryId) {
                return;
            }

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


    /* ========================================================
       RENDER SUBCATEGORY CHIPS
    ======================================================== */

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


    /* ========================================================
       RENDER MENU GRID
    ======================================================== */

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


    /* ========================================================
       INITIAL RENDER
    ======================================================== */

    renderCategoryRail();
    renderMenu();


    /* ========================================================
       CATEGORY CLICK
    ======================================================== */

    categoryTabs.addEventListener("click", event => {

        const chip = event.target.closest(".category-chip");

        if (!chip) {
            return;
        }

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


    /* ========================================================
       SUBCATEGORY CLICK
    ======================================================== */

    subcategoryTabs.addEventListener("click", event => {

        const button = event.target.closest(".subcategory-tab");

        if (!button) {
            return;
        }

        subcategoryTabs.querySelectorAll(".subcategory-tab").forEach(el => el.classList.remove("active"));
        button.classList.add("active");

        activeSubcategoryId = button.dataset.subcatId;

        renderMenu();
    });


    /* ========================================================
       SORT / STOCK FILTER
    ======================================================== */

    sortSelect.addEventListener("change", () => {
        sortMode = sortSelect.value;
        renderMenu();
    });

    stockToggle.addEventListener("click", () => {
        stockOnly = !stockOnly;
        stockToggle.classList.toggle("active", stockOnly);
        renderMenu();
    });


    /* ========================================================
       SEARCH
    ======================================================== */

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

        if (window.history.length > 1) {
            window.history.back();
        } else {
            window.location.href = `/user/${userId}`;
        }
    });


    /* ========================================================
       WISHLIST (client-side only)
    ======================================================== */

    menuContainer.addEventListener("click", event => {

        const wishlistBtn = event.target.closest(".wishlist-btn");

        if (!wishlistBtn) {
            return;
        }

        const id = wishlistBtn.dataset.wishlistId;

        if (wishlist.has(id)) {
            wishlist.delete(id);
            wishlistBtn.classList.remove("active");
        } else {
            wishlist.add(id);
            wishlistBtn.classList.add("active");
        }
    });


    /* ========================================================
       MOBILE CART/ORDER MENU
    ======================================================== */

    const mobileMenuButton = document.getElementById("hideCartOrderBtn");
    const cartOrderContainer = document.getElementById("CartOrderContainer");

    mobileMenuButton.addEventListener("click", () => {

        if (cartOrderContainer.classList.contains("hide")) {
            cartOrderContainer.classList.remove("hide");
            cartOrderContainer.classList.add("show");
        } else {
            cartOrderContainer.classList.remove("show");
            cartOrderContainer.classList.add("hide");
        }
    });


    /* ========================================================
       CART / ORDER NAV
    ======================================================== */

    cartBtn.addEventListener("click", () => {
        window.location.href = `/cart/${userId}`;
    });

    orderBtn.addEventListener("click", () => {
        window.location.href = `/orders/${userId}`;
    });


    /* ========================================================
       PENDING CART ITEM (for replace-cart confirmation)
    ======================================================== */

    let pendingCartItem = null;


    /* ========================================================
       ADD TO CART
    ======================================================== */

    menuContainer.addEventListener("click", async event => {

        const addButton = event.target.closest(".add-btn");

        if (!addButton || addButton.disabled) {
            return;
        }

        const item = addButton.closest(".menu-item");

        if (!item) {
            return;
        }

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

            if (!response.ok) {
                throw new Error("add_to_cart failed");
            }

            const data = await response.json();

            if (data.success) {

                addButton.outerHTML = `
                    <div class="quantity-control">
                        <button class="qty-btn reduce" type="button">-</button>
                        <span class="item_qty">1</span>
                        <button class="qty-btn increase" type="button">+</button>
                    </div>
                `;

                cartCount += 1;
                updateCartBadge();

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


    /* ========================================================
       YES - REPLACE CART
    ======================================================== */

    yesBtn.addEventListener("click", async () => {

        if (!pendingCartItem) {
            return;
        }

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

                        cartCount += 1;
                        updateCartBadge();
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


    /* ========================================================
       NO - CANCEL
    ======================================================== */

    noBtn.addEventListener("click", () => {
        replaceContainer.classList.remove("show");
        overlay.classList.remove("show");
        pendingCartItem = null;
    });


    /* ========================================================
       QUANTITY BUTTONS
    ======================================================== */

    menuContainer.addEventListener("click", event => {

        const item = event.target.closest(".menu-item");

        if (!item) {
            return;
        }

        const itemId = item.dataset.itemId;
        const availableRaw = item.getAttribute("available");

        const available = availableRaw !== null && availableRaw !== ""
            ? parseInt(availableRaw)
            : Infinity;

        /* INCREASE */

        if (event.target.classList.contains("increase")) {

            const qtyEl = item.querySelector(".item_qty");
            const previousQty = Number(qtyEl.textContent);

            if (previousQty + 1 > available) {
                alert(`Only ${available} in stock`);
                return;
            }

            qtyEl.textContent = previousQty + 1;
            cartCount += 1;
            updateCartBadge();

            scheduleCartUpdate(
                itemId,
                userId,
                1,
                qtyEl,
                data => {

                    const total = data.total ?? data.Total ?? 0;

                    if (total > 0) {
                        footer.classList.add("show");
                        totalAmount.textContent = total;
                    }
                },
                errorMessage => {
                    qtyEl.textContent = previousQty;
                    cartCount -= 1;
                    updateCartBadge();
                    alert(errorMessage);
                }
            );

        }

        /* REDUCE */

        else if (event.target.classList.contains("reduce")) {

            const qtyEl = item.querySelector(".item_qty");
            const previousQty = Number(qtyEl.textContent);
            const newQty = Math.max(0, previousQty - 1);

            qtyEl.textContent = newQty;

            if (newQty < previousQty) {
                cartCount = Math.max(0, cartCount - 1);
                updateCartBadge();
            }

            scheduleCartUpdate(
                itemId,
                userId,
                -1,
                qtyEl,
                data => {

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
                errorMessage => {
                    qtyEl.textContent = previousQty;
                    cartCount += 1;
                    updateCartBadge();
                    alert(errorMessage);
                }
            );
        }
    });


    /* ========================================================
       GO TO CART
    ======================================================== */

    goCartBtn.addEventListener("click", () => {
        window.location.href = `/user/${userId}#cart`;
    });

});