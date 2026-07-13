let map;
let marker;

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
    const currentAddress = document.getElementById("currentAddress")
    const livelocationBtn = document.getElementById("liveLocationBtn")
    const loading_container = document.getElementById("loading_container")
    const savedAddress = document.getElementById("savedAddress")
    const userId = pathParts[pathParts.length - 1];
    const maps_btn = document.getElementById("map_btn")
    const cancelbtn=document.getElementById("closeModal")
    console.log(userId)
    let position = null
    let userLocation = null;
    userLatt = null
    userLong = null
    map = await L.map('map').setView([17.3850, 78.4867], 13); // default (Hyderabad)
    console.log("map initialized");
    
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);
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
                Object.entries(data.results).forEach(([id, detail]) => {
                    // console.log(element)
                    console.log(detail)
                    display_resturants.innerHTML +=
                        `<div class="card" id=${id}>
                <div class="card-img">
                    
                    <img src=${detail.file_url} alt="Food">
                    <!-- <div class="img-overlay">ITEMS AT ₹129</div> -->
                </div>
                <div class="card-details">
                    <h3 class="resturant_name" >${detail.res_name}</h3>
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
        // console.log(fetchlocation)
        if (fetchlocation === null) {
            console.log("fetch=false")
            position = await getPosition();
            console.log(position)
            userLatt = position.coords.latitude;
            userLong = position.coords.longitude;
            console.log(userLatt, userLong)
        }
        if (fetchlocation !== null) {
            console.log(userId)
            const address = await fetch("/fetch_address", {
                method: "POST",
                "headers": { "Content-Type": "application/json" },
                body: JSON.stringify({ "user_id": userId })
            })
             if (address.status === 401) {
                    alert("Please log in.");
                    localStorage.clear()
                    window.location.href = "/login/user";
                    return;
                }
            const data = await address.json()
            console.log(data)
            console.log(data.status)
            if (data.success) {
                console.log("in fetch address")
                console.log(data)
                currentAddress.textContent = data.address[0].adrs_type + " - " + data.address[0].address
                currentAddress.dataset.long = data.address[0].coordinates.long
                currentAddress.dataset.lat = data.address[0].coordinates.latt

                userLatt = parseFloat(data.address[0].coordinates.latt)
                userLong = parseFloat(data.address[0].coordinates.long)
                data.address.forEach((addr) => {
                    savedAddress.innerHTML += `
                        <div class="address" data-latt=${addr.coordinates.latt} data-long=${addr.coordinates.long}>
                            <span class="type">${addr.adrs_type}</span>
                            <span class="address-text">${addr.address}</span>
                        </div>
                    `
                });
            }
            else {
                console.log("adrs not found");
                position = await getPosition();
                userLatt = position.coords.latitude;
                userLong = position.coords.longitude;
                console.log(userLatt, userLong)
            }
        }
        // else {
        //     userLatt = fetchlocation.latt
        //     userLong = fetchlocation.long;
        // }
        // console.log(fetchlocation.latt)
        console.log(userLatt, userLong)
        console.log("Location acquired:", userLatt, userLong);
        const address = await reverseGeocode(
            userLatt,
            userLong
        );

        console.log(address);
        currentAddress.textContent = address

        localStorage.setItem("currentAddress", address)

        // userLocation = { latt: userLatt, long: userLong }
        userLocation = { latt: userLatt, long: userLong }
        localStorage.setItem("userLocation", JSON.stringify(userLocation));
        // const userId = pathParts[pathParts.length - 1];
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
                Object.entries(data.results).forEach(([id, detail]) => {
                    // console.log(element)
                    console.log(detail)
                    display_resturants.innerHTML +=
                        `<div class="card" id=${id}>
                <div class="card-img">
                    
                    <img src=${detail.file_url} alt="Food">
                    <!-- <div class="img-overlay">ITEMS AT ₹129</div> -->
                </div>
                <div class="card-details">
                    <h3 class="resturant_name" >${detail.res_name}</h3>
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

                window.location.href = `/menu/${name}/${addresss}/${res_id}/${userId}`
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
    cancelbtn.addEventListener("click",()=>{
        document.getElementById("addressTagModal")
            .classList.remove("show");
    })
    savedAddress.addEventListener("click", async (e) => {
        const selected_address = e.target.closest(".address")
        const latt = parseFloat(selected_address.dataset.latt)
        const long = parseFloat(selected_address.dataset.long)
        change(latt, long)
        const addressType =
            selected_address.querySelector(".type").textContent;

        const addressText =
            selected_address.querySelector(".address-text").textContent;

        currentAddress.textContent = addressType + " - " + addressText
        box.classList.remove("show")
        overlay.classList.remove("show")
    })
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





    const searchBtn = document.getElementById("searchBtn");
    const searchContainer = document.getElementById("searchContainer");

    searchBtn.addEventListener("click", () => {
        searchContainer.style.display = "block"
        searchContainer.classList.toggle("active");

        if (searchContainer.classList.contains("active")) {
            searchContainer.querySelector("input").focus();
        }
    });
    const searchInput = document.getElementById("searchInput");

    searchInput.addEventListener("input", () => {
        const searchTerm = searchInput.value.toLowerCase();

        const cards = document.querySelectorAll(".card");

        cards.forEach(card => {
            const restaurantName = card
                .querySelector(".resturant_name")
                .textContent
                .toLowerCase();

            if (restaurantName.includes(searchTerm)) {
                card.style.display = "block";
            } else {
                card.style.display = "none";
            }
        });
    });




    const input = document.getElementById("addressInput");
    const suggestions = document.getElementById("suggestions");

    let timeout;

    input.addEventListener("input", () => {
        savedAddress.classList.remove("show")
        console.log("change detected");
        clearTimeout(timeout);

        timeout = setTimeout(async () => {
            const query = input.value.trim();

            if (query.length < 3) {
                suggestions.innerHTML = "";
                return;
            }

            try {
                const response = await fetch(
                    `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
                        query + ", Hyderabad"
                    )}&countrycodes=in&addressdetails=1&limit=5`
                );

                const results = await response.json();
                console.log(results)
                suggestions.innerHTML = results
                    .map(place => {

                        const displayParts = place.display_name.split(",");

                        const title = displayParts[0].trim(); // Noor Masjid
                        const subtitle = displayParts.slice(1, 3).join(", "); // Malakpet, Hyderabad

                        return `
            <div class="suggestion-item"
                 data-lat="${place.lat}"
                 data-lon="${place.lon}"
                 data-address="${title + "," + subtitle}">
                <i class="fa-solid fa-location-dot"></i>
                <div>
                    <div class="location-title">${title}</div>
                    <div class="location-subtitle">${subtitle}</div>
                </div>
            </div>
        `;
                    })
                    .join("");

            } catch (err) {
                console.error(err);
                suggestions.innerHTML =
                    "<div class='suggestion-item'>Unable to fetch locations</div>";
            }
        }, 300); // wait 300ms after typing stops
    });








    const trigger = document.getElementById("locationTrigger");
    const box = document.getElementById("locationBox");
    const overlay = document.getElementById("locationOverlay");

    trigger.addEventListener("click", () => {
        box.classList.add("show");
        overlay.classList.add("show");
        savedAddress.classList.add("show")
        document.getElementById("addressInput").focus();
    });

    overlay.addEventListener("click", () => {
        box.classList.remove("show");
        overlay.classList.remove("show");
    });

    const save_as_box = document.getElementById("addressTagModel")
    // save_as_box.addEventListener("click",async(e)=>{
    //     const selected_tag=e.target.closest(".tag-btn")
    //     const tag=selected_tag.dataset.tag.textContent
    //     console.log(tag);

    // })
    suggestions.addEventListener("click", (e) => {
        const item = e.target.closest(".suggestion-item");
        if (!item) return;

        document.getElementById("currentAddress").textContent =
            item.dataset.address;

        localStorage.setItem(
            "selectedAddress",
            item.dataset.address
        );
        document.getElementById("addressTagModal")
            .classList.add("show");
        box.classList.remove("show");
        overlay.classList.remove("show");

        const latti = parseFloat(item.dataset.lat);
        const longi = parseFloat(item.dataset.lon);
        console.log(latti, longi)
        change(latti, longi)
    });
    document.querySelectorAll(".tag-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const addressType = btn.dataset.tag;

            console.log(addressType); // Home / Work / Other
            const address = document.getElementById("currentAddress").textContent
            const address_latt = document.getElementById("currentAddress").dataset.lat
            const address_long = document.getElementById("currentAddress").dataset.long
            const cordinates = {
                latt: address_latt,
                long: address_long
            };
            document.getElementById("addressTagModal")
                .classList.remove("show");
            console.log(userId)
            res = await fetch("/save_address", {
                method: "POST",
                "headers": { "Content-Type": "application/json" },
                body: JSON.stringify({ "address": address, "address_type": addressType, "userId": userId, "cordinates": cordinates })
            })
            // Save to backend here
            currentAddress = addressType + " - " + address
        });
    });

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
        await change(livelctn.coords.latitude, livelctn.coords.longitude)
        loading_container.classList.remove("show");
        // box.classList.remove("show");
        overlay.classList.remove("show");
    })


    /*map*/

    // map = await L.map('map').setView([17.3850, 78.4867], 13); // default (Hyderabad)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);



    // Click on map to select location
    map.on('click', async (e) => {
        const { lat, lng } = e.latlng;

        // document.getElementById("lat").value = lat;
        // document.getElementById("lng").value = lng;
        const address = await reverseGeocode(
            lat,
            lng
        );

        console.log(address);
        currentAddress.dataset.long = userLong
        currentAddress.dataset.lat = userLatt
        currentAddress.textContent = address

        change(lat,lng)
        if (marker) {
            marker.setLatLng(e.latlng);
        } else {
            marker = L.marker(e.latlng).addTo(map);
        }
        setTimeout(() => {
            box.classList.remove("show")
            overlay.classList.remove("show")
            maps_btn.setAttribute("is_active",false)
            map_container.style.display = "none"
            map_container.style.position="absolute"
        }, 1000);
    });
    const map_container = document.getElementById("map_container");
    maps_btn.addEventListener("click", async (e) => {
        // await getLocation()
        if(maps_btn.getAttribute("is_active")==="false"){
                maps_btn.setAttribute("is_active",true)
                map_container.style.display = "block"
                map_container.style.position="relative"
                savedAddress.classList.remove("show")
                setTimeout(() => {
                map.invalidateSize();
                }, 100);

            await getLocation();
        }
        else{
            maps_btn.setAttribute("is_active",false)
            map_container.style.display = "none"
            map_container.style.position="absolute"
        }
    })
})
function getPosition() {
    console.log("in getPosition");
    
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


async function reverseGeocode(lat, lon) {
    const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
    );

    const data = await response.json();

    const address = data.address;

    return `${address.suburb || ""}, ${address.city || address.town || ""}`;
}

