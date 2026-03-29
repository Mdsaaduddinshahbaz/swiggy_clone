const ordersList = document.getElementById("orders-list");
const pathParts = window.location.pathname.split("/");
const userId = pathParts[pathParts.length - 1];
console.log(userId)
const socket = io("http://127.0.0.1:5000");

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
        }
    });
});
async function applyFiter() {
    const filterDropdown = document.getElementById("filterDropdown");
    console.log(filterDropdown.value.toLowerCase());
    const cards = document.querySelectorAll(".order-card");

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
        } else {
            card.style.display = "none";
        }
    });
    filterDropdown.addEventListener("change", () => {
        const selected = filterDropdown.value.toLowerCase();
        console.log(selected)
        const cards = document.querySelectorAll(".order-card");

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
            } else {
                card.style.display = "none";
            }
        });
    });
}
async function loadOrders() {
    const res = await fetch(`/get_orders/${userId}`, {
        method: "POST",
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
        applyFiter()
    });
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
                user_id: userId,
                status: "canceled"
            });
            // card.remove();
            // 🔥 UPDATE UI HERE
            const statusSpan = card.querySelector(".order-status");
            statusSpan.textContent = "canceled";   // or "completed"
            statusSpan.className = "order-status status-canceled";

            // optional UX improvement
            // e.target.disabled = true;
            // e.target.innerText = "Done ✔";
            card.remove();
            console.log("Completed sent:", orderId, tokenNo);
        }
        else {
            alert("failed updating status")
        }
    }
});