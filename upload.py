import io
import uuid
from googleapiclient.http import MediaIoBaseUpload
from verify import drive_service

FOLDER_ID = "1NR8WPfiRUDqjwDKvNFWxGPNAZ2NivOte"


from googleapiclient.http import MediaFileUpload
import uuid

def upload_image(filepath):
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

    return file["id"]