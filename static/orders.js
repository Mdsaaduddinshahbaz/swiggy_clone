const ordersList = document.getElementById("orders-list");
const pathParts = window.location.pathname.split("/");
const userId = pathParts[pathParts.length - 1];
const no_order_container = document.getElementById("No_orders_container")
const filterDropdown = document.getElementById("filterDropdown");
console.log(userId)
const socket = io();

socket.on("connect", () => {
    console.log("Connected:", socket.id);

    socket.emit("join_user_room", {
        user_id: userId
    });
});
socket.on("order_status_updated", (data) => {
    console.log("Update received:", data);

    const orderCards = document.querySelectorAll(".order-card");

    orderCards.forEach(card => {
        // const tokenNo = card.querySelector(".token-no").textContent;
        const tokenNo = card
            .querySelector(".token-no")
            .textContent.split(": ")[1]
            .trim();
        // console.log(statusSpan.textContent)
        console.log(tokenNo)
        console.log(data.token_no)
        const orderid = data.order_id.replace("#", "");
        console.log(orderid)


        if (tokenNo === `${data.token_no}`) {
            console.log("true")
            const statusSpan = card.querySelector(".order-status");
            statusSpan.textContent = data.status;
            statusSpan.className = `order-status status-${data.status}`;
            card.querySelector(".cancelBtn").style.display = "none";
        }
    });
});
async function applyFiter() {
    no_order_container.classList.remove("show");
    console.log(filterDropdown.value.toLowerCase());
    const cards = document.querySelectorAll(".order-card");
    let visibleCardss = 0;
    cards.forEach(card => {
        console.log("hello")
        const statusText = card
            .querySelector(".order-status")
            .textContent
            .trim()
            .toLowerCase();
        console.log(true)
        if (filterDropdown.value.toLowerCase() === "all" || statusText === filterDropdown.value.toLowerCase()) {
            console.log(true)

            card.style.display = "block";
            visibleCardss++;
        } else {
            card.style.display = "none";
        }
    });
    if (visibleCardss !== 0) {
            no_order_container.classList.remove("show");
        } else {
            no_order_container.classList.add("show");
        }
    filterDropdown.addEventListener("change", () => {
        const selected = filterDropdown.value.toLowerCase();
        console.log(selected)
        const cards = document.querySelectorAll(".order-card");
        let visibleCards = 0;
        no_order_container.classList.remove("show");
        cards.forEach(card => {
            const statusText = card
                .querySelector(".order-status")
                .textContent
                .trim()
                .toLowerCase();

            if (selected === "all" || statusText === selected) {
                const buttons = card.querySelectorAll(".cancelBtn");
                if (selected !== "placed") {
                    console.log("alls")
                    // get ALL buttons with class statusBtn inside this card

                    buttons.forEach(btn => {
                        btn.disabled = true;
                        btn.style.opacity = "0.5";   // optional visual
                        btn.style.cursor = "not-allowed";
                        btn.style.visibility = "hidden"
                    });

                }
                else {
                    buttons.forEach(btn => {
                        btn.disabled = false;
                        btn.style.opacity = "1";   // optional visual
                        btn.style.cursor = "pointer";
                        btn.style.visibility = "visible"
                    });
                }
                card.style.display = "block";
                visibleCards++;
            } else {
                card.style.display = "none";
            }
        });
        if (visibleCards !== 0) {
            no_order_container.classList.remove("show");
        } else {
            no_order_container.classList.add("show");
        }
    });
}

// ===== Cache helpers =====
const ORDERS_CACHE_KEY = `cachedOrders_${userId}`;

function renderOrders(orders) {
    if (!orders || orders.length === 0) {
        no_order_container.classList.add("show");
        ordersList.innerHTML = "";
        return;
    }
    no_order_container.classList.remove("show");
    ordersList.innerHTML = "";

    orders.forEach(order => {
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

        const orderHTML = `
            <div class="order-card">
                <div class="order-header">
                    <span class="order-id">#${order.order_id}</span>
                    <span class="order-status status-${order.status}">
                        ${order.status}
                    </span>
                </div>
                <div class="token-no">Token No: ${order.token_no}</div>

                <div class="order-date">${order.date}</div>

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

        ordersList.innerHTML += orderHTML;
    });

    applyFiter();
}

async function loadOrders({ background = false } = {}) {
    // 1. Instantly show cached orders (if any) with no loading state at all
    if (!background) {
        const cached = sessionStorage.getItem(ORDERS_CACHE_KEY);
        if (cached) {
            try {
                renderOrders(JSON.parse(cached));
            } catch (e) {
                console.warn("bad orders cache, ignoring", e);
            }
        }
    }

    // 2. Always fetch fresh in the background and update cache + UI when it lands
    const res = await fetch(`/get_orders/${userId}`, {
        method: "POST",
    });
    if (res.status == 401) {
        alert("unauthorized User,Please Log in")
        window.location.href = "/login/user";
        return;
    }
    const data = await res.json();
    if (!data.success) {
        // Only show an error if we had nothing cached to fall back on
        if (!sessionStorage.getItem(ORDERS_CACHE_KEY)) {
            ordersList.innerHTML = "<p>Error loading orders</p>";
        }
        return;
    }

    sessionStorage.setItem(ORDERS_CACHE_KEY, JSON.stringify(data.orders || []));
    renderOrders(data.orders);
}

loadOrders();
document.addEventListener("click", async (e) => {
    if (e.target.classList.contains("cancelBtn")) {
        const card = e.target.closest(".order-card");

        const orderId = card
            .querySelector(".order-id")
            .textContent.replace("#", "");

        const tokenNo = card
            .querySelector(".token-no")
            .textContent.split(": ")[1];
        let res_ids = []
        const reside = card.querySelectorAll(".restaurant-name")
        reside.forEach(residss => {
            res_ids.push(residss.getAttribute("res_id"))
        })
        const res = await fetch("/update_order_user", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                order_id: orderId,
                status: "canceled",
                user_id: userId
            })
        })
        const data = await res.json()
        if (data.success) {
            socket.emit("user_cancelled_order", {
                order_id: orderId,
                token_no: tokenNo,
                res_ids: res_ids,
                user_id: userId,
                status: "canceled"
            });
            const statusSpan = card.querySelector(".order-status");
            statusSpan.textContent = "canceled";
            statusSpan.className = "order-status status-canceled";
            e.target.style.display = "none";

            // Refresh from server (updates cache too) instead of a full page reload
            await loadOrders({ background: true });
            console.log("Completed sent:", orderId, tokenNo);
        }
        else {
            alert("failed updating status")
        }
    }
});