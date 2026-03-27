const ordersList = document.getElementById("orders-list");

// const pathParts = window.location.pathname.split("/");
// const resID = pathParts[pathParts.length - 1];
// console.log(resID)
// const resId=localStorage.getItem("res_id")
const pathParts = window.location.pathname.split("/");

const resId = pathParts[pathParts.length - 1];
console.log(resId)
const socket = io("http://127.0.0.1:5000");

socket.on("connect", () => {
    console.log("Connected:", socket.id);

    socket.emit("join_seller_room", {
        seller_id: resId
    });
});
socket.on("new_order", () => {
    console.log("New order received → reloading...");
    loadOrders();   // 🔥 call your API again
});
async function loadOrders() {
    const res = await fetch(`/seller/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "res_id": resId })
    });
    const data = await res.json();
    console.log(data)
    if (!data.success) {
        ordersList.innerHTML = "<p>Error loading orders</p>";
        return;
    }

    ordersList.innerHTML = "";

    data.orders.forEach(order => {
        console.log(order)
        let total = 0;

        let restaurantsHTML = "";

        // Object.entries(order).forEach(([resName, details]) => {
        //     console.log(resName)
        //     console.log(details)
        // restaurantsHTML += `<div class="restaurant-name">${details.name}</div>`;

        Object.entries(order.items).forEach(([itemName, detail]) => {
            console.log(itemName)
            console.log(detail)
            const itemTotal = detail.price * detail.qty;
            total += itemTotal;

            restaurantsHTML += `
                    <div class="item">
                        <span>${itemName} x ${detail.qty}</span>
                        <span>₹${itemTotal}</span>
                    </div>
                `;
        });
        // });

        const orderHTML = `
            <div class="order-card">
                <div class="order-header">
                    <span class="order-id">#${order.order_id}</span>
                    <span class="order-status status-${order.status}">
                        ${order.status}
                    </span>
                </div>
                <div class="token-no">Token No: ${order.token_no}</div>
                <div class="order-date">${order.time}</div>

                ${restaurantsHTML}

                <div class="total">Total: ₹${total}</div>
            </div>
        `;

        ordersList.innerHTML += orderHTML;
    });
}
function renderSingleOrder(order, prepend = false) {
    let total = 0;
    let restaurantsHTML = "";

    Object.entries(order.items).forEach(([itemName, detail]) => {
        const itemTotal = detail.price * detail.qty;
        total += itemTotal;

        restaurantsHTML += `
            <div class="item">
                <span>${itemName} x ${detail.qty}</span>
                <span>₹${itemTotal}</span>
            </div>
        `;
    });

    const orderHTML = `
        <div class="order-card">
            <div class="order-header">
                <span class="order-id">#${order.order_id}</span>
                <span class="order-status status-${order.status}">
                    ${order.status}
                </span>
            </div>

            <div class="order-date">${order.time}</div>

            ${restaurantsHTML}

            <div class="total">Total: ₹${total}</div>
        </div>
    `;

    if (prepend) {
        ordersList.innerHTML = orderHTML + ordersList.innerHTML;
    } else {
        ordersList.innerHTML += orderHTML;
    }
}

loadOrders();