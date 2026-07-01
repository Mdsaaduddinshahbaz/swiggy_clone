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
    const addressChgBtn = document.getElementById("ChangeAdrs")
    const deliveryAdrs = document.getElementById("Deliveryaddress")
    const livelocationBtn = document.getElementById("liveLocationBtn")
    const loading_container = document.getElementById("loading_container")
    const typeaddrs = document.getElementById("type")
    const address_container = document.getElementById("addressOptions");
    const no_order_container = document.getElementById("No_orders_container")
    const cartContainer = document.querySelector('.cart-container');
    document.get
    heading.innerText = "Order List";
    const curr_addr = localStorage.getItem("currentAddress")
    deliveryAdrs.textContent = curr_addr
    console.log(userId);  // 45xaddsa
    const res = await fetch("/get_cart_items", {
        method: "POST",
        headers: { "Content-type": "application/json" },
        body: JSON.stringify({ "userid": userId })
    })
    const data = await res.json()
    console.log(data)
    // console.log(Object.keys(data.results.cart).length)
    // console.log(data.results.cart || Object.keys(data.results.cart).length === 0)
    if (data.results === null || Object.keys(data.results.cart).length === 0) {
        cartContainer.querySelector(".cart-left").outerHTML = ""
        cartContainer.querySelector(".cart-right").outerHTML = ""
        cartContainer.style.display = "block"
        no_order_container.classList.add("show")
    }
    else {
        no_order_container.classList.remove("show")
    }

    document.getElementById("shopBtn").addEventListener("click", () => {
        // alert("Redirecting to products page...");

        // Example:
        window.location.href = `/user/${userId}`;
    });
    let restaurants = {}
    if (data.success) {
        console.log(data.results)
        restaurants = data.results.cart;
        let total = 0;
        Object.entries(restaurants).forEach(([resName, details]) => {

            // Optional: show restaurant name
            cart_items_container.innerHTML += `<h2>${details.name}</h2>`;

            Object.entries(details.items).forEach(([item_id, detail]) => {

                cart_items_container.innerHTML += `
            <div class="cart-item" id=${item_id}>
                <span class="veg-icon"><i class="fa-regular fa-circle-stop"></i></span>
                <span class="item-name">${detail.name}</span>
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
    const address = await fetch("/fetch_address", {
        method: "POST",
        "headers": { "Content-Type": "application/json" },
        body: JSON.stringify({ "user_id": userId })
    })
    const datas = await address.json()
    if (datas.success) {
        console.log("in fetch address")
        console.log(datas)
        deliveryAdrs.textContent = datas.address[0].adrs_type + " - " + datas.address[0].address
        deliveryAdrs.dataset.long = datas.address[0].coordinates.long
        deliveryAdrs.dataset.lat = datas.address[0].coordinates.latt

        // userLatt = parseFloat(data.address[0].coordinates.latt)
        // userLong = parseFloat(data.address[0].coordinates.long)
        datas.address.forEach((addr) => {
            address_container.innerHTML += `
                        <div class="address-option" data-long=${addr.coordinates.long} data-latt=${addr.coordinates.latt}>
                        <span class="address-type">${addr.adrs_type}</span>
                        <span  name="payment" value="card">${addr.address}</span>
                    </div>
                    `
        });
    }
    else {
        console.log("adrs not found");

    }
    // Assume 'cartContainer' is the div holding all your .cart-item elements


    cartContainer.addEventListener('click', async (e) => {
        // Check if a quantity button was clicked
        if (e.target.classList.contains('qty-btn')) {

            // 1. Get the parent cart-item element
            const itemRow = e.target.closest('.cart-item');

            // 2. Extract the data
            const itemId = itemRow.id; // Or itemRow.getAttribute('id')
            console.log(itemId)
            const itemName = itemRow.querySelector('.item-name').textContent;
            const item_qty = itemRow.querySelector('.item_qty');
            const item_price = itemRow.querySelector('.item-price');
            const unit_price = itemRow.querySelector('.unit-price');
            let currentQty = parseInt(item_qty.textContent);
            let currentPrice = parseInt(item_price.textContent);
            let unitprice = parseInt(unit_price.textContent);
            let totalprice = parseInt(totalPrice.textContent);
            let topay = parseInt(toPay.textContent);
            console.log(item_qty.textContent)
            // 3. Determine the action
            if (e.target.classList.contains('increase')) {
                console.log(item_qty.textContent)
                console.log(`Increasing: ${itemName} (ID: ${itemId})`);
                const res = await fetch("/update_cart", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ "user_id": userId, "item_id": itemId, "qty": 1 })
                })
                const data = await res.json()
                if (data.success) {
                    console.log(data, currentQty)
                    item_qty.innerText = currentQty + 1;
                    item_price.innerText = currentPrice + unitprice;
                    totalPrice.innerText = totalprice + unitprice;
                    toPay.innerText = topay + unitprice;
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
                    body: JSON.stringify({ "user_id": userId, "item_id": itemId, "qty": -1 })
                })
                const data = await res.json()
                console.log(data)
                if (data.success) {
                    if (currentQty > 1) {
                        // Correctly decrement the number
                        item_qty.textContent = currentQty - 1;
                        item_price.innerText = currentPrice - unitprice;
                        totalPrice.innerText = totalprice - unitprice;
                        toPay.innerText = topay - unitprice;
                    }
                    else {
                        totalPrice.innerText = totalprice - unitprice;
                        toPay.innerText = topay - unitprice;
                        // If it hits 0, remove the element from the cart UI
                        const prevHeading = itemRow.previousElementSibling;

                        // Check if this is the last item under the heading
                        const nextSibling = itemRow.nextElementSibling;

                        itemRow.remove();

                        if (
                            prevHeading &&
                            prevHeading.tagName === "H2" &&
                            (!nextSibling || nextSibling.tagName === "H2")
                        ) {
                            prevHeading.remove();
                        }

                        if (document.querySelectorAll(".cart-item").length === 0) {
                            cartContainer.querySelector(".cart-left").outerHTML = ""
                            cartContainer.querySelector(".cart-right").outerHTML = ""
                            cartContainer.style.display = "block"
                            no_order_container.classList.add("show");
                        }
                    }
                }
                else {
                    alert("failed removing item")
                }
            }
        }
    });
    placeorder.addEventListener("click", async () => {
        const remainingItems = document.querySelectorAll(".cart-item");

        if (remainingItems.length === 0) {
            alert("Your cart is empty");
            return;
        }
        console.log(restaurants)

        const res = await fetch("/store_orders", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ "user_id": userId, "items": restaurants })
        })
        const data = await res.json()
        console.log(data)
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
            window.location.reload()
        }
    })
    orderBtn.addEventListener("click", () => {
        console.log("clicked")
        const userid = localStorage.getItem("userId")
        console.log(userid)
        window.location.href = `/orders/${userId}`
    })

    const box = document.getElementById("addressOptions");
    const overlay = document.getElementById("locationOverlay");
    addressChgBtn.addEventListener("click", async () => {
        console.log("adrschng")
        box.classList.add("show");

        overlay.classList.add("show");

        // document.getElementById("addressInput").focus();
    })

    overlay.addEventListener("click", () => {
        box.classList.remove("show");
        overlay.classList.remove("show");
    });


    address_container.addEventListener("click", (e) => {
        const selected_option = e.target.closest(".address-option")
        const spans = selected_option.querySelectorAll("span");
        typeaddrs.innerText = spans[0].textContent + " -"
        console.log(spans[0].textContent)
        deliveryAdrs.textContent = spans[1].textContent
        address_container.classList.remove("show")
        overlay.classList.remove("show");
    })

    livelocationBtn.addEventListener("click", async () => {
        console.log("livelctn button clicked")
        box.classList.remove("show");
        loading_container.classList.add("show");
        const livelctn = await getPosition();
        const userLocation = {
            latt: livelctn.coords.latitude,
            long: livelctn.coords.longitude
        };
        localStorage.setItem(
            "userLocation",
            JSON.stringify(userLocation)
        );
        const address = await reverseGeocode(
            userLocation.latt,
            userLocation.long
        );

        console.log(address);
        deliveryAdrs.textContent = address
        loading_container.classList.remove("show");
        // box.classList.remove("show");
        overlay.classList.remove("show");
    })


})

function getPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject("Geolocation is not supported by your browser");
        }
        navigator.geolocation.getCurrentPosition(resolve, reject);
    });
}

async function reverseGeocode(lat, lon) {
    const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
    );

    const data = await response.json();

    const address = data.address;

    return `${address.suburb || ""}, ${address.city || address.town || ""}`;
}