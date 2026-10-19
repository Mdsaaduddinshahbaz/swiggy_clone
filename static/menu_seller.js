const pathParts = window.location.pathname.split("/");

const resId = pathParts[pathParts.length - 1];
const type = pathParts[pathParts.length - 4];
const name = pathParts[pathParts.length - 2];
const resname = pathParts[pathParts.length - 2];
console.log(type);

document.addEventListener("DOMContentLoaded", async () => {
  const homeBtn = document.getElementById("homeBtn");
  homeBtn.addEventListener("click", () => {
    window.location.href = `/seller/${name}/${resId}`;
  });

  const res = await fetch("/list_items", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ res_id: resId, type: type })
  });

  if (res.status == 401) {
    alert("unauthorized,Please Log in");
    window.location.href = "/login/seller";
    return;
  }

  const data = await res.json();
  console.log(data);

  if (data.success) {
    state.tree = data.categories.categories.map(cat => ({
      id: String(cat._id),
      name: cat.name,
      subcategories: cat.subcategories.map(sub => ({
        id: String(sub._id),
        name: sub.name
      }))
    }));

    state.items = Object.entries(data.res).map(([id, item]) => ({
      id: id,
      name: item.name,
      desc: item.desc || "",
      unit: item.unit || "",
      price: Number(item.price),
      stock: Number(item.item_qty - item.sold),
      lowAt: Number(item.lowat),
      available: item.available,
      subId: String(item.sub_id),
      url: item.file_url
    }));

    render();
  }
});

const seedTree = [
  {
    id: "cat-1",
    name: "Grocery & Staples",
    subcategories: [
      { id: "sub-1", name: "Rice" },
      { id: "sub-2", name: "Atta & Flour" },
      { id: "sub-3", name: "Pulses & Dal" },
      { id: "sub-4", name: "Sugar & Salt" },
      { id: "sub-5", name: "Edible Oils & Ghee" },
      { id: "sub-6", name: "Dry Fruits" }
    ]
  },
  {
    id: "cat-2",
    name: "Spices & Masalas",
    subcategories: [
      { id: "sub-7", name: "Whole Spices" },
      { id: "sub-8", name: "Powder Spices" },
      { id: "sub-9", name: "Blended Masalas" }
    ]
  },
  {
    id: "cat-3",
    name: "Beverages",
    subcategories: [
      { id: "sub-10", name: "Tea & Coffee" },
      { id: "sub-11", name: "Soft Drinks" },
      { id: "sub-12", name: "Juices" }
    ]
  }
];

const seedItems = [
  {
    id: "SKU-1001",
    name: "India Gate Basmati Rice",
    subId: "sub-1",
    unit: "5 kg bag",
    price: 549,
    stock: 28,
    lowAt: 10,
    available: true,
    desc: "Aged long-grain basmati rice.",
    url: "https://drive.google.com/thumbnail?id=1RWYdWg-vzwMi5P048a7RVKdxyoA5mye3&sz=w1000"
  },
  {
    id: "SKU-1002",
    name: "Sona Masoori Rice",
    subId: "sub-1",
    unit: "10 kg bag",
    price: 620,
    stock: 6,
    lowAt: 8,
    available: true,
    desc: "Everyday medium-grain rice.",
    url: "https://drive.google.com/thumbnail?id=1RWYdWg-vzwMi5P048a7RVKdxyoA5mye3&sz=w1000"
  },
  {
    id: "SKU-1011",
    name: "Aashirvaad Atta",
    subId: "sub-2",
    unit: "5 kg bag",
    price: 249,
    stock: 32,
    lowAt: 10,
    available: true,
    desc: "Whole wheat flour, stone-ground.",
    url: "https://drive.google.com/thumbnail?id=1RWYdWg-vzwMi5P048a7RVKdxyoA5mye3&sz=w1000"
  }
];

const state = {
  tree: structuredClone(seedTree),
  items: structuredClone(seedItems),

  expanded: {
    "cat-1": true
  },

  activeSub: null,
  activeCat: null, // NEW: selected category (shows all items in its subcategories)
  query: "",
  stockFilter: "all",

  editingItem: null,
  drawerOpen: false,
  subcategoryDrawerOpen: false,
  activeCategory: null,
  categoryDrawerOpen: false
};

function openSubcategoryDrawer(cat) {
  state.activeCategory = cat.id;
  state.subcategoryDrawerOpen = true;

  const overlay = document.getElementById("subcategoryDrawer");
  overlay.classList.add("open");

  const input = overlay.querySelector("#subcatName");
  input.value = "";
  input.focus();

  const title = overlay.querySelector("#subDrawerTitle");
  title.textContent = `Add subcategory to ${cat.name}`;
}

