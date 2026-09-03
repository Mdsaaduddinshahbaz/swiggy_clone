// Socket connects ONCE, the first time this script loads, and stays alive
// across all SPA navigation (this script tag is only ever injected once —
// see spa-router.js's ensureScriptLoaded).
const socket = io("https://general-online.onrender.com");

socket.on("connect", () => {
    console.log("Connected:", socket.id);
    const uid = window.APP_USER_ID || window.location.pathname.split("/").pop();
    socket.emit("join_user_room", { user_id: uid });
});

socket.on("order_status_updated", (data) => {
    const orderCards = document.querySelectorAll(".order-card");
    orderCards.forEach(card => {
        const tokenNo = card.querySelector(".token-no").textContent.split(": ")[1].trim();
        if (tokenNo === `${data.token_no}`) {
            const statusSpan = card.querySelector(".order-status");
            statusSpan.textContent = data.status;
            statusSpan.className = `order-status status-${data.status}`;
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
        } catch (e) {}
    }
});

function renderOrders(orders, ordersList, no_order_container) {
    if (!orders || orders.length === 0) {
        no_order_container.classList.add("show");
        ordersList.innerHTML = "";
        return;
    }
    no_order_container.classList.remove("show");

    const html = orders.map(order => {
        const cart = order.resturants.cart;
        let total = 0;
        let restaurantsHTML = "";

        Object.entries(cart).forEach(([resId, blabla]) => {
            restaurantsHTML += `
        <div class="restaurant-name" res_id=${resId}>
            ${blabla.name}
        </div>
    `;
            Object.entries(blabla.items).forEach(([itemid, item]) => {
                const itemTotal = item.price * item.qty;
                total += itemTotal;
                restaurantsHTML += `
            <div class="item" item_id=${itemid}>
                <span>${item.name} x ${item.qty}</span>
                <span>₹${itemTotal}</span>
            </div>
        `;
            });
        });

        return `
            <div class="order-card">
                <div class="order-header">
                    <span class="order-id">#${order.order_id}</span>
                    <span class="order-status status-${order.status}">
                        ${order.status}
                    </span>
                </div>
                <div class="token-no">Token No: ${order.token_no}</div>
                <div class="order-date">${order.date}</div>
                <div class="order-date">Pickup Time: ${order.pickup_time}</div>
                ${restaurantsHTML}
                <div class="total">Total: ₹${total}</div>
                <button class="cancelBtn" style="
                    background: red;
                    color: white;
                    padding: 5px 11px;
                    border-radius: 7px;
                    border: none;
                ">Cancel Order</button>
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

function initOrdersPage() {
    const ordersList = document.getElementById("orders-list");
    if (!ordersList) return; // not actually on the orders content

    const pathParts = window.location.pathname.split("/");
    const userId = window.APP_USER_ID || pathParts[pathParts.length - 1];
    const no_order_container = document.getElementById("No_orders_container");
    const filterDropdown = document.getElementById("filterDropdown");

    filterDropdown.addEventListener("change", () => applyFilterFor(filterDropdown, no_order_container));

    loadOrders(userId).then(() => applyFilterFor(filterDropdown, no_order_container));

    ordersList.addEventListener("click", async (e) => {
        if (!e.target.classList.contains("cancelBtn")) return;
        const card = e.target.closest(".order-card");
        const orderId = card.querySelector(".order-id").textContent.replace("#", "");
        const tokenNo = card.querySelector(".token-no").textContent.split(": ")[1];
        let res_ids = []
        card.querySelectorAll(".restaurant-name").forEach(r => res_ids.push(r.getAttribute("res_id")));

        const res = await fetch("/update_order_user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ order_id: orderId, status: "canceled", user_id: userId })
        })
        const data = await res.json()
        if (data.success) {
            socket.emit("user_cancelled_order", {
                order_id: orderId, token_no: tokenNo, res_ids: res_ids, user_id: userId, status: "canceled"
            });
            const statusSpan = card.querySelector(".order-status");
            statusSpan.textContent = "canceled";
            statusSpan.className = "order-status status-canceled";
            e.target.style.display = "none";
            await loadOrders(userId, { background: true });
            applyFilterFor(filterDropdown, no_order_container);
        }
        else {
            alert("failed updating status")
        }
    });
}

// Run on this page's first real load...
initOrdersPage();
// ...and re-run every time the SPA router swaps Orders back into view
document.addEventListener("spa:pageload", (e) => {
    if (e.detail.page === "orders") initOrdersPage();
});