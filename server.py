from database import fetch_profiles,edit_seller_order_items, list_offers, save_offer, delete_offer, get_payout_summary, get_store_settings, update_store_settings, validate_coupon,get_preview_items, serialize_address,update_address, save_category, get_seller_analytics, get_resturantItem_price, add_subcategory, add_resturant_items, check_existing_owner, set_verified, fetch_address, add_resturants, list_resturant_items, list_resturants, add_customer_items, update_profiles, update_resturant_item, remove_itemss, store_orders, get_orders, store_seller_orders, get_seller_ordes, check_existing_user, create_new_user, update_order_status_seller, update_order_status_user, resturant_stats, return_res_analytics, check_existing_owner, save_address, verify_order, get_restaurant_delivery, is_restaurant_online, set_restaurant_online
from flask import Flask, request, render_template, redirect, url_for, jsonify, g, send_from_directory
from flask_socketio import SocketIO, emit, join_room
from redis_db import add_cart, get_cart, update_cart_qty, acquire_lock, release_lock, get_cart_restaurant
from flask_cors import CORS
from flask_mail import Mail
from dotenv import load_dotenv
from itsdangerous import URLSafeTimedSerializer
from verify import upload_image
from bson import ObjectId
from functools import wraps
import jwt
from datetime import datetime, timedelta
import requests
import os
import re
from foodfacts_data import get_product_details
load_dotenv(override=True)
mail_sever_name = os.getenv("Mail_server")
mail_port = int(os.getenv("Mail_port"))
mail_use_tls = os.getenv("Mail_use_tls", "False").lower() == "true"
mail_use_ssl = os.getenv("Mail_use_ssl", "True").lower() == "true"
mail_username = os.getenv("Mail")
mail_password = os.getenv("Mail_password")
secret_key = os.getenv("Mail_secret_key")
brevo_api = os.getenv("brevo_api_email")
app = Flask(__name__)
CORS(app)
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address


def rate_limit_key():
    if hasattr(g, "user_id"):
        return f"user:{g.user_id}"
    if hasattr(g, "res_id"):
        return f"res:{g.res_id}"
    return get_remote_address()


redis_user = os.getenv("Redis_USERNAME", "")
redis_pass = os.getenv("Redis_PASSWORD", "")
redis_host = os.getenv("Redis_uri")
redis_port = os.getenv("Redis_port")

if redis_user or redis_pass:
    storage_uri = f"redis://{redis_user}:{redis_pass}@{redis_host}:{redis_port}"
else:
    storage_uri = f"redis://{redis_host}:{redis_port}"
# limiter = Limiter(app=app, key_func=rate_limit_key, storage_uri=storage_uri, default_limits=["200 per minute"])
app.config["MAIL_SERVER"] = mail_sever_name
app.config["MAIL_PORT"] = mail_port
app.config["MAIL_USE_TLS"] = mail_use_tls
app.config["MAIL_USE_SSL"] = mail_use_ssl
app.config["MAIL_USERNAME"] = mail_username
app.config["MAIL_PASSWORD"] = mail_password
app.config["SECRET_KEY"] = secret_key

print("SERVER:", mail_sever_name, flush=True)
print("PORT:", mail_port, flush=True)
print("TLS:", mail_use_tls, flush=True)
print("SSL:", mail_use_ssl, flush=True)
print("USER:", mail_username, flush=True)
print("PASS EXISTS:", bool(mail_password), flush=True)

brevo_api = os.getenv("brevo_api_email")
socketio = SocketIO(app, cors_allowed_origins="*")

serializer = URLSafeTimedSerializer(app.config["SECRET_KEY"])

STORE_OFFLINE_MSG = "This store is currently offline. You can't add items right now."


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = (
            request.cookies.get("user_token") or
            request.cookies.get("seller_token")
        )
        if not token:
            print(request.endpoint)
            if (request.endpoint == "home"):
                return redirect(url_for("login", role="user"))
            elif (request.endpoint == "sellerTemplate"):
                return redirect(url_for("login", role="seller"))
            else:
                return jsonify({"success": False, "message": "Token is missing or unauthorized access"}), 401

        try:
            payload = jwt.decode(
                token,
                app.config["SECRET_KEY"],
                algorithms=["HS256"]
            )
            print(payload)
            g.type = payload["type"]
            if (g.type == "user"):
                g.user_id = payload["user_id"]
            elif (g.type == "seller"):
                g.res_id = payload["res_id"]
                g.username = payload["username"]

        except jwt.InvalidTokenError:
            response = jsonify({"success": False, "msg": "invalid Token"})
            response.status_code = 401
            response.delete_cookie("user_token")
            response.delete_cookie("seller_token")
            return response

        return f(*args, **kwargs)

    return wrapper


