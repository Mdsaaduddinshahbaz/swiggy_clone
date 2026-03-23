document.addEventListener("DOMContentLoaded", async () => {
    const cart_items_container = document.getElementById("cart_items");
    const pathParts = window.location.pathname.split("/");

    const userId = pathParts[pathParts.length - 1];
    const res_info = document.querySelector(".res-info");
    const heading = res_info.querySelector("h4");

    heading.innerText = "Order List";

    console.log(userId);  // 45xaddsa
    const res = await fetch("/get_cart_items", {
        method: "POST",
        headers: { "Content-type": "application/json" },
        body: JSON.stringify({ "userid": userId })
    })
    const data = await res.json()
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
        const restaurants = data.results.cart;

        Object.entries(restaurants).forEach(([resName, items]) => {

            // Optional: show restaurant name
            cart_items_container.innerHTML += `<h2>${resName}</h2>`;

            Object.entries(items).forEach(([name, details]) => {

                cart_items_container.innerHTML += `
            <div class="cart-item">
                <span class="veg-icon"><i class="fa-regular fa-circle-stop"></i></span>
                <span class="item-name">${name}</span>
                <div class="quantity-control">
                    <button>-</button>
                    <span>${details.qty}</span>
                    <button>+</button>
                </div>
                <span class="item-price">${details.price * details.qty}</span>
            </div>
        `;
            });
        });
    }
})