// // One pending-request tracker per item_id
// const pendingUpdates = new Map(); // itemId -> { timer, accumulatedDelta, controller }

// function scheduleCartUpdate(itemId,userId,delta, qtyEl, onSuccess, onFailure) {
//     let entry = pendingUpdates.get(itemId);

//     if (entry) {
//         // Fold this click into the pending batch
//         entry.accumulatedDelta += delta;
//         clearTimeout(entry.timer);
//     } else {
//         entry = { accumulatedDelta: delta, timer: null, controller: null };
//         pendingUpdates.set(itemId, entry);
//     }

//     entry.timer = setTimeout(async () => {
//         const delta = entry.accumulatedDelta;
//         pendingUpdates.delete(itemId); // clear before await so new clicks start a fresh batch

//         // Abort any older in-flight request for this item so responses can't race
//         entry.controller?.abort();
//         const controller = new AbortController();

//         try {
//             const res = await fetch("/update_cart", {
//                 method: "POST",
//                 headers: { "Content-Type": "application/json" },
//                 body: JSON.stringify({ user_id: userId, item_id: itemId, qty: delta }),
//                 signal: controller.signal
//             });
//             const data = await res.json();
//             if (data.success) {
//                 onSuccess(data);
//             } else {
//                 onFailure(data.message || "Failed updating cart");
//             }
//         } catch (err) {
//             console.log(err)
//             if (err.name !== "AbortError") onFailure("Network error");
//         }
//     }, 400); // debounce window — tune to taste (300-500ms feels good)
// }
// document.addEventListener("DOMContentLoaded", async () => {
//     const path = window.location.pathname
//     console.log(path)
//     const userId = path.split("/")[5]
//     const res_id = path.split("/")[4]
//     const addresss = path.split("/")[3]
//     const res_name = path.split("/")[2]
//     console.log(res_name)
//     const decoded = decodeURIComponent(res_name);
//     const addresss_decoded = decodeURIComponent(addresss);
//     const menu_items_container = document.getElementById("menu_container")
//     const cartBtn = document.getElementById("cartBtn")
//     const orderBtn = document.getElementById("orderBtn")
//     // const res_info=document.getElementById("res_info")
//     const res_info = document.querySelector(".res-info");
//     const heading = res_info.querySelector("h1");
//     const res_location = res_info.querySelector(".res-location");
//     const breadcrump = document.querySelector(".breadcrumbs")
//     const loading = document.getElementById("loading")
//     const menu_container = document.querySelector('.menu-section');
//     const current_total_amount = document.getElementById("amount")
//     const footer = document.getElementsByTagName("footer")[0];
//     const gotoCartBtn = document.getElementById("GoCartBtn")
//     breadcrump.innerText = `Home / ${addresss_decoded} / ${decoded}`
//     res_location.innerText = addresss_decoded
//     heading.innerText = decoded;


//     const rest = await fetch("/get_cart_items", {
//         method: "POST",
//         headers: { "Content-type": "application/json" },
//         body: JSON.stringify({ "userid": userId })
//     })
//     const datas = await rest.json()
//     console.log(datas)
//     if (datas.results !== null)
//         if (datas.results.total > 0) {
//             footer.classList.add("show");
//             current_total_amount.innerText = datas.results.total
//         }
//     const res = await fetch("/list_items", {
//         method: "POST",
//         "headers": { "Content-Type": "application/json" },
//         body: JSON.stringify({ "res_id": res_id, "type": "user" })
//     })

//     const data = await res.json()
//     console.log(data)
//     if (data.success) {
//         const mergedd = mergeMenuWithCart(data, datas,
//             res_id)
//         loading.style.display = "none"
//         console.log(data)
//         // res_info.closest("h1").innerText = name
//         Object.entries(mergedd).forEach(([name, item]) => {
//             console.log(name, item.id, item.price, item.qty, item.file_url)
//             if (item.qty === 0) {
//                 menu_items_container.innerHTML +=
//                     `
//                         <div class="menu-item" id=${item.id}>
//                             <div class="item-details">
//                                 <h3>${name}</h3>
//                                 <p class="price">${item.price}</p>
//                             </div>
//                             <div class="item-img-wrapper">
//                                 <img src=${item.file_url} alt="Burger">
//                                 <button class="add-btn" id=${item.id}>ADD</button>
//                                 <p class="customisable">Customisable</p>
//                             </div>
//                         </div>

