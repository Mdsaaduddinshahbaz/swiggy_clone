async function setupRestaurant() {
    const name = document.getElementById("name").value;
    const address = document.getElementById("address").value;
    const phone = document.getElementById("phone").value;
    const lat = document.getElementById("lat").value;
    const lng = document.getElementById("lng").value;
    const path = window.location.pathname
    const sellerId = path.split("/")[3]

    // const sellerId = localStorage.getItem("seller_id");
    console.log(name, address, phone, lat, lng)
    const res = await fetch("/add_resturant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            name,
            address,
            phone,
            lat,
            lng,
            owner_id: sellerId
        })
    });

    const data = await res.json();

    if (data.success) {
        localStorage.setItem("res_id", data.res_id);
        alert("Restaurant created!");
        window.location.href = `/seller/${data.res_id}`;
    } else {
        alert("Error creating restaurant");
    }
}

function getLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const lat = position.coords.latitude;
                const lng = position.coords.longitude;

                document.getElementById("lat").value = lat;
                document.getElementById("lng").value = lng;

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
let map;
let marker;
document.addEventListener("DOMContentLoaded", async () => {
    const createBtn = document.getElementById("createBtn")
    createBtn.addEventListener("click", () => {
        setupRestaurant()
    })
    map = L.map('map').setView([17.3850, 78.4867], 13); // default (Hyderabad)

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap'
    }).addTo(map);

    

    // Click on map to select location
    map.on('click', function (e) {
        const { lat, lng } = e.latlng;

        document.getElementById("lat").value = lat;
        document.getElementById("lng").value = lng;

        if (marker) {
            marker.setLatLng(e.latlng);
        } else {
            marker = L.marker(e.latlng).addTo(map);
        }
    });
})