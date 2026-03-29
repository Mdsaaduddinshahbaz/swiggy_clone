document.addEventListener("DOMContentLoaded", async () => {
    const display_resturants = document.getElementById("resturants_container")
    const cartBtn=document.getElementById("cartBtn")
    const orderBtn=document.getElementById("orderBtn")
    const pathParts = window.location.pathname.split("/");

    const userId = pathParts[pathParts.length - 1];
    console.log(userId)
    res = await fetch("/list_resturants", {
        method: "POST",
        "headers": { "Content-Type": "application/json" },
        body: JSON.stringify({ "latt": 17.38172489515112, "long": 78.4916357577191 })
    })
    const data = await res.json()
    if (data.success) {
        console.log(data.results)
        // Object.entries(data.results).forEach(([name, id]) => {
        //     console.log(name, id)
        // })
        Object.entries(data.results).forEach(([name, detail]) => {
            // console.log(element)
            console.log(detail)
            display_resturants.innerHTML +=
                `<div class="card" id=${detail.res_id}>
                <div class="card-img">
                    
                    <img src="../static/food.jpg">
                    <!-- <div class="img-overlay">ITEMS AT ₹129</div> -->
                </div>
                <div class="card-details">
                    <h3 class="resturant_name" >${name}</h3>
                    <p class="rating"><i class="fa-solid fa-circle-star"></i> 4.2 • 25-30 mins</p>
                    <p class="cuisine">Burgers, American</p>
                    <p class="area">${detail.address}</p>
                </div>
            </div>`
        });
    }
    else {
        alert("error loading resturants")
    }
    display_resturants.addEventListener("click", function (e) {

        const card = e.target.closest(".card")
        const res_id=card.getAttribute("id")
        if (card) {
            console.log("Card clicked")
            // console.log(card)
            const name = card.querySelector(".resturant_name").textContent
            const addresss = card.querySelector(".area").textContent
            console.log(name)
            
            window.location.href=`/menu/${name}/${addresss}/${res_id}`
        }

    })
    cartBtn.addEventListener("click", () => {
        console.log("clicked")
        const userid = localStorage.getItem("userId")
        console.log(userid)
        window.location.href = `/cart/${userId}`
    })
    orderBtn.addEventListener("click",()=>{
        console.log("clicked")
        const userid = localStorage.getItem("userId")
        console.log(userid)
        window.location.href = `/orders/${userId}`
    })
})