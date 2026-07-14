import base64
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
import psycopg2, psycopg2.extras
from .drive_contratos import (upload_contrato_docx, upload_documento_cadastral,
                               get_or_create_imovel_folder, delete_arquivo_drive)
from .db import get_db

router = APIRouter(prefix="/contratos-rurais", tags=["Contratos Rurais"])


TIPO_LABELS = {
    "arrendamento": "Arrendamento",
    "parceria": "Parceria",
    "comodato": "Comodato",
    "prestacao_servico": "Prestacao de Servico",
    "compra_venda": "Compra e Venda",
    "condominio": "Condominio Rural",
}


class ContratoSalvar(BaseModel):
    imovel_id: Optional[int] = None
    nome_imovel: Optional[str] = None
    matricula: Optional[str] = None
    tipo: str                           # arrendamento | parceria | comodato | prestacao_servico | compra_venda | condominio
    modalidade: Optional[str] = None
    titulo: Optional[str] = None
    ano_safra: Optional[int] = None
    outorgante_id: Optional[int] = None
    outorgante_nome: Optional[str] = None
    outorgado_id: Optional[int] = None
    outorgado_nome: Optional[str] = None
    dados_json: Optional[dict] = None
    docx_base64: Optional[str] = None
    nome_arquivo: Optional[str] = None
    # Campos simples (contrato sem documento formal ainda) — guardados em dados_json
    descricao: Optional[str] = None
    valor: Optional[float] = None
    data_inicio: Optional[str] = None
    data_fim: Optional[str] = None
    status: Optional[str] = None


class DocumentoUpload(BaseModel):
    nome_arquivo: str
    mimetype: str
    arquivo_base64: str
    descricao: Optional[str] = None


def _imovel_info(conn, imovel_id):
    with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
        cur.execute(
            "SELECT nome, nirf AS matricula FROM imoveis_rurais WHERE id = %s",
            (imovel_id,))
        row = cur.fetchone()
        return dict(row) if row else {}