def auth_seller_res(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = (
            request.cookies.get("seller_res_token")
        )
        if not token:
            return jsonify({"success": False}), 401

        try:
            payload = jwt.decode(
                token,
                app.config["SECRET_KEY"],
                algorithms=["HS256"]
            )
            print(payload)
            g.type = payload["type"]
            g.owner_id = payload["owner_id"]
            g.username = payload["username"]

        except jwt.InvalidTokenError:
            response = jsonify({"success": False, "msg": "invalid Token"})
            response.status_code = 401
            response.delete_cookie("seller_res_token")
            return response

        return f(*args, **kwargs)

    return wrapper


def generate_verification_token(email, role):
    return serializer.dumps({
        "email": email,
        "role": role
    }, salt="email-verification")


def send_verification_email(user_email, role):
    print("in send varification")
    print("generating token")
    token = generate_verification_token(user_email, role)
    print("verify url")
    verify_url = url_for(
        "verify_email",
        token=token,
        _external=True
    )
    print("msg")

    response = requests.post(
        "https://api.brevo.com/v3/smtp/email",
        headers={
            "accept": "application/json",
            "api-key": brevo_api,
            "content-type": "application/json"
        },
        json={
            "sender": {"email": "dummy.mail.saad@gmail.com"},
            "to": [{"email": user_email}],
            "subject": "Verify Email",
            "htmlContent": f"""
            <p>Click below to verify:</p>
            <a href="{verify_url}">{verify_url}</a>
            """
        }
    )
    print(response.status_code, flush=True)
    print(response.text, flush=True)
    if (response.status_code == 201):
        print("done sending email")
        return 1
    else:
        return 0


@app.errorhandler(429)
def ratelimit_handler(e):
    return jsonify({
        "success": False,
        "message": "Too many requests, please slow down"
    }), 429


@app.route("/", methods=["GET", "POST"])
def land():
    return redirect(url_for('renderLanding'))


@app.route("/.well-known/assetlinks.json", methods=["GET"])
def serve_asset_links_file():
    static_file_dir = os.path.join(app.root_path, 'static')
    return send_from_directory(static_file_dir, 'assetlinks.json', mimetype='application/json')


@app.route("/user/<userid>", methods=["GET", "POST"])
@login_required
##@limiter.limit("10 per minute")
def home(userid):
    try:
        return render_template('home.html', page="home")
    except Exception as e:
        print(e)
        return ({"success": False})


@app.route("/logout/seller", methods=["GET"])
def logout_seller():
    response = jsonify({"success": True, "message": "Logged out successfully"})
    response.delete_cookie("seller_token")
    return response


@app.post("/add_res_items")
@login_required
#@limiter.limit("10 per minute")
def add_itemss():
    try:
        if g.type != "seller":
            return jsonify({
                "success": False,
                "message": "Unauthorized"
            }), 403
        data, error = validate_item_form()
        if error:
            return error
        if data["photo"]:
            res_id = g.res_id
            file_id = upload_image(data["photo"])
            print(file_id)
            res = add_resturant_items(
                res_id,
                data["itm_name"],
                data["itm_qty"],
                data["price"],
                data["sub_id"],
                data["desc"],
                data["unit"],
                data["lowat"],
                data["available"],
                file_id=file_id
            )
            print("res after adding item with photo:", res)
        else:
            res_id = g.res_id
            res = add_resturant_items(
                res_id,
                data["itm_name"],
                data["itm_qty"],
                data["price"],
                data["sub_id"],
                data["desc"],
                data["unit"],
                data["lowat"],
                data["available"]
            )
        return ({"success": True, "id": res["id"], "img_url": res["url"]})
    except Exception as e:
        print("add itemss")
        print(e)
        return ({"success": False})


@app.post("/add_resturant")
@auth_seller_res
#@limiter.limit("5 per minute")
def add_resturant():
    try:
        token = request.cookies.get("seller_res_token")
        if not token:
            return jsonify({"success": False, "message": "Token is required"}), 400
        payload = jwt.decode(
            token,
            app.config["SECRET_KEY"],
            algorithms=["HS256"]
        )
        print(payload)
        owner_id = payload["owner_id"]
        name = request.form.get("name")
        shop_type = request.form.get("type")
        address = request.form.get("address")
        phone = request.form.get("phone")
        lat = request.form.get("lat")
        lng = request.form.get("lng")
        # form values arrive as strings ("false" is truthy!) - parse them properly
        delivery_available = str(request.form.get("delivery_available", "")).lower() in ("true", "1")
        try:
            delivery_radius = int(request.form.get("delivery_radius") or 0)
        except ValueError:
            return jsonify({"success": False, "message": "Delivery radius must be a number"}), 400
        print(delivery_available, delivery_radius)
        photo = request.files.get("photo")
        # Required field validation
        if not owner_id:
            return jsonify({"success": False, "message": "Owner ID is required"}), 400

        if not name:
            return jsonify({"success": False, "message": "Restaurant name is required"}), 400

        if not shop_type:
            return jsonify({"success": False, "message": "Restaurant type is required"}), 400

        if not address:
            return jsonify({"success": False, "message": "Address is required"}), 400

        if not phone:
            return jsonify({"success": False, "message": "Phone number is required"}), 400

        if not lat or not lng:
            return jsonify({"success": False, "message": "Latitude and Longitude are required"}), 400

        if delivery_available and delivery_radius <= 0:
            return jsonify({"success": False, "message": "Delivery Radious must be greater than 0"}), 400
        try:
            latt = round(float(lat), 4)
            long = round(float(lng), 4)
            if not (-90 <= latt <= 90):
                return jsonify({"success": False, "message": "Invalid latitude"}), 400

            if not (-180 <= long <= 180):
                return jsonify({"success": False, "message": "Invalid longitude"}), 400
        except ValueError:
            return jsonify({"success": False, "message": "Latitude and Longitude must be numbers"}), 400

        # Phone validation
        if not phone.isdigit() or len(phone) != 10:
            return jsonify({"success": False, "message": "Invalid phone number"}), 400
        if (photo):
            if photo.filename == "":
                return jsonify({"success": False, "message": "Invalid photo"}), 400

            if not allowed_file(photo.filename):
                return jsonify({
                    "success": False,
                    "message": "Only png, jpg, jpeg and webp files are allowed"
                }), 400
            file_id = upload_image(photo)
            print(file_id)
            id = add_resturants(name, shop_type, address, phone, owner_id, long, latt, delivery_available, delivery_radius, file_id)
        else:
            id = add_resturants(name, shop_type, address, phone, owner_id, long, latt, delivery_available, delivery_radius)

        response = jsonify({"success": True, "res_id": id})
        response.delete_cookie("seller_res_token")
        res_id = id
        res_name = name
        token = jwt.encode(
            {
                "type": "seller",
                "res_id": str(res_id),
                "res_name": res_name,
                "username": g.username,
                "exp": datetime.utcnow() + timedelta(days=7)
            },
            app.config["SECRET_KEY"],
            algorithm="HS256"
        )
        response.set_cookie(
            "seller_token",
            token,
            httponly=True,
            secure=False,      # True in production with HTTPS
            samesite="Lax",
            max_age=7 * 24 * 60 * 60
        )
        return response
    except Exception as e:
        print(e)
        return jsonify({
            "success": False,
            "message": "Internal server error"
        }), 500


@app.post("/remove_items")
@login_required
#@limiter.limit("30 per minute")
def remove_item():
    try:
        res_id = g.res_id
        data = request.get_json()
        item_id = data["item_id"]
        remove_itemss(item_id, res_id)
        return ({"success": True})
    except Exception as e:
        print(e)
        return ({"success": False})

@app.post("/seller/edit_order")
@login_required
def edit_order():

    if g.type != "seller":
        return jsonify({"success": False, "message": "Unauthorized"}), 403

    data = request.get_json(silent=True) or {}
    order_id = data.get("order_id")
    items = data.get("items")

    if not order_id or not isinstance(items, dict) or not items:
        return jsonify({"success": False, "message": "order_id and items are required"}), 400

    clean = {}
    for item_id, qty in items.items():
        if isinstance(qty, bool) or not isinstance(qty, int) or qty < 0:
            return jsonify({"success": False, "message": "Quantities must be whole numbers, 0 or more"}), 400
        clean[str(item_id)] = qty

    try:
        result = edit_seller_order_items(str(order_id), g.res_id, clean)
    except Exception as e:
        print("edit_order error:", e)
        return jsonify({"success": False, "message": "Something went wrong, please try again"}), 500

    if not result["success"]:
        return jsonify({"success": False, "message": result["message"]}), result.get("status", 400)

    if result["changed"]:
        # tell the customer their order was changed (listen for this on the user pages)
        socketio.emit(
            "order_items_updated",
            {
                "order_id": str(order_id),
                "token_no": result["token_no"],
                "res_id": g.res_id,
                "items": result["items"],
                "total": result["total"]
            },
            room=result["user_id"]
        )

    return jsonify({"success": True, "items": result["items"], "total": result["total"]})
@app.post("/list_resturants")
@login_required
def list_resturantss():
    try:
        data = request.get_json()
        latt = data["latt"]
        long = data["long"]
        dist = data["dist"]
        dist = int(dist)
        res = list_resturants(long, latt, dist)
        return ({"success": True, "results": res})
    except Exception as e:
        raise Exception


@app.route("/preview_items", methods=["POST"])
def preview_items():
    data = request.json or {}
    res_ids = data.get("res_ids", [])
    if not res_ids:
        return jsonify({"success": False, "message": "res_ids required"}), 400
    items = get_preview_items(res_ids)
    return jsonify({"success": True, "items": items})


@app.post("/list_items")
@login_required
def list_item():
    data = request.get_json()
    types = g.type
    if (types == "seller"):
        res_id = g.res_id
    else:
        res_id = data["res_id"]
    res = list_resturant_items(res_id, types)
    if (types == "seller"):
        return ({"success": True, "res": res["item_name"], "categories": res["categories"], "is_online": is_restaurant_online(res_id)})
    return {
        "success": True,
        "res": res["item_name"],
        "categories": res["categories"],
        "is_online": is_restaurant_online(res_id)
    }


@app.post("/update_item_details")
@login_required
#@limiter.limit("20 per minute")
def update_items():
    try:
        res_id = g.res_id
        data, error = validate_update_item()
        if error:
            print("validation error:", error)
            return error
        if (data["photo"]):
            file_id = upload_image(data["photo"])
            print(file_id)
            res = update_resturant_item(
                data["item_id"],
                data["name"],
                data["price"],
                data["unit"],
                data["lowAt"],
                data["desc"],
                data["subId"],
                data["stock"],
                data["available"],
                res_id,
                file_id=file_id
            )
        else:
            res = update_resturant_item(
                data["item_id"],
                data["name"],
                data["price"],
                data["unit"],
                data["lowAt"],
                data["desc"],
                data["subId"],
                data["stock"],
                data["available"],
                res_id
            )
        if (res["success"]):
            return ({"success": True})
        else:
            return ({"success": False, "message": res["message"]})
    except Exception as e:
        print(e)
        return ({"success": False})


@app.post("/add_item_carts")
def carts():
    try:
        data = request.get_json()
        itm_name = data["itm_name"]
        itm_id = data["itm_id"]
        res_id = data["res_id"]
        add_customer_items(itm_name, res_id, itm_id)
        return ({"success": True})
    except Exception as e:
        print(e)
        return ({"success": False})


@app.post("/user/logout")
def logout_user():
    response = jsonify({"success": True})
    response.delete_cookie("user_token")
    return response


@app.get("/menu/<name>/<address>/<res_id>/<user_id>")
def list_items(name, address, res_id, user_id):
    try:
        return render_template("menu.html")
    except Exception as e:
        print(e)
        return ({"success": False})


@app.get("/menu/sel/<id>")
def s_me(id):
    print("running s_me")
    try:
        return render_template("menu_seller.html")
    except Exception as e:
        print(e)
        return ({"success": False})


@app.get("/cart/<userid>")
def cartss(userid):
    try:
        return render_template("cart.html", page="cart")
    except Exception as e:
        return ({"success": False})


@app.post("/get_cart_items")
@login_required
def list_cart_items():
    try:
        res = get_cart(g.user_id)
        if res and res.get("cart"):
            res_id = next(iter(res["cart"]))   # cart is single-restaurant
            res["cart"][res_id]["delivery"] = get_restaurant_delivery(res_id)
            # delivery["is_online"] is always live (never served from the 10-min cache)
        return {"success": True, "results": res}
    except Exception as e:
        print(e)
        return jsonify({"success": False, "message": "Something went wrong, please try again"}), 500


################# get item details from barcode #########################
@app.post("/get_item_details")
# @login_required
def get_item_details():
    try:
        data = request.get_json(force=True) or {}
        barcode = re.sub(r"\D", "", str(data.get("barcode") or ""))  # digits only
 
        if not barcode:
            return jsonify({"success": False, "message": "barcode is required"}), 400
 
        details = get_product_details(barcode)
        if details is None:
            return jsonify({"success": False, "message": "Item Not Found"}), 404
 
        return jsonify({"success": True, "details": details})
 
    except Exception as e:
        print("get_item_details error:", e)
        return jsonify({"success": False, "message": "Something went wrong, please try again"}), 500
 
@app.post("/update_cart")
@login_required
#@limiter.limit("120 per minute")
def updateCart():
    try:
        data = request.get_json(force=True) or {}
        item_id = data.get("item_id")
        qty = data.get("qty")

        if item_id is None or qty is None:
            return jsonify({"success": False, "message": "item_id and qty are required"}), 400

        try:
            qty = int(qty)
        except (TypeError, ValueError):
            return jsonify({"success": False, "message": "qty must be an integer"}), 400

        # Block increments while the store is offline; decrements/removals stay allowed
        if qty > 0:
            cart_res_id = get_cart_restaurant(g.user_id)
            if cart_res_id and not is_restaurant_online(cart_res_id):
                return jsonify({
                    "success": False,
                    "code": "STORE_OFFLINE",
                    "message": STORE_OFFLINE_MSG
                }), 503

        result = update_cart_qty(g.user_id, item_id, qty)

        if result["success"]:
            return jsonify({
                "success": True,
                "total": result["total"],
                "removed": result.get("removed", False)
            })
        return jsonify({"success": False, "message": result.get("message", "Unable to update item")}), 400

    except Exception as e:
        print("update_cart error:", e)
        return jsonify({"success": False, "message": "Something went wrong, please try again"}), 500


@app.post("/add_to_cart")
#@limiter.limit("30 per minute")
@login_required
def addToCart():
    try:
        data, error = validate_add_to_cart()
        if error:
            return error

        userid = g.user_id

        if not is_restaurant_online(data["resid"]):
            return jsonify({
                "success": False,
                "code": "STORE_OFFLINE",
                "message": STORE_OFFLINE_MSG
            }), 503

        # TODO: re-enable server-side price/stock lookup instead of trusting the client.
        # response = get_resturantItem_price(data["resid"], data["item_id"])
        # price, available_qty = response["price"], response["available_qty"]
        price = data["price"]
        available_qty = 10000

        replace = data.get("replace", False)

        res = add_cart(
            data["resid"],
            userid,
            data["item"],
            data["ress_name"],
            data["item_id"],
            data["qty"],
            price,
            available_qty,
            replace
        )
        print("add_cart result:", res)
        if res["success"]:
            return jsonify({"success": True, "Total": res["total"]})
        return jsonify({"success": False, "message": res.get("message", "Unable to add item to cart")}), 400

    except Exception as e:
        print("add_to_cart error:", e)
        return jsonify({"success": False, "message": "Something went wrong, please try again"}), 500


@app.get("/seller/menu/<name>/<seller_id>")
def seller_page(name, seller_id):
    try:
        return render_template("menu_seller.html")
    except Exception as e:
        print(e)
        return ({"success": False})


@app.post("/store_orders")
#@limiter.limit("5 per minute")
@login_required
def store_order():
    user_id = g.user_id
    lock_key = f"lock:checkout:{user_id}"
    token = acquire_lock(lock_key, ttl_seconds=15)

    if not token:
        return jsonify({
            "success": False,
            "message": "Your order is already being processed"
        }), 409
    try:
        user_id = g.user_id
        data = request.get_json(force=True) or {}
        pickup_time = data.get("pickup_time")
        order_type = data.get("order_type", "pickup")
        if order_type not in ("pickup", "delivery"):
            return jsonify({"success": False, "message": "Invalid order type"}), 400
        address_id = data.get("address_id")
        print(pickup_time, order_type, address_id)

        resids = store_orders(user_id, pickup_time, order_type, address_id)
        print(resids)

        # store_orders returns a dict on validation failure, 404 for an empty cart,
        # False on unexpected failure, or a list of restaurant ids on success
        if isinstance(resids, dict) and not resids.get("success", True):
            status = 503 if resids.get("code") == "STORE_OFFLINE" else 400
            return jsonify({
                "success": False,
                "code": resids.get("code"),
                "message": resids.get("message", "Unable to place order")
            }), status
        if resids == 404:
            return ({"success": False})
        if resids is False:
            return jsonify({"success": False, "message": "Unable to place order, please try again"}), 500
        for resid in resids:
            socketio.emit("new_order", {"msg": "refresh"}, room=resid)
        return ({"success": True})
    except Exception as e:
        raise Exception
    finally:
        release_lock(lock_key, token)


@app.get("/orders/<userid>")
def renderOrders(userid):
    try:
        return render_template("orders.html", page="orders")
    except Exception as e:
        raise Exception


@app.post("/get_orders/<userid>")
@login_required
def getOrders(userid):
    try:
        userid = g.user_id
        orders = get_orders(userid)
        print("oorders in server", orders)
        return ({"success": True, "orders": orders})
    except Exception as e:
        print(e)
        return ({"success": False})


@app.route("/user/fetch_profile", methods=["POST"])
@login_required
def fetch_profile():
    try:
        user_id = g.user_id
        profile = fetch_profiles(user_id)
        if profile is None:
            return jsonify({"success": False, "message": "Profile not found"}), 404
        return jsonify({"success": True, "profile": profile["profile"]})
    except Exception as e:
        print(e)
        return jsonify({"success": False, "message": "Internal server error"}), 500


@app.route("/user/update_profile", methods=["POST"])
@login_required
def update_profile():
    try:
        user_id = g.user_id
        data = request.get_json(force=True) or {}
        name = data.get("name")
        phone = data.get("phone")
        result = update_profiles(user_id, name, phone)
        if not result:
            return jsonify({"success": False, "message": "Failed to update profile"}), 500
        return jsonify({"success": True, "message": "Profile updated successfully"})
    except Exception as e:
        print(e)
        return jsonify({"success": False, "message": "Internal server error"}), 500


@app.post("/update_address")
@login_required
def update_adress():
    if g.type != "user":
        return jsonify({"success": False, "message": "Unauthorized"}), 403
    try:
        payload = request.get_json(silent=True) or {}
        print(payload)
        address_id_raw = payload.get("address_id")

        if not address_id_raw:
            return jsonify({"success": False, "message": "address_id is required"}), 400

        try:
            address_id = ObjectId(address_id_raw)
            print(address_id)
        except (TypeError):
            return jsonify({"success": False, "message": "Invalid address_id"}), 400

        result = update_address(
            address_id,
            g.user_id,
            payload["address"],
            payload["address_type"],
            payload.get("phone")
        )

        if result["success"]:
            return jsonify({"success": True, "address": serialize_address(result["address"])})
        else:
            return jsonify({"success": False, "message": result.get("message", "Could not update address")}), 404

    except Exception as e:
        print(e)
        return jsonify({"success": False, "message": "Internal server error", "error": str(e)}), 500


@app.route("/seller/orders", methods=["POST", "GET"])
@login_required
def getsellerOrders():
    try:
        data = request.get_json()
        if g.type != "seller":
            return jsonify({
                "success": False,
                "message": "Unauthorized"
            }), 403
        res_id = g.res_id
        print(res_id)
        orders = get_seller_ordes(res_id)
        print("orders in server", orders)
        return ({"success": True, "orders": orders})
    except Exception as e:
        print(e)
        return ({"success": False})


@app.get("/seller/orders/<res_name>/<res_id>")
def renderSellerOrders(res_name, res_id):
    try:
        return render_template("seller_orders.html", page="orders")
    except Exception as e:
        print(e)
        return ({"success": False})


@socketio.on('join_seller_room')
@login_required
def handle_join(data):
    try:
        seller_id = g.res_id
        join_room(seller_id)
    except Exception as e:
        print(e)
        return ({"success": False})


def notify_new_order(seller_id, order):
    try:
        socketio.emit('new_order', order, room=seller_id)
    except Exception as e:
        print(e)
        return ({"success": False})


@socketio.on('join_user_room')
@login_required
def handle_user_join(data):
    try:
        user_id = g.user_id
        join_room(user_id)
        print(f"User joined: {user_id}")
    except Exception as e:
        print(e)
        return ({"success": False})


################# store online / offline #########################
@app.post("/seller/set_online")
@login_required
def set_online():
    if g.type != "seller":
        return jsonify({"success": False, "message": "Unauthorized"}), 403

    data = request.get_json(silent=True) or {}
    online = data.get("is_online")
    if not isinstance(online, bool):
        return jsonify({"success": False, "message": "is_online must be a boolean"}), 400

    if not set_restaurant_online(g.res_id, online):
        return jsonify({"success": False, "message": "Restaurant not found"}), 404

    # push to every user currently viewing this store / holding it in their cart
    socketio.emit(
        "store_status",
        {"res_id": g.res_id, "is_online": online},
        room=f"store:{g.res_id}"
    )
    return jsonify({"success": True, "is_online": online})


@app.get("/store_status/<res_id>")
@login_required
def store_status(res_id):
    return jsonify({"success": True, "is_online": is_restaurant_online(res_id)})


@socketio.on("watch_store")
@login_required
def handle_watch_store(data):
    try:
        res_id = str((data or {}).get("res_id", "")).strip()
        if res_id:
            join_room(f"store:{res_id}")
    except Exception as e:
        print(e)


@socketio.on("order_completed")
@login_required
def handle_order_completed(data):
    try:
        print("Order completed:", data)

        token_no = data.get("token_no")
        order_id = data.get("order_id")
        res_id = g.res_id
        user_id = verify_order(res_id, order_id)
        if (user_id == None):
            return {"success": False, "message": "Unauthorized order"}
        status = data.get("status")

        # send update to USER
        socketio.emit(
            "order_status_updated",
            {
                "order_id": order_id,
                "token_no": token_no,
                "res_id": res_id,
                "status": status
            },
            room=user_id
        )
        return ({"success": True})
    except Exception as e:
        print(e)
        return ({"success": False, "message": str(e)})


EMAIL_REGEX = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")


@app.post("/validate_user")
#@limiter.limit("10 per minute")
def validate():
    try:
        data = request.get_json()
        if not data:
            return jsonify({
                "success": False,
                "message": "Request body is required"
            }), 400

        credentials, error = validate_credentials(request.get_json())

        if error:
            return error

        res = check_existing_user(
            credentials["email"],
            credentials["password"]
        )
        print("res", res)
        if (res["success"] == False):
            return jsonify({
                "success": False,
                "message": "Invalid email or password"
            }), 401
        elif (res["success"] == True):
            if (res["is_verified"]):
                userid = str(res["userid"])
                username = res["username"]
                print(userid)
                token = jwt.encode(
                    {
                        "type": "user",
                        "user_id": str(userid),
                        "username": username,
                        "exp": datetime.utcnow() + timedelta(days=7)
                    },
                    app.config["SECRET_KEY"],
                    algorithm="HS256"
                )
                response = jsonify({"success": True, "user_id": userid, "username": username})
                response.delete_cookie("seller_token")
                response.set_cookie(
                    "user_token",
                    token,
                    httponly=True,
                    secure=False,      # True in production with HTTPS
                    samesite="Lax",
                    max_age=7 * 24 * 60 * 60
                )
                return response
            else:
                res_email = send_verification_email(data["email"], "user")
                if (res_email == 1):
                    return jsonify({
                        "success": False,
                        "message": "Email not verified"
                    }), 403

                return jsonify({
                    "success": False,
                    "message": "Failed to send verification email"
                }), 500
        else:
            return ({"success": False, "message": "Not_found"})
    except Exception as e:
        print(e)
        return ({"success": False})


@app.post("/validate_owner")
#@limiter.limit("10 per minute")
def validate_owner():
    try:
        data = request.get_json()
        if not data:
            return ({"success": False})
        credentials, error = validate_credentials(data)

        if error:
            return error

        email = credentials["email"]
        password = credentials["password"]
        res = check_existing_owner(email, password)
        print("res", res)
        if (res["success"] == False):
            return ({"success": False})
        elif (res["success"] == True):
            if (res["is_verified"]):
                if (res["is_setup"] == False):
                    token = jwt.encode(
                        {
                            "type": "seller",
                            "username": res["username"],
                            "owner_id": str(res["id"]),
                            "exp": datetime.utcnow() + timedelta(hours=1)
                        },
                        app.config["SECRET_KEY"],
                        algorithm="HS256"
                    )
                    response = jsonify({"success": True, "user_id": res["id"], "is_setup": False})
                    response.set_cookie(
                        "seller_res_token",
                        token,
                        httponly=True,
                        secure=False,      # True in production with HTTPS
                        samesite="Lax",
                        max_age=7 * 24 * 60 * 60
                    )
                    return response
                res_id = str(res["res_id"])
                res_name = res["resturant_name"]
                is_setup = res["is_setup"]
                username = res["username"]
                token = jwt.encode(
                    {
                        "type": "seller",
                        "res_id": str(res_id),
                        "res_name": res_name,
                        "username": username,
                        "exp": datetime.utcnow() + timedelta(days=7)
                    },
                    app.config["SECRET_KEY"],
                    algorithm="HS256"
                )
                response = jsonify({"success": True, "res_id": res_id, "res_name": res_name, "is_setup": is_setup})
                response.delete_cookie("user_token")
                response.set_cookie(
                    "seller_token",
                    token,
                    httponly=True,
                    secure=False,      # True in production with HTTPS
                    samesite="Lax",
                    max_age=7 * 24 * 60 * 60
                )
                return response
            else:
                res_email = send_verification_email(data["email"], "owner")
                if (res_email == 1):
                    return ({"success": False, "msg": "not_verified"})
                else:
                    return ({"success": False, "msg": "Internal Server occured Please Try again"})
        else:
            return ({"success": False, "msg": "Not_found"})
    except Exception as e:
        print("in exception validate owner")
        print(e)
        return {"success": False}


@app.post("/signup_user")
#@limiter.limit("5 per minute")
def signup_user():
    try:
        data = request.get_json()

        if not data:
            return jsonify({
                "success": False,
                "message": "Request body is required"
            }), 400

        signup_data, error = validate_signup(data)

        if error:
            return error
        res = create_new_user(
            signup_data["email"],
            signup_data["username"],
            signup_data["password"],
            signup_data["role"]
        )

        email = signup_data["email"]
        role = signup_data["role"]
        print(res)
        if (res["success"]):
            res_email = send_verification_email(email, role)
            if (res_email == 1):
                if (role == "seller"):
                    token = jwt.encode(
                        {
                            "type": "seller",
                            "owner_id": str(res["id"]),
                            "username": signup_data["username"],
                            "exp": datetime.utcnow() + timedelta(hours=1)
                        },
                        app.config["SECRET_KEY"],
                        algorithm="HS256"
                    )
                    response = jsonify({"success": True, "user_id": res["id"]})
                    response.set_cookie(
                        "seller_res_token",
                        token,
                        httponly=True,
                        secure=False,      # True in production with HTTPS
                        samesite="Lax",
                        max_age=7 * 24 * 60 * 60
                    )
                    return response
                else:
                    return ({"success": True, "user_id": res["id"]})
            else:
                return ({"success": False, "msg": "Internal Server Occured Please Try Again"})
        else:
            return ({"success": False, "msg": "user already exists!"})
    except Exception as e:
        print("in exception signup user")
        print(e)
        return ({"success": False, "msg": "Internal Error occured Please Try Again"})


@app.route("/verify/<token>")
def verify_email(token):
    try:
        data = serializer.loads(
            token,
            salt="email-verification",
            max_age=3600
        )
        email = data["email"]
        role = data["role"]
    except Exception:
        return "Invalid or expired link."

    userid = set_verified(email, role)

    return f"""
        <h1>Email verified successfully ✅</h1>
        <p>Redirecting to login page in 3 seconds...</p>

        <script>
        const role = "{role}";

        setTimeout(() => {{
            if(role === "user")
                window.location.href = "/login/user";
            else
                window.location.href = "/login/seller";
        }}, 3000);
        </script>
        """


@app.post("/save_subcategory")
@login_required
#@limiter.limit("30 per minute")
def save_subcats():
    data, error = validate_subcategory()

    if error:
        return error
    res = add_subcategory(
        g.res_id,
        data["category_id"],
        data["name"]
    )
    if (res["success"]):
        return {"success": True, "subcategory": res["subcategory"]}
    else:
        return {"success": False}


@app.get("/seller/resturantSetup/<seller_id>")
@auth_seller_res
def renderSetup(seller_id):
    try:
        return render_template("resturant_setup.html")
    except Exception as e:
        print(e)
        return ({"success": False})


@app.route("/login/<role>")
def login(role):
    try:
        return render_template("auth.html")
    except Exception as e:
        print(e)
        return ({"success": False})


@app.route("/signup/<role>")
def signup(role):
    try:
        return render_template("signup.html")
    except Exception as e:
        print(e)
        return ({"success": False})


@app.get("/seller/<name>/<seller_id>")
@login_required
def sellerTemplate(name, seller_id):
    try:
        username = g.username
        print(username)
        return render_template("seller.html", page="dashboard", username=username)
    except Exception as e:
        print(e)
        return ({"success": False})


@app.get("/landing")
def renderLanding():
    try:
        return render_template("landing.html")
    except Exception as e:
        print(e)
        return ({"success": False})


@app.post("/update_order")
@login_required
#@limiter.limit("30 per minute")
def update_status():
    try:
        res_id = g.res_id
        data = request.get_json()
        order_id = data["order_id"]
        status = data["status"]
        userid = data["user_id"]
        reason=data["reason"]
        res = update_order_status_seller(order_id, status, userid, res_id, reason=reason)
        if (res["success"]):
            return ({"success": True})
        else:
            return ({"success": False, "message": res["message"]})
    except Exception as e:
        print(e)
        return ({"success": False})


@app.post("/update_order_user")
@login_required
#@limiter.limit("30 per minute")
def update_status_user():
    try:
        userid = g.user_id
        data = request.get_json()
        order_id = data["order_id"]
        status = data["status"]
        result = update_order_status_user(order_id, status, userid)
        if result["success"]:
            return jsonify(result)

        return jsonify(result), 403
    except Exception as e:
        print(e)
        return ({"success": False})


@app.post("/stats")
@login_required
def returnstats():
    try:
        res_id = g.res_id
        data = request.get_json()
        res = resturant_stats(res_id)
        return ({"success": True, "stats": res})
    except Exception as e:
        print(e)
        return ({"success": False})


@app.get("/seller/analytics/<res_id>")
def render_analytics_template(res_id):
    try:
        print("seller_anlytics")
        return render_template("seller.html")
    except Exception as e:
        print(e)
        return ({"success": False})

@app.get("/seller/<res_id>")
def render_analyticss_template(res_id):
    try:
        print("seller_anlytics")
        return render_template("seller.html")
    except Exception as e:
        print(e)
        return ({"success": False})
@app.post("/seller/analytics")
@login_required
def return_seller_stats():
    try:
        data = request.get_json()
        res_id = g.res_id
        stats = return_res_analytics(res_id)
        return ({"success": True, "stats": stats})
    except Exception as e:
        print(e)
        return ({"success": False})


@app.post("/seller/stats")
@login_required
def return_seller_statistics():
    try:
        res_id = g.res_id
        stats = get_seller_analytics(res_id)
        return ({"success": True, "stats": stats})
    except Exception as e:
        print(e)
        return ({"success": False})


@socketio.on("user_cancelled_order")
def handle_user_cancel(data):
    try:
        # data['res_ids'] is a LIST: ["res1", "res2"]
        res_list = data.get("res_ids", [])

        for res_id in res_list:
            emit("seller_order_cancelled", data, room=res_id)
    except Exception as e:
        print(e)
        return ({"success": False})


@app.post("/save_address")
@login_required
#@limiter.limit("10 per minute")
def save_address_type():
    try:
        data, error = validate_address()

        if error:
            return error

        result = save_address(
            data["address"],
            data["address_type"],
            g.user_id,
            data["cordinates"],
            data.get("phone")
        )
        if (result["success"]):
            return ({"success": True})
        else:
            return ({"success": False})
    except Exception as e:
        print(e)
        return jsonify({"success": False, "message": "Internal server error"}), 500


@app.post("/fetch_address")
@login_required
def fetch_addresss():
    try:
        data = request.get_json()
        uid = g.user_id
        address = fetch_address(uid)
        if (address["success"]):
            if (address["status"] == 200):
                return ({"success": True, "address": address["address"]}), 200
            return ({"success": False, "msg": "No Address Found", "status": 404})
        else:
            return ({"success": False, "status": 500})
    except AttributeError:
        response = jsonify({"success": False, "msg": "Login Please"})
        response.delete_cookie("seller_token")
        return response
    except:
        return ({"success": False})


@app.post("/save_categories")
@login_required
#@limiter.limit("20 per minute")
def sve_cate():
    data, error = validate_category()

    if error:
        return error

    res = save_category(
        g.res_id,
        data["cat_name"],
        data["subcats"]
    )
    if (res["success"]):
        print(res)
        return ({"success": True, "category": res["category_data"]})
    else:
        print(res)
        return ({"success": False, "error": res["error"]})


############################# VALIDATION FNS ######################

ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}


