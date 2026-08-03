
const orderssBtn=document.getElementById("OrderrBtn")
const InventorysBtn=document.getElementById("InventorysBtn")
const DashboardsBtn=document.getElementById("DashboardsBtn")
// const logoutsBtn=document.getElementById("Logout")
// logoutsBtn.addEventListener("click",async ()=>{
//   localStorage.removeItem("resId")
//   localStorage.removeItem("resname")
//   window.location.href="/"
//   const res=await fetch("/logout/seller",{
//     method:"GET"
//   })
//   if(res.ok){
//     console.log("logged out")
//     window.location.href="/landing"
//   }
//   else{
//     console.log("error logging out")
//   }
// })
orderssBtn.addEventListener("click",()=>{
    console.log("orders clicked")
    DashboardsBtn.classList.remove("active")
    InventorysBtn.classList.remove("active")
    orderssBtn.classList.add("active")
  window.location.href=`/seller/orders/${resname}/${resId}`
})
InventorysBtn.addEventListener("click",()=>{
    orderssBtn.classList.remove("active")
    DashboardsBtn.classList.remove("active")
    InventorysBtn.classList.add("active")
  window.location.href=`/seller/menu/${resname}/${resId}`
})
// const DashboardsBtn=document.getElementById("DashboardsBtn")
DashboardsBtn.addEventListener("click",()=>{
    InventorysBtn.classList.remove("active")
    orderssBtn.classList.remove("active")
    DashboardsBtn.classList.add("active")
  window.location.href=`/seller/${resname}/${resId}`
})
// overlay.addEventListener("click",()=>{
//   const sidebar=document.querySelector(".sidebar")
//   overlay.classList.remove("show")
//   sidebar.style.display="none"
//   sidebar.classList.remove("show")
// })