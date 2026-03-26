const resId = localStorage.getItem("res_id");

function goToOrders() {
  window.location.href = `/seller/orders/${resId}`;
}

function goToMenu() {
  window.location.href = `/seller/menu/${resId}`;
}

function goToAnalytics() {
  window.location.href = `/seller/analytics/${resId}`;
}

async function loadStats() {
  const res = await fetch("/seller/stats", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ res_id: resId })
  });

  const data = await res.json();

  if (data.success) {
    document.getElementById("totalOrders").innerText = data.total;
    document.getElementById("pendingOrders").innerText = data.pending;
    document.getElementById("completedOrders").innerText = data.completed;
  }
}

loadStats();