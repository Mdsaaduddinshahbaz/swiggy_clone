"""
Flask app: pages, JSON API and Socket.IO.

Production:  gunicorn -w 1 --threads 100 server:app
Local:       python server.py            (set FLASK_DEBUG=1 for auto-reload)
Packages:    pip install gunicorn simple-websocket

Route function names are Flask endpoint names. Templates may use them in url_for(),
so they are kept exactly as before.
"""
import logging
import os
from datetime import datetime, timedelta, timezone
from functools import wraps

import jwt
import requests
from dotenv import load_dotenv
from flask import Flask, g, jsonify, redirect, render_template, request, send_from_directory, url_for
from flask_cors import CORS
from flask_socketio import SocketIO, emit, join_room
from itsdangerous import URLSafeTimedSerializer
from werkzeug.exceptions import HTTPException

load_dotenv(override=True)
logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("server")

from database import (  # noqa: E402  (logging must be set up first)
    AlreadySetUp, add_resturant_items, add_resturants, add_subcategory, check_existing_owner,
    check_existing_user, create_new_user, fetch_address, fetch_profiles, get_item_for_cart,
    get_orders, get_preview_items, get_seller_analytics, get_seller_orders, list_resturant_items,
    list_resturants, remove_resturant_item, resturant_stats, return_res_analytics, save_address,
    save_category, set_verified, store_orders, update_order_status_seller, update_order_status_user,
    update_profiles, update_resturant_item, verify_order,
)
from redis_db import REDIS_URL, acquire_lock, add_cart, get_cart, release_lock, update_cart_qty  # noqa: E402
from validators import (  # noqa: E402
    validate_add_to_cart, validate_address, validate_category, validate_credentials, validate_item_form,
    validate_restaurant_form, validate_signup, validate_subcategory, validate_update_item,
)
from verify import upload_image  # noqa: E402

SECRET_KEY = os.environ["Mail_secret_key"]
BREVO_API_KEY = os.getenv("brevo_api_email")
MAIL_SENDER = os.getenv("MAIL_SENDER", "dummy.mail.saad@gmail.com")
COOKIE_SECURE = os.getenv("COOKIE_SECURE", "0") == "1"      # set to 1 once the site is on HTTPS

app = Flask(__name__)
app.config["SECRET_KEY"] = SECRET_KEY
CORS(app)
# "threading" is the right mode for pymongo/redis, which block while they wait for the network.
# The Redis message queue is only needed if more than one process sends Socket.IO events.
socketio = SocketIO(app, cors_allowed_origins="*",
                    message_queue=None if os.getenv("SOCKETIO_MESSAGE_QUEUE") == "off" else REDIS_URL,
                    async_mode=os.getenv("SOCKETIO_ASYNC_MODE", "threading"))
serializer = URLSafeTimedSerializer(SECRET_KEY)


# ======================================================================= helpers

def _body():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else {}


def _json_error(message, status, clear_cookies=()):
    resp = jsonify({"success": False, "message": message})
    resp.status_code = status
    for name in clear_cookies:
        resp.delete_cookie(name)
    return resp


def _set_auth_cookie(resp, name, claims, ttl):
    token = jwt.encode({**claims, "exp": datetime.now(timezone.utc) + ttl}, SECRET_KEY, algorithm="HS256")
    resp.set_cookie(name, token, httponly=True, secure=COOKIE_SECURE, samesite="Lax",
                    max_age=int(ttl.total_seconds()))


def _decode(token):
    return jwt.decode(token, SECRET_KEY, algorithms=["HS256"])


# Pages that send a logged-out visitor to a login page instead of returning a JSON error.
LOGIN_PAGES = {"home": "user", "sellerTemplate": "seller"}


def login_required(fn=None, *, role=None):
    """Checks the user_token / seller_token cookie and fills g.
    role=None accepts both; role="user" or role="seller" accepts only that one."""
    if fn is None:
        return lambda f: login_required(f, role=role)

    @wraps(fn)
    def wrapper(*args, **kwargs):
        names = ("seller_token", "user_token") if role == "seller" else ("user_token", "seller_token")
        token = next((request.cookies[n] for n in names if request.cookies.get(n)), None)
        if not token:
            if request.endpoint in LOGIN_PAGES:
                return redirect(url_for("login", role=LOGIN_PAGES[request.endpoint]))
            return _json_error("Token is missing or unauthorized access", 401)
        try:
            payload = _decode(token)
        except jwt.InvalidTokenError:
            return _json_error("Invalid token", 401, ("user_token", "seller_token"))

        g.type = payload.get("type")
        if g.type == "user" and payload.get("user_id"):
            g.user_id = payload["user_id"]
        elif g.type == "seller" and payload.get("res_id"):
            g.res_id = payload["res_id"]
            g.username = payload.get("username")
        else:
            return _json_error("Invalid token", 401, ("user_token", "seller_token"))

        if role and g.type != role:
            return _json_error("Unauthorized", 403)
        return fn(*args, **kwargs)

    return wrapper


