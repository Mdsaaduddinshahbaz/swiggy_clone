import os
import pickle
import uuid
import json
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from dotenv import load_dotenv
load_dotenv(override=True)
google_oauth = json.loads(
    os.getenv("google_oauth_api")
)
# SCOPES = [
#     "https://www.googleapis.com/auth/drive"
# ]

# creds = None

# if os.path.exists("token.pickle"):
#     with open("token.pickle", "rb") as token:
#         creds = pickle.load(token)

# if not creds or not creds.valid:
#     if creds and creds.expired and creds.refresh_token:
#         creds.refresh(Request())
    # else:
    #     print("OAuth file:", google_oauth)
    #     print("Token exists:", os.path.exists("token.pickle"))
    #     flow = InstalledAppFlow.from_client_config(
    #         google_oauth,
    #         SCOPES
    #     )
    #     creds = flow.run_local_server(
    #         port=0,
    #         authorization_prompt_message="",
    #         prompt="consent"
    #     )

    # with open("token.pickle", "wb") as token:
    #     pickle.dump(creds, token)

import os
import pickle
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaFileUpload

# ========= CONFIG =========
CREDENTIALS_FILE = "credentials.json"
TEST_IMAGE = "./static/logo.png"
FOLDER_ID = "1NR8WPfiRUDqjwDKvNFWxGPNAZ2NivOte"
SCOPES = ["https://www.googleapis.com/auth/drive"]
# ==========================

# creds = None

# # Load saved token if it exists
# if os.path.exists("token.pickle"):
#     with open("token.pickle", "rb") as token:
#         creds = pickle.load(token)

# # Login if needed
# if not creds or not creds.valid:
#     if creds and creds.expired and creds.refresh_token:
#         creds.refresh(Request())
#     else:
#         flow = InstalledAppFlow.from_client_config(
#             google_oauth,
#             SCOPES
#         )
#         creds = flow.run_local_server(port=0)

#     # Save token for future runs
#     with open("token.pickle", "wb") as token:
#         pickle.dump(creds, token)

# # Build Drive service
# drive_service = build(
#     "drive",
#     "v3",
#     credentials=creds
# )

creds = None
TOKEN_FILE = "/etc/secrets/token.pickle"

if os.path.exists(TOKEN_FILE):
    with open(TOKEN_FILE, "rb") as token:
        creds = pickle.load(token)

if not creds:
    raise Exception(
        "token.pickle not found. Generate it locally and upload it as a Render Secret File."
    )

if creds.expired and creds.refresh_token:
    creds.refresh(Request())

drive_service = build(
    "drive",
    "v3",
    credentials=creds
)

def upload_images(filepath):
    ext = filepath.rsplit(".", 1)[1].lower()
    filename = f"{uuid.uuid4()}.{ext}"

    metadata = {
        "name": filename,
        "parents": [FOLDER_ID]
    }

    media = MediaFileUpload(
        filepath,
        mimetype=f"image/{ext}"
    )

    file = drive_service.files().create(
        body=metadata,
        media_body=media,
        fields="id"
    ).execute()

    drive_service.permissions().create(
    fileId=file["id"],
    body={
        "type": "anyone",
        "role": "reader"
    }
    ).execute()
    file_id = file["id"]

    print("✅ Uploaded successfully!")
    print("File ID:", file_id)
    print(f"View URL: https://drive.google.com/thumbnail?id={file_id}&sz=w1000")
    return file["id"]

# upload_image("food.jpg")

import io
import pickle
from google_auth_oauthlib.flow import InstalledAppFlow
from google.auth.transport.requests import Request
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
def upload_image(photo):
    ext = photo.filename.rsplit(".", 1)[1].lower()
    filename = f"{uuid.uuid4()}.{ext}"

    metadata = {
        "name": filename,
        "parents": [FOLDER_ID]
    }

    media = MediaIoBaseUpload(
        io.BytesIO(photo.read()),
        mimetype=photo.content_type
    )

    file = drive_service.files().create(
        body=metadata,
        media_body=media,
        fields="id"
    ).execute()

    drive_service.permissions().create(
        fileId=file["id"],
        body={
            "type": "anyone",
            "role": "reader"
        }
    ).execute()

    return file["id"]