document.addEventListener("DOMContentLoaded", async () => {
    const path = window.location.pathname
    console.log(path)
    const userId = path.split("/")[5]
    const res_id = path.split("/")[4]
    const addresss = path.split("/")[3]
    const res_name = path.split("/")[2]
    console.log(res_name)
    const decoded = decodeURIComponent(res_name);
    const addresss_decoded = decodeURIComponent(addresss);
    const menu_items_container = document.getElementById("menu_container")
    const cartBtn = document.getElementById("cartBtn")
    const orderBtn = document.getElementById("orderBtn")
    // const res_info=document.getElementById("res_info")
    const res_info = document.querySelector(".res-info");
    const heading = res_info.querySelector("h1");
    const res_location = res_info.querySelector(".res-location");
    const breadcrump = document.querySelector(".breadcrumbs")
    const loading = document.getElementById("loading")
    const menu_container = document.querySelector('.menu-section');
    breadcrump.innerText = `Home / ${addresss_decoded} / ${decoded}`
    res_location.innerText = addresss_decoded
    heading.innerText = decoded;


    const rest = await fetch("/get_cart_items", {
        method: "POST",
        headers: { "Content-type": "application/json" },
        body: JSON.stringify({ "userid": userId })
    })
    const datas = await rest.json()
    console.log(datas)
    const res = await fetch("/list_items", {
        method: "POST",
        "headers": { "Content-Type": "application/json" },
        body: JSON.stringify({ "res_id": res_id , "type":"user" })
    })

    const data = await res.json()
    console.log(data)
    if (data.success) {
        const mergedd = mergeMenuWithCart(data, datas,
            res_id)
        loading.style.display = "none"
        console.log(data)
        // res_info.closest("h1").innerText = name
        Object.entries(mergedd).forEach(([name, item]) => {
            console.log(name, item.id, item.price, item.qty,item.file_url)
            if (item.qty === 0) {
                menu_items_container.innerHTML +=
                    `
                        <div class="menu-item" id=${item.id}>
                            <div class="item-details">
                                <h3>${name}</h3>
                                <p class="price">${item.price}</p>
                            </div>
                            <div class="item-img-wrapper">
                                <img src=${item.file_url} alt="Burger">
                                <button class="add-btn" id=${item.id}>ADD</button>
                                <p class="customisable">Customisable</p>
                            </div>
                        </div>

                        <hr class="item-divider">
            `
            }
            else {
                menu_items_container.innerHTML +=
                    `
                    <div class="menu-item" id=${item.id}>
                        <div class="item-details">
                            <h3>${name}</h3>
                            <p class="price">${item.price}</p>
                        </div>
                        <div class="item-img-wrapper">
                            <img src="${item.file_url}"
                                alt="Burger">
                            <div class="quantity-control">
                                <button class="qty-btn reduce">-</button>
                                <span class="item_qty">${item.qty}</span>
                                <button class="qty-btn increase">+</button>
                            </div>
                            <p class="customisable">Customisable</p>
                        </div>
                    </div>

                    <hr class="item-divider">
            `
            }
        });
    }
    cartBtn.addEventListener("click", () => {
        console.log("clicked")
        const userid = localStorage.getItem("userId")
        console.log(userid)
        window.location.href = `/cart/${userid}`
    })
    orderBtn.addEventListener("click", () => {
        console.log("clicked")
        const userid = localStorage.getItem("userId")
        console.log(userid)
        window.location.href = `/orders/${userid}`
    })

    const hidecartorderBtn=document.getElementById("hideCartOrderBtn")
    hidecartorderBtn.addEventListener("click",()=>{
        console.log("clicked")
        const cartorderContainer=document.getElementById("CartOrderContainer")
        if(cartorderContainer.classList.contains("hide")){
            cartorderContainer.classList.replace("hide","show")
        }
        else{
            cartorderContainer.classList.replace("show","hide")
        }
    })
    menu_items_container.addEventListener("click", async (e) => {
        if (e.target.classList.contains("add-btn")) {

            // Get item details
            const item = e.target.closest(".menu-item");
            const names = item.querySelector("h3").innerText;
            const price = item.querySelector(".price").innerText;
            const item_id = item.getAttribute("id")
            // console.log("Added:", names, price,item_id);
            const userid = localStorage.getItem("userId")
            // 👉 Here you can send to backend / Redis
            const res = await fetch("/add_to_cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resid: res_id,
                    userid: userid,
                    item: names,
                    ress_name: decoded,
                    qty: 1,
                    item_id: item_id,
                    price: parseInt(price)   // 🔥 important
                })
            })
            const data = await res.json()
            console.log(data)
            if (data.success) {
                alert(`${names} added to cart`)
            }
        }
    });

    menu_container.addEventListener('click', async (e) => {
        console.log("clicke menu_container")

        // 1. Get the parent cart-item element
        const itemRow = e.target.closest('.menu-item');
        // 1. Get the parent cart-item element

        // 2. Extract the data
        const itemId = itemRow.id; // Or itemRow.getAttribute('id')
        const itemName = itemRow.querySelector('.item-details').textContent
        // const item_qty = itemRow.querySelector('.item_qty').textContent;
        const item_price = itemRow.querySelector('.price').textContent;
        // console.log(itemId,item_qty,item_price)
        const addBtn = e.target.closest('.add-btn');
        if (e.target.classList.contains('add-btn')) {
            e.target.outerHTML = `
                <div class="quantity-control">
                    <button class="qty-btn reduce">-</button>
                    <span class="item_qty">1</span>
                    <button class="qty-btn increase">+</button>
                </div>
            `;
        }
        else if (e.target.classList.contains('increase')) {
            const qtyEl = e.target.parentElement.querySelector('.item_qty');
            
            // console.log(item_qty.textContent)
            console.log(`Increasing: ${itemName} (ID: ${itemId})`);
            const res = await fetch("/update_cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ "user_id": userId, "item_id": itemId, "qty": 1 })
            })
            const data = await res.json()
            if (data.success) {
                qtyEl.textContent = Number(qtyEl.textContent) + 1;
            }
            else {
                alert("failed adding item")
            }
        }
        else if (e.target.classList.contains('reduce')) {

            const qtyEl = e.target.parentElement.querySelector('.item_qty');
            // qtyEl.textContent = Math.max(0, Number(qtyEl.textContent) - 1);
            // console.log('Increase clicked:', itemId);
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
                if (Number(qtyEl.textContent) > 1) {
                    // Correctly decrement the number
                    qtyEl.textContent = Math.max(0, Number(qtyEl.textContent) - 1);
                }
                else {
                    // If it hits 0, remove the element from the cart UI
                    // const prevHeading = itemRow.previousElementSibling;
                    const qtyControl = e.target.closest('.quantity-control');

                    qtyControl.outerHTML = `
                        <button class="add-btn" id="${itemId}">ADD</button>
                    `;

                    // Check if this is the last item under the heading
                    const nextSibling = itemRow.nextElementSibling;

                    // itemRow.remove();

                    // if (
                    //     prevHeading &&
                    //     prevHeading.tagName === "H2" &&
                    //     (!nextSibling || nextSibling.tagName === "H2")
                    // ) {
                    //     prevHeading.remove();
                    // }
                }
            }
            else {
                alert("failed removing item")
            }
        }
    });

    const searchBtn = document.getElementById("searchBtn");
    const searchContainer = document.getElementById("searchContainer");

    searchBtn.addEventListener("click", () => {
        searchContainer.classList.toggle("active");

        if (searchContainer.classList.contains("active")) {
            searchContainer.querySelector("input").focus();
        }
    });
    const searchInput = document.getElementById("searchInput");

    searchInput.addEventListener("input", () => {
        const searchTerm = searchInput.value.toLowerCase();

        const menuItems = document.querySelectorAll(".menu-item");

        // menuItems.forEach(item => {
        //     const itemName = item
        //         .querySelector(".item-details h3")
        //         .textContent
        //         .toLowerCase();

        //     if (itemName.includes(searchTerm)) {
        //         item.style.display = "flex"; // your menu-item uses flex
        //     } else {
        //         item.style.display = "none";

        //     }
        // });

        menuItems.forEach(item => {
            const itemName = item
                .querySelector(".item-details h3")
                .textContent
                .toLowerCase();

            const divider = item.nextElementSibling; // the <hr>

            if (itemName.includes(searchTerm)) {
                item.style.display = "flex";

                if (divider && divider.classList.contains("item-divider")) {
                    divider.style.display = "block";
                }
            } else {
                item.style.display = "none";

                if (divider && divider.classList.contains("item-divider")) {
                    divider.style.display = "none";
                }
            }
        });


    });




})

function mergeMenuWithCart(data, datas, res_id) {
    const cleanResId = res_id.toString().trim();
    console.log(res_id)
// const restaurantCart = datas.results.cart?.[cleanResId]?.items || {};
    const restaurantCart = datas?.results?.cart?.[res_id]?.items || {};
    // const cartIds = Object.keys(datas.results.cart);
    console.log(restaurantCart);
    const itemId = Object.keys(restaurantCart)[0];
    console.log(itemId)
    // console.log(Object.keys(restaurantCart));
    // console.log(datas.results.cart?.[cleanResId])
    // const merged = Object.entries(data.res).map(([name, item]) => {
    //     console.log(name)
    //     return {
    //         name : {
    //             id: item.id,
    //             price: item.price,
    //             qty: restaurantCart[name]?.qty || 0
    //         }
    //     };

    // });
    const merged = Object.entries(data.res).reduce((acc, [name, item]) => {
        console.log(acc,name,item)
        acc[name] = {
            id: item.id,
            price: item.price,
            file_url:item.file_url,
            qty: restaurantCart[item.id]?.qty || 0
        };

        return acc;

    }, {});

    console.log("Merged Menu:", merged);

    return merged;
}