def owner_setup_required(fn):
    """For owners who signed up but haven't created their restaurant yet (seller_res_token cookie)."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = request.cookies.get("seller_res_token")
        if not token:
            return jsonify({"success": False}), 401
        try:
            payload = _decode(token)
            g.owner_id = payload["owner_id"]
            g.username = payload.get("username")
        except (jwt.InvalidTokenError, KeyError):
            return _json_error("Invalid token", 401, ("seller_res_token",))
        return fn(*args, **kwargs)
    return wrapper


def socket_auth(role):
    """Socket.IO version of login_required. Reads the cookie sent when the socket connected."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            token = request.cookies.get("user_token" if role == "user" else "seller_token")
            try:
                payload = _decode(token) if token else {}
            except jwt.InvalidTokenError:
                payload = {}
            if payload.get("type") != role:
                return {"success": False, "message": "Unauthorized"}
            g.user_id = payload.get("user_id")
            g.res_id = payload.get("res_id")
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def send_verification_email(email, role):
    token = serializer.dumps({"email": email, "role": role}, salt="email-verification")
    verify_url = url_for("verify_email", token=token, _external=True)
    try:
        resp = requests.post(
            "https://api.brevo.com/v3/smtp/email",
            headers={"accept": "application/json", "api-key": BREVO_API_KEY, "content-type": "application/json"},
            json={
                "sender": {"email": MAIL_SENDER},
                "to": [{"email": email}],
                "subject": "Verify Email",
                "htmlContent": f'<p>Click below to verify:</p><a href="{verify_url}">{verify_url}</a>',
            },
            timeout=10,
        )
    except requests.RequestException:
        log.exception("verification email to %s failed", email)
        return False
    if resp.status_code != 201:
        log.error("Brevo answered %s: %s", resp.status_code, resp.text[:300])
        return False
    return True


@app.errorhandler(Exception)
def handle_unexpected_error(e):
    print(e)
    if isinstance(e, HTTPException):
        return e
    log.exception("unhandled error on %s %s", request.method, request.path)
    return jsonify({"success": False, "message": "Internal server error"}), 500


# ========================================================================= pages

@app.route("/", methods=["GET", "POST"])
def land():
    return redirect(url_for("renderLanding"))


@app.get("/landing")
def renderLanding():
    return render_template("landing.html")


@app.get("/.well-known/assetlinks.json")
def serve_asset_links_file():
    return send_from_directory(os.path.join(app.root_path, "static"), "assetlinks.json",
                               mimetype="application/json")


@app.route("/login/<role>")
def login(role):
    return render_template("auth.html")


@app.route("/signup/<role>")
def signup(role):
    return render_template("signup.html")


@app.route("/user/<userid>", methods=["GET", "POST"])
@login_required
def home(userid):
    return render_template("home.html", page="home")


@app.get("/menu/<name>/<address>/<res_id>/<user_id>")
def list_items(name, address, res_id, user_id):
    return render_template("menu.html")


@app.get("/cart/<userid>")
def cartss(userid):
    return render_template("cart.html", page="cart")


@app.get("/orders/<userid>")
def renderOrders(userid):
    return render_template("orders.html", page="orders")


@app.get("/menu/sel/<id>")
def s_me(id):
    return render_template("menu_seller.html")


@app.get("/seller/menu/<name>/<seller_id>")
def seller_page(name, seller_id):
    return render_template("menu_seller.html")


@app.get("/seller/orders/<res_name>/<res_id>")
def renderSellerOrders(res_name, res_id):
    return render_template("seller_orders.html", page="orders")


@app.get("/seller/analytics/<res_id>")
def render_analytics_template(res_id):
    return render_template("analytics.html")


@app.get("/seller/resturantSetup/<seller_id>")
@owner_setup_required
def renderSetup(seller_id):
    return render_template("resturant_setup.html")


@app.get("/seller/<name>/<seller_id>")
@login_required(role="seller")
def sellerTemplate(name, seller_id):
    return render_template("seller_dashboard.html", page="dashboard", username=g.username)


# ================================================================ auth & account

