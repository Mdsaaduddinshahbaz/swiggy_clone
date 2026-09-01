// profile.js
// Powers the Profile page (tpl-profile). Same pattern as home.js:
// a guarded init function that (re)runs every time the router swaps
// this template into #spa-content.
//
// Assumed backend endpoints (adjust to match your actual Flask routes):
//   POST /fetch_profile  { user_id }               -> { success, user: {name, phone}, address: [...] }
//   POST /update_profile { user_id, name, phone }   -> { success }
// Address shape reused as-is from home.js's /fetch_address response.

function getProfileUserId() {
    const pathParts = window.location.pathname.split("/");
    return window.APP_USER_ID || pathParts[pathParts.length - 1];
}

function escapeHtmlProfile(str) {
    if (str === null || str === undefined) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

// Separate namespace from home.js's addListenerOnce so re-running
// initProfilePage() doesn't step on unrelated dataset flags.
function addListenerOnceProfile(el, event, handler) {
    if (!el) return;
    const key = `boundProfile_${event}`;
    if (el.dataset[key]) return;
    el.dataset[key] = "true";
    el.addEventListener(event, handler);
}

function renderProfileAddresses(addresses, listEl, emptyEl) {
    if (!addresses || addresses.length === 0) {
        listEl.innerHTML = "";
        emptyEl.style.display = "block";
        return;
    }
    emptyEl.style.display = "none";
    listEl.innerHTML = addresses.map(addr => `
        <div class="profile-address-card">
            <span class="profile-address-type">${escapeHtmlProfile(addr.adrs_type)}</span>
            <span class="profile-address-text">${escapeHtmlProfile(addr.address)}</span>
        </div>
    `).join("");
}

async function initProfilePage() {
    const profileCard = document.querySelector(".profile-card");
    if (!profileCard) return; // profile isn't the live page right now

    const userId = getProfileUserId();

    const nameInput = document.getElementById("profileNameInput");
    const phoneInput = document.getElementById("profilePhoneInput");
    const avatar = document.getElementById("profileAvatar");
    const editBtn = document.getElementById("editProfileBtn");
    const saveRow = document.getElementById("profileSaveRow");
    const saveBtn = document.getElementById("saveProfileBtn");
    const cancelBtn = document.getElementById("cancelProfileBtn");
    const addressList = document.getElementById("profileAddressList");
    const noAddress = document.getElementById("profileNoAddress");
    const ordersBtn = document.getElementById("profileOrdersBtn");
    const homeBtn = document.getElementById("profileHomeBtn");
    const logoutBtn = document.getElementById("logoutBtn");
    const loading = document.getElementById("profile_loading");

    let originalName = "";
    let originalPhone = "";

    addListenerOnceProfile(editBtn, "click", () => {
        nameInput.disabled = false;
        phoneInput.disabled = false;
        nameInput.focus();
        saveRow.classList.add("show");
    });

    addListenerOnceProfile(cancelBtn, "click", () => {
        nameInput.value = originalName;
        phoneInput.value = originalPhone;
        nameInput.disabled = true;
        phoneInput.disabled = true;
        saveRow.classList.remove("show");
    });

    addListenerOnceProfile(saveBtn, "click", async () => {
        const name = nameInput.value.trim();
        const phone = phoneInput.value.trim();
        if (!name) { alert("Name can't be empty"); return; }
        try {
            const res = await fetch("/update_profile", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ user_id: userId, name, phone })
            });
            if (!res.ok) throw new Error(`update_profile failed: ${res.status}`);
            const data = await res.json();
            if (data.success) {
                originalName = name;
                originalPhone = phone;
                avatar.textContent = (name.charAt(0) || "U").toUpperCase();
                nameInput.disabled = true;
                phoneInput.disabled = true;
                saveRow.classList.remove("show");
            } else {
                alert("Could not save changes");
            }
        } catch (e) {
            console.error("update_profile failed", e);
            alert("Could not save changes");
        }
    });

    // Reuse the router's global renderPage() so navigating away doesn't
    // do a hard reload — falls back to a plain redirect if it's ever
    // missing (e.g. profile.js loaded standalone without spa_router.js).
    addListenerOnceProfile(ordersBtn, "click", () => {
        if (typeof renderPage === "function") renderPage("orders");
        else window.location.href = `/orders/${userId}`;
    });

    addListenerOnceProfile(homeBtn, "click", () => {
        if (typeof renderPage === "function") renderPage("home");
        else window.location.href = `/user/${userId}`;
    });

    addListenerOnceProfile(logoutBtn, "click", () => {
        localStorage.clear();
        sessionStorage.clear();
        window.location.href = "/login/user";
    });

    try {
        if (loading) loading.classList.add("show");
        const res = await fetch("/fetch_profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id: userId })
        });
        if (res.status === 401) {
            alert("Please log in.");
            localStorage.clear();
            window.location.href = "/login/user";
            return;
        }
        if (!res.ok) throw new Error(`fetch_profile failed: ${res.status}`);
        const data = await res.json();
        if (data.success) {
            originalName = data.user?.name || "";
            originalPhone = data.user?.phone || "";
            nameInput.value = originalName;
            phoneInput.value = originalPhone;
            avatar.textContent = (originalName.charAt(0) || "U").toUpperCase();
            renderProfileAddresses(data.address, addressList, noAddress);
        }
    } catch (e) {
        console.error("initProfilePage failed", e);
    } finally {
        if (loading) loading.classList.remove("show");
    }
}

document.addEventListener("spa:pageload", (e) => {
    if (e.detail.page === "profile") initProfilePage();
});