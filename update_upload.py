with open("app/main.py", encoding="utf-8") as f:
    content = f.read()

old = '''async def upload_documento(lancamento_id: int, file: UploadFile = File(...)):
    from app.db import engine, vincular_documento
    from app.services.drive_handler import upload_para_drive, extensao_por_mime
    from sqlalchemy import text
    conteudo = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    from datetime import datetime
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    from app.services.drive_handler import extensao_por_mime
    ext = extensao_por_mime(mime_type)
    nome_arquivo = f"lancamento_{lancamento_id}_{ts}{ext}"
    with engine.connect() as conn:
        lanc = conn.execute(text("SELECT produtor_id FROM lancamentos WHERE id=:id"), {"id": lancamento_id}).fetchone()
        if not lanc: raise HTTPException(404, "Lancamento nao encontrado")
        subfolder = f"produtor_{lanc[0]}"
    url_drive = upload_para_drive(conteudo, nome_arquivo, mime_type, subfolder_name=subfolder)
    vincular_documento(lancamento_id, url_drive)
    return {"status": "ok", "documento_url": url_drive, "arquivo": nome_arquivo}'''

new = '''async def upload_documento(lancamento_id: int, file: UploadFile = File(...)):
    from app.db import engine, vincular_documento
    from app.services.r2_service import upload_documento as r2_upload
    from sqlalchemy import text
    conteudo = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    with engine.connect() as conn:
        lanc = conn.execute(text("SELECT produtor_id FROM lancamentos WHERE id=:id"), {"id": lancamento_id}).fetchone()
        if not lanc: raise HTTPException(404, "Lancamento nao encontrado")
        produtor_id = lanc[0]
    url = r2_upload(conteudo, mime_type, produtor_id, lancamento_id, file.filename)
    vincular_documento(lancamento_id, url)
    return {"status": "ok", "documento_url": url, "arquivo": file.filename}'''

result = content.replace(old, new)
print("Changed:", content != result)
with open("app/main.py", "w", encoding="utf-8") as f:
    f.write(result)
