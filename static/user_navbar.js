// ===== Shared App Navbar Logic =====
// Include this on home.html, orders.html, cart.html (after the navbar markup is in the DOM)
(function () {
    const pathparts=window.location.pathname.split("/")
    const userid=pathparts[pathparts.length-1]
    function initNavbar() {
        const navbar = document.getElementById("appNavbar");
        if (!navbar) return;

        const indicator = document.getElementById("navbarIndicator");
        const items = Array.from(navbar.querySelectorAll(".nav-item"));

        // uid must be set by the page BEFORE this script runs, e.g.:
        //   <script>window.APP_USER_ID = "{{ uid }}";</script>
        //   <script src="../static/navbar.js"></script>
        const uid = userid || window.APP_USER_ID;
        if (!uid) {
            console.warn(
                "navbar.js: window.APP_USER_ID is not set — nav links won't include the user id."
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

        // Work out which page we're on from the URL path (not filename,
        // since routes are /user/<uid>, /orders/<uid>, /cart/<uid>)
        const path = window.location.pathname;
        let current = "home";
        if (path.startsWith("/orders")) current = "orders";
        else if (path.startsWith("/cart")) current = "cart";
        else if (path.startsWith("/user")) current = "home";

        let activeItem =
            items.find((item) => item.dataset.page === current) || items[0];

        function moveIndicator(el, animate = true) {
            if (!el) return;
            indicator.style.transition = animate
                ? "transform 0.35s cubic-bezier(0.65,0,0.35,1), width 0.35s cubic-bezier(0.65,0,0.35,1)"
                : "none";
            indicator.style.width = el.offsetWidth + "px";
            indicator.style.transform = `translateX(${el.offsetLeft}px)`;
        }

        function setActive(el) {
            items.forEach((item) => item.classList.remove("active"));
            el.classList.add("active");
            moveIndicator(el);
        }

        // Position indicator instantly on load (no animation on first paint)
        setActive(activeItem);
        // moveIndicator(activeItem, false);

        // Optional: instant visual feedback before navigation actually happens
        items.forEach((item) => {
            item.addEventListener("click", (e) => {
                setActive(item);
                // Let the CSS transition play briefly before navigating away
                // Comment this out if your links/buttons handle routing via JS already
            });
        });

        // Recalculate on resize (widths/offsets change, e.g. desktop vs mobile layout)
        window.addEventListener("resize", () => moveIndicator(activeItem, false));
    }

    document.addEventListener("DOMContentLoaded", initNavbar);
})();