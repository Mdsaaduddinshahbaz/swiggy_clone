// const BASEURL="https://productivity-ai-agent.onrender.com"
// import { BASEURL } from "../my_extension/config";
// async function loadConfig() {
//   const { BASEURL } = await import("../my_extension/config");
//   console.log(BASEURL);
//   return BASEURL
// }
// const BASEURL=loadConfig()
const BASEURL = "http://127.0.0.1:5000"
const pathParts = window.location.pathname.split("/");

const role = pathParts[pathParts.length - 1];
document.addEventListener("DOMContentLoaded", () => {
  const form = document.querySelector("form")
  const inputs = form.querySelectorAll("input");
  const signupBtn=document.getElementById("signupBtn")
  signupBtn.addEventListener("click",()=>{
    window.location.href=`/signup/${role}`
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
      const res = await fetch(`${BASEURL}/validate_user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      console.log(data.success)
      if (data.success === "not found") {
        alert("user credentials not found")
      }
      else if (data.success) {
        alert(data.message || "Welcome!");
        localStorage.setItem("userId", data.user_id)
        localStorage.setItem("username", data.username)
        if (role === "user") {
          window.location.href = `http://127.0.0.1:5000/user/${data.user_id}`
        }
        else {
          window.location.href = `http://127.0.0.1:5000/seller/${data.user_id}`
        }
      }
      else {
        alert("username or password is wrong")
      }
    } catch (err) {
      console.error("Error submitting form:", err);
      alert("Something went wrong!");
    }
  });
});