def allowed_file(filename):
    return "." in filename and \
        filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def validate_item_form():
    itm_name = request.form.get("itm_name", "").strip()
    itm_qty = request.form.get("itm_qty", "").strip()
    price = request.form.get("price")
    sub_id = request.form.get("sub_id", "").strip()
    desc = request.form.get("desc", "").strip()
    unit = request.form.get("unit", "").strip()
    lowat = request.form.get("lowat", "").strip()
    available = request.form.get("available", "").strip()
    photo = request.files.get("photo")

    # Required fields
    if not itm_name:
        return None, (jsonify({"success": False, "message": "Item name is required"}), 400)

    if not itm_qty:
        return None, (jsonify({"success": False, "message": "Item quantity is required"}), 400)

    if not price:
        return None, (jsonify({"success": False, "message": "Price is required"}), 400)

    if not sub_id:
        return None, (jsonify({"success": False, "message": "Category is required"}), 400)

    if not unit:
        return None, (jsonify({"success": False, "message": "Unit is required"}), 400)

    if available == "":
        return None, (jsonify({"success": False, "message": "Availability is required"}), 400)

    # Price
    try:
        price = int(price)
        if price < 0:
            return None, (jsonify({"success": False, "message": "Price must be positive"}), 400)
    except ValueError:
        return None, (jsonify({"success": False, "message": "Invalid price"}), 400)

    # Quantity
    try:
        itm_qty = float(itm_qty)
        if itm_qty <= 0:
            return None, (jsonify({"success": False, "message": "Quantity must be greater than 0"}), 400)
    except ValueError:
        return None, (jsonify({"success": False, "message": "Invalid quantity"}), 400)

    # Low stock alert (optional)
    if lowat:
        try:
            lowat = float(lowat)
            if lowat < 0:
                return None, (jsonify({"success": False, "message": "Invalid low stock value"}), 400)
        except ValueError:
            return None, (jsonify({"success": False, "message": "Invalid low stock value"}), 400)
    else:
        lowat = None

    # Available
    if available.lower() not in ("true", "false", "0", "1"):
        return None, (jsonify({"success": False, "message": "Invalid availability"}), 400)

    available = available.lower() in ("true", "1")

    # Image
    if photo:
        if photo.filename == "":
            return None, (jsonify({"success": False, "message": "Invalid image"}), 400)

        if not allowed_file(photo.filename):
            return None, (
                jsonify({
                    "success": False,
                    "message": "Only PNG, JPG, JPEG and WEBP images are allowed"
                }),
                400
            )

    return {
        "itm_name": itm_name,
        "itm_qty": itm_qty,
        "price": price,
        "sub_id": sub_id,
        "desc": desc,
        "unit": unit,
        "lowat": lowat,
        "available": available,
        "photo": photo
    }, None