//                         <hr class="item-divider">
//             `
//             }
//             else {
//                 menu_items_container.innerHTML +=
//                     `
//                     <div class="menu-item" id=${item.id}>
//                         <div class="item-details">
//                             <h3>${name}</h3>
//                             <p class="price">${item.price}</p>
//                         </div>
//                         <div class="item-img-wrapper">
//                             <img src="${item.file_url}"
//                                 alt="Burger">
//                             <div class="quantity-control">
//                                 <button class="qty-btn reduce">-</button>
//                                 <span class="item_qty">${item.qty}</span>
//                                 <button class="qty-btn increase">+</button>
//                             </div>
//                             <p class="customisable">Customisable</p>
//                         </div>
//                     </div>

//                     <hr class="item-divider">
//             `
//             }
//         });
//     }
//     cartBtn.addEventListener("click", () => {
//         console.log("clicked")
//         const userid = localStorage.getItem("userId")
//         console.log(userid)
//         window.location.href = `/cart/${userid}`
//     })
//     orderBtn.addEventListener("click", () => {
//         console.log("clicked")
//         const userid = localStorage.getItem("userId")
//         console.log(userid)
//         window.location.href = `/orders/${userid}`
//     })

//     const hidecartorderBtn = document.getElementById("hideCartOrderBtn")
//     hidecartorderBtn.addEventListener("click", () => {
//         console.log("clicked")
//         const cartorderContainer = document.getElementById("CartOrderContainer")
//         if (cartorderContainer.classList.contains("hide")) {
//             cartorderContainer.classList.replace("hide", "show")
//         }
//         else {
//             cartorderContainer.classList.replace("show", "hide")
//         }
//     })
//     message = document.getElementById("message")
//     ReplaceContainer = document.getElementById("ReplaceContainer")
//     overlayContainer = document.getElementById("overlayContainer")
//     let pendingCartItem = null;
//     menu_items_container.addEventListener("click", async (e) => {
//         if (e.target.classList.contains("add-btn")) {

//             // Get item details
//             const item = e.target.closest(".menu-item");
//             const names = item.querySelector("h3").innerText;
//             const price = item.querySelector(".price").innerText;
//             const item_id = item.getAttribute("id")
//             // console.log("Added:", names, price,item_id);
//             const userid = localStorage.getItem("userId")
//             const button = item.querySelector(".add-btn")

//             // 👉 Here you can send to backend / Redis
//             const res = await fetch("/add_to_cart", {
//                 method: "POST",
//                 headers: { "Content-Type": "application/json" },
//                 body: JSON.stringify({
//                     resid: res_id,
//                     userid: userid,
//                     item: names,
//                     ress_name: decoded,
//                     qty: 1,
//                     item_id: item_id,
//                     price: parseInt(price),
//                     replace: false   // 🔥 important
//                 })
//             })
//             const data = await res.json()
//             console.log(data)
//             if (data.success) {
//                 button.outerHTML = `
//                 <div class="quantity-control">
//                     <button class="qty-btn reduce">-</button>
//                     <span class="item_qty">1</span>
//                     <button class="qty-btn increase">+</button>
//                 </div>
//             `;
//                 footer.classList.add("show")
//                 // alert(`${names} added to cart`)
//                 console.log(data.Total)
//                 current_total_amount.innerText = data.Total
//             }
//             if (!data.success) {
//                 pendingCartItem = {
//                     resid: res_id,
//                     userid: userid,
//                     item: names,
//                     ress_name: decoded,
//                     qty: 1,
//                     item_id: item_id,
//                     price: parseInt(price)
//                 };

