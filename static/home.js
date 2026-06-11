document.addEventListener("DOMContentLoaded", async () => {
    const display_resturants = document.getElementById("resturants_container")
    const cartBtn = document.getElementById("cartBtn")
    const orderBtn = document.getElementById("orderBtn")
    const pathParts = window.location.pathname.split("/");
    const no_results_container = document.getElementById("no-results-container")
    const select_options = document.getElementById("distance_options")
    const access_denied_container = document.getElementById("deny")
    const Note = document.getElementById("Note")
    const loading = document.getElementById("loading")
    const request_location = document.getElementById("requestlocation")
    let position = null
    let userLocation = null;
    userLatt = null
    userLong = null
    select_options.addEventListener("change", async (e) => {
        console.log(e.target.value)
        console.log(userLocation)
        const storedLocation = JSON.parse(
            localStorage.getItem("userLocation")
        );
        res = await fetch("/list_resturants", {
            method: "POST",
            "headers": { "Content-Type": "application/json" },
            body: JSON.stringify({ "latt": storedLocation.latt, "long": storedLocation.long, "dist": e.target.value })
            // body: JSON.stringify({ "latt": 17.38172489515112, "long": 78.4916357577191 })
        })
        const data = await res.json()
        if (data.success) {
            console.log(data)
            if (!data.results || Object.keys(data.results).length === 0) {
                console.log("Empty");
                no_results_container.style.display = "block";
            }
            else {
                console.log(data.results)
                display_resturants.innerHTML = ""
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
        }
        else {
            alert("error loading resturants")
        }
    })
    try {
        // position = await getPosition();
        console.log(position)
        const fetchlocation = JSON.parse(
            localStorage.getItem("userLocation")
        );
        console.log(fetchlocation)
        if (fetchlocation === null) {
            console.log("fetch=false")
            position = await getPosition();
            userLatt = position.coords.latitude;
            userLong = position.coords.longitude;
            console.log(userLatt, userLong)
        }
        else {
            userLatt = fetchlocation.latt
            userLong = fetchlocation.long;
        }
        // console.log(fetchlocation.latt)
        console.log(userLatt, userLong)
        console.log("Location acquired:", userLatt, userLong);
        // userLocation = { latt: userLatt, long: userLong }
        userLocation = { latt: userLatt, long: userLong }
        localStorage.setItem("userLocation", JSON.stringify(userLocation));
        const userId = pathParts[pathParts.length - 1];
        console.log(userId)
        loading.style.visibility = "visible"
        res = await fetch("/list_resturants", {
            method: "POST",
            "headers": { "Content-Type": "application/json" },
            body: JSON.stringify({ "latt": userLatt, "long": userLong, "dist": 5 })
            // body: JSON.stringify({ "latt": 17.38172489515112, "long": 78.4916357577191 })
        })
        const data = await res.json()
        if (data.success) {
            loading.style.display = "none"
            Note.style.display = "block"
            console.log(data)
            if (!data.results || Object.keys(data.results).length === 0) {
                console.log("Empty");
                no_results_container.style.display = "block";
            }
            else {
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
        }
        else {
            alert("error loading resturants")
        }
        display_resturants.addEventListener("click", function (e) {

            const card = e.target.closest(".card")
            const res_id = card.getAttribute("id")
            if (card) {
                console.log("Card clicked")
                // console.log(card)
                const name = card.querySelector(".resturant_name").textContent
                const addresss = card.querySelector(".area").textContent
                console.log(name)

                window.location.href = `/menu/${name}/${addresss}/${res_id}`
            }

        })
        cartBtn.addEventListener("click", () => {
            console.log("clicked")
            const userid = localStorage.getItem("userId")
            console.log(userid)
            window.location.href = `/cart/${userId}`
        })
        orderBtn.addEventListener("click", () => {
            console.log("clicked")
            const userid = localStorage.getItem("userId")
            console.log(userid)
            window.location.href = `/orders/${userId}`
        })
    }
    catch (e) {
        console.log("access denied", e)
        access_denied_container.style.visibility = "visible"
        Note.style.display = "none"
    }
    // position = await getPosition();
    // userLatt = position.coords.latitude;
    // userLong = position.coords.longitude;
    // console.log("Location acquired:", userLatt, userLong);
    // userLocation = { latt: userLatt, long: userLong }
    // const userId = pathParts[pathParts.length - 1];
    // console.log(userId)
    // res = await fetch("/list_resturants", {
    //     method: "POST",
    //     "headers": { "Content-Type": "application/json" },
    //     body: JSON.stringify({ "latt": userLatt, "long": userLong, "dist": 5 })
    //     // body: JSON.stringify({ "latt": 17.38172489515112, "long": 78.4916357577191 })
    // })
    // const data = await res.json()
    // if (data.success) {
    //     console.log(data)
    //     if (!data.results || Object.keys(data.results).length === 0) {
    //         console.log("Empty");
    //         no_results_container.style.display = "block";
    //     }
    //     else {
    //         console.log(data.results)
    //         // Object.entries(data.results).forEach(([name, id]) => {
    //         //     console.log(name, id)
    //         // })
    //         Object.entries(data.results).forEach(([name, detail]) => {
    //             // console.log(element)
    //             console.log(detail)
    //             display_resturants.innerHTML +=
    //                 `<div class="card" id=${detail.res_id}>
    //             <div class="card-img">

    //                 <img src="../static/food.jpg">
    //                 <!-- <div class="img-overlay">ITEMS AT ₹129</div> -->
    //             </div>
    //             <div class="card-details">
    //                 <h3 class="resturant_name" >${name}</h3>
    //                 <p class="rating"><i class="fa-solid fa-circle-star"></i> 4.2 • 25-30 mins</p>
    //                 <p class="cuisine">Burgers, American</p>
    //                 <p class="area">${detail.address}</p>
    //             </div>
    //         </div>`
    //         });
    //     }
    // }
    // else {
    //     alert("error loading resturants")
    // }
    // display_resturants.addEventListener("click", function (e) {

    //     const card = e.target.closest(".card")
    //     const res_id = card.getAttribute("id")
    //     if (card) {
    //         console.log("Card clicked")
    //         // console.log(card)
    //         const name = card.querySelector(".resturant_name").textContent
    //         const addresss = card.querySelector(".area").textContent
    //         console.log(name)

    //         window.location.href = `/menu/${name}/${addresss}/${res_id}`
    //     }

    // })
    // cartBtn.addEventListener("click", () => {
    //     console.log("clicked")
    //     const userid = localStorage.getItem("userId")
    //     console.log(userid)
    //     window.location.href = `/cart/${userId}`
    // })
    // orderBtn.addEventListener("click", () => {
    //     console.log("clicked")
    //     const userid = localStorage.getItem("userId")
    //     console.log(userid)
    //     window.location.href = `/orders/${userId}`
    // })
    request_location.addEventListener("click", async () => {
        try {
            const position = await getPosition();

            const userLocation = {
                latt: position.coords.latitude,
                long: position.coords.longitude
            };

            localStorage.setItem(
                "userLocation",
                JSON.stringify(userLocation)
            );

            location.reload();
        } catch (err) {
            console.log(err);
        }
    });
})
function getPosition() {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject("Geolocation is not supported by your browser");
        }
        navigator.geolocation.getCurrentPosition(resolve, reject);
    });
}
function requestLocation() {
    navigator.geolocation.getCurrentPosition(
        position => {
            console.log(position);
            location.reload();
        },
        error => {
            console.log(error);
        }
    );
}