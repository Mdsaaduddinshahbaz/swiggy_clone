// const BASEURL="https://productivity-ai-agent.onrender.com"
// import { BASEURL } from "../my_extension/config";
// async function loadConfig() {
//   const { BASEURL } = await import("../my_extension/config");
//   console.log(BASEURL);
//   return BASEURL
// }
// const BASEURL="http://127.0.0.1:5000"

const pathParts = window.location.pathname.split("/");

const role = pathParts[pathParts.length - 1];
document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signupform");
  const loginBtn=document.getElementById("loginBtn")
  loginBtn.addEventListener("click",()=>{
    window.location.href=`/login/${role}`
  })
  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirm_password").value;

    if (password !== confirmPassword) {
      alert("Passwords do not match!");
      return;
    }

    try {
      const res = await fetch(`/signup_user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email,username, password }),
      });

      const data = await res.json();
      if (data.success) {
        alert(data.message || "Signup successful! Please login.");
        // window.location.href = "/login";
        if (role === "user") {
          // window.location.href = `http://127.0.0.1:5000/user/${data.user_id}`
          window.location.href = `/login/user`
        }
        else {
          // window.location.href = `http://127.0.0.1:5000/seller/${data.user_id}`
          window.location.href = `/seller/resturantSetup/${data.user_id}`
        }
      }
      else if(!data.success){
        alert(data.message || "User already exists");
      }
       else {
        alert(data.message || "Signup failed, try again.");
      }
    } catch (err) {
      console.error("Signup error:", err);
      alert("Something went wrong!");
    }
  });
});