@app.post("/signup_user")
def signup_user():
    data, error = validate_signup()
    if error:
        return error
    res = create_new_user(data["email"], data["username"], data["password"], data["role"])
    if not res["success"]:
        return {"success": False, "msg": "user already exists!"}
    if not send_verification_email(data["email"], data["role"]):
        return {"success": False, "msg": "Internal Server Occured Please Try Again"}
    if data["role"] == "seller":
        resp = jsonify({"success": True, "user_id": res["id"]})
        _set_auth_cookie(resp, "seller_res_token",
                         {"type": "seller", "owner_id": res["id"], "username": data["username"]},
                         timedelta(hours=1))
        return resp
    return {"success": True, "user_id": res["id"]}


@app.post("/validate_user")
def validate():
    creds, error = validate_credentials()
    if error:
        return error
    res = check_existing_user(creds["email"], creds["password"])
    if res["status"] == "not_found":
        return {"success": False, "message": "Not_found"}
    if res["status"] == "wrong_password":
        return {"success": False, "message": "Invalid email or password"}, 401
    if not res["is_verified"]:
        if send_verification_email(creds["email"], "user"):
            return {"success": False, "message": "Email not verified"}, 403
        return {"success": False, "message": "Failed to send verification email"}, 500

    resp = jsonify({"success": True, "user_id": res["user_id"], "username": res["username"]})
    resp.delete_cookie("seller_token")
    _set_auth_cookie(resp, "user_token",
                     {"type": "user", "user_id": res["user_id"], "username": res["username"]},
                     timedelta(days=7))
    return resp


@app.post("/validate_owner")
def validate_owner():
    creds, error = validate_credentials()
    if error:
        return error
    res = check_existing_owner(creds["email"], creds["password"])
    if res["status"] == "not_found":
        return {"success": False, "msg": "Not_found"}
    if res["status"] == "wrong_password":
        return {"success": False}
    if not res["is_verified"]:
        if send_verification_email(creds["email"], "owner"):
            return {"success": False, "msg": "not_verified"}
        return {"success": False, "msg": "Internal Server occured Please Try again"}

    if not res["is_setup"]:
        resp = jsonify({"success": True, "user_id": res["owner_id"], "is_setup": False})
        _set_auth_cookie(resp, "seller_res_token",
                         {"type": "seller", "owner_id": res["owner_id"], "username": res["username"]},
                         timedelta(hours=1))
        return resp

    resp = jsonify({"success": True, "res_id": res["res_id"], "res_name": res["res_name"], "is_setup": True})
    resp.delete_cookie("user_token")
    _set_auth_cookie(resp, "seller_token",
                     {"type": "seller", "res_id": res["res_id"], "res_name": res["res_name"],
                      "username": res["username"]},
                     timedelta(days=7))
    return resp


@app.route("/verify/<token>")
def verify_email(token):
    try:
        data = serializer.loads(token, salt="email-verification", max_age=3600)
        email, role = data["email"], data["role"]
    except Exception:
        return "Invalid or expired link."
    set_verified(email, role)
    target = "/login/user" if role == "user" else "/login/seller"
    return f"""
        <h1>Email verified successfully ✅</h1>
        <p>Redirecting to login page in 3 seconds...</p>
        <script>setTimeout(() => {{ window.location.href = "{target}"; }}, 3000);</script>
        """


@app.get("/logout/seller")
def logout_seller():
    resp = jsonify({"success": True, "message": "Logged out successfully"})
    resp.delete_cookie("seller_token")
    return resp


@app.post("/user/logout")
def logout_user():
    resp = jsonify({"success": True})
    resp.delete_cookie("user_token")
    return resp


@app.post("/user/fetch_profile")
@login_required(role="user")
def fetch_profile():
    profile = fetch_profiles(g.user_id)
    if profile is None:
        return {"success": False, "message": "Profile not found"}, 404
    return {"success": True, "profile": profile}


@app.post("/user/update_profile")
@login_required(role="user")
def update_profile():
    data = _body()
    if not update_profiles(g.user_id, data.get("name"), data.get("phone")):
        return {"success": False, "message": "Failed to update profile"}, 500
    return {"success": True, "message": "Profile updated successfully"}


@app.post("/save_address")
@login_required(role="user")
def save_address_type():
    data, error = validate_address()
    if error:
        return error
    return {"success": save_address(data["address"], data["address_type"], g.user_id, data["cordinates"])}


@app.post("/fetch_address")
@login_required
def fetch_addresss():
    if g.type != "user":        # same as before: a seller session gets logged out here
        resp = jsonify({"success": False, "msg": "Login Please"})
        resp.delete_cookie("seller_token")
        return resp
    addresses = fetch_address(g.user_id)
    if addresses is None:
        return {"success": False, "status": 500}
    if not addresses:
        return {"success": False, "msg": "No Address Found", "status": 404}
    return {"success": True, "address": addresses}


