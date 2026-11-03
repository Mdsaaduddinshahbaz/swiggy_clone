// Needs /static/ui.js loaded before this file (spinner + toast helpers).

const pathParts = window.location.pathname.split("/");
const role = pathParts[pathParts.length - 1];

document.addEventListener("DOMContentLoaded", () => {
  const signupForm = document.getElementById("signupform");
  const loginBtn = document.getElementById("loginBtn");
  const submitBtn = signupForm.querySelector('button[type="submit"]');

  loginBtn.addEventListener("click", () => {
    window.location.href = `/login/${role}`;
  });

  signupForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const email = document.getElementById("email").value.trim();
    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirm_password").value;

    if (password !== confirmPassword) {
      PickitUI.toast("Passwords do not match!", "error");
      return;
    }

    PickitUI.setLoading(submitBtn, "Creating account…");

    try {
      const res = await fetch(`/signup_user`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, username, password, role }),
      });

      const data = await res.json();
      console.log("in signup", data);

      if (data.success) {
        PickitUI.setSuccess(submitBtn, "Account created");
        PickitUI.toast(
          "Account created! We emailed you, please check your inbox or spam folder.",
          "success",
          3800
        );
        // short pause so the success state is visible before leaving the page
        setTimeout(() => {
          if (role === "user") {
            window.location.href = `/login/user`;
          } else {
            window.location.href = `/login/seller`;
          }
        }, 1800);
      } else {
        PickitUI.setLoading(submitBtn, false);
        PickitUI.toast(data.msg || "User already exists", "error");
      }
    } catch (err) {
      console.error("Signup error:", err);
      PickitUI.setLoading(submitBtn, false);
      PickitUI.toast("Something went wrong. Please try again.", "error");
    }
  });
});