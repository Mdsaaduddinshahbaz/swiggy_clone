
const ordersBtn=document.getElementById("OrdersBtn")
const InventoryBtn=document.getElementById("InventoryBtn")
const DashboardBtn=document.getElementById("DashboardBtn")
const logoutBtn=document.getElementById("Logout")
logoutBtn.addEventListener("click",async ()=>{
  localStorage.removeItem("resId")
  localStorage.removeItem("resname")
  window.location.href="/"
  const res=await fetch("/logout/seller",{
    method:"GET"
  })
  if(res.ok){
    console.log("logged out")
    window.location.href="/landing"
  }
  else{
    console.log("error logging out")
  }
})
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