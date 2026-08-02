const pathParts = window.location.pathname.split("/");
const resId = pathParts[pathParts.length - 1];
const resNameFromPath = pathParts[pathParts.length - 2];

// ---------- Sidebar navigation ----------

function goToDashboard() {
  window.location.href = `/seller/${resNameFromPath}/${resId}`;
}
function goToOrders() {
  window.location.href = `/seller/orders/${resId}`;
}
function goToMenu() {
  window.location.href = `/seller/menu/${resNameFromPath}/${resId}`;
}
function goToAnalytics() {
  window.location.href = `/seller/analytics/${resId}`;
}

// ---------- Elements ----------

const loadingState = document.getElementById("loadingState");
const profileForm = document.getElementById("profileForm");
const editToggle = document.getElementById("editToggle");
const formActions = document.getElementById("formActions");
const cancelBtn = document.getElementById("cancelBtn");

const fields = {
  resName: document.getElementById("resName"),
  ownerName: document.getElementById("ownerName"),
  email: document.getElementById("email"),
  phone: document.getElementById("phone"),
  cuisine: document.getElementById("cuisine"),
  address: document.getElementById("address"),
  openTime: document.getElementById("openTime"),
  closeTime: document.getElementById("closeTime"),
};

const openToggle = document.getElementById("openToggle");
const openLabel = document.getElementById("openLabel");
const ratingValue = document.getElementById("ratingValue");
const ratingCount = document.getElementById("ratingCount");

const avatarImg = document.getElementById("avatarImg");
const avatarInitial = document.getElementById("avatarInitial");
const avatarInput = document.getElementById("avatarInput");
const bannerImg = document.getElementById("bannerImg");
const bannerInput = document.getElementById("bannerInput");

let originalValues = {};
let pendingAvatarFile = null;
let pendingBannerFile = null;
let isEditing = false;

// ---------- Load profile ----------

async function loadProfile() {
  try {
    const res = await fetch("/seller/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ res_id: resId }),
    });
    const data = await res.json();
    console.log(data);

    if (!data.success) {
      loadingState.innerHTML = `<p>Couldn't load your profile. Try refreshing.</p>`;
      return;
    }

    const p = data.profile;

    fields.resName.value = p.res_name || "";
    fields.ownerName.value = p.owner_name || "";
    fields.email.value = p.email || "";
    fields.phone.value = p.phone || "";
    fields.cuisine.value = p.cuisine || "";
    fields.address.value = p.address || "";
    fields.openTime.value = p.open_time || "";
    fields.closeTime.value = p.close_time || "";

    openToggle.checked = !!p.is_open;
    openLabel.textContent = p.is_open ? "Open for orders" : "Closed";

    ratingValue.textContent = (p.rating ?? 0).toFixed(1);
    ratingCount.textContent = `(${p.rating_count ?? 0} ratings)`;

    avatarInitial.textContent = (p.res_name || "R").charAt(0).toUpperCase();
    if (p.logo_url) {
      avatarImg.src = p.logo_url;
      avatarImg.style.display = "block";
      avatarInitial.style.display = "none";
    }
    if (p.banner_url) {
      bannerImg.src = p.banner_url;
      bannerImg.style.display = "block";
    }

    originalValues = snapshotValues();

    loadingState.style.display = "none";
    profileForm.style.display = "grid";
  } catch (err) {
    console.error("Failed to load profile:", err);
    loadingState.innerHTML = `<p>Something went wrong loading your profile.</p>`;
  }
}

function snapshotValues() {
  const snap = {};
  Object.entries(fields).forEach(([key, el]) => (snap[key] = el.value));
  snap.isOpen = openToggle.checked;
  return snap;
}

// ---------- Edit mode ----------

function setEditing(on) {
  isEditing = on;
  Object.values(fields).forEach((el) => (el.disabled = !on));
  openToggle.disabled = !on;
  formActions.style.display = on ? "flex" : "none";
  editToggle.classList.toggle("active", on);
  editToggle.innerHTML = on
    ? `<i class="fa-solid fa-xmark"></i> Editing`
    : `<i class="fa-solid fa-pen"></i> Edit`;
}

editToggle.addEventListener("click", () => {
  if (isEditing) {
    setEditing(false);
  } else {
    setEditing(true);
  }
});

cancelBtn.addEventListener("click", () => {
  Object.entries(fields).forEach(([key, el]) => (el.value = originalValues[key]));
  openToggle.checked = originalValues.isOpen;
  pendingAvatarFile = null;
  pendingBannerFile = null;
  setEditing(false);
});

openToggle.addEventListener("change", () => {
  openLabel.textContent = openToggle.checked ? "Open for orders" : "Closed";
});

// ---------- Image previews ----------

avatarInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  pendingAvatarFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    avatarImg.src = reader.result;
    avatarImg.style.display = "block";
    avatarInitial.style.display = "none";
  };
  reader.readAsDataURL(file);
});

bannerInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) return;
  pendingBannerFile = file;
  const reader = new FileReader();
  reader.onload = () => {
    bannerImg.src = reader.result;
    bannerImg.style.display = "block";
  };
  reader.readAsDataURL(file);
});

// ---------- Save ----------

profileForm.addEventListener("submit", async (e) => {
  e.preventDefault();

  const saveBtn = document.getElementById("saveBtn");
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";

  try {
    const payload = new FormData();
    payload.append("res_id", resId);
    payload.append("res_name", fields.resName.value.trim());
    payload.append("owner_name", fields.ownerName.value.trim());
    payload.append("email", fields.email.value.trim());
    payload.append("phone", fields.phone.value.trim());
    payload.append("cuisine", fields.cuisine.value.trim());
    payload.append("address", fields.address.value.trim());
    payload.append("open_time", fields.openTime.value);
    payload.append("close_time", fields.closeTime.value);
    payload.append("is_open", openToggle.checked);
    if (pendingAvatarFile) payload.append("logo", pendingAvatarFile);
    if (pendingBannerFile) payload.append("banner", pendingBannerFile);

    const res = await fetch("/seller/update_profile", {
      method: "POST",
      body: payload,
    });
    const data = await res.json();

    if (data.success) {
      originalValues = snapshotValues();
      pendingAvatarFile = null;
      pendingBannerFile = null;
      setEditing(false);
    } else {
      alert(data.msg || "Couldn't save changes, try again.");
    }
  } catch (err) {
    console.error("Failed to save profile:", err);
    alert("Something went wrong saving your changes.");
  } finally {
    saveBtn.disabled = false;
    saveBtn.textContent = "Save Changes";
  }
});

// ---------- Init ----------

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("navDashboard").addEventListener("click", goToDashboard);
  document.getElementById("navOrders").addEventListener("click", goToOrders);
  document.getElementById("navMenu").addEventListener("click", goToMenu);
  document.getElementById("navAnalytics").addEventListener("click", goToAnalytics);

  setEditing(false);
  loadProfile();
});