def validate_update_item():
    item_id = request.form.get("item_id", "").strip()
    name = request.form.get("name", "").strip()
    price_raw = request.form.get("price", "").strip()
    unit = request.form.get("unit", "").strip()
    low_at_raw = request.form.get("lowAt", "").strip()
    desc = request.form.get("desc", "").strip()
    sub_id = request.form.get("subId", "").strip()
    stock_raw = request.form.get("stock", "").strip()
    available_raw = request.form.get("available", "").strip()
    photo = request.files.get("photo")

    # Required fields
    required = {
        "item_id": item_id,
        "name": name,
        "price": price_raw,
        "unit": unit,
        "lowAt": low_at_raw,
        "desc": desc,
        "subId": sub_id,
        "stock": stock_raw,
        "available": available_raw
    }

    for field, value in required.items():
        if not value:
            return None, (jsonify({
                "success": False,
                "message": f"{field} is required"
            }), 400)

    # Name
    if not name:
        return None, (jsonify({
            "success": False,
            "message": "Item name cannot be empty"
        }), 400)

    # Price
    try:
        price = int(price_raw)
        if price < 0:
            raise ValueError
    except (ValueError, TypeError):
        return None, (jsonify({
            "success": False,
            "message": "Invalid price"
        }), 400)

    # Stock
    try:
        stock = float(stock_raw)
        if stock < 0:
            raise ValueError
    except (ValueError, TypeError):
        return None, (jsonify({
            "success": False,
            "message": "Invalid stock quantity"
        }), 400)

    # Low stock alert
    try:
        low_at = float(low_at_raw)
        if low_at < 0:
            raise ValueError
    except (ValueError, TypeError):
        return None, (jsonify({
            "success": False,
            "message": "Invalid low stock value"
        }), 400)

    # Available
    if available_raw.lower() not in ("true", "false"):
        return None, (jsonify({
            "success": False,
            "message": "available must be true or false"
        }), 400)

    available = available_raw.lower() == "true"

    validated = {
        "item_id": item_id,
        "name": name,
        "price": price,
        "unit": unit,
        "lowAt": low_at,
        "desc": desc,
        "subId": sub_id,
        "stock": stock,
        "available": available,
        "photo": photo
    }

    return validated, None


