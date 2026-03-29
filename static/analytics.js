const pathParts = window.location.pathname.split("/");

const resId = pathParts[pathParts.length - 1];
async function loadAnalytics() {
  const res = await fetch("/seller/analytics", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ res_id: resId })
  });

  const data = await res.json();
  console.log(data)
  const body = document.getElementById("analyticsBody");
  body.innerHTML = "";

  let totalSales = 0;
  let topItem = "";
  let maxSold = 0;

  data.stats.forEach(item => {
    console.log(item)
    const remaining = item.initial_qty - item.sold;
    const sold=item.sold
    totalSales += sold;
    console.log("sold"+sold+" "+"total sales="+totalSales)

    if (sold > maxSold) {
      maxSold = sold;
      topItem = item.item_name;
    }

    body.innerHTML += `
      <tr>
        <td>${item.item_name}</td>
        <td>${item.initial_qty}</td>
        <td>${remaining}</td>
        <td>${item.sold}</td>
      </tr>
    `;
  });
  console.log(topItem)
  document.getElementById("totalSales").innerText = totalSales;
  document.getElementById("topItem").innerText = topItem;
}

loadAnalytics();