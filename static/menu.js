document.addEventListener("DOMContentLoaded", async () => {
    const path = window.location.pathname
    const res_id = path.split("/")[3]
    const res_name = path.split("/")[2]
    console.log(res_name)
    const decoded = decodeURIComponent(res_name);
    const menu_items_container = document.getElementById("menu_container")
    const cartBtn = document.getElementById("cartBtn")
    const orderBtn = document.getElementById("orderBtn")
    // const res_info=document.getElementById("res_info")
    const res_info = document.querySelector(".res-info");
    const heading = res_info.querySelector("h1");

    heading.innerText = decoded;
    const res = await fetch("/list_items", {
        method: "POST",
        "headers": { "Content-Type": "application/json" },
        body: JSON.stringify({ "res_id": res_id })
    })

    const data = await res.json()
    if (data.success) {
        console.log(data)
        // res_info.closest("h1").innerText = name
        Object.entries(data.res).forEach(([name, item]) => {
            menu_items_container.innerHTML +=
                `
            <div class="menu-item" id=${item.id}>
                <div class="item-details">
                    <h3>${name}</h3>
                    <p class="price">${item.price}</p>
                </div>
                <div class="item-img-wrapper">
                    <img src="https://images.unsplash.com/photo-1571091718767-18b5b1457add?auto=format&fit=crop&w=300&q=80"
                        alt="Burger">
                    <button class="add-btn" id=addBtn>ADD</button>
                    <p class="customisable">Customisable</p>
                </div>
            </div>

            <hr class="item-divider">
            `
        });
    }
    cartBtn.addEventListener("click", () => {
        console.log("clicked")
        const userid = localStorage.getItem("userId")
        console.log(userid)
        window.location.href = `/cart/${userid}`
    })
    orderBtn.addEventListener("click",()=>{
        console.log("clicked")
        const userid = localStorage.getItem("userId")
        console.log(userid)
        window.location.href = `/orders/${userid}`
    })
    menu_items_container.addEventListener("click", async (e) => {
        if (e.target.classList.contains("add-btn")) {

            // Get item details
            const item = e.target.closest(".menu-item");
            const names = item.querySelector("h3").innerText;
            const price = item.querySelector(".price").innerText;

            console.log("Added:", names, price);
            const userid = localStorage.getItem("userId")
            // 👉 Here you can send to backend / Redis
            const res = await fetch("/add_to_cart", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    resid:res_id,
                    userid: userid,
                    item: names,
                    ress_name:decoded,
                    qty: 1,
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
})