def validate_add_to_cart():
    data = request.get_json(silent=True)
    print(data)
    print("validate_add to cart", data)
    if not data:
        return None, (jsonify({
            "success": False,
            "message": "Invalid JSON payload"
        }), 400)

    required = [
        "resid",
        "item",
        "qty",
        "item_id",
        "ress_name",
        "price"
    ]

    for field in required:
        if field not in data:
            return None, (jsonify({
                "success": False,
                "message": f"{field} is required"
            }), 400)

    # Item name
    item = str(data["item"]).strip()
    if not item:
        return None, (jsonify({
            "success": False,
            "message": "Item name cannot be empty"
        }), 400)

    replace = data["replace"]
    if (type(replace) != bool):
        return None, (jsonify({
            "success": False,
            "message": "Replace value must be a Boolean"
        }), 400)
    # Restaurant name
    res_name = str(data["ress_name"]).strip()
    if not res_name:
        return None, (jsonify({
            "success": False,
            "message": "Restaurant name cannot be empty"
        }), 400)

    # Quantity
    try:
        qty = int(data["qty"])
        if qty <= 0:
            raise ValueError
    except (ValueError, TypeError):
        return None, (jsonify({
            "success": False,
            "message": "Quantity must be greater than 0"
        }), 400)

    # Price
    try:
        price = float(data["price"])
        if price < 0:
            raise ValueError
    except (ValueError, TypeError):
        return None, (jsonify({
            "success": False,
            "message": "Invalid price"
        }), 400)

    # IDs
    try:
        resid = (data["resid"])
        item_id = (data["item_id"])
    except Exception as e:
        print(e)
        return None, (jsonify({
            "success": False,
            "message": "Invalid restaurant or item id"
        }), 400)

    return {
        "resid": resid,
        "item": item,
        "qty": qty,
        "item_id": item_id,
        "ress_name": res_name,
        "price": price,
        "replace": replace
    }, None


