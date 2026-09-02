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
   CART UPDATE
   ============================================================ */

function scheduleCartUpdate(
    itemId,
    userId,
    delta,
    qtyEl,
    onSuccess,
    onFailure
) {

    let entry = pendingUpdates.get(itemId);

    if (entry) {

        entry.accumulatedDelta += delta;

        clearTimeout(entry.timer);

    } else {

        entry = {
            accumulatedDelta: delta,
            timer: null
        };

        pendingUpdates.set(itemId, entry);
    }


    entry.timer = setTimeout(async () => {

        const netDelta = entry.accumulatedDelta;

        pendingUpdates.delete(itemId);


        if (netDelta === 0) {
            return;
        }


        if (inFlightControllers.has(itemId)) {
            inFlightControllers
                .get(itemId)
                .abort();
        }


        const controller =
            new AbortController();

        inFlightControllers.set(
            itemId,
            controller
        );


        try {

            const response =
                await fetch(
                    "/update_cart",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            user_id: userId,
                            item_id: itemId,
                            qty: netDelta
                        }),

                        signal: controller.signal
                    }
                );


            if (!response.ok) {
                throw new Error(
                    `update_cart failed: ${response.status}`
                );
            }


            const data =
                await response.json();


            if (data.success) {

                onSuccess(data);

            } else {

                onFailure(
                    data.message ||
                    "Failed updating cart"
                );
            }


        } catch (error) {

            if (error.name !== "AbortError") {

                console.error(
                    "Cart update failed:",
                    error
                );

                onFailure(
                    "Network error"
                );
            }

        } finally {

            if (
                inFlightControllers.get(itemId)
                === controller
            ) {

                inFlightControllers.delete(
                    itemId
                );
            }
        }

    }, 400);
}


/* ============================================================
   MAIN
   ============================================================ */

