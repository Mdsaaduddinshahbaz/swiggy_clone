// const resId = localStorage.getItem("res_id");
const pathParts = window.location.pathname.split("/");

const resId = pathParts[pathParts.length - 1];
const resname=pathParts[pathParts.length - 2];
console.log(resId)
function goToOrders() {
  window.location.href = `/seller/orders/${resId}`;
}

function goToMenu() {
  window.location.href = `/seller/menu/${resname}/${resId}`;
}

function goToAnalytics() {
  window.location.href = `/seller/analytics/${resId}`;
}

// async function loadStats() {
//   const res = await fetch("/seller/stats", {
//     method: "POST",
//     headers: {"Content-Type": "application/json"},
//     body: JSON.stringify({ res_id: resId })
//   });

//   const data = await res.json();

//   if (data.success) {
//     document.getElementById("totalOrders").innerText = data.total;
//     document.getElementById("pendingOrders").innerText = data.pending;
//     document.getElementById("completedOrders").innerText = data.completed;
//   }
// }

// loadStats();
document.addEventListener("DOMContentLoaded",async ()=>{
  const res = await fetch("/stats", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ res_id: resId })
  });

  const data = await res.json();
  console.log(data)
  if (data.success) {
    document.getElementById("totalOrders").innerText = data.stats.Total_orders;
    document.getElementById("pendingOrders").innerText = data.stats.pending;
    document.getElementById("completedOrders").innerText = data.stats.completed;
    document.getElementById("canceledOrders").innerText = data.stats.canceled;
  }
})