"""
Input checks for server.py.
Every validator returns (data, None) when the input is fine, or (None, error_response).
"""
import math
import re

from flask import jsonify, request

EMAIL_REGEX = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")
ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
ADDRESS_TYPES = {"Home", "Work", "Other"}   # change if the frontend uses other names
MAX_NAME_LENGTH = 100


def _fail(message, status=400):
    return None, (jsonify({"success": False, "message": message}), status)


def _json():
    data = request.get_json(silent=True)
    return data if isinstance(data, dict) else None


def _text(source, key):
    value = source.get(key)
    return "" if value is None else str(value).strip()


def _number(raw, whole=False):
    """A finite number >= 0, or None. whole=True only accepts whole numbers."""
    try:
        n = float(raw)
    except (TypeError, ValueError):
        return None
    if not math.isfinite(n) or n < 0 or (whole and not n.is_integer()):
        return None
    return int(n) if n.is_integer() else n


def _bool(raw):
    raw = str(raw).strip().lower()
    if raw in ("true", "1"):
        return True
    if raw in ("false", "0"):
        return False
    return None


def allowed_file(filename):
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _photo_error(photo):
    if photo and (photo.filename == "" or not allowed_file(photo.filename)):
        return "Only PNG, JPG, JPEG and WEBP images are allowed"
    return None


# ------------------------------------------------------------------- items

def validate_item_form():
    form = request.form
    name = _text(form, "itm_name")
    sub_id = _text(form, "sub_id")
    unit = _text(form, "unit")
    lowat_raw = _text(form, "lowat")
    available_raw = _text(form, "available")
    photo = request.files.get("photo")

    if not name:
        return _fail("Item name is required")
    if not _text(form, "itm_qty"):
        return _fail("Item quantity is required")
    if not _text(form, "price"):
        return _fail("Price is required")
    if not sub_id:
        return _fail("Category is required")
    if not unit:
        return _fail("Unit is required")
    if not available_raw:
        return _fail("Availability is required")

    price = _number(form.get("price"), whole=True)
    if price is None:
        return _fail("Invalid price")
    qty = _number(form.get("itm_qty"))
    if qty is None:
        return _fail("Invalid quantity")
    if qty <= 0:
        return _fail("Quantity must be greater than 0")
    lowat = _number(lowat_raw) if lowat_raw else None
    if lowat_raw and lowat is None:
        return _fail("Invalid low stock value")
    available = _bool(available_raw)
    if available is None:
        return _fail("Invalid availability")
    if _photo_error(photo):
        return _fail(_photo_error(photo))

    return {
        "itm_name": name,
        "itm_qty": qty,
        "price": price,
        "sub_id": sub_id,
        "desc": _text(form, "desc"),
        "unit": unit,
        "lowat": lowat,
        "available": available,
        "photo": photo,
    }, None


def validate_update_item():
    form = request.form
    photo = request.files.get("photo")
    required = ("item_id", "name", "price", "unit", "subId", "stock", "available")
    for field in required:
        if not _text(form, field):
            return _fail(f"{field} is required")

    price = _number(form.get("price"), whole=True)
    if price is None:
        return _fail("Invalid price")
    stock = _number(form.get("stock"))
    if stock is None:
        return _fail("Invalid stock quantity")
    lowat_raw = _text(form, "lowAt")
    lowat = _number(lowat_raw) if lowat_raw else None
    if lowat_raw and lowat is None:
        return _fail("Invalid low stock value")
    available = _bool(form.get("available"))
    if available is None:
        return _fail("available must be true or false")
    if _photo_error(photo):
        return _fail(_photo_error(photo))

    return {
        "item_id": _text(form, "item_id"),
        "name": _text(form, "name"),
        "price": price,
        "unit": _text(form, "unit"),
        "lowAt": lowat,
        "desc": _text(form, "desc"),
        "subId": _text(form, "subId"),
        "stock": stock,
        "available": available,
        "photo": photo,
    }, None


# -------------------------------------------------------------- restaurant

def validate_restaurant_form():
    form = request.form
    fields = {key: _text(form, key) for key in ("name", "type", "address", "phone", "lat", "lng")}
    photo = request.files.get("photo")

    if not fields["name"]:
        return _fail("Restaurant name is required")
    if not fields["type"]:
        return _fail("Restaurant type is required")
    if not fields["address"]:
        return _fail("Address is required")
    if not fields["phone"]:
        return _fail("Phone number is required")
    if not fields["lat"] or not fields["lng"]:
        return _fail("Latitude and Longitude are required")
    try:
        lat, lng = round(float(fields["lat"]), 4), round(float(fields["lng"]), 4)
    except ValueError:
        return _fail("Latitude and Longitude must be numbers")
    if not -90 <= lat <= 90:
        return _fail("Invalid latitude")
    if not -180 <= lng <= 180:
        return _fail("Invalid longitude")
    if not fields["phone"].isdigit() or len(fields["phone"]) != 10:
        return _fail("Invalid phone number")
    if _photo_error(photo):
        return _fail(_photo_error(photo))

    return {**fields, "lat": lat, "lng": lng, "photo": photo}, None


