// ===== SPA Router (final) =====
// Include this ONCE, on every page, as the LAST script tag in <body>,
// AFTER that page's own script (home.js / orders.js / cart.js).
//
// REQUIRES:
//  - Every page wraps its unique content in <div id="spa-content">...</div>
//  - Header (with #appNavbar) and footer are IDENTICAL markup on all 3 pages,
//    live OUTSIDE #spa-content, and are never replaced.
//  - window.APP_USER_ID is set before this script runs.

window.__SPA__ = true;

(function () {
    const pathparts = window.location.pathname.split("/");
    const userid = pathparts[pathparts.length - 1];
    const uid = userid || window.APP_USER_ID;
    const CONTENT_ID = "spa-content";
    const pageCache = new Map();      // url -> { html, title }  (raw page skeletons)
    const loadedScripts = new Set();  // pages whose JS has already run at least once
    let currentPage = null;

    // Map each logical page to its script file. Adjust paths if yours differ.
    const SCRIPTS = {
        home: "../static/home.js",
        orders: "../static/orders.js",
        cart: "../static/cart.js",
    };

    function pageForPath(pathname) {
        if (pathname.startsWith("/orders")) return "orders";
        if (pathname.startsWith("/cart")) return "cart";
        return "home";
    }

    function setActiveTab(page, animate) {
        const navbar = document.getElementById("appNavbar");
        if (!navbar) return;
        const indicator = document.getElementById("navbarIndicator");
        const items = Array.from(navbar.querySelectorAll(".nav-item"));
        const activeItem = items.find((i) => i.dataset.page === page) || items[0];

        items.forEach((i) => i.classList.remove("active"));
        activeItem.classList.add("active");

        indicator.style.transition = animate
            ? "transform 0.35s cubic-bezier(0.65,0,0.35,1), width 0.35s cubic-bezier(0.65,0,0.35,1)"
            : "none";
        indicator.style.width = activeItem.offsetWidth + "px";
        indicator.style.transform = `translateX(${activeItem.offsetLeft}px)`;
    }

    function buildNavLinks() {
        const navbar = document.getElementById("appNavbar");
        if (!navbar) return;
        // const uid = window.APP_USER_ID;
        if (!uid) {
            console.warn("spa-router.js: window.APP_USER_ID is not set — nav links will be wrong.");
        }
        const routes = {
            home: `/user/${uid}`,
            orders: `/orders/${uid}`,
            cart: `/cart/${uid}`,
        };
        navbar.querySelectorAll(".nav-item").forEach((item) => {
            const page = item.dataset.page;
            if (routes[page]) item.setAttribute("href", routes[page]);
        });
    }

    async function fetchSkeleton(url) {
        if (pageCache.has(url)) return pageCache.get(url);
        const res = await fetch(url, { credentials: "same-origin" });
        const text = await res.text();
        const doc = new DOMParser().parseFromString(text, "text/html");
        const content = doc.getElementById(CONTENT_ID);
        const entry = {
            html: content ? content.innerHTML : doc.body.innerHTML,
            title: doc.title,
        };
        pageCache.set(url, entry);
        return entry;
    }

    // Loads a page's script exactly once. On its FIRST load, the script's own
    // top-level code runs its init immediately (same as it would on a normal
    // page load) — so we do NOT also fire spa:pageload that time, or it'd
    // double-init. On later revisits, the script is already loaded, so we
    // dispatch spa:pageload instead, which the script listens for to re-run
    // its init function against the freshly-swapped-in DOM.
    function ensureScriptLoaded(page) {
        return new Promise((resolve, reject) => {
            if (loadedScripts.has(page)) {
                resolve({ firstLoad: false });
                return;
            }
            loadedScripts.add(page);
            const s = document.createElement("script");
            s.src = SCRIPTS[page];
            s.onload = () => resolve({ firstLoad: true });
            s.onerror = reject;
            document.body.appendChild(s);
        });
    }

    async function navigate(url, { push = true } = {}) {
        const container = document.getElementById(CONTENT_ID);
        if (!container) {
            window.location.href = url; // safety net if a page forgot the wrapper
            return;
        }

        // Fade the old content out first — hides the hard-cut jump and gives
        // the fetch a moment to land before anything visually changes.
        container.classList.add("spa-fading");
        await new Promise((r) => setTimeout(r, 150));

        let entry;
        try {
            entry = await fetchSkeleton(url);
        } catch (err) {
            console.error("SPA navigation failed, falling back to full load", err);
            window.location.href = url;
            return;
        }

        // Swap the content FIRST — the page's script assumes its elements exist.
        container.innerHTML = entry.html;
        document.title = entry.title;

        const page = pageForPath(new URL(url, window.location.origin).pathname);
        currentPage = page;
        setActiveTab(page, true);

        if (push) history.pushState({ url }, "", url);

        const { firstLoad } = await ensureScriptLoaded(page);
        if (!firstLoad) {
            document.dispatchEvent(new CustomEvent("spa:pageload", { detail: { page, url } }));
        }

        requestAnimationFrame(() => container.classList.remove("spa-fading"));
        window.scrollTo(0, 0);
    }

    function initRouter() {
        buildNavLinks();

        const currentUrl = window.location.pathname;
        currentPage = pageForPath(currentUrl);

        // Seed the skeleton cache with what's already server-rendered, so
        // coming back to THIS page later never re-fetches it either.
        const container = document.getElementById(CONTENT_ID);
        if (container) {
            pageCache.set(currentUrl, { html: container.innerHTML, title: document.title });
        }
        // The current page's own <script> tag already ran (it's included
        // directly in this page's HTML, before this router script) — mark it
        // loaded so we don't re-inject it.
        loadedScripts.add(currentPage);

        setActiveTab(currentPage, false);

        document.addEventListener("click", (e) => {
            const link = e.target.closest("#appNavbar a.nav-item");
            if (!link) return;
            e.preventDefault();
            const url = link.getAttribute("href");
            if (pageForPath(new URL(url, window.location.origin).pathname) === currentPage) return;
            navigate(url);
        });

        window.addEventListener("popstate", () => navigate(window.location.pathname, { push: false }));
        window.addEventListener("resize", () => setActiveTab(currentPage, false));
    }

    document.addEventListener("DOMContentLoaded", initRouter);
})();