//                 // button.outerHTML = `<button class="add-btn" id="${item_id}">ADD</button>`
//                 console.log(button.innerText);
//                 button.innerText = "ADD"
//                 ReplaceContainer.classList.add("show")
//                 overlayContainer.classList.add("show")
//                 message.innerText = (data.message || "please Try again")
//                 // Reo
//             }
//         }
//     });
//     replaceYesBtn = document.getElementById("YES")
//     replaceYesBtn.addEventListener("click", async () => {
//         const res = await fetch("/add_to_cart", {
//             method: "POST",
//             headers: { "Content-Type": "application/json" },
//             body: JSON.stringify({
//                 resid: pendingCartItem.resid,
//                 userid: pendingCartItem.userid,
//                 item: pendingCartItem.item,
//                 ress_name: pendingCartItem.ress_name,
//                 qty: pendingCartItem.qty,
//                 item_id: pendingCartItem.item_id,
//                 price: pendingCartItem.price,
//                 replace: true   // 🔥 important
//             })
//         })
//         const data = await res.json()
//         console.log(data)
//         if (data.success) {
//             footer.classList.add("show")
//             // alert(`${names} added to cart`)
//             console.log(data.Total)
//             current_total_amount.innerText = data.Total
//             ReplaceContainer.classList.remove("show")
//             overlayContainer.classList.remove("show")
//             message.innerText = "Error:"
//             let itemssss = document.getElementById(pendingCartItem.item_id)
//             const button = itemssss.querySelector(".add-btn")
//             console.log(button);
//             button.outerHTML = `
//                 <div class="quantity-control">
//                     <button class="qty-btn reduce">-</button>
//                     <span class="item_qty">1</span>
//                     <button class="qty-btn increase">+</button>
//                 </div>
//             `;

//         }
//     })

//     replaceNoBtn = document.getElementById("NO")
//     replaceNoBtn.addEventListener("click", async () => {
//         ReplaceContainer.classList.remove("show")
//         overlayContainer.classList.remove("show")
//         message.innerText = "Error:"
//     })
//     menu_container.addEventListener('click', async (e) => {
//         console.log("clicke menu_container")

//         // 1. Get the parent cart-item element
//         const itemRow = e.target.closest('.menu-item');
//         // 1. Get the parent cart-item element

//         // 2. Extract the data
//         const itemId = itemRow.id; // Or itemRow.getAttribute('id')
//         const itemName = itemRow.querySelector('.item-details').textContent
//         // const item_qty = itemRow.querySelector('.item_qty').textContent;
//         const item_price = itemRow.querySelector('.price').textContent;
//         // console.log(itemId,item_qty,item_price)
//         const addBtn = e.target.closest('.add-btn');
//         if (e.target.classList.contains('add-btn')) {
//             // e.target.outerHTML = `
//             //     <div class="quantity-control">
//             //         <button class="qty-btn reduce">-</button>
//             //         <span class="item_qty">1</span>
//             //         <button class="qty-btn increase">+</button>
//             //     </div>
//             // `;
//         }
//         else if (e.target.classList.contains('increase')) {
//             const qtyEl = e.target.parentElement.querySelector('.item_qty');
//             const prevQty = Number(qtyEl.textContent);
//             console.log(`Increasing: ${itemName} (ID: ${itemId})`);
//             // 1. Optimistic UI update — instant feedback
//             qtyEl.textContent = prevQty + 1;

//             // 2. Batched/debounced network call
//             scheduleCartUpdate(itemId,userId, 1, qtyEl,
//                 (data) => {
//                     if (data.total > 0) {
//                         footer.classList.add("show");
//                         current_total_amount.innerText = data.total;
//                     } else {
//                         footer.classList.remove("show");
//                     }
//                 },
//                 (message) => {
//                     qtyEl.textContent = prevQty; // rollback on failure
//                     alert(message);
//                 }
//             );
//         }
//         else if (e.target.classList.contains('reduce')) {