document.addEventListener(
    "DOMContentLoaded",
    async () => {

        /* ========================================================
           URL
        ======================================================== */

        const path =
            window.location.pathname
                .split("/")
                .filter(Boolean);


        /*
            Expected:

            /menu/:res_name/:address/:res_id/:userId

            Example:

            /menu/Burger%20King/Banjara%20Hills/123/456
        */

        const resName =
            path[1] || "";

        const address =
            path[2] || "";

        const resId =
            path[3] || "";

        const userId =
            path[4] || "";


        const decodedRestaurant =
            decodeURIComponent(resName);

        const decodedAddress =
            decodeURIComponent(address);


        /* ========================================================
           DOM ELEMENTS
        ======================================================== */

        const menuContainer =
            document.getElementById(
                "menu_container"
            );

        const loading =
            document.getElementById(
                "loading"
            );

        const heading =
            document.querySelector(
                ".res-info h1"
            );

        const location =
            document.querySelector(
                ".res-location"
            );

        const breadcrumbs =
            document.querySelector(
                ".breadcrumbs"
            );

        const footer =
            document.querySelector(
                "footer"
            );

        const totalAmount =
            document.getElementById(
                "amount"
            );

        const goCartBtn =
            document.getElementById(
                "GoCartBtn"
            );

        const cartBtn =
            document.getElementById(
                "cartBtn"
            );

        const orderBtn =
            document.getElementById(
                "orderBtn"
            );


        /* Search */

        const searchBtn =
            document.getElementById(
                "searchBtn"
            );

        const searchContainer =
            document.getElementById(
                "searchContainer"
            );

        const searchInput =
            document.getElementById(
                "searchInput"
            );


        /* Categories */

        const categoryTabs =
            document.getElementById(
                "categoryTabs"
            );

        const categoryIndicator =
            document.getElementById(
                "categoryTabsIndicator"
            );


        const subcategoryTabs =
            document.getElementById(
                "subcategoryTabs"
            );

        const subcategoryIndicator =
            document.getElementById(
                "subcategoryTabsIndicator"
            );


        /* Replace cart */

        const replaceContainer =
            document.getElementById(
                "ReplaceContainer"
            );

        const overlay =
            document.getElementById(
                "overlayContainer"
            );

        const message =
            document.getElementById(
                "message"
            );

        const yesBtn =
            document.getElementById(
                "YES"
            );

        const noBtn =
            document.getElementById(
                "NO"
            );


        /* ========================================================
           HEADER
        ======================================================== */

        heading.textContent =
            decodedRestaurant;

        location.textContent =
            decodedAddress;

        breadcrumbs.innerHTML =
            `Home / ${escapeHtml(decodedAddress)} /
             <span>${escapeHtml(decodedRestaurant)}</span>`;


        /* ========================================================
           GET CART
        ======================================================== */

        let cartData;


        try {

            const response =
                await fetch(
                    "/get_cart_items",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            userid: userId
                        })
                    }
                );


            if (response.status === 401) {

                alert(
                    "Unauthorized user. Please log in"
                );

                window.location.href =
                    "/login/user";

                return;
            }


            if (!response.ok) {

                throw new Error(
                    "Failed to load cart"
                );
            }


            cartData =
                await response.json();


            if (
                cartData?.results &&
                cartData.results.total > 0
            ) {

                footer.classList.add(
                    "show"
                );

                totalAmount.textContent =
                    cartData.results.total;
            }


        } catch (error) {

            console.error(
                "Cart loading error:",
                error
            );

            alert(
                "Error loading cart"
            );

            return;
        }


        /* ========================================================
           GET MENU
        ======================================================== */

        let menuData;


        try {

            const response =
                await fetch(
                    "/list_items",
                    {
                        method: "POST",

                        headers: {
                            "Content-Type":
                                "application/json"
                        },

                        body: JSON.stringify({
                            res_id: resId,
                            type: "user"
                        })
                    }
                );


            if (response.status === 401) {

                alert(
                    "Unauthorized user. Please log in"
                );

                window.location.href =
                    "/login/user";

                return;
            }


            if (!response.ok) {

                throw new Error(
                    "Failed to load menu"
                );
            }


            menuData =
                await response.json();


        } catch (error) {

            console.error(
                "Menu loading error:",
                error
            );

            alert(
                "Error loading menu"
            );

            return;
        }


        /* ========================================================
           DEBUG
        ======================================================== */

        console.log(
            "FULL API RESPONSE:",
            menuData
        );

        console.log(
            "Categories:",
            menuData.categories?.categories
        );

        console.log(
            "Menu items:",
            menuData.res
        );


        /* ========================================================
           CATEGORIES
        ======================================================== */

        const categories =
            Array.isArray(
                menuData?.categories?.categories
            )
                ? menuData.categories.categories
                : [];


        /* ========================================================
           BUILD CATEGORY MAP
           
           This is the IMPORTANT PART.

           sub_id -> subcategory -> category
           
           Example:

           item.sub_id = 1

           category:
             {
                _id: 1,
                name: "sugar tablets",
                subcategories: [
                    {
                        _id: 1,
                        name: "sugar1"
                    }
                ]
             }

           Therefore:

           item.sub_id 1
                  ↓
           subcategory 1
                  ↓
           category 1
        ======================================================== */

        const subcategoryMap =
            new Map();


        categories.forEach(category => {

            const categoryId =
                normalizeId(
                    category._id
                );

            const categoryName =
                String(
                    category.name || ""
                )
                .trim()
                .toLowerCase();


            const subcategories =
                Array.isArray(
                    category.subcategories
                )
                    ? category.subcategories
                    : [];


            subcategories.forEach(
                subcategory => {

                    const subId =
                        normalizeId(
                            subcategory._id
                        );


                    if (!subId) {
                        return;
                    }


                    subcategoryMap.set(
                        subId,
                        {

                            categoryId:
                                categoryId,

                            categoryName:
                                categoryName,

                            subcategoryId:
                                subId,

                            subcategoryName:
                                String(
                                    subcategory.name ||
                                    ""
                                )
                                .trim()
                                .toLowerCase()

                        }
                    );

                }
            );

        });


        console.log(
            "SUBCATEGORY MAP:",
            subcategoryMap
        );


        /* ========================================================
           MERGE MENU ITEMS
           
           IMPORTANT:

           Your API has:

           res: {
               table1: {...},
               table2: {...}
           }

           Therefore:

           Object.entries(data.res)

           gives:

           ["table1", item]
           ["table2", item]

           The KEY is the item name.
        ======================================================== */

        const menuItems = [];


        Object.entries(
            menuData.res || {}
        ).forEach(
            ([itemName, item]) => {

                if (!item) {
                    return;
                }


                const itemId =
                    normalizeId(
                        item.id ??
                        item._id
                    );


                if (!itemId) {

                    console.warn(
                        "Item has no ID:",
                        item
                    );

                    return;
                }


                /* ----------------------------------------------
                   YOUR API USES sub_id
                ---------------------------------------------- */

                const subId =
                    normalizeId(
                        item.sub_id
                    );


                /* ----------------------------------------------
                   Find category using sub_id
                ---------------------------------------------- */

                const categoryInfo =
                    subcategoryMap.get(
                        subId
                    );


                console.log(
                    `ITEM: ${itemName}`,
                    "sub_id:",
                    subId,
                    "category:",
                    categoryInfo
                );


                /* ----------------------------------------------
                   Cart quantity
                ---------------------------------------------- */

                const cleanResId =
                    normalizeId(resId);


                const restaurantCart =
                    cartData
                        ?.results
                        ?.cart
                        ?.[cleanResId]
                        ?.items || {};


                const cartItem =
                    restaurantCart[itemId];


                menuItems.push({

                    id:
                        itemId,

                    /*
                       IMPORTANT:
                       table1/table2/table3 is the
                       actual item name.
                    */

                    name:
                        itemName,

                    price:
                        item.price,

                    file_url:
                        item.file_url,

                    item_qty:
                        item.item_qty ?? 0,

                    qty:
                        Number(
                            cartItem?.qty || 0
                        ),


                    /* Category */

                    catId:
                        categoryInfo
                            ?.categoryId ||
                        "uncategorized",

                    catName:
                        categoryInfo
                            ?.categoryName ||
                        "",


                    /* Subcategory */

                    subcatId:
                        categoryInfo
                            ?.subcategoryId ||
                        subId ||
                        "uncategorized",

                    subcatName:
                        categoryInfo
                            ?.subcategoryName ||
                        "",

                    /*
                       Keep original object
                       in case needed later.
                    */

                    original:
                        item

                });

            }
        );


        console.log(
            "FINAL MENU ITEMS:",
            menuItems
        );


        loading.style.display =
            "none";


        /* ========================================================
           ACTIVE FILTER STATE
        ======================================================== */

        let activeCategoryId =
            "all";

        let activeSubcategoryId =
            "all";


        /* ========================================================
           FIND CATEGORY
        ======================================================== */

        function findCategory(
            categoryId
        ) {

            const id =
                normalizeId(
                    categoryId
                );


            return categories.find(
                category =>
                    normalizeId(
                        category._id
                    ) === id
            );
        }


        /* ========================================================
           FIND SUBCATEGORY
        ======================================================== */

        function findSubcategory(
            category,
            subcategoryId
        ) {

            if (!category) {
                return null;
            }


            const id =
                normalizeId(
                    subcategoryId
                );


            return (
                category.subcategories
                    ?.find(
                        sub =>
                            normalizeId(
                                sub._id
                            ) === id
                    )
                || null
            );
        }


        /* ========================================================
           MOVE TAB INDICATOR
        ======================================================== */

        function moveIndicator(
            indicator,
            button
        ) {

            if (!indicator || !button) {
                return;
            }


            indicator.style.width =
                `${button.offsetWidth}px`;


            indicator.style.transform =
                `translateX(${button.offsetLeft - 4}px)`;
        }


        /* ========================================================
           RENDER MENU
        ======================================================== */

        function renderMenu() {

            const searchTerm =
                searchInput.value
                    .trim()
                    .toLowerCase();


            const selectedCategory =
                activeCategoryId === "all"
                    ? null
                    : findCategory(
                        activeCategoryId
                    );


            const selectedSubcategory =
                activeSubcategoryId === "all"
                    ? null
                    : findSubcategory(
                        selectedCategory,
                        activeSubcategoryId
                    );


            /* ====================================================
               FILTER
            ==================================================== */

            const filteredItems =
                menuItems.filter(
                    item => {

                        /* Search */

                        const matchesSearch =
                            item.name
                                .toLowerCase()
                                .includes(
                                    searchTerm
                                );


                        /* Category */

                        const matchesCategory =
                            !selectedCategory ||
                            item.catId ===
                                normalizeId(
                                    selectedCategory._id
                                );


                        /* Subcategory */

                        const matchesSubcategory =
                            !selectedSubcategory ||
                            item.subcatId ===
                                normalizeId(
                                    selectedSubcategory._id
                                );


                        return (
                            matchesSearch &&
                            matchesCategory &&
                            matchesSubcategory
                        );

                    }
                );


            console.log(
                "FILTER:",
                {
                    category:
                        activeCategoryId,

                    subcategory:
                        activeSubcategoryId,

                    search:
                        searchTerm,

                    results:
                        filteredItems
                }
            );


            /* ====================================================
               EMPTY
            ==================================================== */

            if (
                filteredItems.length === 0
            ) {

                menuContainer.innerHTML = `

                    <div class="empty-menu">

                        <h3>
                            No items found
                        </h3>

                        <p>
                            No menu items match this filter.
                        </p>

                    </div>

                `;

                return;
            }


            /* ====================================================
               RENDER
            ==================================================== */

            menuContainer.innerHTML =
                filteredItems
                    .map(
                        (item, index) => {

                            let controls;


                            if (
                                item.qty === 0
                            ) {

                                controls = `

                                    <button
                                        class="add-btn"
                                        data-item-id="${escapeHtml(item.id)}"
                                        type="button"
                                    >
                                        ADD
                                    </button>

                                `;

                            } else {

                                controls = `

                                    <div
                                        class="quantity-control"
                                    >

                                        <button
                                            class="qty-btn reduce"
                                            type="button"
                                        >
                                            -
                                        </button>

                                        <span
                                            class="item_qty"
                                        >
                                            ${escapeHtml(item.qty)}
                                        </span>

                                        <button
                                            class="qty-btn increase"
                                            type="button"
                                        >
                                            +
                                        </button>

                                    </div>

                                `;
                            }


                            return `

                                <div
                                    class="menu-item"
                                    id="${escapeHtml(item.id)}"

                                    data-item-id="${escapeHtml(item.id)}"

                                    data-cat-id="${escapeHtml(item.catId)}"

                                    data-subcat-id="${escapeHtml(item.subcatId)}"

                                    available="${escapeHtml(item.item_qty)}"

                                    style="animation-delay:${index * 0.03}s"
                                >

                                    <div class="item-details">

                                        <h3>
                                            ${escapeHtml(item.name)}
                                        </h3>

                                        <p class="price">
                                            ${escapeHtml(item.price)}
                                        </p>

                                    </div>


                                    <div class="item-img-wrapper">

                                        <img
                                            src="${escapeHtml(item.file_url)}"
                                            alt="${escapeHtml(item.name)}"
                                        >

                                        ${controls}

                                        <p class="customisable">
                                            Customisable
                                        </p>

                                    </div>

                                </div>

                                <hr class="item-divider">

                            `;
                        }
                    )
                    .join("");
        }


        /* ========================================================
           RENDER SUBCATEGORIES
        ======================================================== */

        function renderSubcategories(
            category
        ) {

            /*
               Remove old subcategory buttons
            */

            subcategoryTabs
                .querySelectorAll(
                    ".subcategory-tab"
                )
                .forEach(
                    button =>
                        button.remove()
                );


            activeSubcategoryId =
                "all";


            /*
               No category / no subcategories
            */

            if (
                !category ||
                !Array.isArray(
                    category.subcategories
                ) ||
                category.subcategories.length === 0
            ) {

                subcategoryTabs.classList.remove(
                    "show"
                );

                return;
            }


            subcategoryTabs.classList.add(
                "show"
            );


            /* ====================================================
               ALL BUTTON
            ==================================================== */

            const allButton =
                document.createElement(
                    "button"
                );


            allButton.className =
                "subcategory-tab active";


            allButton.type =
                "button";


            allButton.dataset.subcatId =
                "all";


            allButton.textContent =
                "All";


            subcategoryTabs.appendChild(
                allButton
            );


            /* ====================================================
               SUBCATEGORY BUTTONS
            ==================================================== */

            category.subcategories
                .forEach(
                    subcategory => {

                        const button =
                            document.createElement(
                                "button"
                            );


                        button.className =
                            "subcategory-tab";


                        button.type =
                            "button";


                        button.dataset.subcatId =
                            normalizeId(
                                subcategory._id
                            );


                        button.textContent =
                            subcategory.name;


                        subcategoryTabs.appendChild(
                            button
                        );

                    }
                );


            requestAnimationFrame(
                () => {

                    moveIndicator(
                        subcategoryIndicator,

                        subcategoryTabs
                            .querySelector(
                                ".subcategory-tab.active"
                            )
                    );

                }
            );
        }


        /* ========================================================
           CREATE CATEGORY BUTTONS
        ======================================================== */

        categories.forEach(
            category => {

                const categoryId =
                    normalizeId(
                        category._id
                    );


                if (!categoryId) {
                    return;
                }


                const button =
                    document.createElement(
                        "button"
                    );


                button.className =
                    "category-tab";


                button.type =
                    "button";


                button.dataset.catId =
                    categoryId;


                button.textContent =
                    category.name;


                categoryTabs.appendChild(
                    button
                );

            }
        );


        /* ========================================================
           CATEGORY CLICK
        ======================================================== */

        categoryTabs.addEventListener(
            "click",
            event => {

                const button =
                    event.target.closest(
                        ".category-tab"
                    );


                if (!button) {
                    return;
                }


                /* Remove active */

                categoryTabs
                    .querySelectorAll(
                        ".category-tab"
                    )
                    .forEach(
                        btn =>
                            btn.classList.remove(
                                "active"
                            )
                    );


                /* Activate clicked */

                button.classList.add(
                    "active"
                );


                activeCategoryId =
                    button.dataset.catId;


                /*
                   If All is selected,
                   remove subcategories.
                */

                if (
                    activeCategoryId ===
                    "all"
                ) {

                    renderSubcategories(
                        null
                    );

                } else {

                    const category =
                        findCategory(
                            activeCategoryId
                        );


                    renderSubcategories(
                        category
                    );
                }


                /* Render filtered menu */

                renderMenu();


                requestAnimationFrame(
                    () => {

                        moveIndicator(
                            categoryIndicator,
                            button
                        );

                    }
                );

            }
        );


        /* ========================================================
           SUBCATEGORY CLICK
        ======================================================== */

        subcategoryTabs.addEventListener(
            "click",
            event => {

                const button =
                    event.target.closest(
                        ".subcategory-tab"
                    );


                if (!button) {
                    return;
                }


                subcategoryTabs
                    .querySelectorAll(
                        ".subcategory-tab"
                    )
                    .forEach(
                        btn =>
                            btn.classList.remove(
                                "active"
                            )
                    );


                button.classList.add(
                    "active"
                );


                activeSubcategoryId =
                    button.dataset.subcatId;


                renderMenu();


                requestAnimationFrame(
                    () => {

                        moveIndicator(
                            subcategoryIndicator,
                            button
                        );

                    }
                );

            }
        );


        /* ========================================================
           INITIAL INDICATOR
        ======================================================== */

        requestAnimationFrame(
            () => {

                moveIndicator(
                    categoryIndicator,

                    categoryTabs.querySelector(
                        ".category-tab.active"
                    )
                );

            }
        );


        /* ========================================================
           SEARCH
        ======================================================== */

        searchBtn.addEventListener(
            "click",
            () => {

                searchContainer.classList.toggle(
                    "active"
                );


                if (
                    searchContainer.classList.contains(
                        "active"
                    )
                ) {

                    searchInput.focus();
                }

            }
        );


        searchInput.addEventListener(
            "input",
            renderMenu
        );


        /* ========================================================
           RESIZE
        ======================================================== */

        window.addEventListener(
            "resize",
            () => {

                moveIndicator(
                    categoryIndicator,

                    categoryTabs.querySelector(
                        ".category-tab.active"
                    )
                );


                const activeSub =
                    subcategoryTabs.querySelector(
                        ".subcategory-tab.active"
                    );


                if (activeSub) {

                    moveIndicator(
                        subcategoryIndicator,
                        activeSub
                    );
                }

            }
        );


        /* ========================================================
           INITIAL MENU
        ======================================================== */

        renderMenu();


        /* ========================================================
           CART BUTTON
        ======================================================== */

        cartBtn.addEventListener(
            "click",
            () => {

                window.location.href =
                    `/cart/${userId}`;

            }
        );


        /* ========================================================
           ORDER BUTTON
        ======================================================== */

        orderBtn.addEventListener(
            "click",
            () => {

                window.location.href =
                    `/orders/${userId}`;

            }
        );


        /* ========================================================
           MOBILE CART/ORDER MENU
        ======================================================== */

        const mobileMenuButton =
            document.getElementById(
                "hideCartOrderBtn"
            );

        const cartOrderContainer =
            document.getElementById(
                "CartOrderContainer"
            );


        mobileMenuButton.addEventListener(
            "click",
            () => {

                if (
                    cartOrderContainer.classList.contains(
                        "hide"
                    )
                ) {

                    cartOrderContainer.classList.remove(
                        "hide"
                    );

                    cartOrderContainer.classList.add(
                        "show"
                    );

                } else {

                    cartOrderContainer.classList.remove(
                        "show"
                    );

                    cartOrderContainer.classList.add(
                        "hide"
                    );
                }

            }
        );


        /* ========================================================
           PENDING CART ITEM
        ======================================================== */

        let pendingCartItem = null;


        /* ========================================================
           ADD TO CART
        ======================================================== */

        menuContainer.addEventListener(
            "click",
            async event => {

                const addButton =
                    event.target.closest(
                        ".add-btn"
                    );


                if (!addButton) {
                    return;
                }


                const item =
                    addButton.closest(
                        ".menu-item"
                    );


                if (!item) {
                    return;
                }


                const itemId =
                    item.dataset.itemId;


                const itemName =
                    item.querySelector(
                        "h3"
                    ).textContent;


                const price =
                    item.querySelector(
                        ".price"
                    ).textContent;


                const available =
                    parseInt(
                        item.getAttribute(
                            "available"
                        )
                    );


                if (
                    !Number.isNaN(available) &&
                    available <= 0
                ) {

                    alert(
                        "This item is currently out of stock"
                    );

                    return;
                }


                try {

                    const response =
                        await fetch(
                            "/add_to_cart",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                        "application/json"
                                },

                                body:
                                    JSON.stringify({

                                        resid:
                                            resId,

                                        userid:
                                            userId,

                                        item:
                                            itemName,

                                        ress_name:
                                            decodedRestaurant,

                                        qty:
                                            1,

                                        item_id:
                                            itemId,

                                        price:
                                            parseInt(
                                                price
                                            ),

                                        replace:
                                            false

                                    })
                            }
                        );


                    if (
                        response.status === 401
                    ) {

                        alert(
                            "Unauthorized user. Please log in"
                        );

                        window.location.href =
                            "/login/user";

                        return;
                    }


                    if (!response.ok) {

                        throw new Error(
                            "add_to_cart failed"
                        );
                    }


                    const data =
                        await response.json();


                    if (data.success) {

                        addButton.outerHTML = `

                            <div class="quantity-control">

                                <button
                                    class="qty-btn reduce"
                                    type="button"
                                >
                                    -
                                </button>

                                <span class="item_qty">
                                    1
                                </span>

                                <button
                                    class="qty-btn increase"
                                    type="button"
                                >
                                    +
                                </button>

                            </div>

                        `;


                        footer.classList.add(
                            "show"
                        );


                        totalAmount.textContent =
                            data.Total ??
                            data.total ??
                            0;


                    } else {

                        pendingCartItem = {

                            resid:
                                resId,

                            userid:
                                userId,

                            item:
                                itemName,

                            ress_name:
                                decodedRestaurant,

                            qty:
                                1,

                            item_id:
                                itemId,

                            price:
                                parseInt(
                                    price
                                )

                        };


                        message.textContent =
                            data.message ||
                            "Do you want to replace your existing cart?";


                        replaceContainer.classList.add(
                            "show"
                        );

                        overlay.classList.add(
                            "show"
                        );

                    }


                } catch (error) {

                    console.error(
                        "Add cart error:",
                        error
                    );

                    alert(
                        "Something went wrong adding this item."
                    );
                }

            }
        );


        /* ========================================================
           YES - REPLACE CART
        ======================================================== */

        yesBtn.addEventListener(
            "click",
            async () => {

                if (!pendingCartItem) {
                    return;
                }


                try {

                    const response =
                        await fetch(
                            "/add_to_cart",
                            {
                                method: "POST",

                                headers: {
                                    "Content-Type":
                                        "application/json"
                                },

                                body:
                                    JSON.stringify({

                                        ...pendingCartItem,

                                        replace:
                                            true

                                    })
                            }
                        );


                    if (
                        response.status === 401
                    ) {

                        alert(
                            "Unauthorized user. Please log in"
                        );

                        window.location.href =
                            "/login/user";

                        return;
                    }


                    const data =
                        await response.json();


                    if (data.success) {

                        footer.classList.add(
                            "show"
                        );


                        totalAmount.textContent =
                            data.Total ??
                            data.total ??
                            0;


                        replaceContainer.classList.remove(
                            "show"
                        );

                        overlay.classList.remove(
                            "show"
                        );


                        const item =
                            document.getElementById(
                                pendingCartItem.item_id
                            );


                        if (item) {

                            const addButton =
                                item.querySelector(
                                    ".add-btn"
                                );


                            if (addButton) {

                                addButton.outerHTML = `

                                    <div class="quantity-control">

                                        <button
                                            class="qty-btn reduce"
                                            type="button"
                                        >
                                            -
                                        </button>

                                        <span class="item_qty">
                                            1
                                        </span>

                                        <button
                                            class="qty-btn increase"
                                            type="button"
                                        >
                                            +
                                        </button>

                                    </div>

                                `;
                            }
                        }

                    } else {

                        alert(
                            data.message ||
                            "Failed to replace cart"
                        );
                    }


                } catch (error) {

                    console.error(
                        "Replace cart error:",
                        error
                    );

                    alert(
                        "Something went wrong."
                    );

                } finally {

                    pendingCartItem = null;
                }

            }
        );


        /* ========================================================
           NO - CANCEL
        ======================================================== */

        noBtn.addEventListener(
            "click",
            () => {

                replaceContainer.classList.remove(
                    "show"
                );

                overlay.classList.remove(
                    "show"
                );

                pendingCartItem = null;

            }
        );


        /* ========================================================
           QUANTITY BUTTONS
        ======================================================== */

        menuContainer.addEventListener(
            "click",
            event => {

                const item =
                    event.target.closest(
                        ".menu-item"
                    );


                if (!item) {
                    return;
                }


                const itemId =
                    item.dataset.itemId;


                const availableRaw =
                    item.getAttribute(
                        "available"
                    );


                const available =
                    availableRaw !== null &&
                    availableRaw !== ""
                        ? parseInt(
                            availableRaw
                        )
                        : Infinity;


                /* =================================================
                   INCREASE
                ================================================= */

                if (
                    event.target.classList.contains(
                        "increase"
                    )
                ) {

                    const qtyEl =
                        item.querySelector(
                            ".item_qty"
                        );


                    const previousQty =
                        Number(
                            qtyEl.textContent
                        );


                    if (
                        previousQty + 1 >
                        available
                    ) {

                        alert(
                            `Only ${available} in stock`
                        );

                        return;
                    }


                    qtyEl.textContent =
                        previousQty + 1;


                    scheduleCartUpdate(

                        itemId,

                        userId,

                        1,

                        qtyEl,

                        data => {

                            const total =
                                data.total ??
                                data.Total ??
                                0;


                            if (total > 0) {

                                footer.classList.add(
                                    "show"
                                );

                                totalAmount.textContent =
                                    total;

                            }

                        },

                        errorMessage => {

                            qtyEl.textContent =
                                previousQty;

                            alert(
                                errorMessage
                            );

                        }

                    );

                }


                /* =================================================
                   REDUCE
                ================================================= */

                else if (
                    event.target.classList.contains(
                        "reduce"
                    )
                ) {

                    const qtyEl =
                        item.querySelector(
                            ".item_qty"
                        );


                    const previousQty =
                        Number(
                            qtyEl.textContent
                        );


                    const newQty =
                        Math.max(
                            0,
                            previousQty - 1
                        );


                    qtyEl.textContent =
                        newQty;


                    scheduleCartUpdate(

                        itemId,

                        userId,

                        -1,

                        qtyEl,

                        data => {

                            const total =
                                data.total ??
                                data.Total ??
                                0;


                            if (total > 0) {

                                footer.classList.add(
                                    "show"
                                );

                                totalAmount.textContent =
                                    total;

                            } else {

                                footer.classList.remove(
                                    "show"
                                );
                            }


                            if (
                                data.removed
                            ) {

                                const control =
                                    item.querySelector(
                                        ".quantity-control"
                                    );


                                if (control) {

                                    control.outerHTML = `

                                        <button
                                            class="add-btn"
                                            data-item-id="${escapeHtml(itemId)}"
                                            type="button"
                                        >
                                            ADD
                                        </button>

                                    `;
                                }
                            }

                        },

                        errorMessage => {

                            qtyEl.textContent =
                                previousQty;

                            alert(
                                errorMessage
                            );

                        }

                    );
                }

            }
        );


        /* ========================================================
           GO TO CART
        ======================================================== */

        goCartBtn.addEventListener(
            "click",
            () => {

                window.location.href =
                    `/user/${userId}#cart`;

            }
        );

    }
);