function closeSubcategoryDrawer() {
  console.log("in closeSubcategory");
  state.subcategoryDrawerOpen = false;
  state.activeCategory = null;
  document.getElementById("subcategoryDrawer").classList.remove("open");
}

function openItemDrawer(item = null) {
  hideNameDropdown();
  state.editingItem = item;
  state.drawerOpen = true;

  const drawer = document.getElementById("itemDrawer");
  drawer.classList.remove("hidden");

  document.getElementById("drawerTitle").textContent = item ? "Edit Item" : "Add Item";

  document.getElementById("itemName").value = item?.name || "";
  document.getElementById("itemDesc").value = item?.desc || "";
  setUnitFields(item?.unit || "");
  document.getElementById("itemPrice").value = item?.price || "";
  document.getElementById("itemStock").value = item?.stock || "";
  document.getElementById("itemLow").value = item?.lowAt || 10;
  document.getElementById("itemListed").checked = item?.available ?? true;

  // ---- barcode scanner: only show "Scan barcode" when ADDING, reset photo/status ----
  scanWrap.style.display = item ? "none" : "block";
  setScanStatus("");
  resetPhotoUi();

  const select = document.getElementById("itemSub");
  select.innerHTML = "";

  state.tree.forEach(cat => {
    const group = document.createElement("optgroup");
    group.label = cat.name;

    cat.subcategories.forEach(sub => {
      const option = document.createElement("option");
      option.value = sub.id;
      option.textContent = sub.name;
      group.appendChild(option);
    });

    select.appendChild(group);
  });

  select.value =
    item?.subId ||
    state.activeSub ||
    state.tree[0].subcategories[0].id;
}

function closeDrawer() {
  state.drawerOpen = false;
  document.getElementById("itemDrawer").classList.add("hidden");
}