//             const qtyEl = e.target.parentElement.querySelector('.item_qty');
//             const prevQty = Number(qtyEl.textContent);
//             console.log(`Reducing: ${itemName} (ID: ${itemId})`);
//             // 1. Optimistic UI update — instant feedback
//             qtyEl.textContent = prevQty - 1;

//             // 2. Batched/debounced network call
//             scheduleCartUpdate(itemId,userId, -1, qtyEl,
//                 (data) => {
//                     if (data.total > 0) {
//                         footer.classList.add("show");
//                         current_total_amount.innerText = data.total;
//                     } else {
//                         footer.classList.remove("show");
//                     }
//                 },
//                 (message) => {
//                     qtyEl.textContent = prevQty; // rollback on failure
//                     alert(message);
//                 }
//             );
//             // if (data.success) {
//             //     console.log(data.total)
//             //     if (data.total > 0) {
//             //         footer.classList.add("show")
//             //         current_total_amount.innerText = data.total
//             //     }
//             //     else {
//             //         footer.classList.remove("show")
//             //     }
//             if (Number(qtyEl.textContent) > 1) {
//                 // Correctly decrement the number
//                 qtyEl.textContent = Math.max(0, Number(qtyEl.textContent) - 1);
//             }
//             else {
//                 // If it hits 0, remove the element from the cart UI
//                 // const prevHeading = itemRow.previousElementSibling;
//                 const qtyControl = e.target.closest('.quantity-control');

//                 qtyControl.outerHTML = `
//                     <button class="add-btn" id="${itemId}">ADD</button>
//                 `;

//                 // Check if this is the last item under the heading
//                 const nextSibling = itemRow.nextElementSibling;

//                 // itemRow.remove();

//                 // if (
//                 //     prevHeading &&
//                 //     prevHeading.tagName === "H2" &&
//                 //     (!nextSibling || nextSibling.tagName === "H2")
//                 // ) {
//                 //     prevHeading.remove();
//                 // }
//             }
//             }
//             else {
//                 alert("failed removing item")
//             }
//     });

//     const searchBtn = document.getElementById("searchBtn");
//     const searchContainer = document.getElementById("searchContainer");

//     searchBtn.addEventListener("click", () => {
//         searchContainer.classList.toggle("active");

//         if (searchContainer.classList.contains("active")) {
//             searchContainer.querySelector("input").focus();
//         }
//     });
//     const searchInput = document.getElementById("searchInput");

//     searchInput.addEventListener("input", () => {
//         const searchTerm = searchInput.value.toLowerCase();

//         const menuItems = document.querySelectorAll(".menu-item");

//         // menuItems.forEach(item => {
//         //     const itemName = item
//         //         .querySelector(".item-details h3")
//         //         .textContent
//         //         .toLowerCase();

//         //     if (itemName.includes(searchTerm)) {
//         //         item.style.display = "flex"; // your menu-item uses flex
//         //     } else {
//         //         item.style.display = "none";

//         //     }
//         // });

//         menuItems.forEach(item => {
//             const itemName = item
//                 .querySelector(".item-details h3")
//                 .textContent
//                 .toLowerCase();

//             const divider = item.nextElementSibling; // the <hr>

//             if (itemName.includes(searchTerm)) {
//                 item.style.display = "flex";

//                 if (divider && divider.classList.contains("item-divider")) {
//                     divider.style.display = "block";
//                 }
//             } else {
//                 item.style.display = "none";

//                 if (divider && divider.classList.contains("item-divider")) {
//                     divider.style.display = "none";
//                 }
//             }
//         });


//     });
//     gotoCartBtn.addEventListener("click", () => {
//         window.location.href = `/cart/${userId}`
//     })




// })

// function mergeMenuWithCart(data, datas, res_id) {
//     const cleanResId = res_id.toString().trim();
//     console.log(res_id)
//     // const restaurantCart = datas.results.cart?.[cleanResId]?.items || {};
//     const restaurantCart = datas?.results?.cart?.[res_id]?.items || {};
//     // const cartIds = Object.keys(datas.results.cart);
//     console.log(restaurantCart);
//     const itemId = Object.keys(restaurantCart)[0];
//     console.log(itemId)
//     // console.log(Object.keys(restaurantCart));
//     // console.log(datas.results.cart?.[cleanResId])
//     // const merged = Object.entries(data.res).map(([name, item]) => {
//     //     console.log(name)
//     //     return {
//     //         name : {
//     //             id: item.id,
//     //             price: item.price,
//     //             qty: restaurantCart[name]?.qty || 0
//     //         }
//     //     };

