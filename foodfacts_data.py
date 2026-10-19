# import requests

# def get_product_details(barcode):
#     url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"

#     try:
#         response = requests.get(
#             url,
#             params={
#                 "fields": (
#                     "product_name,product_name_en,brands,"
#                     "image_front_url,product_quantity,"
#                     "product_quantity_unit"
#                 )
#             },
#             headers={"User-Agent": "pickit/1.0"},
#             timeout=10
#         )
#         response.raise_for_status()
#         data = response.json()

#         if data.get("status") != 1:
#             return None

#         product = data.get("product", {})
#         # print(product)
#         # return {
#         #     "brands":product.get("brands"),
#         #     "name": product.get("product_name")or product.get("product_name_en"),
#         #     "image": product.get("image_front_url"),
#         #     "quantity": product.get("product_quantity"),
#         #     "unit": product.get("product_quantity_unit")
#         # }
#         details={"product_name":(product.get("brands")+" "+(product.get("product_name")or product.get("product_name_en"))),"image_url":product.get("image_front_url"),"product_quantity":product.get("product_quantity"),"product_units":product.get("product_quantity_unit")}
#         return details

#     except requests.RequestException:
#         return None
# productss=get_product_details("8901725121181")
# # details={"product_name":(productss.get("brands")+productss.get("name")),"image_url":productss.get("image"),"product_quantity":productss.get("quantity"),"product_units":productss.get("unit")}
# print(productss)

import re
import requests
 
 
def get_product_details(barcode):
    url = f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
 
    try:
        response = requests.get(
            url,
            params={
                "fields": (
                    "product_name,product_name_en,brands,"
                    "image_front_url,product_quantity,"
                    "product_quantity_unit"
                )
            },
            headers={"User-Agent": "pickit/1.0"},
            timeout=10,
        )
        response.raise_for_status()
        data = response.json()
 
        if data.get("status") != 1:
            return None
 
        product = data.get("product", {}) or {}
 
        # brands / product_name can be missing or None -> never concatenate directly
        brand = (product.get("brands") or "").split(",")[0].strip()
        name = (product.get("product_name") or product.get("product_name_en") or "").strip()
 
        if not name and not brand:
            return None  # nothing useful -> treated as "item not found"
 
        # avoid "Amul Amul Butter" when the name already contains the brand
        if brand and brand.lower() in name.lower():
            full_name = name
        else:
            full_name = f"{brand} {name}".strip()
 
        return {
            "product_name": full_name,
            "image_url": product.get("image_front_url"),
            "product_quantity": product.get("product_quantity"),
            "product_units": product.get("product_quantity_unit"),
        }
 
    except (requests.RequestException, ValueError):
        return None