async function saveItem() {
  const file = document.getElementById("photo").files[0];
  const item = {
    id: state.editingItem?.id || `SKU-${Date.now()}`,
    name: document.getElementById("itemName").value,
    desc: document.getElementById("itemDesc").value,
    unit: getUnitString(),
    price: Number(document.getElementById("itemPrice").value),
    stock: Number(document.getElementById("itemStock").value),
    lowAt: Number(document.getElementById("itemLow").value),
    subId: document.getElementById("itemSub").value,
    available: document.getElementById("itemListed").checked,
    url: state.editingItem?.url || null // keep existing image when editing
  };
  console.log(item.subId);

  const formData = new FormData();

  formData.append("res_id", resId);
  formData.append("sub_id", item.subId);
  formData.append("desc", item.desc);
  formData.append("itm_name", item.name);
  formData.append("unit", item.unit);
  formData.append("price", item.price);
  formData.append("itm_qty", item.stock);
  formData.append("lowat", item.lowAt);
  formData.append("available", item.available);
  formData.append("sold", 0);
  if (file) {
    formData.append("photo", file);
  }

  if (state.editingItem) {
    formData.append("item_id", item.id);
    formData.append("name", item.name);
    formData.append("unit", item.unit);
    formData.append("price", item.price);
    formData.append("lowAt", item.lowAt);
    formData.append("desc", item.desc);
    formData.append("subId", item.subId);
    formData.append("stock", item.stock);
    formData.append("available", item.available);
    if (file) {
      formData.append("photo", file);
    }

    const res = await fetch("/update_item_details", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    console.log(data);

    if (data.success) {
      if (data.img_url) item.url = data.img_url;
      state.items = state.items.map(i => (i.id === item.id ? item : i));
    } else {
    }
  } else {
    const res = await fetch("/add_res_items", {
      method: "POST",
      body: formData
    });
    const data = await res.json();
    if (data.success) {
      console.log(data);
      item.id = data.id;
      item.url = data.img_url;
      state.items.unshift(item);
    } else {
    }
  }

  state.editingItem = null;
  closeDrawer();
  render();
}

function deleteItem(id) {
  state.items = state.items.filter(i => i.id !== id);
  render();
}

function renderTree() {
  const tree = document.getElementById("categoryTree");
  tree.innerHTML = "";

  const allBtn = document.getElementById("allItemsBtn");
  allBtn.classList.toggle(
    "active",
    state.activeSub === null && state.activeCat === null
  );

  state.tree.forEach((cat, index) => {
    const wrapper = document.createElement("div");
    const btn = document.createElement("button");

    btn.style.cssText = `
      width:100%;
      text-align:left;
      padding:10px 20px;
      border:none;
      background:${state.activeCat === cat.id ? "#EAE6D9" : "none"};
      cursor:pointer;
      display:flex;
      align-items:center;
      gap:8px;
      font-family:Fraunces;
      font-size:14px;
      font-weight:600;
    `;

    btn.innerHTML = `
      <span>
        ${state.expanded[cat.id] ? "▼" : "▶"}
      </span>

      <span>
        ${index + 1}.
        ${cat.name}
      </span>
    `;

    // Category click: toggle expand + select category (shows all its items)
    btn.onclick = () => {
      state.expanded[cat.id] = !state.expanded[cat.id];
      state.activeCat = cat.id;
      state.activeSub = null;
      render();
    };

    wrapper.appendChild(btn);

    if (state.expanded[cat.id]) {
      cat.subcategories.forEach(sub => {
        const count = state.items.filter(i => i.subId === sub.id).length;

        const subBtn = document.createElement("button");

        subBtn.style.cssText = `
          width:100%;
          border:none;
          background:${state.activeSub === sub.id ? "#EAE6D9" : "transparent"};
          cursor:pointer;
          padding:8px 20px 8px 42px;
          display:flex;
          justify-content:space-between;
          align-items:center;
        `;

        subBtn.innerHTML = `
          <span>
            ${sub.name}
          </span>

          <span
            style="
              font-family:'JetBrains Mono';
              font-size:11px;
              color:#87897F;
            "
          >
            ${count}
          </span>
        `;

        subBtn.onclick = () => {
          state.activeSub = sub.id;
          state.activeCat = null;
          render();
          if (window.innerWidth <= 768) {
            closeSidebar();
          }
        };

        wrapper.appendChild(subBtn);
      });

      // Add Subcategory button
      const addBtn = document.createElement("button");

      addBtn.style.cssText = `
        width:100%;
        border:none;
        background:transparent;
        cursor:pointer;
        padding:10px 20px 10px 42px;
        text-align:left;
        color:#2E6F4E;
        font-weight:600;
      `;
      addBtn.className = "tree-add-sub";
      addBtn.innerHTML = "+ Add subcategory";

      addBtn.onclick = () => {
        openSubcategoryDrawer(cat);
      };

      wrapper.appendChild(addBtn);
    }

    tree.appendChild(wrapper);
  });
}

function getSubLookup() {
  const map = {};

  state.tree.forEach(cat => {
    cat.subcategories.forEach(sub => {
      map[sub.id] = {
        ...sub,
        catId: cat.id,
        catName: cat.name
      };
    });
  });

  return map;
}

// Returns items belonging to the currently selected category (all subcategories)
function getCategoryItems(catId) {
  const catObj = state.tree.find(c => c.id === catId);
  if (!catObj) return [];
  const subIds = catObj.subcategories.map(s => s.id);
  return state.items.filter(i => subIds.includes(i.subId));
}

async function renderCards() {
  const grid = document.getElementById("itemsGrid");
  grid.innerHTML = "";

  const catObj = state.tree.find(c => c.id === state.activeCat);
  const catSubIds = catObj ? catObj.subcategories.map(s => s.id) : [];

  let items = state.items.filter(item => {
    const subMatch = state.activeSub
      ? item.subId === state.activeSub
      : state.activeCat
        ? catSubIds.includes(item.subId)
        : true;

    const searchMatch =
      item.name.toLowerCase().includes(state.query.toLowerCase()) ||
      item.id.toLowerCase().includes(state.query.toLowerCase());

    const stockMatch =
      state.stockFilter === "all" ||
      (state.stockFilter === "low" &&
        item.stock > 0 &&
        item.stock <= item.lowAt) ||
      (state.stockFilter === "out" && item.stock === 0);

    return subMatch && searchMatch && stockMatch;
  });

  if (!items.length) {
    grid.innerHTML = `
      <div
        style="
          padding:60px;
          text-align:center;
          color:#87897F;
          grid-column:1/-1;
        "
      >
        No items match here yet.
      </div>
    `;
    return;
  }

  items.forEach(item => {
    const low = item.stock > 0 && item.stock <= item.lowAt;
    const out = item.stock === 0;

    const card = document.createElement("div");
    card.className = "card";
    card.style.position = "relative";

    let badge = "";

    if (low) {
      badge = `
        <div
          style="
            position:absolute;
            top:12px;
            right:12px;
            background:#FCEFDE;
            color:#C97A1F;
            padding:4px 8px;
            border-radius:20px;
            font-size:11px;
            font-weight:600;
          "
        >
          Low stock
        </div>
      `;
    }

    if (out) {
      badge = `
        <div
          style="
            position:absolute;
            top:12px;
            right:12px;
            background:#FBEAE7;
            color:#B23B30;
            padding:4px 8px;
            border-radius:20px;
            font-size:11px;
            font-weight:600;
          "
        >
          Out of stock
        </div>
      `;
    }

    card.innerHTML = `
      ${badge}

      <div
        style="
          font-family:
          'JetBrains Mono';
          font-size:11px;
          color:#87897F;
          margin-bottom:10px;
          overflow-wrap: anywhere;
        "
      >
        ${item.id}
      </div>
      <img src="${item.url}" alt="food" style="
        position: absolute;
        right: 18px;
        top: 48px;
        height: 86px;
        border-radius: 20px;
        object-fit: cover;
        width: 86px;
      ">
      <h3 style="display: block;word-wrap: anywhere;width: 60%;">
        ${item.name}
      </h3>

      <div>
        ${item.unit}
      </div>

      <p>
        ${item.desc}
      </p>

      <div
        class="card-price"
      >
        ₹${item.price}
      </div>

      <div
        class="card-stock"
        style="
          color:
            ${out ? "#B23B30" : low ? "#C97A1F" : "#2E6F4E"};
        "
      >
        ${out ? "Out of stock" : `${item.stock} in stock`}
      </div>
    `;

    const controls = document.createElement("div");
    controls.className = "controlsContainer";
    controls.style.cssText = `
display:flex;
justify-content:flex-end;
gap:10px;
margin-top:15px;
`;

    const edit = document.createElement("button");
    edit.textContent = "Edit";
    edit.style.cssText = `
padding:6px 10px;
border:1px solid #E1DED2;
background:white;
border-radius:6px;
cursor:pointer;
`;
    edit.onclick = async () => openItemDrawer(item);

    const del = document.createElement("button");
    del.textContent = "Delete";
    del.style.cssText = `
padding:6px 10px;
border:1px solid #E1DED2;
background:white;
border-radius:6px;
cursor:pointer;
color:#B23B30;
`;
    del.onclick = async () => {
      const res = await fetch("/remove_items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item_id: item.id })
      });
      const data = await res.json();
      if (data.success) {
        deleteItem(item.id);
      } else {
      }
    };

    controls.appendChild(edit);
    controls.appendChild(del);
    card.appendChild(controls);
    grid.appendChild(card);
  });
}

