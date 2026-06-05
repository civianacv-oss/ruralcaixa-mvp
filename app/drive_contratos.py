import os, io, json
from datetime import datetime
from googleapiclient.discovery import build
from googleapiclient.http import MediaIoBaseUpload
from google.oauth2 import service_account

SCOPES = ["https://www.googleapis.com/auth/drive"]
ROOT_FOLDER_ID = "1pBNh8utdLLLqEvC1DnyZ7uuMPY4RsVT8"
IMOVEIS_ROOT_NAME = "Imoveis Rurais"


def _get_service():
    raw = os.environ.get("GOOGLE_SERVICE_ACCOUNT_JSON", "")
    if not raw:
        raise RuntimeError("GOOGLE_SERVICE_ACCOUNT_JSON nao configurado")
    info = json.loads(raw)
    creds = service_account.Credentials.from_service_account_info(info, scopes=SCOPES)
    return build("drive", "v3", credentials=creds, cache_discovery=False)


def _find_folder(service, name, parent_id):
    q = (f"name='{name}' and '{parent_id}' in parents "
         "and mimeType='application/vnd.google-apps.folder' and trashed=false")
    res = service.files().list(q=q, fields="files(id)", pageSize=1).execute()
    files = res.get("files", [])
    return files[0]["id"] if files else None


def _get_or_create_folder(service, name, parent_id):
    fid = _find_folder(service, name, parent_id)
    if fid:
        return fid
    meta = {"name": name,
            "mimeType": "application/vnd.google-apps.folder",
            "parents": [parent_id]}
    return service.files().create(body=meta, fields="id").execute()["id"]


def _imoveis_root(service):
    return _get_or_create_folder(service, IMOVEIS_ROOT_NAME, ROOT_FOLDER_ID)


def _imovel_folder_name(imovel_id, nome_imovel, matricula):
    if imovel_id:
        base = f"{str(imovel_id).zfill(3)} - {nome_imovel or 'Imovel'}"
    else:
        base = f"Externo - {nome_imovel or 'Sem vinculo'}"
    if matricula:
        base += f" (Mat. {matricula})"
    return base[:250]


def _upload_file(service, file_bytes, file_name, mimetype, dest_folder_id):
    media = MediaIoBaseUpload(io.BytesIO(file_bytes), mimetype=mimetype, resumable=False)
    uploaded = service.files().create(
        body={"name": file_name, "parents": [dest_folder_id]},
        media_body=media, fields="id, webViewLink").execute()
    service.permissions().create(
        fileId=uploaded["id"],
        body={"type": "anyone", "role": "reader"}).execute()
    return uploaded


def get_or_create_imovel_folder(imovel_id, nome_imovel, matricula=""):
    service = _get_service()
    root = _imoveis_root(service)
    nome = _imovel_folder_name(imovel_id, nome_imovel, matricula)
    folder_id = _get_or_create_folder(service, nome, root)
    _get_or_create_folder(service, "Dados_Cadastrais", folder_id)
    return folder_id


def upload_documento_imovel(file_bytes, file_name, mimetype, imovel_id,
                             nome_imovel, matricula="", ano=None, pasta_fixa=None):
    service = _get_service()
    root = _imoveis_root(service)
    nome_pasta = _imovel_folder_name(imovel_id, nome_imovel, matricula)
    imovel_folder_id = _get_or_create_folder(service, nome_pasta, root)
    if pasta_fixa:
        dest_id = _get_or_create_folder(service, pasta_fixa, imovel_folder_id)
        ano_pasta = None
    else:
        ano_real = ano or datetime.now().year
        dest_id = _get_or_create_folder(
            service, f"Ano_{ano_real}", imovel_folder_id)
        ano_pasta = ano_real
    uploaded = _upload_file(service, file_bytes, file_name, mimetype, dest_id)
    return {
        "drive_file_id": uploaded["id"],
        "drive_url": uploaded.get("webViewLink", ""),
        "pasta_drive_id": dest_id,
        "imovel_folder_id": imovel_folder_id,
        "ano_pasta": ano_pasta,
    }


def upload_contrato_docx(docx_bytes, file_name, imovel_id,
                          nome_imovel, matricula="", ano=None):
    DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return upload_documento_imovel(
        docx_bytes, file_name, DOCX, imovel_id, nome_imovel, matricula, ano)


def upload_documento_cadastral(file_bytes, file_name, mimetype,
                                imovel_id, nome_imovel, matricula=""):
    return upload_documento_imovel(
        file_bytes, file_name, mimetype, imovel_id, nome_imovel, matricula,
        pasta_fixa="Dados_Cadastrais")


def delete_arquivo_drive(drive_file_id):
    try:
        _get_service().files().delete(fileId=drive_file_id).execute()
    except Exception:
        pass
