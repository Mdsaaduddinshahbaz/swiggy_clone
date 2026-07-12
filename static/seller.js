const pathParts = window.location.pathname.split("/");

const resId = pathParts[pathParts.length - 1];
const resname = pathParts[pathParts.length - 2];
console.log(resId);

function goToOrders() {
  window.location.href = `/seller/orders/${resId}`;
}

function goToMenu() {
  window.location.href = `/seller/menu/${resname}/${resId}`;
}

function goToAnalytics() {
  window.location.href = `/seller/analytics/${resId}`;
}

// Animate a number ticking up from 0 to its target value
function countUp(el, target, duration = 700) {
  const start = 0;
  const startTime = performance.now();
  const value = Number(target) || 0;

  function tick(now) {
    const progress = Math.min((now - startTime) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    el.innerText = Math.round(start + (value - start) * eased);
    if (progress < 1) {
      requestAnimationFrame(tick);
    } else {
      el.innerText = value;
    }
  }
  requestAnimationFrame(tick);
}

document.addEventListener("DOMContentLoaded", async () => {
  const resNameLabel = document.getElementById("resNameLabel");
  if (resNameLabel && resname) {
    resNameLabel.innerText = decodeURIComponent(resname);
  }

  try {
    const res = await fetch("/stats", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ res_id: resId })
    });

    const data = await res.json();
    console.log(data);

    if (data.success) {
      countUp(document.getElementById("totalOrders"), data.stats.Total_orders);
      countUp(document.getElementById("pendingOrders"), data.stats.pending);
      countUp(document.getElementById("completedOrders"), data.stats.completed);
      countUp(document.getElementById("canceledOrders"), data.stats.canceled);
    }
  } catch (err) {
    console.error("Failed to load stats:", err);
  }
});