# -------------------------------------------------------------------- cart

def validate_add_to_cart():
    data = _json()
    if not data:
        return _fail("Invalid JSON payload")
    for field in ("resid", "item_id", "qty", "ress_name"):
        if field not in data:
            return _fail(f"{field} is required")

    try:
        qty = int(data["qty"])
    except (TypeError, ValueError):
        qty = 0
    if qty <= 0:
        return _fail("Quantity must be greater than 0")

    res_name = _text(data, "ress_name")
    if not res_name:
        return _fail("Restaurant name cannot be empty")

    replace = data.get("replace", False)
    if not isinstance(replace, bool):
        return _fail("Replace value must be a Boolean")

    return {
        "resid": str(data["resid"]),
        "item_id": str(data["item_id"]),
        "qty": qty,
        "ress_name": res_name,
        "replace": replace,
    }, None


# -------------------------------------------------------------- categories

def validate_subcategory():
    data = _json()
    if not data:
        return _fail("Invalid JSON payload")
    if "category_id" not in data:
        return _fail("category_id is required")
    try:
        category_id = int(data["category_id"])
    except (TypeError, ValueError):
        return _fail("Invalid category_id")
    name = _text(data, "name")
    if not name:
        return _fail("Subcategory name cannot be empty")
    if len(name) > MAX_NAME_LENGTH:
        return _fail("Subcategory name is too long")
    return {"category_id": category_id, "name": name}, None


def validate_category():
    data = _json()
    if not data:
        return _fail("Invalid JSON payload")
    cat_name = _text(data, "cat_name")
    if not cat_name:
        return _fail("Category name is required")
    if len(cat_name) > MAX_NAME_LENGTH:
        return _fail("Category name is too long")

    subcats = data.get("subcats")
    if not isinstance(subcats, list):
        return _fail("subcats must be a list")
    cleaned, seen = [], set()
    for i, subcat in enumerate(subcats):
        if not isinstance(subcat, str):
            return _fail(f"Subcategory at index {i} must be a string")
        subcat = subcat.strip()
        if not subcat:
            continue
        if len(subcat) > MAX_NAME_LENGTH:
            return _fail(f"Subcategory '{subcat}' is too long")
        if subcat.lower() not in seen:
            seen.add(subcat.lower())
            cleaned.append(subcat)
    if not cleaned:
        return _fail("At least one valid subcategory is required")
    return {"cat_name": cat_name, "subcats": cleaned}, None


# ----------------------------------------------------------------- address

def validate_address():
    data = _json()
    if not data:
        return _fail("Invalid JSON payload")
    address = _text(data, "address")
    if not address:
        return _fail("Address is required")
    address_type = _text(data, "address_type")
    if not address_type:
        return _fail("Address type is required")
    if address_type not in ADDRESS_TYPES:
        return _fail("Invalid address type")

    coords = data.get("cordinates")
    if not isinstance(coords, dict):
        return _fail("Coordinates are required")
    if coords.get("latt") is None or coords.get("long") is None:
        return _fail("Latitude and longitude are required")
    try:
        lat, lng = float(coords["latt"]), float(coords["long"])
    except (TypeError, ValueError):
        return _fail("Coordinates must be valid numbers")
    if not -90 <= lat <= 90:
        return _fail("Invalid latitude")
    if not -180 <= lng <= 180:
        return _fail("Invalid longitude")
    return {"address": address, "address_type": address_type,
            "cordinates": {"latt": lat, "long": lng}}, None


# -------------------------------------------------------------------- auth

def validate_credentials():
    data = _json()
    if not data:
        return _fail("Request body is required")
    email = _text(data, "email").lower()
    password = data.get("password")
    if not email:
        return _fail("Email is required")
    if not EMAIL_REGEX.match(email):
        return _fail("Invalid email format")
    if not password or not isinstance(password, str):
        return _fail("Password is required")
    return {"email": email, "password": password}, None


def validate_signup():
    data = _json()
    if not data:
        return _fail("Request body is required")
    email = _text(data, "email").lower()
    username = _text(data, "username")
    password = data.get("password")
    role = _text(data, "role").lower()

    if not email:
        return _fail("Email is required")
    if not EMAIL_REGEX.match(email):
        return _fail("Invalid email")
    if not username:
        return _fail("Username is required")
    if len(username) < 3:
        return _fail("Username is too short")
    if not password or not isinstance(password, str):
        return _fail("Password is required")
    if len(password) < 8:
        return _fail("Password must be at least 8 characters")
    if role not in ("user", "seller"):
        return _fail("Invalid role")
    return {"email": email, "username": username, "password": password, "role": role}, None