def validate_update_cart():
    data = request.get_json(silent=True)
    print("valid update cart", data)
    if not data:
        return None, (jsonify({
            "success": False,
            "message": "Invalid JSON"
        }), 400)

    if "item_id" not in data:
        return None, (jsonify({
            "success": False,
            "message": "item_id is required"
        }), 400)

    if "qty" not in data:
        return None, (jsonify({
            "success": False,
            "message": "qty is required"
        }), 400)

    try:
        item_id = (data["item_id"])
        qty = int(data["qty"])
    except (TypeError, ValueError):
        return None, (jsonify({
            "success": False,
            "message": "Invalid item_id or qty"
        }), 400)

    return {
        "item_id": item_id,
        "qty": qty
    }, None


def validate_subcategory():
    data = request.get_json(silent=True)

    if not data:
        return None, (
            jsonify({
                "success": False,
                "message": "Invalid JSON payload"
            }),
            400
        )

    if "category_id" not in data:
        return None, (
            jsonify({
                "success": False,
                "message": "category_id is required"
            }),
            400
        )

    if "name" not in data:
        return None, (
            jsonify({
                "success": False,
                "message": "Subcategory name is required"
            }),
            400
        )

    try:
        category_id = int(data["category_id"])
    except (ValueError, TypeError):
        return None, (
            jsonify({
                "success": False,
                "message": "Invalid category_id"
            }),
            400
        )

    name = str(data["name"]).strip()

    if not name:
        return None, (
            jsonify({
                "success": False,
                "message": "Subcategory name cannot be empty"
            }),
            400
        )

    if len(name) > 100:
        return None, (
            jsonify({
                "success": False,
                "message": "Subcategory name is too long"
            }),
            400
        )

    return {
        "category_id": category_id,
        "name": name
    }, None


