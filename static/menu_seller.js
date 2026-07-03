const pathParts = window.location.pathname.split("/");

const resId = pathParts[pathParts.length - 1];
const type = pathParts[pathParts.length - 4];
console.log(type);

document.addEventListener("DOMContentLoaded", async () => {
  const res = await fetch("/list_items", {
    method: "POST",
    "headers": { "Content-Type": "application/json" },
    body: JSON.stringify({ "res_id": resId, "type": type })
  })
  const data = await res.json()
  console.log(data)
  if (data.success) {
    state.tree =
      data.categories.categories.map(
        cat => ({
          id: String(cat._id),
          name: cat.name,

          subcategories:
            cat.subcategories.map(
              sub => ({
                id: String(sub._id),
                name: sub.name
              })
            )
        })
      );
    state.items =
      Object.entries(data.res)
        .map(([name, item]) => ({
          id: item.id,
          name,

          desc:
            item.desc || "",

          unit:
            item.unit || "",

          price:
            Number(
              item.price
            ),

          stock:
            Number(
              item.item_qty
            ),

          lowAt:
            Number(
              item.lowat
            ),

          available:
            item.available,

          subId:
            String(item.sub_id)
        }));
    render();
  }

})
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
    desc: "Aged long-grain basmati rice."
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
    desc: "Everyday medium-grain rice."
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
    desc: "Whole wheat flour, stone-ground."
  }
];

const state = {
  tree: structuredClone(seedTree),
  items: structuredClone(seedItems),

  expanded: {
    "cat-1": true
  },

  activeSub: null,
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

  const overlay =
    document.getElementById(
      "subcategoryDrawer"
    );

  overlay.classList.add(
    "open"
  );

  const input =
    overlay.querySelector(
      "#subcatName"
    );

  input.value = "";

  input.focus();

  const title =
    overlay.querySelector(
      "#subDrawerTitle"
    );

  title.textContent =
    `Add subcategory to ${cat.name}`;
}
function closeSubcategoryDrawer() {
  console.log("in closeSubcategory")
  state.subcategoryDrawerOpen =
    false;

  state.activeCategory =
    null;

  document
    .getElementById(
      "subcategoryDrawer"
    )
    .classList.remove(
      "open"
    );
}
function openItemDrawer(
  item = null
) {
  state.editingItem =
    item;

  state.drawerOpen =
    true;

  const drawer =
    document.getElementById(
      "itemDrawer"
    );

  drawer.classList.remove(
    "hidden"
  );
  const title =
    document.getElementById(
      "drawerTitle"
    );

  title.textContent =
    item
      ? "Edit Item"
      : "Add Item";

  document.getElementById(
    "itemName"
  ).value =
    item?.name || "";

  document.getElementById(
    "itemDesc"
  ).value =
    item?.desc || "";

  document.getElementById(
    "itemUnit"
  ).value =
    item?.unit || "";

  document.getElementById(
    "itemPrice"
  ).value =
    item?.price || "";

  document.getElementById(
    "itemStock"
  ).value =
    item?.stock || "";

  document.getElementById(
    "itemLow"
  ).value =
    item?.lowAt || 10;

  document.getElementById(
    "itemListed"
  ).checked =
    item?.available ??
    true;

  const select =
    document.getElementById(
      "itemSub"
    );

  select.innerHTML = "";

  state.tree.forEach(
    cat => {

      const group =
        document.createElement(
          "optgroup"
        );

      group.label =
        cat.name;

      cat.subcategories.forEach(
        sub => {

          const option =
            document.createElement(
              "option"
            );

          option.value =
            sub.id;

          option.textContent =
            sub.name;

          group.appendChild(
            option
          );
        }
      );

      select.appendChild(
        group
      );
    }
  );

  select.value =
    item?.subId ||
    state.activeSub ||
    state.tree[0]
      .subcategories[0]
      .id;
}

function closeDrawer() {
  state.drawerOpen =
    false;

  document
    .getElementById(
      "itemDrawer"
    )
    .classList.add(
      "hidden"
    );
}