async function change(latt, long) {
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
    let currentAddress = document.getElementById("currentAddress")
    try {
        console.log(typeof (latt))
        typeof (latt)
        userLatt = latt
        userLong = long
        // console.log(fetchlocation.latt)
        console.log(userLatt, userLong)
        console.log("Location acquired:", userLatt, userLong);
        const address = await reverseGeocode(
            userLatt,
            userLong
        );

        console.log(address);
        currentAddress.dataset.long = userLong
        currentAddress.dataset.lat = userLatt
        // currentAddress.textContent = address


        // userLocation = { latt: userLatt, long: userLong }
        userLocation = { latt: userLatt, long: userLong }
        localStorage.setItem("userLocation", JSON.stringify(userLocation));
        // const userId = pathParts[pathParts.length - 1];
        // console.log(userId)
        loading.style.visibility = "visible"
        res = await fetch("/list_resturants", {
            method: "POST",
            "headers": { "Content-Type": "application/json" },
            body: JSON.stringify({ "latt": userLatt, "long": userLong, "dist": 5 })
            // body: JSON.stringify({ "latt": 17.38172489515112, "long": 78.4916357577191 })
        })
        const data = await res.json()
        console.log(data)
        if (data.success) {
            loading.style.display = "none"
            Note.style.display = "block"
            console.log(data)
            if (!data.results || Object.keys(data.results).length === 0) {
                console.log("Empty");
                no_results_container.style.display = "block";
                display_resturants.innerHTML = ""
            }
            else {
                console.log(data.results)
                // Object.entries(data.results).forEach(([name, id]) => {
                //     console.log(name, id)
                // })
                display_resturants.innerHTML = ""
                no_results_container.style.display = "none";
                Object.entries(data.results).forEach(([id, detail]) => {
                    // console.log(element)
                    console.log(detail)
                    display_resturants.innerHTML +=
                        `<div class="card" id=${id}>
                <div class="card-img">
                    
                    <img src=${detail.file_url} alt="Food">
                    <!-- <div class="img-overlay">ITEMS AT ₹129</div> -->
                </div>
                <div class="card-details">
                    <h3 class="resturant_name" >${detail.res_name}</h3>
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
                console.log(userId)
                window.location.href = `/menu/${name}/${addresss}/${res_id}/${userId}`
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
        // Note.style.display = "none"
        access_denied_container.style.visibility = "visible"
        Note.style.display = "none"
    }
}


async function getLocation () {
    // const maps = document.getElementById("map_container");
    const currentAddress = document.getElementById("currentAddress")
    // maps.classList.add("show");

    // setTimeout(() => {
    //     if (map) {
    //         map.invalidateSize();
    //     }
    // }, 100);
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async(position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                // document.getElementById("lat").value = lat;
                // document.getElementById("lng").value = lng;
                const address = await reverseGeocode(
                    lat,
                    lng
                );

                console.log(address);
                currentAddress.dataset.long = userLong
                currentAddress.dataset.lat = userLatt
                currentAddress.textContent = address

                // 🔥 update map
                map.setView([lat, lng], 15);

                if (marker) {
                    marker.setLatLng([lat, lng]);
                } else {
                    marker = L.marker([lat, lng]).addTo(map);
                }
            },
            () => alert("Location access denied")
        );
    }


}
getLocation()