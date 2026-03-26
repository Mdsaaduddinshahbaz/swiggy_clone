document.addEventListener("DOMContentLoaded", async () => {
    const cart_items_container = document.getElementById("cart_items");
    const pathParts = window.location.pathname.split("/");

    const userId = pathParts[pathParts.length - 1];
    const res_info = document.querySelector(".res-info");
    const heading = res_info.querySelector("h4");
    const placeorder = document.getElementById("placeorder")
    const orderBtn=document.getElementById("orderBtn")
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

        Object.entries(restaurants).forEach(([resName, details]) => {

            // Optional: show restaurant name
            cart_items_container.innerHTML += `<h2>${details.name}</h2>`;

            Object.entries(details.items).forEach(([name, detail]) => {

                cart_items_container.innerHTML += `
            <div class="cart-item">
                <span class="veg-icon"><i class="fa-regular fa-circle-stop"></i></span>
                <span class="item-name">${name}</span>
                <div class="quantity-control">
                    <button>-</button>
                    <span>${detail.qty}</span>
                    <button>+</button>
                </div>
                <span class="item-price">${detail.price * detail.qty}</span>
            </div>
        `;
            });
        });
    }
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
            window.location.href=`/orders/${userId}`
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
    orderBtn.addEventListener("click",()=>{
        console.log("clicked")
        const userid = localStorage.getItem("userId")
        console.log(userid)
        window.location.href = `/orders/${userid}`
    })
})