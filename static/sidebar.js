
const ordersBtn=document.getElementById("OrdersBtn")
const InventoryBtn=document.getElementById("InventoryBtn")
const DashboardBtn=document.getElementById("DashboardBtn")
ordersBtn.addEventListener("click",()=>{
    DashboardBtn.classList.remove("active")
    InventoryBtn.classList.remove("active")
    ordersBtn.classList.add("active")
  window.location.href=`/seller/orders/${resname}/${resId}`
})
InventoryBtn.addEventListener("click",()=>{
    ordersBtn.classList.remove("active")
    DashboardBtn.classList.remove("active")
    InventoryBtn.classList.add("active")
  window.location.href=`/seller/menu/${resname}/${resId}`
})
// const DashboardBtn=document.getElementById("DashboardBtn")
DashboardBtn.addEventListener("click",()=>{
    InventoryBtn.classList.remove("active")
    ordersBtn.classList.remove("active")
    DashboardBtn.classList.add("active")
  window.location.href=`/seller/${resname}/${resId}`
})
// overlay.addEventListener("click",()=>{
//   const sidebar=document.querySelector(".sidebar")
//   overlay.classList.remove("show")
//   sidebar.style.display="none"
//   sidebar.classList.remove("show")
// })