function closeCategoryDrawer() {
  console.log("closeCategoryDrawer clicked");
  state.categoryDrawerOpen = false;
  document.getElementById("categoryDrawer").classList.add("hidden");
}

function showCategoryDrawer() {
  console.log("showCategoryDrawer clicked");
  state.categoryDrawerOpen = true;
  document.getElementById("categoryDrawer").classList.remove("hidden");
}

function renderStats() {
  document.getElementById("totalItems").textContent = state.items.length;

  document.getElementById("listedItems").textContent = state.items.filter(
    i => i.available
  ).length;

  document.getElementById("lowItems").textContent = state.items.filter(
    i => i.stock > 0 && i.stock <= i.lowAt
  ).length;

  document.getElementById("outItems").textContent = state.items.filter(
    i => i.stock === 0
  ).length;
}

function render() {
  renderTree();
  renderCards();
  renderStats();
  renderHeader();
}

function renderHeader() {
  const lookup = getSubLookup();
  const title = document.getElementById("headerTitle");
  const crumb = document.getElementById("breadcrumb");

  // Category selected: show category name + names of all items in it
  if (state.activeCat) {
    const cat = state.tree.find(c => c.id === state.activeCat);
    if (cat) {
      const names = getCategoryItems(cat.id).map(i => i.name);
      title.textContent = cat.name;
      return;
    }
  }

  if (!state.activeSub) {
    title.textContent = "All items";
    crumb.textContent = "Every category";
    return;
  }

  const sub = lookup[state.activeSub];

  title.textContent = sub.name;
  crumb.textContent = `${sub.catName} / ${sub.name}`;
}

document.getElementById("searchInput").addEventListener("input", e => {
  state.query = e.target.value;
  render();
});

document.getElementById("allItemsBtn").onclick = () => {
  state.activeSub = null;
  state.activeCat = null;
  render();
  if (window.innerWidth <= 768) {
    closeSidebar();
  }
};

document.getElementById("stockFilter").addEventListener("change", e => {
  state.stockFilter = e.target.value;
  render();
});

document.getElementById("hideCategoryBtn").addEventListener("click", function () {
  closeSidebar();
});

document.getElementById("addItemBtn").onclick = () => openItemDrawer();
document.getElementById("cancelSubBtn").onclick = closeSubcategoryDrawer;
document.getElementById("closeDrawer").onclick = closeDrawer;
document.getElementById("closeCategoryDrawer").onclick = closeCategoryDrawer;
document.getElementById("addCategoryBtn").onclick = showCategoryDrawer;
document.getElementById("saveItemBtn").onclick = saveItem;
document.getElementById("menuToggle").onclick = openSidebar;
document.getElementById("sidebarOverlay").onclick = closeSidebar;

