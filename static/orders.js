const ordersList = document.getElementById("orders-list");
const pathParts = window.location.pathname.split("/");
const userId = pathParts[pathParts.length - 1];
console.log(userId)
async function loadOrders() {
    const res = await fetch(`/get_orders/${userId}`,{
        method:"POST",
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

        Object.entries(order.resturants).forEach(([resName, details]) => {

            restaurantsHTML += `<div class="restaurant-name">${details.name}</div>`;

            Object.entries(details.items).forEach(([itemName, detail]) => {

                const itemTotal = detail.price * detail.qty;
                total += itemTotal;

                restaurantsHTML += `
                    <div class="item">
                        <span>${itemName} x ${detail.qty}</span>
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
            </div>
        `;

        ordersList.innerHTML += orderHTML;
    });
}

loadOrders();