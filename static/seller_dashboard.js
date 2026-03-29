const resId = localStorage.getItem("res_id");

async function loadInventory() {
  const res = await fetch("/seller/inventory", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ res_id: resId })
  });

  const data = await res.json();
  const grid = document.getElementById("inventoryGrid");

  grid.innerHTML = "";

  data.items.forEach(item => {
    let statusClass = "in-stock";
    let statusText = "In Stock";

    if (item.qty <= 0) {
      statusClass = "out-stock";
      statusText = "Out of Stock";
    } else if (item.qty < 5) {
      statusClass = "low-stock";
      statusText = "Low Stock";
    }

    const card = `
      <div class="card">
        <div class="item-name">${item.name}</div>

        <div class="stock">Remaining: ${item.qty}</div>

        <div class="status ${statusClass}">
          ${statusText}
        </div>

        <button class="btn" onclick="updateStock('${item.id}')">
          Update Stock
        </button>
      </div>
    `;

    grid.innerHTML += card;
  });
}

function updateStock(itemId) {
  const newQty = prompt("Enter new quantity:");

  if (newQty === null) return;

  fetch("/seller/update_stock", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({
      item_id: itemId,
      qty: parseInt(newQty)
    })
  })
  .then(res => res.json())
  .then(data => {
    if (data.success) {
      loadInventory();
    }
  });
}

loadInventory();