render();

function openSidebar() {
  state.sidebarOpen = true;
  document.querySelector(".sidebar").classList.add("open");
  document.getElementById("sidebarOverlay").classList.remove("hidden");
}

function closeSidebar() {
  state.sidebarOpen = false;
  document.querySelector(".sidebar").classList.remove("open");
  document.getElementById("sidebarOverlay").classList.add("hidden");
}

const saveCategoryBtn = document.getElementById("saveCategoryBtn");
saveCategoryBtn.addEventListener("click", async () => {
  const cat = document.querySelector("#categoryDrawer");
  const drawer = cat.querySelector(".drawer");
  const catName = drawer.querySelector("#catName").value;
  const subNames = drawer
    .querySelector("#subNames")
    .value.split("\n")
    .map(item => item.trim())
    .filter(item => item !== "");
  console.log(catName);
  console.log(subNames);

  if (!catName.trim() || !subNames.length) {
    return;
  }

  const res = await fetch("/save_categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      res_id: resId,
      cat_name: catName,
      subcats: subNames
    })
  });
  const data = await res.json();
  console.log(data);

  if (data.success) {
    console.log("updated");
    const cat = data.category;
    state.tree.push({
      id: String(cat._id),
      name: cat.name,
      subcategories: cat.subcategories.map(sub => ({
        id: String(sub._id),
        name: sub.name
      }))
    });

    render();
    closeCategoryDrawer();
  } else {
    console.log("not updated");
  }
});

document.getElementById("saveSubBtn").onclick = async () => {
  const name = document.getElementById("subcatName").value.trim();

  if (!name) return;

  const res = await fetch("/save_subcategory", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      res_id: resId,
      category_id: state.activeCategory,
      name
    })
  });

  const data = await res.json();
  console.log(data);
  if (!data.success) return;

  const category = state.tree.find(
    c => c.id === String(state.activeCategory)
  );

  category.subcategories.push({
    id: String(data.subcategory._id),
    name: data.subcategory.name
  });

  render();
  closeSubcategoryDrawer();
};


/* ---------- Item name dropdown (Add / Edit item drawer) ----------
   Click the item name box -> shows all existing items in the same
   category as the selected subcategory. Click one to fill the name. */
const itemNameInput = document.getElementById("itemName");
const itemSubSelect = document.getElementById("itemSub");

const nameWrap = document.createElement("div");
nameWrap.style.position = "relative";
itemNameInput.parentNode.insertBefore(nameWrap, itemNameInput);
nameWrap.appendChild(itemNameInput);

const nameDropdown = document.createElement("div");
nameDropdown.style.cssText = `
  display:none;
  position:absolute;
  left:0;
  right:0;
  top:100%;
  margin-top:4px;
  z-index:50;
  max-height:220px;
  overflow-y:auto;
  background:#fff;
  border:1px solid #E1DED2;
  border-radius:8px;
  box-shadow:0 8px 20px rgba(0,0,0,.12);
`;
nameWrap.appendChild(nameDropdown);

function hideNameDropdown() {
  nameDropdown.style.display = "none";
}

function renderNameDropdown() {
  const info = getSubLookup()[itemSubSelect.value];
  if (!info) return hideNameDropdown();

  const q = itemNameInput.value.trim().toLowerCase();
  const subLookup = getSubLookup();
  const list = getCategoryItems(info.catId).filter(i =>
    i.name.toLowerCase().includes(q)
  );

  nameDropdown.innerHTML = "";

  if (!list.length) {
    const empty = document.createElement("div");
    empty.textContent = "No items in this category yet";
    empty.style.cssText = "padding:10px 12px;color:#87897F;font-size:13px;";
    nameDropdown.appendChild(empty);
  }

  list.forEach(i => {
    const row = document.createElement("div");
    row.style.cssText = `
      padding:8px 12px;
      cursor:pointer;
      display:flex;
      justify-content:space-between;
      gap:10px;
      font-size:14px;
    `;

    const label = document.createElement("span");
    label.textContent = i.name;

    const subLabel = document.createElement("span");
    subLabel.textContent = subLookup[i.subId]?.name || "";
    subLabel.style.cssText = "color:#87897F;font-size:11px;white-space:nowrap;";

    row.appendChild(label);
    row.appendChild(subLabel);

    row.onmouseenter = () => (row.style.background = "#F4F1E8");
    row.onmouseleave = () => (row.style.background = "transparent");
    row.onmousedown = e => e.preventDefault(); // keep input focused
    row.onclick = () => {
      itemNameInput.value = i.name;
      document.getElementById("itemDesc").value = i.desc || "";
      setUnitFields(i.unit || "");
      document.getElementById("itemPrice").value = i.price || "";
      document.getElementById("itemLow").value = i.lowAt || 10;
      document.getElementById("itemListed").checked = i.available ?? true;
      itemSubSelect.value = i.subId;

      // stock is left empty on purpose -> blink it so the user fills it
      const stockInput = document.getElementById("itemStock");
      stockInput.value = "";
      hideNameDropdown();
      blinkInput(stockInput);
    };

    nameDropdown.appendChild(row);
  });

  nameDropdown.style.display = "block";
}