def validate_category():
    data = request.get_json(silent=True)

    if not data:
        return None, (
            jsonify({
                "success": False,
                "message": "Invalid JSON payload"
            }),
            400
        )

    cat_name = str(data.get("cat_name", "")).strip()

    if not cat_name:
        return None, (
            jsonify({
                "success": False,
                "message": "Category name is required"
            }),
            400
        )

    if len(cat_name) > 100:
        return None, (
            jsonify({
                "success": False,
                "message": "Category name is too long"
            }),
            400
        )

    subcats = data.get("subcats")

    if subcats is None:
        return None, (
            jsonify({
                "success": False,
                "message": "subcats is required"
            }),
            400
        )

    if not isinstance(subcats, list):
        return None, (
            jsonify({
                "success": False,
                "message": "subcats must be a list"
            }),
            400
        )

    cleaned_subcats = []
    seen = set()

    for i, subcat in enumerate(subcats):
        if not isinstance(subcat, str):
            return None, (
                jsonify({
                    "success": False,
                    "message": f"Subcategory at index {i} must be a string"
                }),
                400
            )

        subcat = subcat.strip()

        if not subcat:
            continue

        if len(subcat) > 100:
            return None, (
                jsonify({
                    "success": False,
                    "message": f"Subcategory '{subcat}' is too long"
                }),
                400
            )

        key = subcat.lower()

        if key not in seen:
            seen.add(key)
            cleaned_subcats.append(subcat)

    if not cleaned_subcats:
        return None, (
            jsonify({
                "success": False,
                "message": "At least one valid subcategory is required"
            }),
            400
        )

    return {
        "cat_name": cat_name,
        "subcats": cleaned_subcats
    }, None


def validate_address():
    data = request.get_json(silent=True)

    if not data:
        return None, (
            jsonify({
                "success": False,
                "message": "Invalid JSON payload"
            }),
            400
        )

    address = str(data.get("address", "")).strip()

    if not address:
        return None, (
            jsonify({
                "success": False,
                "message": "Address is required"
            }),
            400
        )

    address_type = str(data.get("address_type", "")).strip()

    if not address_type:
        return None, (
            jsonify({
                "success": False,
                "message": "Address type is required"
            }),
            400
        )

    allowed_types = {"Home", "Work", "Other"}

    if address_type not in allowed_types:
        return None, (
            jsonify({
                "success": False,
                "message": "Invalid address type"
            }),
            400
        )

    # the cart page sends "coordinates"; older clients send "cordinates" - accept both
    coordinates = data.get("coordinates") or data.get("cordinates")

    if not isinstance(coordinates, dict):
        return None, (
            jsonify({
                "success": False,
                "message": "Coordinates are required"
            }),
            400
        )

    latt = coordinates.get("latt")
    longitude = coordinates.get("long")

    if latt is None or longitude is None:
        return None, (
            jsonify({
                "success": False,
                "message": "Latitude and longitude are required"
            }),
            400
        )

    try:
        latt = float(latt)
        longitude = float(longitude)
    except (ValueError, TypeError):
        return None, (
            jsonify({
                "success": False,
                "message": "Coordinates must be valid numbers"
            }),
            400
        )

    if not (-90 <= latt <= 90):
        return None, (
            jsonify({
                "success": False,
                "message": "Invalid latitude"
            }),
            400
        )

    if not (-180 <= longitude <= 180):
        return None, (
            jsonify({
                "success": False,
                "message": "Invalid longitude"
            }),
            400
        )

    phone = str(data.get("phone") or "").strip() or None

    return {
        "address": address,
        "address_type": address_type,
        "cordinates": {
            "latt": latt,
            "long": longitude
        },
        "phone": phone
    }, None


def validate_credentials(data):
    if not data:
        return None, (
            jsonify({
                "success": False,
                "message": "Request body is required"
            }),
            400
        )

    email = data.get("email", "").strip().lower()
    password = data.get("password", "")

    if not email:
        return None, (
            jsonify({
                "success": False,
                "message": "Email is required"
            }),
            400
        )

    if not EMAIL_REGEX.match(email):
        return None, (
            jsonify({
                "success": False,
                "message": "Invalid email format"
            }),
            400
        )

    if not password:
        return None, (
            jsonify({
                "success": False,
                "message": "Password is required"
            }),
            400
        )

    return {
        "email": email,
        "password": password
    }, None


