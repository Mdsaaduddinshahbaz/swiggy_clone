// spa_router.js
//
// Content-swap router: exactly one page's markup lives inside
// #spa-content at any time (cloned from a <template>). This matches
// what home.js / cart.js / orders.js already assume — e.g. their
// `if (!someElement) return;` guards, and the comment in home.js
// about the old map DOM node being "discarded by the router's
// content swap".

const SPA_PAGES = ["home", "orders", "cart"];
const spaContent = document.getElementById("spa-content");
const navLinks = document.querySelectorAll(".nav-item");
const navIndicator = document.getElementById("navbarIndicator");

let currentPage = null;
const loadedPageScripts = new Set(); // tracks lazy-loaded scripts (orders + socket.io)

function getTemplate(page) {
    return document.getElementById(`tpl-${page}`);
}

function moveNavIndicator(page) {
    if (!navIndicator) return;
    const activeLink = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (!activeLink) return;
    navIndicator.style.width = `${activeLink.offsetWidth}px`;
    navIndicator.style.transform = `translateX(${activeLink.offsetLeft}px)`;
}

// Lazily injects a script tag once, resolving when it (and its
// dependencies) finish loading.
function loadScriptOnce(src) {
    return new Promise((resolve, reject) => {
        if (loadedPageScripts.has(src)) { resolve(); return; }
        const s = document.createElement("script");
        s.src = src;
        s.onload = () => { loadedPageScripts.add(src); resolve(); };
        s.onerror = () => reject(new Error(`Failed to load ${src}`));
        document.body.appendChild(s);
    });
}

// orders.js expects `io()` (socket.io) to already be defined, and per
// its own comment should only ever be injected once and stay alive
// across navigation — so we lazy-load both together, only the first
// time the user visits Orders.
async function ensurePageScripts(page) {
    if (page !== "orders") return;
    if (loadedPageScripts.has("orders.js")) return;
    await loadScriptOnce("https://cdnjs.cloudflare.com/ajax/libs/socket.io/4.7.5/socket.io.min.js");
    await loadScriptOnce("../static/orders.js");
    loadedPageScripts.add("orders.js");
}

async function renderPage(page, { pushState = true } = {}) {
    if (!SPA_PAGES.includes(page)) page = "home";
    if (page === currentPage) return;

    const tpl = getTemplate(page);
    if (!tpl) return;

    spaContent.innerHTML = "";
    spaContent.appendChild(tpl.content.cloneNode(true));

    navLinks.forEach((link) => {
        link.classList.toggle("active", link.dataset.page === page);
    });
    moveNavIndicator(page);

    currentPage = page;
    if (pushState) history.pushState({ page }, "", `#${page}`);

    // Load orders.js/socket.io before dispatching, so first-time
    // navigation to Orders runs initOrdersPage() via the script's own
    // self-invocation. On later visits the script is already loaded,
    // so the spa:pageload listener below is what re-runs it.
    await ensurePageScripts(page);

    document.dispatchEvent(new CustomEvent("spa:pageload", { detail: { page } }));
}

navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
        e.preventDefault();
        const page = link.dataset.page;
        renderPage(page);
    });
});

window.addEventListener("popstate", (e) => {
    const page = (e.state && e.state.page) || "home";
    renderPage(page, { pushState: false });
});

// Initial render — respects a deep link like /#cart, defaults to home.
const initialPage = window.location.hash.replace("#", "") || "home";
renderPage(initialPage, { pushState: false });