# ============================================================ restaurant & menu

@app.post("/add_resturant")
@owner_setup_required
def add_resturant():
    data, error = validate_restaurant_form()
    if error:
        return error
    file_id = upload_image(data["photo"]) if data["photo"] else None
    try:
        res_id = add_resturants(data["name"], data["type"], data["address"], data["phone"],
                                g.owner_id, data["lng"], data["lat"], file_id)
    except AlreadySetUp:
        return {"success": False, "message": "This account already has a restaurant"}, 409

    resp = jsonify({"success": True, "res_id": res_id})
    resp.delete_cookie("seller_res_token")
    _set_auth_cookie(resp, "seller_token",
                     {"type": "seller", "res_id": res_id, "res_name": data["name"], "username": g.username},
                     timedelta(days=7))
    return resp


@app.post("/list_resturants")
@login_required
def list_resturantss():
    data = _body()
    try:
        lat, lng = float(data["latt"]), float(data["long"])
        dist = min(max(int(data.get("dist", 5)), 1), 100)
    except (KeyError, TypeError, ValueError):
        return {"success": False, "message": "latt, long and dist must be numbers"}, 400
    return {"success": True, "results": list_resturants(lng, lat, dist)}


@app.post("/preview_items")
def preview_items():
    res_ids = _body().get("res_ids")
    if not res_ids or not isinstance(res_ids, list):
        return {"success": False, "message": "res_ids required"}, 400
    return {"success": True, "items": get_preview_items(res_ids)}


@app.post("/list_items")
@login_required
def list_item():
    if g.type == "seller":
        res_id = g.res_id
    else:
        res_id = str(_body().get("res_id") or "")
        if not res_id:
            return {"success": False, "message": "res_id is required"}, 400
    res = list_resturant_items(res_id, for_seller=g.type == "seller")
    return {"success": True, "res": res["item_name"], "categories": res["categories"]}


@app.post("/add_res_items")
@login_required(role="seller")
def add_itemss():
    data, error = validate_item_form()
    if error:
        return error
    file_id = upload_image(data["photo"]) if data["photo"] else None
    res = add_resturant_items(g.res_id, data["itm_name"], data["itm_qty"], data["price"], data["sub_id"],
                              data["desc"], data["unit"], data["lowat"], data["available"], file_id=file_id)
    return {"success": True, "id": res["id"], "img_url": res["url"]}


@app.post("/update_item_details")
@login_required(role="seller")
def update_items():
    data, error = validate_update_item()
    if error:
        return error
    file_id = upload_image(data["photo"]) if data["photo"] else None
    res = update_resturant_item(data["item_id"], g.res_id, data["name"], data["price"], data["unit"],
                                data["lowAt"], data["desc"], data["subId"], data["stock"], data["available"],
                                file_id=file_id)
    if res["success"]:
        return {"success": True}
    return {"success": False, "message": res["message"]}


@app.post("/remove_items")
@login_required(role="seller")
def remove_item():
    item_id = _body().get("item_id")
    if not item_id:
        return {"success": False, "message": "item_id is required"}, 400
    return remove_resturant_item(str(item_id), g.res_id)


@app.post("/save_categories")
@login_required(role="seller")
def sve_cate():
    data, error = validate_category()
    if error:
        return error
    return {"success": True, "category": save_category(g.res_id, data["cat_name"], data["subcats"])}


@app.post("/save_subcategory")
@login_required(role="seller")
def save_subcats():
    data, error = validate_subcategory()
    if error:
        return error
    res = add_subcategory(g.res_id, data["category_id"], data["name"])
    if res["success"]:
        return {"success": True, "subcategory": res["subcategory"]}
    return {"success": False}


# ========================================================================== cart

@app.post("/add_item_carts")
def carts():
    # Old endpoint: carts live in Redis now (/add_to_cart). Kept so old frontend calls don't 404.
    return {"success": True}


@app.post("/get_cart_items")
@login_required(role="user")
def list_cart_items():
    return {"success": True, "results": get_cart(g.user_id)}


@app.post("/add_to_cart")
@login_required(role="user")
def addToCart():
    data, error = validate_add_to_cart()
    if error:
        return error
    # Price and stock come from the database, never from the browser.
    item = get_item_for_cart(data["resid"], data["item_id"])
    if item is None:
        return {"success": False, "message": "Item not found"}, 404
    if not item["available"] or item["item_qty"] <= 0:
        return {"success": False, "message": f"{item['name']} is not available right now"}, 400

    res = add_cart(data["resid"], g.user_id, item["name"], data["ress_name"], data["item_id"],
                   data["qty"], item["price"], item["item_qty"], data["replace"])
    if res["success"]:
        return {"success": True, "Total": res["total"]}
    return {"success": False, "message": res.get("message", "Unable to add item to cart")}, 400


