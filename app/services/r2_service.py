import os, boto3
from botocore.config import Config
from datetime import datetime

def get_r2_client():
    account_id = os.getenv("R2_ACCOUNT_ID")
    return boto3.client("s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.getenv("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=os.getenv("R2_SECRET_KEY"),
        config=Config(signature_version="s3v4"),
        region_name="auto")

def extensao_por_mime(mime_type):
    return {
        "application/pdf":".pdf","image/jpeg":".jpg",
        "image/png":".png","image/webp":".webp",
    }.get(mime_type, ".bin")

def upload_documento(conteudo, mime_type, produtor_id, lancamento_id, nome_original=None):
    bucket = os.getenv("R2_BUCKET_NAME","ruralcaixa-documentos")
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    ext = extensao_por_mime(mime_type)
    nome = nome_original or f"{ts}{ext}"
    key = f"documentos/produtor_{produtor_id}/lancamento_{lancamento_id}/{ts}_{nome}"
    get_r2_client().put_object(Bucket=bucket, Key=key, Body=conteudo, ContentType=mime_type)
    account_id = os.getenv("R2_ACCOUNT_ID")
    return f"https://{account_id}.r2.cloudflarestorage.com/{bucket}/{key}"

def gerar_url_temporaria(key, expiracao_segundos=3600):
    bucket = os.getenv("R2_BUCKET_NAME","ruralcaixa-documentos")
    return get_r2_client().generate_presigned_url("get_object",
        Params={"Bucket":bucket,"Key":key}, ExpiresIn=expiracao_segundos)