@router.post("", status_code=201)
def salvar_contrato(body: ContratoSalvar):
    conn = get_db()
    drive = None
    try:
        nome_imovel = body.nome_imovel or ""
        matricula   = body.matricula or ""
        if body.imovel_id:
            info = _imovel_info(conn, body.imovel_id)
            nome_imovel = info.get("nome") or nome_imovel
            matricula   = info.get("matricula") or matricula

        ano = body.ano_safra or datetime.now().year

        titulo = body.titulo or f"Contrato de {TIPO_LABELS.get(body.tipo, body.tipo)} - {ano}"

        # Monta dados_json mesclando o que o cliente enviou com os campos
        # simples (descricao/valor/datas/status) — assim nao e preciso
        # migrar a tabela para suportar o formulario simples de contrato.
        dados_json = dict(body.dados_json or {})
        if body.descricao is not None:
            dados_json["descricao"] = body.descricao
        if body.valor is not None:
            dados_json["valor"] = body.valor
        if body.data_inicio is not None:
            dados_json["data_inicio"] = body.data_inicio
        if body.data_fim is not None:
            dados_json["data_fim"] = body.data_fim
        if body.status is not None:
            dados_json["status"] = body.status

        # Upload do documento (Word) e integracao com o Drive sao opcionais.
        # Se nao houver docx_base64, o contrato e salvo sem documento anexado
        # (pode ser complementado depois com upload_doc_cadastral).
        docx_drive_id = None
        docx_drive_url = None
        pasta_drive_id = None
        imovel_folder_id = None

        if body.docx_base64:
            try:
                docx_bytes = base64.b64decode(body.docx_base64)
            except Exception:
                raise HTTPException(400, "docx_base64 invalido")

            nome_arquivo = body.nome_arquivo or f"{titulo}.docx"
            try:
                drive = upload_contrato_docx(
                    docx_bytes, nome_arquivo,
                    body.imovel_id, nome_imovel, matricula, ano)
            except Exception as e:
                raise HTTPException(500, f"Erro Drive: {e}")

            docx_drive_id = drive["drive_file_id"]
            docx_drive_url = drive["drive_url"]
            pasta_drive_id = drive["pasta_drive_id"]
            imovel_folder_id = drive["imovel_folder_id"]

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO contratos_rurais (
                    imovel_id, nome_imovel, matricula, tipo, modalidade,
                    titulo, ano_safra, dados_json,
                    outorgante_id, outorgante_nome,
                    outorgado_id,  outorgado_nome,
                    docx_drive_id, docx_drive_url,
                    pasta_drive_id, imovel_folder_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                RETURNING id, created_at""",
                (body.imovel_id, nome_imovel, matricula,
                 body.tipo, body.modalidade, titulo, ano,
                 psycopg2.extras.Json(dados_json),
                 body.outorgante_id, body.outorgante_nome,
                 body.outorgado_id,  body.outorgado_nome,
                 docx_drive_id, docx_drive_url,
                 pasta_drive_id, imovel_folder_id))
            row = cur.fetchone()
            conn.commit()
            return {
                "id": str(row["id"]),
                "created_at": row["created_at"].isoformat(),
                "tipo": body.tipo,
                "titulo": titulo,
                "descricao": dados_json.get("descricao"),
                "valor": dados_json.get("valor"),
                "data_inicio": dados_json.get("data_inicio"),
                "data_fim": dados_json.get("data_fim"),
                "status": dados_json.get("status"),
                "drive_url": docx_drive_url,
                "ano_safra": ano,
            }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        if drive and drive.get("drive_file_id"):
            delete_arquivo_drive(drive["drive_file_id"])
        raise HTTPException(500, f"Erro: {e}")
    finally:
        conn.close()


@router.get("")
def listar_contratos(
    imovel_id:  Optional[int] = Query(None),
    tipo:       Optional[str] = Query(None),
    ano_safra:  Optional[int] = Query(None),
    limit: int = Query(50, le=200),
    offset: int = Query(0)):

    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            filters, params = [], []
            if imovel_id is not None:
                filters.append("imovel_id = %s"); params.append(imovel_id)
            if tipo:
                filters.append("tipo = %s"); params.append(tipo)
            if ano_safra:
                filters.append("ano_safra = %s"); params.append(ano_safra)
            where = ("WHERE " + " AND ".join(filters)) if filters else ""
            fp = params[:]
            params += [limit, offset]
            cur.execute(f"""
                SELECT id, imovel_id, nome_imovel, matricula, tipo, modalidade,
                       titulo, ano_safra, outorgante_nome, outorgado_nome,
                       docx_drive_url, created_at,
                       dados_json->>'descricao' AS descricao,
                       (dados_json->>'valor')::numeric AS valor,
                       dados_json->>'data_inicio' AS data_inicio,
                       dados_json->>'data_fim' AS data_fim,
                       COALESCE(dados_json->>'status', 'ativo') AS status
                FROM contratos_rurais {where}
                ORDER BY ano_safra DESC, created_at DESC
                LIMIT %s OFFSET %s""", params)
            rows = cur.fetchall()
            cur.execute(
                f"SELECT COUNT(*) AS total FROM contratos_rurais {where}", fp)
            return {"total": cur.fetchone()["total"],
                    "items": [dict(r) for r in rows]}
    finally:
        conn.close()


@router.get("/{contrato_id}")
def detalhar_contrato(contrato_id: str):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT * FROM contratos_rurais WHERE id = %s", (contrato_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Contrato nao encontrado")
            return dict(row)
    finally:
        conn.close()


@router.delete("/{contrato_id}", status_code=204)
def deletar_contrato(contrato_id: str):
    conn = get_db()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute(
                "SELECT docx_drive_id FROM contratos_rurais WHERE id = %s",
                (contrato_id,))
            row = cur.fetchone()
            if not row:
                raise HTTPException(404, "Contrato nao encontrado")
            if row.get("docx_drive_id"):
                delete_arquivo_drive(row["docx_drive_id"])
            cur.execute(
                "DELETE FROM contratos_rurais WHERE id = %s", (contrato_id,))
            conn.commit()
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, f"Erro: {e}")
    finally:
        conn.close()


@router.post("/imoveis/{imovel_id}/documentos", status_code=201)
def upload_doc_cadastral(imovel_id: int, body: DocumentoUpload):
    try:
        file_bytes = base64.b64decode(body.arquivo_base64)
    except Exception:
        raise HTTPException(400, "arquivo_base64 invalido")

    conn = get_db()
    try:
        info = _imovel_info(conn, imovel_id)
        if not info:
            raise HTTPException(404, "Imovel nao encontrado")
        nome_imovel = info.get("nome", "")
        matricula   = info.get("matricula", "")

        try:
            drive = upload_documento_cadastral(
                file_bytes, body.nome_arquivo, body.mimetype,
                imovel_id, nome_imovel, matricula)
        except Exception as e:
            raise HTTPException(500, f"Erro Drive: {e}")

        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute("""
                INSERT INTO documentos_imovel_rural
                    (imovel_id, nome_arquivo, descricao, mimetype,
                     drive_file_id, drive_url, pasta_drive_id)
                VALUES (%s,%s,%s,%s,%s,%s,%s)
                RETURNING id, created_at""",
                (imovel_id, body.nome_arquivo, body.descricao, body.mimetype,
                 drive["drive_file_id"], drive["drive_url"],
                 drive["pasta_drive_id"]))
            row = cur.fetchone()
            conn.commit()
            return {"id": str(row["id"]),
                    "drive_url": drive["drive_url"],
                    "created_at": row["created_at"].isoformat()}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, f"Erro: {e}")
    finally:
        conn.close()


@router.post("/imoveis/{imovel_id}/pasta-drive", status_code=201)
def criar_pasta_imovel(imovel_id: int):
    conn = get_db()
    try:
        info = _imovel_info(conn, imovel_id)
        if not info:
            raise HTTPException(404, "Imovel nao encontrado")
        folder_id = get_or_create_imovel_folder(
            imovel_id, info.get("nome", ""), info.get("matricula", ""))
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE imoveis_rurais SET drive_folder_id = %s WHERE id = %s",
                (folder_id, imovel_id))
            conn.commit()
        return {"imovel_id": imovel_id, "drive_folder_id": folder_id}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, f"Erro: {e}")
    finally:
        conn.close()