itemNameInput.addEventListener("focus", renderNameDropdown);
itemNameInput.addEventListener("click", renderNameDropdown);
itemNameInput.addEventListener("input", renderNameDropdown);
itemSubSelect.addEventListener("change", () => {
  if (nameDropdown.style.display === "block") renderNameDropdown();
});
document.addEventListener("click", e => {
  if (!nameWrap.contains(e.target)) hideNameDropdown();
});


/* ---------- Blink effect for the stock input ---------- */
const blinkStyle = document.createElement("style");
blinkStyle.textContent = `
  @keyframes inputBlink {
    0%, 100% { box-shadow: 0 0 0 0 rgba(46,111,78,0); border-color: #E1DED2; background: inherit; }
    50% { box-shadow: 0 0 0 4px rgba(46,111,78,.35); border-color: #2E6F4E; background: #EAF4EE; }
  }
  .input-blink { animation: inputBlink .6s ease-in-out 3; }
`;
document.head.appendChild(blinkStyle);

function blinkInput(el) {
  el.classList.remove("input-blink");
  void el.offsetWidth; // restart animation
  el.classList.add("input-blink");
  el.focus();
  el.addEventListener("animationend", () => el.classList.remove("input-blink"), { once: true });
}


/* ---------- Pack size helpers (quantity input + unit select) ----------
   Stored/sent as one string, e.g. "5 kg". Existing values like "5 kg bag"
   are split into quantity "5" and unit "kg bag" (added to the select if new). */
function getUnitString() {
  const val = document.getElementById("itemUnitValue").value.trim();
  const unit = document.getElementById("itemUnit").value;
  return val ? `${val} ${unit}` : unit;
}

function setUnitFields(str) {
  const valInput = document.getElementById("itemUnitValue");
  const unitSelect = document.getElementById("itemUnit");

  const m = String(str || "").trim().match(/^([\d.]+)\s*(.*)$/);
  const val = m ? m[1] : "";
  const unit = m ? m[2].trim() : String(str || "").trim();

  valInput.value = val;

  if (!unit) {
    unitSelect.value = "kg";
    return;
  }

  let opt = Array.from(unitSelect.options).find(
    o => o.value.toLowerCase() === unit.toLowerCase()
  );
  if (!opt) {
    opt = document.createElement("option");
    opt.value = unit;
    opt.textContent = unit;
    unitSelect.appendChild(opt);
  }
  unitSelect.value = opt.value;
}


/* =====================================================================
   BARCODE SCANNER (Add item drawer)
   Scan button -> camera -> barcode number -> POST /get_item_details
   -> autofill name / pack size / photo, or "not found, enter manually".
   The html5-qrcode library is loaded automatically on the first scan.
   Camera access requires HTTPS (or localhost).
   ===================================================================== */
const scanStyle = document.createElement("style");
scanStyle.textContent = `
  .scan-btn {
    width: 100%;
    padding: 12px;
    margin: 4px 0 6px;
    border: 1.5px dashed #2E6F4E;
    background: #EAF4EE;
    color: #2E6F4E;
    font-weight: 600;
    font-size: 14px;
    border-radius: 10px;
    cursor: pointer;
  }
  .scan-btn:disabled { opacity: .6; cursor: default; }
  .scan-status {
    display: none;
    font-size: 13px;
    padding: 8px 12px;
    border-radius: 8px;
    margin-bottom: 8px;
  }
  .scan-status.info { display: block; background: #EEF2F7; color: #34506E; }
  .scan-status.ok   { display: block; background: #EAF4EE; color: #2E6F4E; }
  .scan-status.warn { display: block; background: #FCEFDE; color: #C97A1F; }
  .scan-status.err  { display: block; background: #FBEAE7; color: #B23B30; }

  .photo-status {
    display: none;
    align-items: center;
    gap: 10px;
    font-size: 13px;
    padding: 10px 12px;
    margin-top: 10px;
    border-radius: 10px;
  }
  .photo-status.loading { display: flex; background: #EEF2F7; color: #34506E; }
  .photo-status.failed  { display: flex; background: #FBEAE7; color: #B23B30; }
  .photo-spinner {
    width: 18px;
    height: 18px;
    border: 3px solid rgba(52, 80, 110, .25);
    border-top-color: #34506E;
    border-radius: 50%;
    animation: photoSpin .8s linear infinite;
    flex-shrink: 0;
  }
  .photo-status.failed .photo-spinner { display: none; }
  @keyframes photoSpin { to { transform: rotate(360deg); } }

  .scanner-overlay {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, .85);
    display: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 16px;
    gap: 14px;
  }
  .scanner-overlay.open { display: flex; }
  .scanner-box {
    width: 100%;
    max-width: 420px;
    background: #000;
    border-radius: 14px;
    overflow: hidden;
  }
  .scanner-hint { color: #fff; font-size: 14px; text-align: center; }
  .scanner-cancel {
    padding: 10px 28px;
    border: none;
    border-radius: 8px;
    background: #fff;
    font-weight: 600;
    cursor: pointer;
  }
`;
document.head.appendChild(scanStyle);

