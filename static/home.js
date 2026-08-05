let map;
let marker;

// ===== Cache helpers (shared across all restaurant-rendering code paths) =====
function getRestaurantCacheKey(userId) {
    return `cachedRestaurants_${userId}`;
}

function renderRestaurants(results, containers) {
    const { display_resturants, no_results_container } = containers;
    display_resturants.innerHTML = "";

    if (!results || Object.keys(results).length === 0) {
        no_results_container.style.display = "block";
        return;
    }

    no_results_container.style.display = "none";
    Object.entries(results).forEach(([id, detail]) => {
        display_resturants.innerHTML +=
            `<div class="card" id=${id}>
                <div class="card-img">
                    <img src=${detail.file_url} alt="Food">
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

document.addEventListener("DOMContentLoaded", async () => {
    const display_resturants = document.getElementById("resturants_container")
    const cartBtn = document.getElementById("CartBtn")
    const orderBtn = document.getElementById("OrdersBtn")
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
    const cancelbtn = document.getElementById("closeModal")
    console.log(userId)
    let position = null
    let userLocation = null;
    userLatt = null
    userLong = null

    const CACHE_KEY = getRestaurantCacheKey(userId);
    const renderContainers = { display_resturants, no_results_container };

    // 1. Show cached restaurants instantly, before location/network work even starts
    const cachedRestaurants = sessionStorage.getItem(CACHE_KEY);
    if (cachedRestaurants) {
        try {
            const cached = JSON.parse(cachedRestaurants);
            renderRestaurants(cached, renderContainers);
            Note.style.display = "block";
            loading.style.display = "none";
        } catch (e) {
            console.warn("bad restaurant cache, ignoring", e);
        }
    }

    map = await L.map('map').setView([17.3850, 78.4867], 13); // default (Hyderabad)
    console.log("map initialized");

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);
    select_options.addEventListener("change", async (e) => {
        console.log(e.target.value)
        const storedLocation = JSON.parse(
            localStorage.getItem("userLocation")
        );
        res = await fetch("/list_resturants", {
            method: "POST",
            "headers": { "Content-Type": "application/json" },
            body: JSON.stringify({ "latt": storedLocation.latt, "long": storedLocation.long, "dist": e.target.value })
        })
        const data = await res.json()
        if (data.success) {
            renderRestaurants(data.results, renderContainers);
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(data.results));
        }
        else {
            alert("error loading resturants")
        }
    })
    try {
        console.log(position)

        const fetchlocation = JSON.parse(
            localStorage.getItem("userLocation")
        );
        if (fetchlocation === null) {
            console.log("fetch=false")
            position = await getPosition();
            userLatt = position.coords.latitude;
            userLong = position.coords.longitude;
        }
        if (fetchlocation !== null) {
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
            // if(address.status===404){
            //     console.log("No address found for user, fetching current location...");
            //     return;
            // }
            const data = await address.json()
            console.log("fetch_address", data)
            
            if (data.success) {
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
                if(data.status===404){
                    console.log("No address found for user, fetching current location...");
                    // return;
                }
                // position = await getPosition();
                // userLatt = position.coords.latitude;
                // userLong = position.coords.longitude;
            }
        }
        if(localStorage.getItem("currentAddress")===null){
            position = await getPosition();
                userLatt = position.coords.latitude;
                userLong = position.coords.longitude;
            console.log("No current address found in localStorage", new Date().toLocaleTimeString());
            const address = await reverseGeocode(
                userLatt,
                userLong
            );

            currentAddress.textContent = address
            localStorage.setItem("currentAddress", address)

            userLocation = { latt: userLatt, long: userLong }
            localStorage.setItem("userLocation", JSON.stringify(userLocation));
        }
        else{
            console.log("Using cached current address from localStorage", new Date().toLocaleTimeString());
            currentAddress.textContent = localStorage.getItem("currentAddress")
            userLocation = JSON.parse(localStorage.getItem("userLocation"))
            userLatt = userLocation.latt
            userLong = userLocation.long
        }
        // Only show the spinner if we had nothing cached to display already
        if (!cachedRestaurants) {
            loading.style.visibility = "visible"
        }
        res = await fetch("/list_resturants", {
            method: "POST",
            "headers": { "Content-Type": "application/json" },
            body: JSON.stringify({ "latt": userLatt, "long": userLong, "dist": 5 })
        })
        const data = await res.json()
        if (data.success) {
            loading.style.display = "none"
            Note.style.display = "block"
            renderRestaurants(data.results, renderContainers);
            sessionStorage.setItem(CACHE_KEY, JSON.stringify(data.results));
        }
        else if (!cachedRestaurants) {
            alert("error loading resturants")
        }
        display_resturants.addEventListener("click", function (e) {
            const card = e.target.closest(".card")
            const res_id = card.getAttribute("id")
            if (card) {
                const name = card.querySelector(".resturant_name").textContent
                const addresss = card.querySelector(".area").textContent
                window.location.href = `/menu/${name}/${addresss}/${res_id}/${userId}`
            }
        })
        cartBtn.addEventListener("click", () => {
            window.location.href = `/cart/${userId}`
        })
        orderBtn.addEventListener("click", () => {
            window.location.href = `/orders/${userId}`
        })
    }
    catch (e) {
        console.log("access denied", e)
        console.error(e)
        // Only hide the listing if we had nothing cached to fall back on
        if (!cachedRestaurants) {
            Note.style.display = "none"
        }
    }

    cancelbtn.addEventListener("click", () => {
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
        localStorage.setItem("currentAddress", addressText)
        localStorage.setItem(
            "userLocation",
            JSON.stringify({ latt: latt, long: long })
        );
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

    // const searchBtn = document.getElementById("searchBtn");
    // const searchContainer = document.getElementById("searchContainer");

    // searchContainer.style.display = "block"
    // searchContainer.classList.toggle("active");

    // if (searchContainer.classList.contains("active")) {
    //     searchContainer.querySelector("input").focus();
    // }
    // const searchInput = document.getElementById("searchInput");

    // searchInput.addEventListener("input", () => {
    //     const searchTerm = searchInput.value.toLowerCase();
    //     const cards = document.querySelectorAll(".card");
    //     cards.forEach(card => {
    //         const restaurantName = card
    //             .querySelector(".resturant_name")
    //             .textContent
    //             .toLowerCase();
    //         if (restaurantName.includes(searchTerm)) {
    //             card.style.display = "block";
    //         } else {
    //             card.style.display = "none";
    //         }
    //     });
    // });

    // const indicator = document.querySelector(".active-indicator");

    // function moveIndicator(btn) {
    //     const x = btn.offsetLeft + (btn.offsetWidth - indicator.offsetWidth) / 2;
    //     indicator.style.transform = `translateX(${x}px)`;
    // }

    // const buttons = document.querySelectorAll(".nav-btn");

    // buttons.forEach(btn => {
    //     btn.addEventListener("click", () => {
    //         document.querySelector(".nav-btn.active")?.classList.remove("active");
    //         btn.classList.add("active");
    //         moveIndicator(btn);
    //     });
    // });

    // window.addEventListener("resize", () => {
    //     moveIndicator(document.querySelector(".nav-btn.active"));
    // });

    // moveIndicator(document.querySelector(".nav-btn.active"));

    const input = document.getElementById("addressInput");
    const suggestions = document.getElementById("suggestions");

    let timeout;

    input.addEventListener("input", () => {
        savedAddress.classList.remove("show")
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
                suggestions.innerHTML = results
                    .map(place => {
                        const displayParts = place.display_name.split(",");
                        const title = displayParts[0].trim();
                        const subtitle = displayParts.slice(1, 3).join(", ");

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
        }, 300);
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
        change(latti, longi)
    });
    document.querySelectorAll(".tag-btn").forEach(btn => {
        btn.addEventListener("click", async () => {
            const addressType = btn.dataset.tag;
            const address = document.getElementById("currentAddress").textContent
            const address_latt = document.getElementById("currentAddress").dataset.lat
            const address_long = document.getElementById("currentAddress").dataset.long
            const cordinates = {
                latt: address_latt,
                long: address_long
            };
            document.getElementById("addressTagModal")
                .classList.remove("show");
            res = await fetch("/save_address", {
                method: "POST",
                "headers": { "Content-Type": "application/json" },
                body: JSON.stringify({ "address": address, "address_type": addressType, "userId": userId, "cordinates": cordinates })
            })
            currentAddress = addressType + " - " + address
        });
    });

    livelocationBtn.addEventListener("click", async () => {
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
        overlay.classList.remove("show");
    })

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    map.on('click', async (e) => {
        const { lat, lng } = e.latlng;
        const address = await reverseGeocode(
            lat,
            lng
        );

        currentAddress.dataset.long = userLong
        currentAddress.dataset.lat = userLatt
        currentAddress.textContent = address
        localStorage.setItem("currentAddress", address)
        localStorage.setItem(
            "userLocation",
            JSON.stringify({ latt: lat, long: lng })
        );
        change(lat, lng)
        if (marker) {
            marker.setLatLng(e.latlng);
        } else {
            marker = L.marker(e.latlng).addTo(map);
        }
        setTimeout(() => {
            box.classList.remove("show")
            overlay.classList.remove("show")
            maps_btn.setAttribute("is_active", false)
            map_container.style.display = "none"
            map_container.style.position = "absolute"
        }, 1000);
    });
    const map_container = document.getElementById("map_container");
    maps_btn.addEventListener("click", async (e) => {
        if (maps_btn.getAttribute("is_active") === "false") {
            maps_btn.setAttribute("is_active", true)
            map_container.style.display = "block"
            map_container.style.position = "relative"
            savedAddress.classList.remove("show")
            setTimeout(() => {
                map.invalidateSize();
            }, 100);

            await getLocation();
        }
        else {
            maps_btn.setAttribute("is_active", false)
            map_container.style.display = "none"
            map_container.style.position = "absolute"
        }
    })
})
function getPosition() {
    console.log("Fetching user position...",new Date().toLocaleTimeString());
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
            location.reload();
        },
        error => {
            console.log(error);
        }
    );
}

async function reverseGeocode(lat, lon) {
    console.log("Reverse geocoding for coordinates:", lat, lon,new Date().toLocaleTimeString());
    const response = await fetch(
        `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
    );
    const data = await response.json();
    const address = data.address;
    return `${address.suburb || ""}, ${address.city || address.town || ""}`;
}

async function change(latt, long) {
    console.log("Changing location to:", latt, long,new Date().toLocaleTimeString());
    const display_resturants = document.getElementById("resturants_container")
    const cartBtn = document.getElementById("cartBtn")
    const orderBtn = document.getElementById("orderBtn")
    const pathParts = window.location.pathname.split("/");
    const userId = pathParts[pathParts.length - 1];
    const no_results_container = document.getElementById("no-results-container")
    const access_denied_container = document.getElementById("deny")
    const Note = document.getElementById("Note")
    const loading = document.getElementById("loading")
    let currentAddress = document.getElementById("currentAddress")
    try {
        userLatt = latt
        userLong = long
        const address = await reverseGeocode(
            userLatt,
            userLong
        );

        currentAddress.dataset.long = userLong
        currentAddress.dataset.lat = userLatt
        currentAddress.textContent = address
        userLocation = { latt: userLatt, long: userLong }
        localStorage.setItem("currentAddress", address)
        localStorage.setItem("userLocation", JSON.stringify(userLocation));
        loading.style.visibility = "visible"
        res = await fetch("/list_resturants", {
            method: "POST",
            "headers": { "Content-Type": "application/json" },
            body: JSON.stringify({ "latt": userLatt, "long": userLong, "dist": 5 })
        })
        const data = await res.json()
        if (data.success) {
            loading.style.display = "none"
            Note.style.display = "block"
            renderRestaurants(data.results, { display_resturants, no_results_container });
            sessionStorage.setItem(getRestaurantCacheKey(userId), JSON.stringify(data.results));
        }
        else {
            alert("error loading resturants")
        }
        display_resturants.addEventListener("click", function (e) {
            const card = e.target.closest(".card")
            const res_id = card.getAttribute("id")
            if (card) {
                const name = card.querySelector(".resturant_name").textContent
                const addresss = card.querySelector(".area").textContent
                window.location.href = `/menu/${name}/${addresss}/${res_id}/${userId}`
            }
        })
        // cartBtn.addEventListener("click", () => {
        //     window.location.href = `/cart/${userId}`
        // })
        // orderBtn.addEventListener("click", () => {
        //     window.location.href = `/orders/${userId}`
        // })
    }
    catch (e) {
        console.log("access denied", e)
        access_denied_container.style.visibility = "visible"
        Note.style.display = "none"
    }
}

async function getLocation() {
    console.log("Getting user location...",new Date().toLocaleTimeString());
    let currentAddress = document.getElementById("currentAddress")
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;
                const address = await reverseGeocode(
                    lat,
                    lng
                );
                currentAddress.dataset.long = userLong
                currentAddress.dataset.lat = userLatt
                currentAddress.textContent = address
                localStorage.setItem("currentAddress", address)
        localStorage.setItem(
            "userLocation",
            JSON.stringify({ latt: lat, long: lng })
        );
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
// getLocation()