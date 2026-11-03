/* ============================================================
   PICKIT UI HELPERS — button loading state + toasts
   Drop in /static/ui.js and load it BEFORE auth.js / signup.js.

   PickitUI.setLoading(btn, "Logging in…")   -> spinner + disabled
   PickitUI.setLoading(btn, false)           -> back to normal
   PickitUI.setSuccess(btn, "Logged in")     -> green check state
   PickitUI.toast("message", "error" | "success" | "info", ms)

   Login page (form[name="login form"]) is wired automatically:
   - on submit the button shows "Logging in…" with a spinner
   - alert() calls from auth.js become non-blocking toasts
   - the spinner clears when an alert/error appears; if the request
     finished but the page did not navigate, it also clears itself
   ============================================================ */
(function () {
  "use strict";

  /* ---------- styles ---------- */
  var css = [
    ".btn.is-loading,.btn.is-success{display:flex;align-items:center;justify-content:center;gap:10px;pointer-events:none}",
    ".btn.is-loading{cursor:progress;filter:saturate(.9)}",
    ".btn.is-success{background:#48a968!important;box-shadow:0 12px 24px rgba(72,169,104,.28)!important}",
    ".pk-spin{width:18px;height:18px;flex:0 0 18px;border-radius:50%;border:2.5px solid rgba(255,255,255,.4);border-top-color:#fff;animation:pkspin .7s linear infinite}",
    "@keyframes pkspin{to{transform:rotate(360deg)}}",
    ".pk-check{font-weight:800;font-size:17px;line-height:1}",
    ".pk-toasts{position:fixed;top:max(14px,env(safe-area-inset-top));left:50%;transform:translateX(-50%);z-index:99999;display:flex;flex-direction:column;gap:8px;width:min(92vw,420px);pointer-events:none}",
    ".pk-toast{display:flex;align-items:flex-start;gap:10px;padding:13px 16px;border-radius:16px;background:#211714;color:#fff;font:600 14px/1.4 'DM Sans',sans-serif;box-shadow:0 18px 40px rgba(33,23,20,.28);animation:pkin .3s cubic-bezier(.2,.8,.2,1) both;pointer-events:auto}",
    ".pk-toast i{flex:0 0 auto;width:9px;height:9px;margin-top:5px;border-radius:50%;background:#f5b51b}",
    ".pk-toast.error i{background:#ff6a47}",
    ".pk-toast.success i{background:#48a968}",
    ".pk-toast.out{animation:pkout .25s ease both}",
    "@keyframes pkin{from{opacity:0;transform:translateY(-10px) scale(.97)}to{opacity:1;transform:none}}",
    "@keyframes pkout{to{opacity:0;transform:translateY(-8px)}}"
  ].join("\n");
  var st = document.createElement("style");
  st.textContent = css;
  document.head.appendChild(st);

  /* ---------- toast ---------- */
  var wrap;
  function toast(message, type, ms) {
    if (!message) return;
    if (!wrap) {
      wrap = document.createElement("div");
      wrap.className = "pk-toasts";
      wrap.setAttribute("role", "status");
      wrap.setAttribute("aria-live", "polite");
      document.body.appendChild(wrap);
    }
    var t = document.createElement("div");
    t.className = "pk-toast " + (type || "info");
    var dot = document.createElement("i");
    var txt = document.createElement("span");
    txt.textContent = String(message);
    t.appendChild(dot);
    t.appendChild(txt);
    wrap.appendChild(t);
    var life = ms || 3500;
    setTimeout(function () {
      t.classList.add("out");
      setTimeout(function () { t.remove(); }, 260);
    }, life);
  }

  /* ---------- button states ---------- */
  function setLoading(btn, state) {
    if (!btn) return;
    if (state === false) {
      if (btn.dataset.pkLabel !== undefined) {
        btn.innerHTML = btn.dataset.pkLabel;
        delete btn.dataset.pkLabel;
      }
      btn.classList.remove("is-loading", "is-success");
      btn.disabled = false;
      btn.removeAttribute("aria-busy");
      return;
    }
    if (btn.dataset.pkLabel === undefined) btn.dataset.pkLabel = btn.innerHTML;
    btn.classList.remove("is-success");
    btn.classList.add("is-loading");
    btn.disabled = true;
    btn.setAttribute("aria-busy", "true");
    btn.innerHTML = "";
    var sp = document.createElement("span");
    sp.className = "pk-spin";
    var tx = document.createElement("span");
    tx.textContent = typeof state === "string" ? state : "Please wait…";
    btn.appendChild(sp);
    btn.appendChild(tx);
  }

  function setSuccess(btn, text) {
    if (!btn) return;
    if (btn.dataset.pkLabel === undefined) btn.dataset.pkLabel = btn.innerHTML;
    btn.classList.remove("is-loading");
    btn.classList.add("is-success");
    btn.disabled = true;
    btn.removeAttribute("aria-busy");
    btn.innerHTML = "";
    var ck = document.createElement("span");
    ck.className = "pk-check";
    ck.textContent = "✓";
    var tx = document.createElement("span");
    tx.textContent = text || "Done";
    btn.appendChild(ck);
    btn.appendChild(tx);
  }

  window.PickitUI = { setLoading: setLoading, setSuccess: setSuccess, toast: toast };

  /* ---------- alert() -> non-blocking toast ---------- */
  var activeBtn = null; // login button currently showing a spinner
  window.alert = function (msg) {
    var m = String(msg == null ? "" : msg);
    var good = /success|welcome|sent|created|logged in/i.test(m) && !/fail|invalid|wrong|error|not |incorrect/i.test(m);
    toast(m, good ? "success" : "error", good ? 3500 : 4000);
    if (activeBtn && !good) { setLoading(activeBtn, false); activeBtn = null; }
  };

  /* ---------- login page auto-wiring ---------- */
  var origFetch = window.fetch ? window.fetch.bind(window) : null;
  if (origFetch) {
    window.fetch = function () {
      var p = origFetch.apply(null, arguments);
      if (activeBtn) {
        var btn = activeBtn;
        p.then(function () {
          // request finished; if we're still on this page shortly after, stop the spinner
          setTimeout(function () {
            if (activeBtn === btn) { setLoading(btn, false); activeBtn = null; }
          }, 1600);
        }, function () {
          setLoading(btn, false);
          activeBtn = null;
          toast("Network problem. Please try again.", "error");
        });
      }
      return p;
    };
  }

  document.addEventListener("DOMContentLoaded", function () {
    var form = document.querySelector('form[name="login form"]');
    if (!form) return;
    var btn = form.querySelector('button[type="submit"]');
    form.addEventListener("submit", function () {
      // runs only after the browser's own validation passed
      activeBtn = btn;
      setLoading(btn, "Logging in…");
    }, true);
  });

  // coming back via the browser's back button should never show a stuck spinner
  window.addEventListener("pageshow", function (e) {
    if (e.persisted && activeBtn) { setLoading(activeBtn, false); activeBtn = null; }
  });
})();