// Scan button + status line, placed right under the drawer header
const scanWrap = document.createElement("div");
scanWrap.id = "scanWrap";
scanWrap.innerHTML = `
  <button type="button" id="scanBarcodeBtn" class="scan-btn">📷 Scan barcode</button>
  <div id="scanStatus" class="scan-status"></div>
`;
document.querySelector("#itemDrawer .drawer-header").after(scanWrap);

// Fullscreen camera overlay
const scannerOverlay = document.createElement("div");
scannerOverlay.className = "scanner-overlay";
scannerOverlay.innerHTML = `
  <div class="scanner-box"><div id="barcodeReader"></div></div>
  <div class="scanner-hint">Point the camera at the product barcode</div>
  <button type="button" class="scanner-cancel" id="scannerCancel">Cancel</button>
`;
document.body.appendChild(scannerOverlay);

const scanBtn = document.getElementById("scanBarcodeBtn");
const scanStatusEl = document.getElementById("scanStatus");

function setScanStatus(msg, kind = "info") {
  scanStatusEl.textContent = msg;
  scanStatusEl.className = "scan-status " + (msg ? kind : "");
}

let scanner = null;
let scanHandled = false;
let scanLibPromise = null;

function loadScannerLib() {
  if (window.Html5Qrcode) return Promise.resolve();
  if (scanLibPromise) return scanLibPromise;
  scanLibPromise = new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js";
    s.onload = resolve;
    s.onerror = () => {
      scanLibPromise = null;
      reject(new Error("scanner library failed to load"));
    };
    document.head.appendChild(s);
  });
  return scanLibPromise;
}

async function stopScanner() {
  if (!scanner) return;
  try {
    if (scanner.isScanning) await scanner.stop();
    scanner.clear();
  } catch (e) {
    console.log("scanner stop:", e);
  }
  scanner = null;
}

async function closeScanner() {
  await stopScanner();
  scannerOverlay.classList.remove("open");
}

async function openScanner() {
  setScanStatus("");

  try {
    await loadScannerLib();
  } catch (e) {
    setScanStatus("Scanner could not load. Please enter the details manually.", "err");
    return;
  }

  scanHandled = false;
  scannerOverlay.classList.add("open");

  scanner = new Html5Qrcode("barcodeReader", {
    formatsToSupport: [
      Html5QrcodeSupportedFormats.EAN_13,
      Html5QrcodeSupportedFormats.EAN_8,
      Html5QrcodeSupportedFormats.UPC_A,
      Html5QrcodeSupportedFormats.UPC_E,
      Html5QrcodeSupportedFormats.CODE_128
    ],
    experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    verbose: false
  });

  try {
    await scanner.start(
      { facingMode: "environment" },
      { fps: 10, qrbox: { width: 280, height: 140 } },
      async decodedText => {
        if (scanHandled) return;
        scanHandled = true;
        await closeScanner();
        lookupBarcode(decodedText);
      },
      () => { } // per-frame "no code found", ignore
    );
  } catch (err) {
    console.log("camera error:", err);
    await closeScanner();
    setScanStatus(
      "Could not open the camera (check permission / HTTPS). Please enter the details manually.",
      "err"
    );
  }
}

scanBtn.addEventListener("click", openScanner);
document.getElementById("scannerCancel").addEventListener("click", closeScanner);

/* ---------- Image block: spinner while loading, message if it fails ---------- */
const photoStatusEl = document.createElement("div");
photoStatusEl.className = "photo-status";
photoStatusEl.innerHTML = `<div class="photo-spinner"></div><span id="photoStatusText"></span>`;
document.getElementById("preview").after(photoStatusEl);

