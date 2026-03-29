document.addEventListener("DOMContentLoaded", async () => {
    const cart_items_container = document.getElementById("cart_items");
    const pathParts = window.location.pathname.split("/");

    const userId = pathParts[pathParts.length - 1];
    const res_info = document.querySelector(".res-info");
    const heading = res_info.querySelector("h4");
    const placeorder = document.getElementById("placeorder")
    const orderBtn = document.getElementById("orderBtn")
    const totalPrice = document.getElementById("totalPrice")
    const toPay = document.getElementById("toPay")
    heading.innerText = "Order List";

    console.log(userId);  // 45xaddsa
    const res = await fetch("/get_cart_items", {
        method: "POST",
        headers: { "Content-type": "application/json" },
        body: JSON.stringify({ "userid": userId })
    })
    const data = await res.json()
    console.log(data)
    let restaurants = {}
    if (data.success) {
        console.log(data.results)
        // heading.innerText = data.results.ress_name
        // Object.entries(data.results.cart).forEach(([name, details]) => {
        //     console.log(name);        // biryani
        //     console.log(details);     // {price: 40, qty: 1}

        //     console.log(details.price); // 40
        //     console.log(details.qty);   // 1
        //     cart_items_container.innerHTML +=
        //         `
        //     <div class="cart-item">
        //                 <span class="veg-icon"><i class="fa-regular fa-circle-stop"></i></span>
        //                 <span class="item-name">${name}</span>
        //                 <div class="quantity-control">
        //                     <button>-</button>
        //                     <span>${details.qty}</span>
        //                     <button>+</button>
        //                 </div>
        //                 <span class="item-price">${details.price * details.qty}</span>
        //             </div>
        //     `

        // });
        restaurants = data.results.cart;
        let total = 0;
        Object.entries(restaurants).forEach(([resName, details]) => {

            // Optional: show restaurant name
            cart_items_container.innerHTML += `<h2>${details.name}</h2>`;

            Object.entries(details.items).forEach(([name, detail]) => {

                cart_items_container.innerHTML += `
            <div class="cart-item" id=${detail.item_id}>
                <span class="veg-icon"><i class="fa-regular fa-circle-stop"></i></span>
                <span class="item-name">${name}</span>
                <div class="quantity-control">
                    <button class="qty-btn reduce">-</button>
                    <span class="item_qty">${detail.qty}</span>
                    <button class="qty-btn increase">+</button>
                </div>
                <span class="unit-price">${detail.price}</span>
                <span class="item-price">${detail.price * detail.qty}</span>
            </div>
        `;
                total += (detail.price * detail.qty)
                console.log(total)
                totalPrice.innerText = total
                toPay.innerText = total
            });
        });
    }
    // Assume 'cartContainer' is the div holding all your .cart-item elements
    const cartContainer = document.querySelector('.cart-container');

    cartContainer.addEventListener('click', async (e) => {
        // Check if a quantity button was clicked
        if (e.target.classList.contains('qty-btn')) {

            // 1. Get the parent cart-item element
            const itemRow = e.target.closest('.cart-item');

            // 2. Extract the data
            const itemId = itemRow.id; // Or itemRow.getAttribute('id')
            const itemName = itemRow.querySelector('.item-name').textContent;
            const item_qty = itemRow.querySelector('.item_qty');
            const item_price=itemRow.querySelector('.item-price');
            const unit_price=itemRow.querySelector('.unit-price');
            let currentQty = parseInt(item_qty.textContent);
            let currentPrice=parseInt(item_price.textContent);
            let unitprice=parseInt(unit_price.textContent);
            let totalprice=parseInt(totalPrice.textContent);
            let topay=parseInt(toPay.textContent);
            console.log(item_qty.textContent)
            // 3. Determine the action
            if (e.target.classList.contains('increase')) {
                console.log(item_qty.textContent)
                console.log(`Increasing: ${itemName} (ID: ${itemId})`);
                const res = await fetch("/update_cart", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ "user_id": userId, "item_name": itemName, "qty": 1 })
                })
                const data = await res.json()
                if (data.success) {
                    console.log(data,currentQty)
                    item_qty.innerText = currentQty + 1;
                    item_price.innerText=currentPrice + unitprice;
                    totalPrice.innerText=totalprice+unitprice;
                    toPay.innerText=topay+unitprice;
                }
                else {
                    alert("failed adding item")
                }
                // Call your update function here
            } else if (e.target.classList.contains('reduce')) {
                console.log(`Reducing: ${itemName} (ID: ${itemId})`);
                // Call your update function here
                const res = await fetch("/update_cart", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ "user_id": userId, "item_name": itemName, "qty": -1 })
                })
                const data = await res.json()
                console.log(data)
                if (data.success) {
                    if (currentQty > 1) {
                        // Correctly decrement the number
                        item_qty.textContent = currentQty - 1;
                        item_price.innerText=currentPrice - unitprice;
                        totalPrice.innerText=totalprice-unitprice;
                        toPay.innerText=topay-unitprice;
                    }
                    else {
                        // If it hits 0, remove the element from the cart UI
                        itemRow.remove();
                    }
                }
                else {
                    alert("failed removing item")
                }
            }
        }
    });
    placeorder.addEventListener("click", async () => {
        console.log(restaurants)

        const res = await fetch("/store_orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ "user_id": userId, "items": restaurants })
        })
        const data = await res.json()
        if (data.success) {
            alert("order placed")
            window.location.href = `/orders/${userId}`
            // console.log(restaurants)
            // await fetch("/seller_orders", {
            //     method: "POST",
            //     headers: { "Content-Type": "application/json" },
            //     body: JSON.stringify({
            //         user_id: userId,
            //         items: restaurants   // full cart
            //     })
            // });
        }
        else {
            alert("error while placing order")
        }
    })
    orderBtn.addEventListener("click", () => {
        console.log("clicked")
        const userid = localStorage.getItem("userId")
        console.log(userid)
        window.location.href = `/orders/${userId}`
    })
})