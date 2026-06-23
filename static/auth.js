// const BASEURL="https://productivity-ai-agent.onrender.com"
// import { BASEURL } from "../my_extension/config";
// async function loadConfig() {
//   const { BASEURL } = await import("../my_extension/config");
//   console.log(BASEURL);
//   return BASEURL
// }
// const BASEURL=loadConfig()
// const BASEURL = "http://127.0.0.1:5000"
const pathParts = window.location.pathname.split("/");

const role = pathParts[pathParts.length - 1];
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form")
  const inputs = form.querySelectorAll("input");
  const signupBtn = document.getElementById("signupBtn")
  signupBtn.addEventListener("click", () => {
    window.location.href = `/signup/${role}`
  })
  let formData = {};

  // Attach input listeners
  inputs.forEach((input, index) => {
    // Decide field name
    let fieldName =
      input.getAttribute("name") ||
      input.getAttribute("placeholder") ||
      input.getAttribute("id") ||
      `field_${index}`;

    // Initialize field
    formData[fieldName] = "";

    // Update as user types
    input.addEventListener("input", (e) => {
      formData[fieldName] = e.target.value;
      console.log("Updated formData:", formData);
    });
  });
  console.log(formData)
  // Handle form submit
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      if (role === "user") {
        console.log("hello")
        const res = await fetch(`/validate_user`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        const data = await res.json();
        console.log(data.success)
        if (data.msg === "Not_found") {
          alert("user credentials not found")
        }
        else if(data.msg==="Not_verified"){
          alert("Not verified \n An Email is Sent to You please click the link to verify your mail")
        }
        else if (data.success) {
          console.log(data)
          alert(data.message || "Welcome!");
          localStorage.setItem("userId", data.user_id)
          localStorage.setItem("username", data.username)
          window.location.href = `/user/${data.user_id}`
          // else {
          //   window.location.href = `/seller/${data.username}/${data.user_id}`
          // }
        }
        else {
          alert("username or password is wrong")
        }
      }
      else {
        console.log("hello")
        const res = await fetch(`/validate_owner`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(formData),
        });

        const data = await res.json();
        console.log(data)
        console.log(data.success)
        if (data.msg === "not found") {
          alert("user credentials not found")
        }
        else if (data.msg === "not_verified"){
          alert("An Email is sent to you please click the Link to verify Your Account")
          window.location.href=`/login/seller`
        }
        else if(!data.is_setup){
          window.location.href = `/seller/resturantSetup/${data.user_id}`
        }
        else if (data.success && data.is_setup) {
          alert(data.message || "Welcome!");
          window.location.href = `/seller/${data.username}/${data.user_id}`
        }
        else {
          alert("username or password is wrong")
        }
      }

    } catch (err) {
      console.error("Error submitting form:", err);
      alert("Something went wrong!");
    }
  });
});
