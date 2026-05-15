"""
app/services/drive_handler.py
Upload de documentos para o Google Drive vinculados a lançamentos.
"""
import os
import json
import httpx
import io
from google.oauth2 import service_account
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload

GDRIVE_FOLDER_ID  = os.getenv("GDRIVE_FOLDER_ID")
GDRIVE_CREDENTIALS = os.getenv("GDRIVE_CREDENTIALS")  # JSON como string


def get_drive_service():
    creds_dict = json.loads(GDRIVE_CREDENTIALS)
    creds = service_account.Credentials.from_service_account_info(
        creds_dict,
        scopes=["https://www.googleapis.com/auth/drive"]
    )
    return build("drive", "v3", credentials=creds)


async def baixar_midia_whatsapp(media_id: str, wapp_token: str) -> tuple:
    """Baixa mídia do WhatsApp e retorna (bytes, mime_type)."""
    graph = "https://graph.facebook.com/v23.0"
    headers = {"Authorization": f"Bearer {wapp_token}"}

    async with httpx.AsyncClient() as client:
        r = await client.get(f"{graph}/{media_id}", headers=headers)
        r.raise_for_status()
        data = r.json()
        url = data["url"]
        mime_type = data.get("mime_type", "application/octet-stream")

        r2 = await client.get(url, headers=headers)
        r2.raise_for_status()
        return r2.content, mime_type


def upload_para_drive(conteudo: bytes, nome_arquivo: str, mime_type: str, subfolder_name: str = None) -> str:
    """Faz upload de arquivo para o Google Drive. Retorna a URL do arquivo."""
    service = get_drive_service()

    folder_id = GDRIVE_FOLDER_ID
    if subfolder_name:
        folder_id = _get_or_create_subfolder(service, subfolder_name, GDRIVE_FOLDER_ID)

    file_metadata = {"name": nome_arquivo, "parents": [folder_id]}
    media = MediaIoBaseUpload(io.BytesIO(conteudo), mimetype=mime_type, resumable=False)
    arquivo = service.files().create(
        body=file_metadata,
        media_body=media,
        fields="id, webViewLink"
    ).execute()

    service.permissions().create(
        fileId=arquivo["id"],
        body={"type": "anyone", "role": "reader"}
    ).execute()

    return arquivo.get("webViewLink", "")


def _get_or_create_subfolder(service, nome: str, parent_id: str) -> str:
    query = (
        f"name='{nome}' and "
        f"mimeType='application/vnd.google-apps.folder' and "
        f"'{parent_id}' in parents and trashed=false"
    )
    results = service.files().list(q=query, fields="files(id)").execute()
    files = results.get("files", [])
    if files:
        return files[0]["id"]

    metadata = {
        "name": nome,
        "mimeType": "application/vnd.google-apps.folder",
        "parents": [parent_id]
    }
    folder = service.files().create(body=metadata, fields="id").execute()
    return folder["id"]


def extensao_por_mime(mime_type: str) -> str:
    mimes = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "application/pdf": ".pdf",
        "image/heic": ".heic",
    }
    return mimes.get(mime_type, ".bin")