async function saveItem() {
  const item = {
    id:
      state.editingItem?.id ||
      `SKU-${Date.now()}`,

    name:
      document.getElementById(
        "itemName"
      ).value,

    desc:
      document.getElementById(
        "itemDesc"
      ).value,

    unit:
      document.getElementById(
        "itemUnit"
      ).value,

    price: Number(
      document.getElementById(
        "itemPrice"
      ).value
    ),

    stock: Number(
      document.getElementById(
        "itemStock"
      ).value
    ),

    lowAt: Number(
      document.getElementById(
        "itemLow"
      ).value
    ),

    subId:
      document.getElementById(
        "itemSub"
      ).value,

    available:
      document.getElementById(
        "itemListed"
      ).checked
  };

  if (state.editingItem) {
    const res = await fetch("/update_item_details", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "item_id": item.id,
        "name": item.name,
        "unit": item.unit,
        "price": item.price,
        "lowAt": item.lowAt,
        "desc": item.desc,
        "subId": item.subId,
        "stock": item.stock,
        "available": item.available
      })
    })
    const data = await res.json()
    if (data.success) {

      state.items =
        state.items.map(
          i =>
            i.id === item.id
              ? item
              : i
        );
    }
    else {

    }
  }
  else {
    const res = await fetch("/add_res_items", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "res_id": resId,
        "sub_id": item.subId,
        "description": item.desc,
        "itm_name": item.name,
        "unit": item.unit,
        "price": item.price,
        "itm_qty": item.stock,
        "lowAt": item.lowAt,
        "available": item.available,
        "sold": 0
      })
    })
    const data = await res.json()
    if (data.success) {
      console.log(data)
      item.id = data.id
      state.items.unshift(
        item
      );
    }
    else {

    }
  }
  state.editingItem = null;
  closeDrawer();
  render();
}
function deleteItem(id) {
  state.items =
    state.items.filter(
      i =>
        i.id !== id
    );

  render();
}
function renderTree() {
  const tree =
    document.getElementById(
      "categoryTree"
    );

  tree.innerHTML = "";

  const allBtn =
    document.getElementById(
      "allItemsBtn"
    );

  allBtn.classList.toggle(
    "active",
    state.activeSub === null
  );

  state.tree.forEach(
    (cat, index) => {

      const wrapper =
        document.createElement("div");

      const btn =
        document.createElement(
          "button"
        );

      btn.style.cssText = `
        width:100%;
        text-align:left;
        padding:10px 20px;
        border:none;
        background:none;
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
          ${state.expanded[cat.id]
          ? "▼"
          : "▶"
        }
        </span>

        <span>
          ${index + 1}.
          ${cat.name}
        </span>
      `;

      btn.onclick = () => {
        state.expanded[cat.id] =
          !state.expanded[cat.id];

        render();
      };

      wrapper.appendChild(btn);

      if (state.expanded[cat.id]) {
        cat.subcategories.forEach(
          sub => {

            const count =
              state.items.filter(
                i =>
                  i.subId === sub.id
              ).length;

            const subBtn =
              document.createElement(
                "button"
              );

            subBtn.style.cssText = `
              width:100%;
              border:none;
              background:${state.activeSub ===
                sub.id
                ? "#EAE6D9"
                : "transparent"
              };
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

            subBtn.onclick =
              () => {

                state.activeSub =
                  sub.id;

                render();
                if (
                  window.innerWidth <= 768
                ) {
                  closeSidebar();
                }
              };

            wrapper.appendChild(
              subBtn
            );
          }
        );
        // Add Subcategory button
        const addBtn =
          document.createElement("button");

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
        addBtn.className =
          "tree-add-sub";
        addBtn.innerHTML =
          "+ Add subcategory";

        addBtn.onclick = () => {
          openSubcategoryDrawer(cat);
        };

        wrapper.appendChild(addBtn);
      }

      tree.appendChild(wrapper);
    }
  );
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
async function renderCards() {
  const grid =
    document.getElementById(
      "itemsGrid"
    );

  grid.innerHTML = "";

  let items =
    state.items.filter(item => {

      const subMatch =
        !state.activeSub ||
        item.subId ===
        state.activeSub;

      const searchMatch =
        item.name
          .toLowerCase()
          .includes(
            state.query.toLowerCase()
          ) ||
        item.id
          .toLowerCase()
          .includes(
            state.query.toLowerCase()
          );

      const stockMatch =
        state.stockFilter ===
        "all" ||

        (
          state.stockFilter ===
          "low" &&
          item.stock > 0 &&
          item.stock <=
          item.lowAt
        ) ||

        (
          state.stockFilter ===
          "out" &&
          item.stock === 0
        );

      return (
        subMatch &&
        searchMatch &&
        stockMatch
      );
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

    const low =
      item.stock > 0 &&
      item.stock <= item.lowAt;

    const out =
      item.stock === 0;

    const card =
      document.createElement(
        "div"
      );

    card.className =
      "card";

    card.style.position =
      "relative";

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
        "
      >
        ${item.id}
      </div>

      <h3>
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
            ${out
        ? "#B23B30"
        : low
          ? "#C97A1F"
          : "#2E6F4E"
      };
        "
      >
        ${out
        ? "Out of stock"
        : `${item.stock} in stock`
      }
      </div>
    `;

    const controls =
      document.createElement(
        "div"
      );

    controls.style.cssText = `
display:flex;
justify-content:flex-end;
gap:10px;
margin-top:15px;
`;

    const edit =
      document.createElement(
        "button"
      );

    edit.textContent =
      "Edit";

    edit.style.cssText = `
padding:6px 10px;
border:1px solid #E1DED2;
background:white;
border-radius:6px;
cursor:pointer;
`;
    edit.onclick =
      async () =>
        openItemDrawer(
          item
        );

    const del =
      document.createElement(
        "button"
      );

    del.textContent =
      "Delete";
    del.style.cssText = `
padding:6px 10px;
border:1px solid #E1DED2;
background:white;
border-radius:6px;
cursor:pointer;
color:#B23B30;
`;
    del.onclick =
      async () => {
        const res = await fetch("/remove_items", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ "item_id": item.id })
        })
        const data = await res.json()
        if (data.success) {
          deleteItem(item.id);
        }
        else {

        }
      }

    controls.appendChild(
      edit
    );

    controls.appendChild(
      del
    );

    card.appendChild(
      controls
    );

    grid.appendChild(
      card
    );
  });
}
function closeCategoryDrawer() {
  console.log("closeCategoryDrawer clicked")
  state.categoryDrawerOpen =
    false;

  document
    .getElementById(
      "categoryDrawer"
    )
    .classList.add(
      "hidden"
    );
}
function showCategoryDrawer() {
  console.log("closeCategoryDrawer clicked")
  state.categoryDrawerOpen =
    true;

  document
    .getElementById(
      "categoryDrawer"
    )
    .classList.remove(
      "hidden"
    );
}
function renderStats() {
  document.getElementById(
    "totalItems"
  ).textContent =
    state.items.length;

  document.getElementById(
    "listedItems"
  ).textContent =
    state.items.filter(
      i => i.available
    ).length;

  document.getElementById(
    "lowItems"
  ).textContent =
    state.items.filter(
      i =>
        i.stock > 0 &&
        i.stock <= i.lowAt
    ).length;

  document.getElementById(
    "outItems"
  ).textContent =
    state.items.filter(
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
  const lookup =
    getSubLookup();

  const title =
    document.getElementById(
      "headerTitle"
    );

  const crumb =
    document.getElementById(
      "breadcrumb"
    );

  if (
    !state.activeSub
  ) {
    title.textContent =
      "All items";

    crumb.textContent =
      "Every category";

    return;
  }

  const sub =
    lookup[
    state.activeSub
    ];

  title.textContent =
    sub.name;

  crumb.textContent =
    `${sub.catName} / ${sub.name}`;
}
document
  .getElementById("searchInput")
  .addEventListener(
    "input",
    e => {
      state.query = e.target.value;
      render();
    }
  );
document
  .getElementById("allItemsBtn")
  .onclick = () => {
    state.activeSub = null;
    render();
    if (
      window.innerWidth <= 768
    ) {
      closeSidebar();
    }
  };

document
  .getElementById(
    "stockFilter"
  )
  .addEventListener(
    "change",
    e => {
      state.stockFilter =
        e.target.value;

      render();
    }
  );
document.getElementById("hideCategoryBtn").addEventListener("click", function () {

  closeSidebar()
});



document
  .getElementById(
    "addItemBtn"
  )
  .onclick =
  () =>
    openItemDrawer();
document
  .getElementById(
    "cancelSubBtn"
  )
  .onclick =
  closeSubcategoryDrawer;
document
  .getElementById(
    "closeDrawer"
  )
  .onclick =
  closeDrawer;
document
  .getElementById(
    "closeCategoryDrawer"
  )
  .onclick =
  closeCategoryDrawer;

document
  .getElementById(
    "addCategoryBtn"
  )
  .onclick =
  showCategoryDrawer;

document
  .getElementById(
    "saveItemBtn"
  )
  .onclick =
  saveItem;
document
  .getElementById(
    "menuToggle"
  )
  .onclick =
  openSidebar;

document
  .getElementById(
    "sidebarOverlay"
  )
  .onclick =
  closeSidebar;
render();
function openSidebar() {
  state.sidebarOpen = true;

  document
    .querySelector(
      ".sidebar"
    )
    .classList.add(
      "open"
    );

  document
    .getElementById(
      "sidebarOverlay"
    )
    .classList.remove(
      "hidden"
    );
}

function closeSidebar() {
  state.sidebarOpen = false;

  document
    .querySelector(
      ".sidebar"
    )
    .classList.remove(
      "open"
    );

  document
    .getElementById(
      "sidebarOverlay"
    )
    .classList.add(
      "hidden"
    );
}

const saveCategoryBtn = document.getElementById("saveCategoryBtn")
saveCategoryBtn.addEventListener("click", async () => {
  const cat = document.querySelector("#categoryDrawer");
  const drawer = cat.querySelector(".drawer");
  // console.log(drawer)
  const catName = drawer.querySelector("#catName").value;
  const subNames = drawer
    .querySelector("#subNames")
    .value
    .split("\n")
    .map(item => item.trim())
    .filter(item => item !== "");
  console.log(catName);
  console.log(subNames);
  if (
    !catName.trim() ||
    !subNames.length
  ) {
    return;
  }

  const res = await fetch("/save_categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      "res_id": resId,
      "cat_name": catName,
      "subcats": subNames
    })
  })
  const data = await res.json()
  console.log(data)
  if (data.success) {
    console.log("updated");
    const cat = data.category;
    // state.tree.push({
    //   id: `cat-${data.cat_id}`,
    //   name: catName,
    //   subcategories: subNames.map((name, i) => ({
    //     id: `sub-${Date.now()}-${i}`,
    //     name
    //   }))
    // });
    state.tree.push({
      id: String(cat._id),
      name: cat.name,
      subcategories:
        cat.subcategories.map(sub => ({
          id: String(sub._id),
          name: sub.name
        }))
    });


    render();
    closeCategoryDrawer();

  }
  else {
    console.log("not updated");

  }


})
document
  .getElementById(
    "saveSubBtn"
  )
  .onclick =
  async () => {

    const name =
      document
        .getElementById(
          "subcatName"
        )
        .value
        .trim();

    if (!name) return;

    const res =
      await fetch(
        "/save_subcategory",
        {
          method: "POST",
          headers: {
            "Content-Type":
              "application/json"
          },
          body:
            JSON.stringify({
              res_id: resId,
              category_id:
                state.activeCategory,
              name
            })
        }
      );

    const data =
      await res.json();

    if (!data.success)
      return;

    const category =
      state.tree.find(
        c =>
          c.id ===
          String(
            state.activeCategory
          )
      );

    category.subcategories.push({
      id: String(
        data.subcategory._id
      ),
      name:
        data.subcategory.name
    });

    render();
    closeSubcategoryDrawer();
  };
// document.addEventListener("DOMContentLoaded",()=>{
//   render()
// })