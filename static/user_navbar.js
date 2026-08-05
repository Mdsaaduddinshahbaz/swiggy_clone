// ===== Shared App Navbar Logic =====
// Include this on home.html, orders.html, cart.html (after the navbar markup is in the DOM)
//
// Each page should already mark its own tab with class="active" in the HTML
// (e.g. cart.html's Cart <a> has class="nav-item active"). This script trusts
// that, snaps the indicator there instantly on load, and only animates when
// the user actually clicks a different tab.

(function () {
    const pathparts = window.location.pathname.split("/");
    const userid = pathparts[pathparts.length - 1];

    function initNavbar() {
        const navbar = document.getElementById("appNavbar");
        if (!navbar) return;

        const indicator = document.getElementById("navbarIndicator");
        const items = Array.from(navbar.querySelectorAll(".nav-item"));

        const uid = userid || window.APP_USER_ID;
        if (!uid) {
            console.warn(
                "navbar.js: user id not found in URL or window.APP_USER_ID — nav links won't include it."
            );
        }

        // Build correct hrefs for each tab based on your actual Flask routes
        const routes = {
            home: `/user/${uid}`,
            orders: `/orders/${uid}`,
            cart: `/cart/${uid}`,
        };
        items.forEach((item) => {
            const page = item.dataset.page;
            if (routes[page]) item.setAttribute("href", routes[page]);
        });

        function moveIndicator(el, animate = true) {
            if (!el) return;
            indicator.style.transition = animate
                ? "transform 0.35s cubic-bezier(0.65,0,0.35,1), width 0.35s cubic-bezier(0.65,0,0.35,1)"
                : "none";
            indicator.style.width = el.offsetWidth + "px";
            indicator.style.transform = `translateX(${el.offsetLeft}px)`;
        }

        // Trust whichever tab is already marked active in this page's HTML.
        // Fall back to path-based detection only if none is marked yet.
        let activeItem = items.find((item) => item.classList.contains("active"));
        if (!activeItem) {
            const path = window.location.pathname;
            let current = "home";
            if (path.startsWith("/orders")) current = "orders";
            else if (path.startsWith("/cart")) current = "cart";
            activeItem = items.find((item) => item.dataset.page === current) || items[0];
            activeItem.classList.add("active");
        }

        // 1. Snap the indicator to the active tab instantly — no transition on first paint
        moveIndicator(activeItem, false);

        // 2. On click, animate the slide to the clicked tab before normal <a> navigation happens
        items.forEach((item) => {
            item.addEventListener("click", () => {
                items.forEach((i) => i.classList.remove("active"));
                item.classList.add("active");
                moveIndicator(item, true);
            });
        });

        // Recalculate on resize (widths/offsets change, e.g. desktop vs mobile layout)
        window.addEventListener("resize", () => moveIndicator(activeItem, false));
    }

    document.addEventListener("DOMContentLoaded", initNavbar);
})();