@app.post("/update_cart")
@login_required(role="user")
def updateCart():
    data = _body()
    item_id, qty = data.get("item_id"), data.get("qty")
    if item_id is None or qty is None:
        return {"success": False, "message": "item_id and qty are required"}, 400
    try:
        qty = int(qty)
    except (TypeError, ValueError):
        return {"success": False, "message": "qty must be an integer"}, 400

    result = update_cart_qty(g.user_id, item_id, qty)
    if result["success"]:
        return {"success": True, "total": result["total"], "removed": result.get("removed", False)}
    return {"success": False, "message": result.get("message", "Unable to update item")}, 400


# ======================================================================== orders

@app.post("/store_orders")
@login_required(role="user")
def store_order():
    lock_key = f"lock:checkout:{g.user_id}"
    lock = acquire_lock(lock_key, ttl_seconds=15)
    if not lock:
        return {"success": False, "message": "Your order is already being processed"}, 409
    try:
        # time=time.perf_counter()
        result = store_orders(g.user_id, _body().get("pickup_time"))
        # print("total_time",time.perf_counter()-time)
    finally:
        release_lock(lock_key, lock)

    if not result["success"]:
        return {"success": False, "message": result["message"]},500
    for res_id in result["restaurant_ids"]:
        socketio.emit("new_order", {"msg": "refresh"}, room=res_id)
    print("returning true")
    return {"success": True, "token_no": result["token_no"]}


@app.post("/get_orders/<userid>")
@login_required(role="user")
def getOrders(userid):
    return {"success": True, "orders": get_orders(g.user_id)}


@app.route("/seller/orders", methods=["GET", "POST"])
@login_required(role="seller")
def getsellerOrders():
    return {"success": True, "orders": get_seller_orders(g.res_id)}


@app.post("/update_order")
@login_required(role="seller")
def update_status():
    data = _body()
    if not data.get("order_id") or not data.get("status"):
        return {"success": False, "message": "order_id and status are required"}, 400
    res = update_order_status_seller(str(data["order_id"]), str(data["status"]), g.res_id)
    if res["success"]:
        return {"success": True}
    return {"success": False, "message": res["message"]}


@app.post("/update_order_user")
@login_required(role="user")
def update_status_user():
    data = _body()
    result = update_order_status_user(str(data.get("order_id") or ""), str(data.get("status") or ""), g.user_id)
    return jsonify(result), (200 if result["success"] else 403)


# ============================================================== seller dashboard

@app.post("/stats")
@login_required(role="seller")
def returnstats():
    return {"success": True, "stats": resturant_stats(g.res_id)}


@app.post("/seller/analytics")
@login_required(role="seller")
def return_seller_stats():
    return {"success": True, "stats": return_res_analytics(g.res_id)}


@app.post("/seller/stats")
@login_required(role="seller")
def return_seller_statistics():
    return {"success": True, "stats": get_seller_analytics(g.res_id)}


# ===================================================================== Socket.IO

@socketio.on("join_seller_room")
@socket_auth("seller")
def handle_join(data=None):
    join_room(g.res_id)


@socketio.on("join_user_room")
@socket_auth("user")
def handle_user_join(data=None):
    join_room(g.user_id)


@socketio.on("order_completed")
@socket_auth("seller")
def handle_order_completed(data=None):
    data = data or {}
    order_id = data.get("order_id")
    user_id = verify_order(g.res_id, order_id)
    if user_id is None:
        return {"success": False, "message": "Unauthorized order"}
    socketio.emit("order_status_updated",
                  {"order_id": order_id, "token_no": data.get("token_no"), "res_id": g.res_id,
                   "status": data.get("status")},
                  room=user_id)
    return {"success": True}


@socketio.on("user_cancelled_order")
@socket_auth("user")
def handle_user_cancel(data=None):
    data = data or {}
    for res_id in data.get("res_ids", []):
        emit("seller_order_cancelled", data, room=res_id)


if __name__ == "__main__":
    socketio.run(
        app,
        host=os.getenv("HOST", "127.0.0.1"),
        port=int(os.getenv("PORT", "8000")),
        debug=os.getenv("FLASK_DEBUG") == "1",
        allow_unsafe_werkzeug=True,
    )