const photoStatusText = document.getElementById("photoStatusText");
let imageToken = 0; // lets us ignore a slow image if the seller moved on

function showImageLoading() {
  photoStatusText.textContent = "Loading image…";
  photoStatusEl.className = "photo-status loading";
  // Save is disabled while the image loads so the photo is never silently lost
  const saveBtn = document.getElementById("saveItemBtn");
  saveBtn.disabled = true;
}

function showImageFailed() {
  photoStatusText.textContent = "Failed to fetch the image. Please upload a photo manually.";
  photoStatusEl.className = "photo-status failed";
  document.getElementById("saveItemBtn").disabled = false;
}

function hideImageStatus() {
  photoStatusEl.className = "photo-status";
  document.getElementById("saveItemBtn").disabled = false;
}

function resetPhotoUi() {
  imageToken++; // cancels any image still loading
  hideImageStatus();
  document.getElementById("photo").value = "";
  const previewImg = document.getElementById("preview");
  previewImg.style.display = "none";
  previewImg.removeAttribute("src");
}

// Seller picks their own photo: stop the barcode image and show their choice
document.getElementById("photo").addEventListener("change", e => {
  imageToken++;
  hideImageStatus();
  const previewImg = document.getElementById("preview");
  const f = e.target.files[0];
  if (f) {
    previewImg.src = URL.createObjectURL(f);
    previewImg.style.display = "block";
  } else {
    previewImg.style.display = "none";
    previewImg.removeAttribute("src");
  }
});

/* ---------- Barcode lookup + autofill ---------- */
async function lookupBarcode(barcode) {
  resetPhotoUi();
  setScanStatus(`Barcode ${barcode} scanned. Looking up item…`, "info");
  scanBtn.disabled = true;

  try {
    const res = await fetch("/get_item_details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ barcode })
    });

    if (res.status === 401) {
      alert("unauthorized,Please Log in");
      window.location.href = "/login/seller";
      return;
    }

    if (res.status === 404) {
      setScanStatus("Item not found. Please enter the details manually.", "warn");
      return;
    }

    const data = await res.json();
    if (!res.ok || !data.success) {
      setScanStatus(
        data.message || "Something went wrong. Please enter the details manually.",
        "err"
      );
      return;
    }

    // Text fields are filled immediately; the image loads in the background
    fillFromBarcodeDetails(data.details);
    setScanStatus("Item found. Details filled in, please check and add price & stock.", "ok");
  } catch (e) {
    console.log("lookup error:", e);
    setScanStatus("Network error. Please enter the details manually.", "err");
  } finally {
    scanBtn.disabled = false;
  }
}

function fillFromBarcodeDetails(d) {
  if (d.product_name) {
    document.getElementById("itemName").value = d.product_name.trim();
    document.getElementById("itemDesc").value =
      `${(d.product_name || "").trim()} ${d.product_quantity || ""} ${d.product_units || ""} pack`
        .trim()
        .replace(/\s+/g, " ");
  }

  // Pack size: "500" + "g" -> setUnitFields("500 g")
  if (d.product_quantity) {
    let prod_quantity = d.product_units === "g"
    ? d.product_quantity / 1000
    : d.product_quantity;

    let prod_units = d.product_units === "g"
        ? "kg"
        : d.product_units;
    setUnitFields(`${prod_quantity} ${prod_units || ""}`.trim());
  }

  hideNameDropdown();

  // price & stock are never in the barcode database -> make the seller fill them
  blinkInput(document.getElementById("itemPrice"));

  // not awaited on purpose: the form is usable while the image loads
  if (d.image_url) attachBarcodeImage(d.image_url);
}

async function attachBarcodeImage(url) {
  const myToken = ++imageToken;
  showImageLoading();

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10000); // give up after 10 s

  try {
    const resp = await fetch(url, { signal: ctrl.signal });
    if (!resp.ok) throw new Error("image http " + resp.status);

    const blob = await resp.blob();
    if (!blob.type.startsWith("image/")) throw new Error("not an image");

    if (myToken !== imageToken) return; // seller moved on, ignore

    const file = new File([blob], "product.jpg", { type: blob.type });
    const dt = new DataTransfer();
    dt.items.add(file);
    document.getElementById("photo").files = dt.files; // uploaded when Save is pressed

    const previewImg = document.getElementById("preview");
    previewImg.src = URL.createObjectURL(blob);
    previewImg.style.display = "block";
    hideImageStatus();
  } catch (e) {
    console.log("could not load image:", e);
    if (myToken !== imageToken) return;
    showImageFailed();
  } finally {
    clearTimeout(timer);
  }
}