def validate_signup(data):
    if not data:
        return None, (
            jsonify({
                "success": False,
                "message": "Request body is required"
            }),
            400
        )

    email = data.get("email", "").strip().lower()
    username = data.get("username", "").strip()
    password = data.get("password", "")
    role = data.get("role", "").strip().lower()

    if not email:
        return None, (jsonify({"success": False, "message": "Email is required"}), 400)

    if not EMAIL_REGEX.match(email):
        return None, (jsonify({"success": False, "message": "Invalid email"}), 400)

    if not username:
        return None, (jsonify({"success": False, "message": "Username is required"}), 400)

    if len(username) < 3:
        return None, (jsonify({"success": False, "message": "Username is too short"}), 400)

    if not password:
        return None, (jsonify({"success": False, "message": "Password is required"}), 400)

    if len(password) < 8:
        return None, (jsonify({"success": False, "message": "Password must be at least 8 characters"}), 400)

    if role not in ("user", "seller"):
        return None, (jsonify({"success": False, "message": "Invalid role"}), 400)

    return {
        "email": email,
        "username": username,
        "password": password,
        "role": role
    }, None

################# seller pages: payouts / offers / settings #########################

def _seller_guard():
    """Returns an error response if the caller isn't a seller, else None."""
    if g.type != "seller":
        return jsonify({"success": False, "message": "Unauthorized"}), 403
    return None


# ---------- payouts ----------
@app.get("/seller/payouts")
@login_required
def seller_payouts_route():
    err = _seller_guard()
    if err:
        return err
    try:
        summary = get_payout_summary(g.res_id)
        return jsonify({"success": True, **summary})
    except Exception as e:
        print("payouts error:", e)
        return jsonify({"success": False, "message": "Couldn't load payouts"}), 500


# ---------- offers ----------
OFFER_CODE_RE = re.compile(r"^[A-Z0-9_-]{3,20}$")
DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def validate_offer(data):
    code = str(data.get("code", "")).strip().upper()
    if not OFFER_CODE_RE.match(code):
        return None, "Code must be 3-20 letters, numbers, - or _"

    otype = data.get("type")
    if otype not in ("percent", "flat"):
        return None, "Type must be percent or flat"

    try:
        value = float(data.get("value"))
    except (TypeError, ValueError):
        return None, "Discount value must be a number"
    if value <= 0:
        return None, "Discount value must be greater than 0"
    if otype == "percent" and value > 100:
        return None, "Percent can't exceed 100"
    value = int(value) if value == int(value) else value

    try:
        min_order = float(data.get("min_order") or 0)
    except (TypeError, ValueError):
        return None, "Min order must be a number"
    if min_order < 0:
        return None, "Min order can't be negative"
    min_order = int(min_order) if min_order == int(min_order) else min_order

    expires = data.get("expires") or None
    if expires:
        if not DATE_RE.match(str(expires)):
            return None, "Invalid expiry date"
        try:
            datetime.strptime(expires, "%Y-%m-%d")
        except ValueError:
            return None, "Invalid expiry date"

    active = data.get("active", True)
    if not isinstance(active, bool):
        return None, "active must be true or false"

    return {
        "code": code, "type": otype, "value": value,
        "min_order": min_order, "expires": expires, "active": active
    }, None


@app.get("/seller/offers")
@login_required
def seller_offers_list():
    err = _seller_guard()
    if err:
        return err
    try:
        return jsonify({"success": True, "offers": list_offers(g.res_id)})
    except Exception as e:
        print("offers list error:", e)
        return jsonify({"success": False, "message": "Couldn't load offers"}), 500


@app.post("/seller/offers/save")
@login_required
def seller_offers_save():
    err = _seller_guard()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    fields, error = validate_offer(data)
    if error:
        return jsonify({"success": False, "message": error}), 400

    result = save_offer(g.res_id, data.get("id"), fields)
    if not result["success"]:
        return jsonify({"success": False, "message": result["message"]}), result.get("status", 400)
    return jsonify({"success": True, "offer": result["offer"]})


@app.post("/seller/offers/delete")
@login_required
def seller_offers_delete():
    err = _seller_guard()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    offer_id = data.get("id")
    if not offer_id:
        return jsonify({"success": False, "message": "id is required"}), 400
    if not delete_offer(g.res_id, str(offer_id)):
        return jsonify({"success": False, "message": "Offer not found"}), 404
    return jsonify({"success": True})


# ---------- customer: check a coupon against the cart ----------
@app.post("/validate_coupon")
@login_required
def validate_coupon_route():
    if g.type != "user":
        return jsonify({"success": False, "message": "Unauthorized"}), 403
    data = request.get_json(silent=True) or {}
    res_id = str(data.get("res_id", "")).strip()
    code = str(data.get("code", "")).strip()
    if not res_id or not code:
        return jsonify({"success": False, "message": "res_id and code are required"}), 400

    # subtotal comes from the server-side cart, never from the client
    cart = get_cart(g.user_id) or {}
    restaurant = (cart.get("cart") or {}).get(res_id)
    if not restaurant:
        return jsonify({"success": False, "message": "Your cart has no items from this store"}), 400
    subtotal = sum(float(i.get("price", 0)) * int(i.get("qty", 0)) for i in restaurant["items"].values())

    result = validate_coupon(res_id, code, subtotal)
    return jsonify(result), (200 if result["success"] else 400)


# ---------- settings ----------
TIME_RE = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


def validate_settings(s):
    store_name = str(s.get("store_name", "")).strip()
    if not store_name:
        return None, "Store name is required"
    if len(store_name) > 100:
        return None, "Store name is too long"

    phone = str(s.get("phone", "")).strip()
    if phone and (not phone.isdigit() or len(phone) != 10):
        return None, "Phone must be a 10 digit number"

    address = str(s.get("address", "")).strip()
    if len(address) > 250:
        return None, "Address is too long"

    opens = str(s.get("opens", "")).strip()
    closes = str(s.get("closes", "")).strip()
    for label, t in (("Opening", opens), ("Closing", closes)):
        if t and not TIME_RE.match(t):
            return None, f"{label} time is invalid"

    def whole(name, raw, maximum):
        raw = str(raw if raw is not None else "").strip()
        if raw == "":
            return None, None
        try:
            n = int(float(raw))
        except ValueError:
            return None, f"{name} must be a number"
        if n < 0 or n > maximum:
            return None, f"{name} is out of range"
        return n, None

    prep_time, e1 = whole("Prep time", s.get("prep_time"), 600)
    if e1:
        return None, e1
    min_order, e2 = whole("Minimum order", s.get("min_order"), 100000)
    if e2:
        return None, e2

    return {
        "store_name": store_name, "phone": phone, "address": address,
        "opens": opens, "closes": closes,
        "prep_time": prep_time, "min_order": min_order
    }, None


@app.get("/seller/settings")
@login_required
def seller_settings_get():
    err = _seller_guard()
    if err:
        return err
    settings = get_store_settings(g.res_id)
    if settings is None:
        return jsonify({"success": False, "message": "Restaurant not found"}), 404
    return jsonify({"success": True, "settings": settings})


@app.post("/seller/settings")
@login_required
def seller_settings_save():
    err = _seller_guard()
    if err:
        return err
    data = request.get_json(silent=True) or {}
    clean, error = validate_settings(data.get("settings") or {})
    if error:
        return jsonify({"success": False, "message": error}), 400
    if not update_store_settings(g.res_id, clean):
        return jsonify({"success": False, "message": "Restaurant not found"}), 404
    return jsonify({"success": True})
if __name__ == "__main__":
    socketio.run(app, debug=True)