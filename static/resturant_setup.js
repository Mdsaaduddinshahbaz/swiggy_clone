let map;
let marker;
let deliveryCircle = null;

// ---------- Helpers ----------

function hasSelectedLocation() {
    const lat = parseFloat(document.getElementById("lat").value);
    const lng = parseFloat(document.getElementById("lng").value);
    return !isNaN(lat) && !isNaN(lng);
}

function setLocation(lat, lng, zoom = 15) {
    document.getElementById("lat").value = lat;
    document.getElementById("lng").value = lng;

    map.setView([lat, lng], zoom);

    if (marker) {
        marker.setLatLng([lat, lng]);
    } else {
        marker = L.marker([lat, lng]).addTo(map);
    }
    updateDeliveryCircle();
}

// Draw / update / remove the circle based on current state
function updateDeliveryCircle() {
    const isAvailable = document.getElementById("deliveryAvailable").value === "true";
    const radiusValue = parseFloat(document.getElementById("deliveryRadius").value);

    // Remove circle if delivery is off, radius invalid, or no location
    if (!isAvailable || isNaN(radiusValue) || radiusValue <= 0 || !hasSelectedLocation()) {
        if (deliveryCircle) {
            map.removeLayer(deliveryCircle);
            deliveryCircle = null;
        }
        return;
    }

    const lat = parseFloat(document.getElementById("lat").value);
    const lng = parseFloat(document.getElementById("lng").value);
    const radiusMeters = radiusValue * 1000; // radius input assumed to be in KM

    if (deliveryCircle) {
        deliveryCircle.setLatLng([lat, lng]);
        deliveryCircle.setRadius(radiusMeters);
    } else {
        deliveryCircle = L.circle([lat, lng], {
            radius: radiusMeters,
            color: "#e23744",
            fillColor: "#e23744",
            fillOpacity: 0.15,
            weight: 2
        }).addTo(map);
    }

    // Keep the whole circle visible as it grows
    map.fitBounds(deliveryCircle.getBounds(), { padding: [20, 20] });
}

// Fetch current location only if seller hasn't picked one
function ensureLocation() {
    return new Promise((resolve) => {
        if (hasSelectedLocation()) return resolve(true);

        if (!navigator.geolocation) {
            alert("Geolocation is not supported by your browser");
            return resolve(false);
        }

        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation(position.coords.latitude, position.coords.longitude);
                resolve(true);
            },
            () => {
                alert("Location access denied. Please select your location on the map.");
                resolve(false);
            }
        );
    });
}

// ---------- Existing functions ----------

async function setupRestaurant() {
    const name = document.getElementById("name").value;
    const type = document.getElementById("type").value;
    const address = document.getElementById("address").value;
    const phone = document.getElementById("phone").value;
    const lat = document.getElementById("lat").value;
    const lng = document.getElementById("lng").value;
    const deliveryAvailableVal = document.getElementById("deliveryAvailable").value;
    const deliveryRadiusVal = document.getElementById("deliveryRadius").value;
    const path = window.location.pathname;
    const sellerId = path.split("/")[3];

    const formData = new FormData();
    formData.append("name", name);
    formData.append("type", type);
    formData.append("address", address);
    formData.append("phone", phone);
    formData.append("lat", lat);
    formData.append("lng", lng);
    formData.append("owner_id", sellerId);
    formData.append("delivery_available", deliveryAvailableVal);
    formData.append("delivery_radius", deliveryRadiusVal); // in km

    const file = document.getElementById("photo").files[0];
    if (file) {
        formData.append("photo", file);
    }

    const res = await fetch("/add_resturant", {
        method: "POST",
        body: formData
    });

    const data = await res.json();

    if (data.success) {
        localStorage.setItem("res_id", data.res_id);
        alert("Restaurant created!");
        window.location.href = `/seller/${name}/${data.res_id}`;
    } else {
        alert(data.message || "Error creating restaurant");
        console.error("Error creating restaurant:", data);
    }
}

function getLocation() {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation(position.coords.latitude, position.coords.longitude);
            },
            () => alert("Location access denied")
        );
    }
}

document.addEventListener("DOMContentLoaded", async () => {
    const createBtn = document.getElementById("createBtn");
    const photoInput = document.getElementById("photo");
    const preview = document.getElementById("preview");
    const deliveryAvailable = document.getElementById("deliveryAvailable");
    const deliveryRadiusGroup = document.getElementById("deliveryRadiusGroup");
    const deliveryRadius = document.getElementById("deliveryRadius");

    map = L.map("map").setView([17.3850, 78.4867], 13); // default (Hyderabad)

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap"
    }).addTo(map);

    // Delivery toggle
    deliveryAvailable.addEventListener("change", async function () {
        const isAvailable = this.value === "true";

        deliveryRadiusGroup.style.display = isAvailable ? "block" : "none";
        deliveryRadius.required = isAvailable;

        if (!isAvailable) {
            deliveryRadius.value = "";
            updateDeliveryCircle(); // removes the circle
            return;
        }

        // Yes selected: use current location if seller hasn't chosen one
        await ensureLocation();
        updateDeliveryCircle();
    });

    // Radius changes -> circle grows/shrinks live
    deliveryRadius.addEventListener("input", updateDeliveryCircle);

    photoInput.addEventListener("change", (e) => {
        const file = e.target.files[0];
        if (!file) return;
        preview.src = URL.createObjectURL(file);
        preview.style.display = "block";
    });

    createBtn.addEventListener("click", () => {
        setupRestaurant();
    });

    // Click on map to select location -> circle moves with it
    map.on("click", function (e) {
        const { lat, lng } = e.latlng;
        document.getElementById("lat").value = lat;
        document.getElementById("lng").value = lng;

        if (marker) {
            marker.setLatLng(e.latlng);
        } else {
            marker = L.marker(e.latlng).addTo(map);
        }
        updateDeliveryCircle();
    });
});