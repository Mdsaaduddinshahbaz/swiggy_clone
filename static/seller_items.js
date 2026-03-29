document.addEventListener("DOMContentLoaded", async () => {
    const path = window.location.pathname
    const res_id = path.split("/")[4]
    const resname=path.split("/")[3]
    console.log(res_id)
    // const res_id = localStorage.getItem("res_id")
    const menu_items_container = document.getElementById("menu_container")
    const addItems = document.getElementById("addItem")
    const item_name = document.getElementById("name")
    const item_price = document.getElementById("price")
    const item_qty = document.getElementById("qty")
    const update_details = document.getElementById("saveUpdate")
    const update_name = document.getElementById("update_name")
    const update_price = document.getElementById("update_price")
    const update_qty = document.getElementById("update_qty")
    const resname_html=document.getElementById("res_name")
    const resname_heading=document.getElementById("res_name_heading")
    // const UpdateBtn=document.getElementById("UpdateBtn")
    const res = await fetch("/list_items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ "res_id": res_id })
    })

    const data = await res.json()
    if (data.success) {
        console.log(data)
        resname_html.innerText=resname
        resname_heading.innerText=resname
        // res_info.closest("h1").innerText = name
        Object.entries(data.res).forEach(([name, item]) => {
            menu_items_container.innerHTML +=
                `
            <div class="menu-item" item-id=${item.id}>
                <div class="item-details">
                    <h3>${name}</h3>
                    <p class="price">${item.price}</p>
                </div>
                <div class="item-img-wrapper">
                <img src="https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=300&q=80"
                alt="Burger">
                <button class="remove-btn" id=RemoveBtn>Remove</button>
                <button class="update-btn" >Update</button>
                    <p class="customisable">Customisable</p>
                </div>
            </div>

            <hr class="item-divider">
            `
        });
    }
    addItems.addEventListener("click", async () => {
        // console.log(item_name.value)
        const res = await fetch("/add_res_items", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ "res_id": res_id, "itm_name": item_name.value, "price": item_price.value, "itm_qty": item_qty.value })
        })
        const data = await res.json()
        if (data.success) {
            alert("new item added")
            // window.location.href = "/seller_items"
            window.location.reload()
        }
        else {
            alert("error adding items")
        }
    })
    // UpdateBtn.addEventListener("click",async()=>{

    // })
    document.addEventListener("click", async (e)=> {
        if (e.target.classList.contains("update-btn")) {

            const menuItem = e.target.closest(".menu-item");

            const itemId = menuItem.getAttribute("item-id");
            // OR dataset.id if you switch

            const name = menuItem.querySelector("h3").innerText;
            const price = menuItem.querySelector(".price").innerText;

            // store id globally
            currentItemId = itemId;

            // fill inputs
            update_name.value = name;
            update_price.value = price;
            update_qty.value = ""; // optional

            // show modal
            document.getElementById("updateModal").classList.remove("hidden");
        }
        if (e.target.classList.contains("remove-btn")) {

            const menuItem = e.target.closest(".menu-item");

            const itemId = menuItem.getAttribute("item-id");


            // store id globally
            currentItemId = itemId;
            const res = await fetch("/remove_items", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ "item_id": currentItemId})
            })
            const data = await res.json()
            if (data.success) {
                alert("item removed")
                window.location.href = "/seller_items"
            }
            else {
                alert("failed removing prices")
            }

        }
    });
    update_details.addEventListener("click", async () => {
        console.log("clicked")
        console.log(update_price.value)
        const res = await fetch("/update_item_details", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ "item_id": currentItemId, "name": update_name.value, "price": update_price.value })
        })
        const data = await res.json()
        if (data.success) {
            alert("price updated")
            window.location.href = "/seller_items"
        }
        else {
            alert("failed updating prices")
        }
    })
})