//     // });
//     const merged = Object.entries(data.res).reduce((acc, [name, item]) => {
//         console.log(acc, item.name, item)
//         acc[name] = {
//             id: item.id,
//             price: item.price,
//             file_url: item.file_url,
//             qty: restaurantCart[item.id]?.qty || 0
//         };

//         return acc;

//     }, {});

//     console.log("Merged Menu:", merged);

//     return merged;
// }

// One pending (not-yet-sent) batch per item, and one in-flight-request tracker per item.
// pendingUpdates handles debouncing rapid clicks; inFlightControllers cancels a request
// that's already been sent if a newer batch needs to go out before the old one resolves.
const pendingUpdates = new Map();       // itemId -> { timer, accumulatedDelta }
const inFlightControllers = new Map();  // itemId -> AbortController

function scheduleCartUpdate(itemId, userId, delta, qtyEl, onSuccess, onFailure) {
    let entry = pendingUpdates.get(itemId);

    if (entry) {
        // Fold this click into the pending batch
        entry.accumulatedDelta += delta;
        clearTimeout(entry.timer);
    } else {
        entry = { accumulatedDelta: delta, timer: null };
        pendingUpdates.set(itemId, entry);
    }

    entry.timer = setTimeout(async () => {
        const netDelta = entry.accumulatedDelta;
        pendingUpdates.delete(itemId); // clear before await so new clicks start a fresh batch

        // Clicks cancelled each other out (e.g. +1 then -1) — UI is already correct
        // from the optimistic updates, nothing to send to the server.
        if (netDelta === 0) return;

        // Cancel any older in-flight request for this item so responses can't race.
        inFlightControllers.get(itemId)?.abort();
        const controller = new AbortController();
        inFlightControllers.set(itemId, controller);

        try {
            const res = await fetch("/update_cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, item_id: itemId, qty: netDelta }),
                signal: controller.signal
            });
            const data = await res.json();
            if (data.success) {
                onSuccess(data);
            } else {
                onFailure(data.message || "Failed updating cart");
            }
        } catch (err) {
            console.log(err);
            if (err.name !== "AbortError") onFailure("Network error");
        } finally {
            if (inFlightControllers.get(itemId) === controller) {
                inFlightControllers.delete(itemId);
            }
        }
    }, 400); // debounce window — tune to taste (300-500ms feels good)
}

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
    const current_total_amount = document.getElementById("amount")
    const footer = document.getElementsByTagName("footer")[0];
    const gotoCartBtn = document.getElementById("GoCartBtn")
    breadcrump.innerText = `Home / ${addresss_decoded} / ${decoded}`
    res_location.innerText = addresss_decoded
    heading.innerText = decoded;


    const rest = await fetch("/get_cart_items", {
        method: "POST",
        headers: { "Content-type": "application/json" },
        body: JSON.stringify({ "userid": userId })
    })
    if(rest.status ==401){
        alert("unauthorized User,Please Log in")
        window.location.href="/login/user";
        
    }
    const datas = await rest.json()
    console.log(datas)
    if (datas.results !== null)
        if (datas.results.total > 0) {
            footer.classList.add("show");
            current_total_amount.innerText = datas.results.total
        }
    const res = await fetch("/list_items", {
        method: "POST",
        "headers": { "Content-Type": "application/json" },
        body: JSON.stringify({ "res_id": res_id, "type": "user" })
    })
    if(res.status ==401){
        alert("unauthorized User,Please Log in")
        window.location.href="/login/user";

    }
    const data = await res.json()
    console.log(data)
    if (data.success) {
        const mergedd = mergeMenuWithCart(data, datas,
            res_id)
        loading.style.display = "none"
        console.log(data)
        // res_info.closest("h1").innerText = name
        Object.entries(mergedd).forEach(([name, item]) => {
            console.log(name, item.id, item.price, item.qty, item.file_url)
            if (item.qty === 0) {
                menu_items_container.innerHTML +=
                    `
                        <div class="menu-item" id=${item.id} available=${item.item_qty}>
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
                    <div class="menu-item" id=${item.id} available=${item.item_qty}>
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

    const hidecartorderBtn = document.getElementById("hideCartOrderBtn")
    hidecartorderBtn.addEventListener("click", () => {
        console.log("clicked")
        const cartorderContainer = document.getElementById("CartOrderContainer")
        if (cartorderContainer.classList.contains("hide")) {
            cartorderContainer.classList.replace("hide", "show")
        }
        else {
            cartorderContainer.classList.replace("show", "hide")
        }
    })
    message = document.getElementById("message")
    ReplaceContainer = document.getElementById("ReplaceContainer")
    overlayContainer = document.getElementById("overlayContainer")
    let pendingCartItem = null;
    menu_items_container.addEventListener("click", async (e) => {
        if (e.target.classList.contains("add-btn")) {

            // Get item details
            const item = e.target.closest(".menu-item");
            const names = item.querySelector("h3").innerText;
            const price = item.querySelector(".price").innerText;
            const item_id = item.getAttribute("id")
            // console.log("Added:", names, price,item_id);
            const userid = localStorage.getItem("userId")
            const button = item.querySelector(".add-btn")

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
                    price: parseInt(price),
                    replace: false   // 🔥 important
                })
            })
            if(res.status ==401){
                alert("unauthorized User,Please Log in")
                window.location.href="/login/user";
                return;    
            }
            const data = await res.json()
            console.log(data)
            if (data.success) {
                button.outerHTML = `
                <div class="quantity-control">
                    <button class="qty-btn reduce">-</button>
                    <span class="item_qty">1</span>
                    <button class="qty-btn increase">+</button>
                </div>
            `;
                footer.classList.add("show")
                // alert(`${names} added to cart`)
                console.log(data.Total)
                current_total_amount.innerText = data.Total
            }
            if (!data.success) {
                pendingCartItem = {
                    resid: res_id,
                    userid: userid,
                    item: names,
                    ress_name: decoded,
                    qty: 1,
                    item_id: item_id,
                    price: parseInt(price)
                };

                // button.outerHTML = `<button class="add-btn" id="${item_id}">ADD</button>`
                console.log(button.innerText);
                button.innerText = "ADD"
                ReplaceContainer.classList.add("show")
                overlayContainer.classList.add("show")
                message.innerText = (data.message || "please Try again")
                // Reo
            }
        }
    });
    replaceYesBtn = document.getElementById("YES")
    replaceYesBtn.addEventListener("click", async () => {
        const res = await fetch("/add_to_cart", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                resid: pendingCartItem.resid,
                userid: pendingCartItem.userid,
                item: pendingCartItem.item,
                ress_name: pendingCartItem.ress_name,
                qty: pendingCartItem.qty,
                item_id: pendingCartItem.item_id,
                price: pendingCartItem.price,
                replace: true   // 🔥 important
            })
        })
        const data = await res.json()
        console.log(data)
        if (data.success) {
            footer.classList.add("show")
            // alert(`${names} added to cart`)
            console.log(data.Total)
            current_total_amount.innerText = data.Total
            ReplaceContainer.classList.remove("show")
            overlayContainer.classList.remove("show")
            message.innerText = "Error:"
            let itemssss = document.getElementById(pendingCartItem.item_id)
            const button = itemssss.querySelector(".add-btn")
            console.log(button);
            button.outerHTML = `
                <div class="quantity-control">
                    <button class="qty-btn reduce">-</button>
                    <span class="item_qty">1</span>
                    <button class="qty-btn increase">+</button>
                </div>
            `;

        }
    })

    replaceNoBtn = document.getElementById("NO")
    replaceNoBtn.addEventListener("click", async () => {
        ReplaceContainer.classList.remove("show")
        overlayContainer.classList.remove("show")
        message.innerText = "Error:"
    })
    menu_container.addEventListener('click', async (e) => {
        console.log("clicke menu_container")

        // 1. Get the parent cart-item element
        const itemRow = e.target.closest('.menu-item');
        // 1. Get the parent cart-item element

        // 2. Extract the data
        const itemId = itemRow.id; // Or itemRow.getAttribute('id')
        const item_qty=parseInt(itemRow.getAttribute("available"))
        console.log(item_qty);
        
        const itemName = itemRow.querySelector('.item-details').textContent
        // const item_qty = itemRow.querySelector('.item_qty').textContent;
        const item_price = itemRow.querySelector('.price').textContent;
        // console.log(itemId,item_qty,item_price)
        const addBtn = e.target.closest('.add-btn');
        if (e.target.classList.contains('add-btn')) {
            // e.target.outerHTML = `
            //     <div class="quantity-control">
            //         <button class="qty-btn reduce">-</button>
            //         <span class="item_qty">1</span>
            //         <button class="qty-btn increase">+</button>
            //     </div>
            // `;
        }
        else if (e.target.classList.contains('increase')) {
            const qtyEl = e.target.parentElement.querySelector('.item_qty');
            const prevQty = Number(qtyEl.textContent);
            console.log(`Increasing: ${itemName} (ID: ${itemId})`);

            // 1. Optimistic UI update — instant feedback
            if(parseInt(prevQty + 1)>item_qty){
                alert(`only ${item_qty} in stock`)
                return
            }
            qtyEl.textContent = prevQty + 1;
            // 2. Batched/debounced network call
            scheduleCartUpdate(itemId, userId, 1, qtyEl,
                (data) => {
                    if (data.total > 0) {
                        footer.classList.add("show");
                        current_total_amount.innerText = data.total;
                    } else {
                        footer.classList.remove("show");
                    }
                },
                (message) => {
                    qtyEl.textContent = prevQty; // rollback on failure
                    alert(message);
                }
            );
        }
        else if (e.target.classList.contains('reduce')) {
            const qtyEl = e.target.parentElement.querySelector('.item_qty');
            const prevQty = Number(qtyEl.textContent);
            console.log(`Reducing: ${itemName} (ID: ${itemId})`);

            // 1. Optimistic UI update — instant feedback (and ONLY this, nothing else)
            qtyEl.textContent = Math.max(0, prevQty - 1);

            // 2. Batched/debounced network call
            scheduleCartUpdate(itemId, userId, -1, qtyEl,
                (data) => {
                    if (data.total > 0) {
                        footer.classList.add("show");
                        current_total_amount.innerText = data.total;
                    } else {
                        footer.classList.remove("show");
                    }

                    // Backend is the source of truth on whether the item fully left
                    // the cart — don't infer this from qtyEl.textContent client-side.
                    if (data.removed) {
                        const qtyControl = e.target.closest('.quantity-control');
                        if (qtyControl) {
                            qtyControl.outerHTML = `<button class="add-btn" id="${itemId}">ADD</button>`;
                        }
                    }
                },
                (message) => {
                    qtyEl.textContent = prevQty; // rollback on failure
                    alert(message);
                }
            );
            if (Number(qtyEl.textContent) >=1) {
                // Correctly decrement the number
                // qtyEl.textContent = Math.max(0, Number(qtyEl.textContent) - 1);
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
    gotoCartBtn.addEventListener("click", () => {
        window.location.href = `/cart/${userId}`
    })




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

    const merged = Object.entries(data.res).reduce((acc, [name, item]) => {
        console.log(acc, item.name, item)
        acc[name] = {
            id: item.id,
            price: item.price,
            file_url: item.file_url,
            item_qty:item.item_qty || 0,
            qty: restaurantCart[item.id]?.qty || 0
        };

        return acc;

    }, {});

    console.log("Merged Menu:", merged);

    return merged;
}