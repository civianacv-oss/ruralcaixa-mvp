# bovino module enabled
from app.routers.bovino import router as bovino_router
import hmac, hashlib, json, os
import httpx
from datetime import date
from typing import Optional, List

# piscicultura module enabled          â† ADICIONAR
from app.routers.piscicultura import router as piscicultura_router
from backend.routers.telegram_router import router as telegram_router
from app.routers.telegram_bot_router import router as telegram_bot_router
from backend.routers.telegram_router import router as telegram_router
from app.routers.agricultura import router as agricultura_router

from fastapi import FastAPI, Request, Query, HTTPException, BackgroundTasks
from .router_contratos import router as contratos_rurais_router
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from app.contratos_api import router as contratos_router
from app.lancamentos_contrato import router as lanc_router

from app.services.classifier import classificar
try:
    from app.routers.ovino import router as ovino_router
    print("OVINO ROUTER LOADED OK")
except Exception as e:
    print(f"OVINO ROUTER FAILED: {e}")
    ovino_router = None

try:
    from app.routers.caprino import router as caprino_router
    print("CAPRINO ROUTER LOADED OK")
except Exception as e:
    print(f"CAPRINO ROUTER FAILED: {e}")
    caprino_router = None

try:
    from app.routers.suino import router as suino_router
    print("SUINO ROUTER LOADED OK")
except Exception as e:
    print(f"SUINO ROUTER FAILED: {e}")
    suino_router = None

try:
    from app.routers.compravenda import router as compravenda_router
    print("COMPRAVENDA ROUTER LOADED OK")
except Exception as e:
    print(f"COMPRAVENDA ROUTER FAILED: {e}")
    compravenda_router = None

try:
    from app.routers.acai import router as acai_router
    print("ACAI ROUTER LOADED OK")
except Exception as e:
    print(f"ACAI ROUTER FAILED: {e}")
    acai_router = None

efdreinf_router = None
try:
    from app.routers.efdreinf import router as efdreinf_router
    print("EFDREINF ROUTER LOADED OK")
except Exception as e:
    print(f"EFDREINF ROUTER FAILED: {e}")
    efdreinf_router = None

load_dotenv()

app = FastAPI(title="Rural Caixa PF")

VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN")
APP_SECRET   = os.getenv("WHATSAPP_APP_SECRET")
WAPP_TOKEN   = os.getenv("WHATSAPP_TOKEN")
PHONE_ID     = os.getenv("WHATSAPP_PHONE_ID")
GRAPH        = "https://graph.facebook.com/v23.0"

sessoes = {}
if ovino_router: app.include_router(ovino_router)
if caprino_router: app.include_router(caprino_router)
if suino_router: app.include_router(suino_router)
if compravenda_router: app.include_router(compravenda_router)
if acai_router: app.include_router(acai_router)
if efdreinf_router: app.include_router(efdreinf_router)

simulador_regime_router = None
try:
    from app.routers.simulador_regime import router as simulador_regime_router
    print("SIMULADOR_REGIME ROUTER LOADED OK")
except Exception as e:
    print(f"SIMULADOR_REGIME ROUTER FAILED: {e}")
    simulador_regime_router = None

if simulador_regime_router: app.include_router(simulador_regime_router)

acertos_contrato_router = None
try:
    from app.routers.acertos_contrato import router as acertos_contrato_router
    print("ACERTOS_CONTRATO ROUTER LOADED OK")
except Exception as e:
    print(f"ACERTOS_CONTRATO ROUTER FAILED: {e}")
    acertos_contrato_router = None

if acertos_contrato_router: app.include_router(acertos_contrato_router)

# DCTFWeb
dctfweb_router = None
try:
    from app.routers.dctfweb import router as dctfweb_router
    print("DCTFWEB ROUTER LOADED OK")
except Exception as e:
    print(f"DCTFWEB ROUTER FAILED: {e}")
    dctfweb_router = None
if dctfweb_router: app.include_router(dctfweb_router)

# Livro Caixa
livro_caixa_router = None
try:
    from app.routers.livro_caixa import router as livro_caixa_router
    print("LIVRO_CAIXA ROUTER LOADED OK")
except Exception as e:
    print(f"LIVRO_CAIXA ROUTER FAILED: {e}")
    livro_caixa_router = None
if livro_caixa_router: app.include_router(livro_caixa_router)

# DIRPF
dirpf_router = None
try:
    from app.routers.dirpf import router as dirpf_router
    print("DIRPF ROUTER LOADED OK")
except Exception as e:
    print(f"DIRPF ROUTER FAILED: {e}")
    dirpf_router = None
if dirpf_router: app.include_router(dirpf_router)

# NF-e Produtor (novo router com tabela nfe_produtor)
nfe_produtor_router = None
try:
    from app.routers.nfe_produtor import router as nfe_produtor_router
    print("NFE_PRODUTOR ROUTER LOADED OK")
except Exception as e:
    print(f"NFE_PRODUTOR ROUTER FAILED: {e}")
    nfe_produtor_router = None
if nfe_produtor_router: app.include_router(nfe_produtor_router)

# ApuraÃ§Ã£o PJ
apuracao_pj_router = None
try:
    from app.routers.apuracao_pj import router as apuracao_pj_router
    print("APURACAO_PJ ROUTER LOADED OK")
except Exception as e:
    print(f"APURACAO_PJ ROUTER FAILED: {e}")
    apuracao_pj_router = None
if apuracao_pj_router: app.include_router(apuracao_pj_router)


# ImportaÃ§Ã£o em lote
importacao_router = None
try:
    from app.routers.importacao import router as importacao_router
    print("IMPORTACAO ROUTER LOADED OK")
except Exception as e:
    print(f"IMPORTACAO ROUTER FAILED: {e}")
if importacao_router:
    app.include_router(importacao_router)

try:
    from app.routers.propriedades_rural import router as propriedades_rural_router
    app.include_router(propriedades_rural_router)
    print('PROPRIEDADES_RURAL ROUTER LOADED OK')
except Exception as _e:
    print(f'PROPRIEDADES_RURAL ROUTER FAILED: {_e}')

insumos_router = None
try:
    from app.routers.insumos import router as insumos_router
    app.include_router(insumos_router)
    print("INSUMOS ROUTER LOADED OK")
except Exception as e:
    print(f"INSUMOS ROUTER FAILED: {e}")

# Cron alertas insumos
try:
    from app.services.insumo_cron import verificar_alertas_insumo
    print('INSUMO CRON LOADED OK')
except Exception as _e:
    verificar_alertas_insumo = None
    print(f'INSUMO CRON FAILED: {_e}')

# Cron alertas ovinos
try:
    from app.services.ovino_cron import processar_alertas_ovinos
    print("OVINO CRON LOADED OK")
except Exception as e:
    print(f"OVINO CRON FAILED: {e}")
    processar_alertas_ovinos = None

# Cron alertas caprinos
try:
    from app.services.caprino_cron import processar_alertas_caprinos
    print("CAPRINO CRON LOADED OK")
except Exception as e:
    print(f"CAPRINO CRON FAILED: {e}")
    processar_alertas_caprinos = None
# Cron alertas suÃ­nos
try:
    from app.services.suino_cron import processar_alertas_suinos
    print("SUINO CRON LOADED OK")
except Exception as e:
    print(f"SUINO CRON FAILED: {e}")
    processar_alertas_suinos = None
# Cron alertas bovinos
try:
    from app.services.bovino_cron import processar_alertas_bovinos
    print("BOVINO CRON LOADED OK")
except Exception as e:
    print(f"BOVINO CRON FAILED: {e}")
    processar_alertas_bovinos = None
# Cron alertas agricultura
try:
    from app.services.agricultura_cron import processar_alertas_agricultura
    print("AGRICULTURA CRON LOADED OK")
except Exception as e:
    print(f"AGRICULTURA CRON FAILED: {e}")
    processar_alertas_agricultura = None
# Cron alertas aÃ§aÃ­
try:
    from app.services.acai_cron import processar_alertas_acai
    print("ACAI CRON LOADED OK")
except Exception as e:
    print(f"ACAI CRON FAILED: {e}")
    processar_alertas_acai = None
# Cron alertas piscicultura
try:
    from app.services.piscicultura_cron import processar_alertas_piscicultura
    print("PISCICULTURA CRON LOADED OK")
except Exception as e:
    print(f"PISCICULTURA CRON FAILED: {e}")
    processar_alertas_piscicultura = None

# CORS primeiro (executa por Ãºltimo na pilha)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Auth depois (executa primeiro na pilha)
from app.middleware.auth_middleware import AuthMiddleware
app.add_middleware(AuthMiddleware)
app.include_router(contratos_router)
app.include_router(lanc_router)
from app.propriedades import router as propriedades_router
app.include_router(propriedades_router)
from app.consorcios import router as consorcios_router
app.include_router(consorcios_router)
app.include_router(contratos_rurais_router)
app.include_router(bovino_router)
app.include_router(agricultura_router)
app.include_router(piscicultura_router)
app.include_router(telegram_router)
app.include_router(telegram_bot_router)   # â† ADICIONAR

# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Models Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

class ClassificarTexto(BaseModel):
    texto: str

class LancamentoCreate(BaseModel):
    produtor_id: int
    valor: float
    data: Optional[str] = None
    origem: str = "agricultura"
    safra_id: Optional[int] = None
    # Campos legados mantidos para compatibilidade (ignorados no INSERT)
    conta_codigo: str = "4.1"
    tipo: str = "despesa"
    descricao: str = ""
    data_lancamento: Optional[str] = None
    confirmado: bool = True
    atividade: str = "rural"
    perc_participacao: float = 100.0

class ProdutorCreate(BaseModel):
    nome: str
    cpf: str
    telefone: str
    nirf: Optional[str] = None

class ImovelCreate(BaseModel):
    nome: Optional[str] = None
    nirf: Optional[str] = None
    area_ha: Optional[float] = None
    municipio: Optional[str] = None
    uf: Optional[str] = None
    imovel_id: Optional[int] = None
    participacao: Optional[float] = None

class CadastroRequest(BaseModel):
    produtor: ProdutorCreate
    imovel: ImovelCreate

class ClassificacaoUpdate(BaseModel):
    conta: str
    tipo: str

class TerceiroCreate(BaseModel):
    imovel_id: int
    tipo_contraparte: str
    id_contraparte: str
    nome_contraparte: str
    perc_contraparte: float

class TerceiroUpdate(BaseModel):
    perc_contraparte: float
    area_ha: float = 0
    investimento: float = 0

# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Endpoints Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 
@app.put("/terceiros/{terceiro_id}")
def update_terceiro(terceiro_id: int, data: TerceiroUpdate):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE terceiros SET perc_contraparte = :perc, area_ha = :area, investimento = :inv
            WHERE id = :id
        """), {"perc": data.perc_contraparte, "area": data.area_ha, "inv": data.investimento, "id": terceiro_id})
        conn.commit()
    return {"status": "ok"}


@app.get("/imoveis/{imovel_id}/terceiros")
def get_terceiros(imovel_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT * FROM terceiros WHERE imovel_id = :iid ORDER BY id"
        ), {"iid": imovel_id}).fetchall()
        return [dict(r._mapping) for r in rows]

@app.post("/imoveis/{imovel_id}/terceiros")
def add_terceiro(imovel_id: int, data: TerceiroCreate):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        result = conn.execute(text("""
            INSERT INTO terceiros (imovel_id, tipo_contraparte, id_contraparte, nome_contraparte, perc_contraparte)
            VALUES (:iid, :tipo, :id_cp, :nome, :perc)
            RETURNING id
        """), {
            "iid": imovel_id,
            "tipo": data.tipo_contraparte,
            "id_cp": data.id_contraparte,
            "nome": data.nome_contraparte,
            "perc": data.perc_contraparte,
        })
        conn.commit()
        return {"id": result.fetchone()[0]}

class LancamentoUpdate(BaseModel):
    valor: Optional[float] = None
    data: Optional[str] = None
    descricao: Optional[str] = None
    tipo: Optional[str] = None
    atividade: Optional[str] = None

@app.put("/lancamentos/{lancamento_id}")
def atualizar_lancamento(lancamento_id: str, data: LancamentoUpdate):
    import psycopg2, uuid as _uuid, os
    DB_URL = os.getenv("DATABASE_URL")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    try:
        fields = []
        vals = []
        if data.valor is not None:
            fields.append("valor = %s")
            vals.append(abs(float(data.valor)))
        if data.data is not None:
            fields.append("data = %s")
            vals.append(data.data)

        # Se descriÃ§Ã£o ou tipo mudaram â†’ reclassificar e APRENDER
        if data.descricao is not None or data.tipo is not None:
            # Buscar dados atuais do lanÃ§amento
            cur.execute(
                "SELECT s.nome, LOWER(s.tipo), s.atividade_tipo FROM lancamentos l LEFT JOIN subcontas s ON s.id = l.subconta_id WHERE l.id = %s::uuid",
                (lancamento_id,)
            )
            row = cur.fetchone()
            nome_sub = data.descricao or (row[0] if row else "Outros")
            tipo_raw = (data.tipo or (row[1] if row else "despesa")).upper()
            atividade_sub = "RURAL" if (data.atividade or (row[2] if row else "RURAL")).upper() == "RURAL" else "INVESTIMENTO"

            # Buscar ou criar subconta correta
            cur.execute(
                "SELECT id FROM subcontas WHERE LOWER(nome) LIKE LOWER(%s) AND tipo = %s LIMIT 1",
                (f"%{nome_sub[:20]}%", tipo_raw)
            )
            sub = cur.fetchone()
            if not sub:
                sub_id = str(_uuid.uuid4())
                cur.execute(
                    "INSERT INTO subcontas (id, nome, tipo, atividade_tipo) VALUES (%s, %s, %s, %s)",
                    (sub_id, nome_sub[:100], tipo_raw, atividade_sub)
                )
            else:
                sub_id = sub[0]

            fields.append("subconta_id = %s")
            vals.append(sub_id)

            # â”€â”€ APRENDIZADO: salvar regra para esta descriÃ§Ã£o â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
            palavra_chave = nome_sub[:50].lower()
            cur.execute(
                "SELECT id FROM regras_classificacao WHERE palavra_chave = %s",
                (palavra_chave,)
            )
            regra_existente = cur.fetchone()
            if regra_existente:
                cur.execute(
                    "UPDATE regras_classificacao SET subconta_id = %s, atualizado_em = NOW() WHERE palavra_chave = %s",
                    (sub_id, palavra_chave)
                )
            else:
                cur.execute(
                    "INSERT INTO regras_classificacao (id, palavra_chave, subconta_id, criado_em, atualizado_em) VALUES (%s, %s, %s, NOW(), NOW())",
                    (str(_uuid.uuid4()), palavra_chave, sub_id)
                )

            # â”€â”€ PROPAGAR: atualizar lanÃ§amentos semelhantes sem correÃ§Ã£o manual â”€â”€
            # Busca lanÃ§amentos com descriÃ§Ã£o parecida que ainda nÃ£o foram corrigidos manualmente
            cur.execute("""
                UPDATE lancamentos l
                SET subconta_id = %s
                FROM subcontas s
                WHERE l.subconta_id = s.id
                  AND LOWER(s.nome) LIKE LOWER(%s)
                  AND l.id != %s::uuid
                  AND l.id NOT IN (SELECT lancamento_id FROM correcoes_manuais WHERE lancamento_id IS NOT NULL)
            """, (sub_id, f"%{nome_sub[:20]}%", lancamento_id))
            propagados = cur.rowcount

        if not fields:
            raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")

        vals.append(lancamento_id)
        cur.execute(
            f"UPDATE lancamentos SET {', '.join(fields)} WHERE id = %s::uuid",
            tuple(vals)
        )

        # Registrar que este lanÃ§amento foi corrigido manualmente
        if data.descricao is not None or data.tipo is not None:
            cur.execute(
                "INSERT INTO correcoes_manuais (id, lancamento_id, criado_em) VALUES (%s, %s::uuid, NOW()) ON CONFLICT (lancamento_id) DO NOTHING",
                (str(_uuid.uuid4()), lancamento_id)
            )

        conn.commit()
        return {"ok": True, "propagados": propagados if (data.descricao is not None or data.tipo is not None) else 0}
    finally:
        cur.close()
        conn.close()

@app.delete("/lancamentos/{lancamento_id}", status_code=204)
def deletar_lancamento(lancamento_id: str):
    import psycopg2
    import os
    DB_URL = os.getenv("DATABASE_URL")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    try:
        cur.execute("DELETE FROM lancamentos WHERE id = %s::uuid", (lancamento_id,))
        conn.commit()
    finally:
        cur.close()
        conn.close()




@app.delete("/imoveis-rurais/{imovel_id}")
def deletar_imovel_rural(imovel_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        total = conn.execute(text(
            "SELECT COUNT(*) FROM lancamentos WHERE empreendimento_id=:id"
        ), {"id": imovel_id}).fetchone()[0]
        if total > 0:
            raise HTTPException(status_code=400,
                detail=f"Imovel possui {total} lancamentos. Remova-os primeiro.")
        conn.execute(text("DELETE FROM imoveis_rurais WHERE id=:id"), {"id": imovel_id})
        conn.commit()
    return {"status": "ok", "id": imovel_id}


@app.put("/imoveis-rurais/{imovel_id}")
def atualizar_imovel_rural(imovel_id: int, dados: dict):
    from app.db import engine
    from sqlalchemy import text
    campos = []
    valores = {"id": imovel_id}
    for campo in ["nome", "municipio", "uf", "area_total", "caepf", "nirf"]:
        if campo in dados:
            campos.append(f"{campo} = :{campo}")
            valores[campo] = dados[campo]
    if not campos:
        raise HTTPException(status_code=400, detail="Nenhum campo para atualizar")
    with engine.connect() as conn:
        conn.execute(text(
            f"UPDATE imoveis_rurais SET {', '.join(campos)} WHERE id=:id"
        ), valores)
        conn.commit()
    return {"status": "ok"}


@app.get("/me/produtor")
def get_produtor_by_token(token: str = None, cpf: str = None):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        if token:
            result = conn.execute(text(
                "SELECT id, nome, cpf, telefone FROM produtores WHERE api_token = :token"
            ), {"token": token})
        elif cpf:
            cpf_clean = cpf.replace(".", "").replace("-", "").strip()
            result = conn.execute(text(
                "SELECT id, nome, cpf, telefone FROM produtores WHERE REPLACE(REPLACE(cpf,'.',''),'-','') = :cpf"
            ), {"cpf": cpf_clean})
        else:
            raise HTTPException(status_code=400, detail="Informe token ou cpf")
        row = result.fetchone()
        if not row:
            raise HTTPException(status_code=401, detail="CPF ou token nao encontrado")
        return {"id": row[0], "nome": row[1], "cpf": row[2], "telefone": row[3]}

@app.delete("/produtores/{produtor_id}/lancamentos/{lancamento_id}")
def deletar_lancamento_por_produtor(produtor_id: int, lancamento_id: str):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        result = conn.execute(text(
            "DELETE FROM lancamentos WHERE id=:lid AND produtor_id=:pid RETURNING id"
        ), {"lid": lancamento_id, "pid": produtor_id})
        conn.commit()
        if not result.fetchone():
            raise HTTPException(status_code=404, detail="Lancamento nao encontrado")
    return {"status": "ok", "id": lancamento_id}

@app.delete("/terceiros/{terceiro_id}")
def del_terceiro(terceiro_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM terceiros WHERE id = :id"), {"id": terceiro_id})
        conn.commit()
    return {"status": "ok"}

@app.put("/imoveis/{imovel_id}/tipo-exploracao")
def update_tipo_exploracao(imovel_id: int, tipo: int, participacao: float):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE imoveis_rurais SET tipo_exploracao = :tipo, participacao = :part
            WHERE id = :iid
        """), {"tipo": tipo, "part": participacao, "iid": imovel_id})
        conn.commit()
    return {"status": "ok"}

@app.post("/imoveis/{imovel_id}/recalcular-participacoes")
def recalcular_participacoes(imovel_id: int, alfa: float = 0.5, beta: float = 0.5):
    from app.db import engine
    from sqlalchemy import text
    if abs(alfa + beta - 1.0) > 0.01:
        raise HTTPException(status_code=400, detail="alfa + beta deve ser igual a 1")
    with engine.connect() as conn:
        # Buscar imÃƒÂ³vel e terceiros
        imovel = conn.execute(text(
            "SELECT area_declarante, investimento_declarante FROM imoveis_rurais WHERE id = :id"
        ), {"id": imovel_id}).fetchone()
        terceiros = conn.execute(text(
            "SELECT id, area_ha, investimento FROM terceiros WHERE imovel_id = :id"
        ), {"id": imovel_id}).fetchall()

        if not imovel:
            raise HTTPException(status_code=404, detail="ImÃƒÂ³vel nÃƒÂ£o encontrado")

        # Calcular totais
        area_total = float(imovel[0] or 0) + sum(float(t[1] or 0) for t in terceiros)
        inv_total = float(imovel[1] or 0) + sum(float(t[2] or 0) for t in terceiros)

        # Calcular participaÃƒÂ§ÃƒÂ£o do declarante
        c_terra_decl = float(imovel[0] or 0) / area_total if area_total > 0 else 0
        c_inv_decl = float(imovel[1] or 0) / inv_total if inv_total > 0 else 0
        perc_decl = round((alfa * c_terra_decl + beta * c_inv_decl) * 100, 2)

        # Atualizar imÃƒÂ³vel
        conn.execute(text("""
            UPDATE imoveis_rurais 
            SET participacao = :perc, alfa = :alfa, beta = :beta,
                area_total = :area_total, investimento_total = :inv_total
            WHERE id = :id
        """), {"perc": perc_decl, "alfa": alfa, "beta": beta,
               "area_total": area_total, "inv_total": inv_total, "id": imovel_id})

        # Atualizar cada terceiro
        resultados = []
        for t in terceiros:
            c_terra = float(t[1] or 0) / area_total if area_total > 0 else 0
            c_inv = float(t[2] or 0) / inv_total if inv_total > 0 else 0
            perc = round((alfa * c_terra + beta * c_inv) * 100, 2)
            conn.execute(text(
                "UPDATE terceiros SET perc_contraparte = :perc WHERE id = :id"
            ), {"perc": perc, "id": t[0]})
            resultados.append({"id": t[0], "perc": perc})

        conn.commit()
        return {
            "declarante": perc_decl,
            "terceiros": resultados,
            "area_total": area_total,
            "inv_total": inv_total,
        }



# â”€â”€ AutenticaÃ§Ã£o por CPF + OTP â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class SolicitarCodigoRequest(BaseModel):
    cpf: str

class VerificarCodigoRequest(BaseModel):
    cpf: str
    codigo: str

@app.post("/auth/solicitar")
async def auth_solicitar(body: SolicitarCodigoRequest):
    """Envia cÃ³digo OTP via WhatsApp/Telegram para o CPF informado."""
    from app.services.auth_service import solicitar_codigo
    result = solicitar_codigo(body.cpf)
    if "erro" in result:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=result["erro"])
    return result

@app.post("/auth/verificar")
async def auth_verificar(body: VerificarCodigoRequest):
    """Valida o cÃ³digo OTP e retorna o token de acesso."""
    from app.services.auth_service import verificar_codigo
    result = verificar_codigo(body.cpf, body.codigo)
    if "erro" in result:
        from fastapi import HTTPException
        raise HTTPException(status_code=400, detail=result["erro"])
    return result


# â”€â”€ Feedback de testadores â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

class FeedbackRequest(BaseModel):
    descricao: str
    pagina: str = ""
    origem: str = "app"

@app.post("/feedback")
async def receber_feedback(body: FeedbackRequest, request: Request):
    """Recebe feedback de testadores e envia para o grupo Telegram."""
    import os, httpx as _httpx
    token_bot = os.getenv("TELEGRAM_BOT_TOKEN")
    group_id = os.getenv("TELEGRAM_GROUP_CHAT_ID", "-5457537054")

    # Tenta identificar o produtor pelo token
    auth = request.headers.get("Authorization", "")
    produtor_nome = "AnÃ´nimo"
    if auth.startswith("Bearer "):
        try:
            from app.db import get_db
            with get_db() as conn:
                with conn.cursor() as cur:
                    cur.execute(
                        "SELECT nome FROM produtores WHERE api_token=%s LIMIT 1",
                        (auth.split(" ", 1)[1].strip(),)
                    )
                    row = cur.fetchone()
                    if row:
                        produtor_nome = row["nome"]
        except Exception:
            pass

    mensagem = (
        f"ðŸ› *Novo feedback de testador*\n\n"
        f"ðŸ‘¤ Produtor: {produtor_nome}\n"
        f"ðŸ“ PÃ¡gina: {body.pagina or 'nÃ£o informada'}\n"
        f"ðŸ“ DescriÃ§Ã£o:\n{body.descricao}"
    )

    if token_bot:
        try:
            async with _httpx.AsyncClient(timeout=10) as client:
                await client.post(
                    f"https://api.telegram.org/bot{token_bot}/sendMessage",
                    json={"chat_id": group_id, "text": mensagem, "parse_mode": "Markdown"},
                )
        except Exception as e:
            import logging
            logging.getLogger(__name__).error(f"Feedback telegram error: {e}")

    # Envia tambÃ©m por WhatsApp
    try:
        from app.services.whatsapp_service import enviar_whatsapp
        enviar_whatsapp("5598992002705", mensagem.replace("*", ""))
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Feedback whatsapp error: {e}")

    return {"ok": True, "msg": "Feedback recebido. Obrigado!"}

@app.get("/auth/me")
async def auth_me(request: Request):
    """Retorna dados do produtor autenticado via Bearer token."""
    from app.db import get_db
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Token nÃ£o fornecido.")
    token = auth.split(" ", 1)[1].strip()
    with get_db() as conn:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, nome, cpf, telefone, caepf, municipio, uf "
                "FROM produtores WHERE api_token = %s LIMIT 1",
                (token,)
            )
            row = cur.fetchone()
    if not row:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="Token invÃ¡lido.")
    return dict(row)



@app.get("/")
def root():
    return {"status": "Rural Caixa PF online", "version": "2.0"}

@app.get("/regras-classificacao")
def listar_regras_classificacao():
    """Lista todas as regras de classificaÃ§Ã£o aprendidas."""
    import psycopg2, os
    DB_URL = os.getenv("DATABASE_URL")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    try:
        cur.execute("""
            SELECT r.palavra_chave, s.nome as subconta, s.tipo, s.atividade_tipo,
                   r.criado_em, r.atualizado_em
            FROM regras_classificacao r
            LEFT JOIN subcontas s ON s.id = r.subconta_id
            ORDER BY r.atualizado_em DESC
        """)
        rows = cur.fetchall()
        return [
            {
                "palavra_chave": row[0],
                "subconta": row[1],
                "tipo": row[2],
                "atividade": row[3],
                "criado_em": row[4].isoformat() if row[4] else None,
                "atualizado_em": row[5].isoformat() if row[5] else None,
            }
            for row in rows
        ]
    finally:
        cur.close()
        conn.close()

@app.post("/setup-aprendizado")
def setup_aprendizado():
    """Cria as tabelas de aprendizado se nÃ£o existirem. Chamar uma vez apÃ³s deploy."""
    import psycopg2, os
    DB_URL = os.getenv("DATABASE_URL")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    try:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS regras_classificacao (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                palavra_chave VARCHAR(100) NOT NULL UNIQUE,
                subconta_id UUID REFERENCES subcontas(id),
                criado_em TIMESTAMPTZ DEFAULT NOW(),
                atualizado_em TIMESTAMPTZ DEFAULT NOW()
            );
            CREATE TABLE IF NOT EXISTS correcoes_manuais (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                lancamento_id UUID UNIQUE,
                criado_em TIMESTAMPTZ DEFAULT NOW()
            );
        """)
        conn.commit()
        return {"ok": True, "msg": "Tabelas de aprendizado criadas/verificadas"}
    finally:
        cur.close()
        conn.close()

@app.post("/classificar-texto")
def classificar_texto(data: ClassificarTexto):
    resultado = classificar(data.texto)
    if not resultado:
        return {"erro": "Nao foi possivel classificar"}
    return resultado

@app.post("/lancamentos")
def criar_lancamento(data: LancamentoCreate):
    import psycopg2, uuid as _uuid, os
    DB_URL = os.getenv("DATABASE_URL")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    try:
        data_real = data.data or data.data_lancamento or None
        descricao = data.descricao or data.origem or "Outros"

        # 1. Tentar classificar automaticamente via regras aprendidas no banco
        cur.execute(
            "SELECT subconta_id FROM regras_classificacao WHERE palavra_chave = LOWER(%s) LIMIT 1",
            (descricao[:50].lower(),)
        )
        regra = cur.fetchone()

        if regra:
            # Regra aprendida encontrada
            sub_id = regra[0]
            cur.execute("SELECT tipo, atividade_tipo FROM subcontas WHERE id = %s", (sub_id,))
            sub_info = cur.fetchone()
            tipo_raw = sub_info[0] if sub_info else (data.tipo or "despesa").upper()
            atividade_sub = sub_info[1] if sub_info else "RURAL"
        else:
            # 2. Fallback: usar o classificador de regras por palavras-chave
            resultado_classif = classificar(descricao)
            if resultado_classif:
                tipo_raw = resultado_classif["tipo"].upper()
                atividade_sub = resultado_classif.get("atividade", "rural").upper()
                if atividade_sub not in ("RURAL", "INVESTIMENTO"):
                    atividade_sub = "RURAL"
            else:
                tipo_raw = (data.tipo or "despesa").upper()
                atividade_sub = "RURAL" if (data.atividade or "rural").upper() == "RURAL" else "INVESTIMENTO"

            # Buscar ou criar subconta pelo nome + tipo
            cur.execute(
                "SELECT id FROM subcontas WHERE LOWER(nome) LIKE LOWER(%s) AND tipo = %s LIMIT 1",
                (f"%{descricao[:20]}%", tipo_raw)
            )
            sub = cur.fetchone()
            if not sub:
                sub_id = str(_uuid.uuid4())
                cur.execute(
                    "INSERT INTO subcontas (id, nome, tipo, atividade_tipo) VALUES (%s, %s, %s, %s)",
                    (sub_id, descricao[:100], tipo_raw, atividade_sub)
                )
            else:
                sub_id = sub[0]

        lanc_id = str(_uuid.uuid4())
        cur.execute(
            "INSERT INTO lancamentos (id, produtor_id, subconta_id, valor, data, documento_url) VALUES (%s, %s, %s, %s, %s, NULL)",
            (lanc_id, data.produtor_id, sub_id, abs(float(data.valor)), data_real)
        )
        conn.commit()
        return {"id": lanc_id, "subconta_id": sub_id, "tipo_classificado": tipo_raw.lower()}
    finally:
        cur.close()
        conn.close()

@app.get("/wapp/inbound")
async def verify_webhook(
    mode: str = Query(None, alias="hub.mode"),
    token: str = Query(None, alias="hub.verify_token"),
    challenge: str = Query(None, alias="hub.challenge")
):
    print(f"--- TENTATIVA DE VALIDAÃƒâ€¡ÃƒÆ’O ---")
    print(f"Mode: {mode}, Token: {token}, Challenge: {challenge}")
    
    if mode == "subscribe" and token == "campo_digital_2026":
        print("VALIDAÃƒâ€¡ÃƒÆ’O APROVADA!")
        from fastapi.responses import Response
        return Response(content=challenge, media_type="text/plain")
    
    print("VALIDAÃƒâ€¡ÃƒÆ’O FALHOU: Token incorreto ou parÃƒÂ¢metros ausentes.")
    raise HTTPException(status_code=403, detail="Verification failed")

@app.post("/wapp/inbound")
async def wapp_inbound(request: Request, background: BackgroundTasks):
    body = await request.body()
    payload = json.loads(body)
    background.add_task(processar, payload)
    return {"status": "ok"}

@app.post("/ovino/processar-alertas")
async def processar_alertas_ovinos_endpoint(imovel_id: int = None):
    """Processa e envia alertas ovinos via WhatsApp. Chamado pelo cron Railway."""
    if processar_alertas_ovinos:
        return processar_alertas_ovinos(imovel_id=imovel_id)
    return {"erro": "Cron nÃ£o disponÃ­vel"}

@app.post("/caprino/processar-alertas")
async def processar_alertas_caprinos_endpoint(imovel_id: int = None):
    """Processa e envia alertas caprinos via WhatsApp. Chamado pelo cron Railway."""
    if processar_alertas_caprinos:
        return processar_alertas_caprinos(imovel_id=imovel_id)
    return {"erro": "Cron nÃ£o disponÃ­vel"}
@app.post("/suino/processar-alertas")
async def processar_alertas_suinos_endpoint(imovel_id: int = None):
    """Processa e envia alertas suÃ­nos via WhatsApp. Chamado pelo cron Railway."""
    if processar_alertas_suinos:
        return processar_alertas_suinos(imovel_id=imovel_id)
    return {"erro": "Cron nÃ£o disponÃ­vel"}
@app.post("/bovino/processar-alertas")
async def processar_alertas_bovinos_endpoint(imovel_id: int = None):
    """Processa e envia alertas bovinos via WhatsApp. Chamado pelo cron Railway."""
    if processar_alertas_bovinos:
        return processar_alertas_bovinos(imovel_id=imovel_id)
    return {"erro": "Cron nÃ£o disponÃ­vel"}
@app.post("/agricultura/processar-alertas")
async def processar_alertas_agricultura_endpoint(imovel_id: int = None):
    """Processa e envia alertas de agricultura via WhatsApp. Chamado pelo cron Railway."""
    if processar_alertas_agricultura:
        return processar_alertas_agricultura(imovel_id=imovel_id)
    return {"erro": "Cron nÃ£o disponÃ­vel"}
@app.post("/acai/processar-alertas")
async def processar_alertas_acai_endpoint(imovel_id: int = None):
    """Processa e envia alertas de aÃ§aÃ­ via WhatsApp. Chamado pelo cron Railway."""
    if processar_alertas_acai:
        return processar_alertas_acai(imovel_id=imovel_id)
    return {"erro": "Cron nÃ£o disponÃ­vel"}
@app.post("/piscicultura/processar-alertas")
async def processar_alertas_piscicultura_endpoint(imovel_id: int = None):
    """Processa e envia alertas de piscicultura via WhatsApp. Chamado pelo cron Railway."""
    if processar_alertas_piscicultura:
        return processar_alertas_piscicultura(imovel_id=imovel_id)
    return {"erro": "Cron nÃ£o disponÃ­vel"}
@app.post("/cadastro")
async def cadastrar_produtor(data: CadastroRequest):
    from app.db import cadastrar
    result = cadastrar(data.produtor.dict(), data.imovel.dict())
    return {"status": "ok", "produtor_id": result}

@app.get("/imoveis/buscar")
def buscar_imoveis(q: str = ""):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT DISTINCT ON (i.nome) i.nome, i.nirf, i.area_ha, i.municipio, i.uf,
                   MIN(i.id) as id,
                   COUNT(*) as total_produtores
            FROM imoveis_rurais i
            WHERE LOWER(i.nome) LIKE LOWER(:q) OR COALESCE(i.nirf,'') LIKE :q
            GROUP BY i.nome, i.nirf, i.area_ha, i.municipio, i.uf
            ORDER BY i.nome LIMIT 10
        """), {"q": f"%{q}%"}).fetchall()
        return [dict(r._mapping) for r in rows]

@app.get("/produtores")
def get_produtores():
    from app.db import listar_produtores
    produtores = listar_produtores()
    result = []
    for p in produtores:
        result.append({
            "id": p["id"],
            "nome": p["nome"],
            "cpf": p["cpf"],
            "telefone": p["telefone"],
            "municipio": p.get("municipio", ""),
            "uf": p.get("uf", ""),
            "receita": float(p["receita"]),
            "despesa": float(p["despesa"]),
            "pendentes": int(p["pendentes"]),
        })
    return result
@app.get("/produtores/{produtor_id}/analytics")
def get_analytics(produtor_id: int, mes: Optional[str] = None):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        fm = "AND to_char(l.data, 'YYYY-MM') = :mes" if mes else "AND date_trunc('month', l.data) = date_trunc('month', CURRENT_DATE)"
        params = {"pid": produtor_id}
        if mes: params["mes"] = mes
        rec = conn.execute(text(
            "SELECT s.nome as label, SUM(l.valor) as total"
            " FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id"
            " WHERE l.produtor_id = :pid AND s.tipo = 'RECEITA' " + fm +
            " GROUP BY s.nome ORDER BY total DESC"
        ), params).fetchall()
        desp = conn.execute(text(
            "SELECT s.nome as label, SUM(l.valor) as total"
            " FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id"
            " WHERE l.produtor_id = :pid AND s.tipo = 'DESPESA' AND s.atividade_tipo = 'RURAL' " + fm +
            " GROUP BY s.nome ORDER BY total DESC"
        ), params).fetchall()
        inv = conn.execute(text(
            "SELECT s.nome as label, SUM(l.valor) as total"
            " FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id"
            " WHERE l.produtor_id = :pid AND s.atividade_tipo = 'INVESTIMENTO' " + fm +
            " GROUP BY s.nome ORDER BY total DESC"
        ), params).fetchall()
        evo = conn.execute(text(
            "SELECT to_char(l.data, 'YYYY-MM') as mes, LOWER(s.tipo) as tipo, SUM(l.valor) as total"
            " FROM lancamentos l JOIN subcontas s ON s.id = l.subconta_id"
            " WHERE l.produtor_id = :pid AND l.data >= CURRENT_DATE - INTERVAL '6 months'"
            " GROUP BY mes, s.tipo ORDER BY mes"
        ), {"pid": produtor_id}).fetchall()
        return {
            "receitas_por_produto": [{"conta": "", "label": r[0], "total": float(r[1])} for r in rec],
            "despesas_por_categoria": [{"conta": "", "label": d[0], "total": float(d[1])} for d in desp],
            "investimentos": [{"conta": "", "label": i[0], "total": float(i[1])} for i in inv],
            "evolucao_mensal": [{"mes": e[0], "tipo": e[1], "total": float(e[2])} for e in evo],
        }

@app.get("/produtores/{produtor_id}/lancamentos")
def get_lancamentos(produtor_id: int, mes: Optional[str] = None, atividade: Optional[str] = None):
    from app.db import buscar_lancamentos, engine
    from sqlalchemy import text
    lancamentos = buscar_lancamentos(produtor_id, mes, atividade)
    
    # Buscar participaÃƒÂ§ÃƒÂ£o do produtor nos imÃƒÂ³veis
    with engine.connect() as conn:
        imoveis = conn.execute(text("""
            SELECT id, participacao FROM imoveis_rurais WHERE produtor_id = :pid
        """), {"pid": produtor_id}).fetchall()
        participacoes = {i[0]: float(i[1] or 100) for i in imoveis}
        print(f">>> participacoes: {participacoes}")
    
    result = []
    for l in lancamentos:
        imovel_id = l.get("imovel_id")
        perc_proprio = float(l.get("perc_participacao") or 0)
        if perc_proprio > 0 and perc_proprio < 100:
            perc = perc_proprio
        elif participacoes:
            perc = list(participacoes.values())[0]  # usa participacao do primeiro imovel
        else:
            perc = 100
        valor_original = float(l["valor"])
        valor_proporcional = round(valor_original * perc / 100, 2)
        
        result.append({
            "id": l["id"],
            "tipo": l["tipo"],
            "conta_codigo": l["conta_codigo"],
            "descricao": l["descricao"],
            "valor": valor_proporcional,
            "valor_bruto": valor_original,
            "perc_participacao": perc,
            "data_lancamento": str(l["data_lancamento"]),
            "produto": l.get("produto"),
            "documento_url": l.get("documento_url"),
            "confirmado": l.get("confirmado", False),
            "atividade": l.get("atividade", "rural"),
        })
    return result

@app.get("/produtor/imoveis")
def get_imoveis_por_cpf(cpf: str):
    from app.db import buscar_imoveis_por_cpf
    return buscar_imoveis_por_cpf(cpf)

@app.get("/produtores/{produtor_id}/resumo")
def get_resumo(produtor_id: int):
    from app.db import buscar_resumo_mes
    resumo = buscar_resumo_mes(produtor_id)
    return {
        "receita": float(resumo.get("receita", 0)),
        "despesa": float(resumo.get("despesa", 0)),
        "total_lancamentos": int(resumo.get("total_lancamentos", 0)),
        "pendentes": int(resumo.get("pendentes", 0)),
    }

@app.put("/lancamentos/{lancamento_id}/classificacao")
def update_classificacao(lancamento_id: int, data: ClassificacaoUpdate):
    from app.db import atualizar_classificacao
    atualizar_classificacao(lancamento_id, data.conta, data.tipo)
    return {"status": "ok"}

@app.post("/produtores/{produtor_id}/fechar-mes")
def fechar_mes_produtor(produtor_id: int):
    from app.db import fechar_mes
    fechar_mes(produtor_id)
    return {"status": "ok"}

@app.delete("/produtores/{produtor_id}")
def excluir_produtor(produtor_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("DELETE FROM lancamentos WHERE produtor_id = :pid"), {"pid": produtor_id})
        conn.execute(text("DELETE FROM imoveis_rurais WHERE produtor_id = :pid"), {"pid": produtor_id})
        conn.execute(text("DELETE FROM produtores WHERE id = :pid"), {"pid": produtor_id})
        conn.commit()
    return {"status": "ok"}

class ProdutorUpdate(BaseModel):
    nome: str
    telefone: str
    nirf: Optional[str] = None

@app.put("/produtores/{produtor_id}")
def atualizar_produtor(produtor_id: int, data: ProdutorUpdate):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE produtores SET nome = :nome, telefone = :telefone, nirf = :nirf
            WHERE id = :pid
        """), {"nome": data.nome, "telefone": data.telefone, "nirf": data.nirf, "pid": produtor_id})
        conn.commit()
    return {"status": "ok"}

# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ WhatsApp helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async def send_msg(to: str, body: str):
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{GRAPH}/{PHONE_ID}/messages",
            headers={"Authorization": f"Bearer {WAPP_TOKEN}", "Content-Type": "application/json"},
            json={"messaging_product": "whatsapp", "recipient_type": "individual", "to": to, "type": "text", "text": {"body": body}}
        )

# Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Processamento WhatsApp Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

async def processar(payload: dict):
    print(f">>> processar chamado: {json.dumps(payload)[:200]}")
    try:
        value = payload["entry"][0]["changes"][0]["value"]
        msgs  = value.get("messages", [])
        if not msgs:
            return
        msg    = msgs[0]
        numero = msg["from"]
        tipo   = msg["type"]

        if tipo == "audio":
            await send_msg(numero, "Audio recebido! Transcrevendo...")
            from app.services.audio_handler import processar_audio
            await processar_audio(numero, msg, WAPP_TOKEN, sessoes, send_msg)
            return

        if tipo == "text":
            texto = msg["text"]["body"].strip()
            print(f">>> texto recebido: {texto}")
            texto_upper = texto.upper()

            # Deteccao ovino
            keywords_ovino = ["brinco", "ovino", "ovelha", "cordeiro", "carneiro",
                              "pesagem", "vacina", "vermifug", "parto", "monta", "famacha",
                              "abate", "desmame"]
            if any(k in texto.lower() for k in keywords_ovino):
                from app.routers.ovino import webhook_whatsapp_ovino, WhatsAppMensagem
                from app.db import engine
                from sqlalchemy import text as sqlt
                with engine.connect() as conn:
                    row = conn.execute(sqlt(
                        "SELECT id FROM imoveis_rurais WHERE produtor_id = (SELECT id FROM produtores WHERE telefone LIKE :tel LIMIT 1) LIMIT 1"
                    ), {"tel": "%{}".format(numero[-8:])}).fetchone()
                    imovel_id = row[0] if row else 1
                payload_ovino = WhatsAppMensagem(telefone=numero, tipo_midia="texto", conteudo=texto, imovel_id=imovel_id)
                resultado = webhook_whatsapp_ovino(payload_ovino)
                await send_msg(numero, resultado["resumo"])
                return

            # Deteccao caprino
            keywords_caprino = ["caprino", "cabra", "cabrito", "bode", "caprinocultura",
                                "leite de cabra", "queijo", "cabrinha"]
            if any(k in texto.lower() for k in keywords_caprino):
                from app.routers.caprino import webhook_whatsapp_caprino, WhatsAppMensagem as CaprinoMensagem
                from app.db import engine
                from sqlalchemy import text as sqlt
                with engine.connect() as conn:
                    row = conn.execute(sqlt(
                        "SELECT id FROM imoveis_rurais WHERE produtor_id = (SELECT id FROM produtores WHERE telefone LIKE :tel LIMIT 1) LIMIT 1"
                    ), {"tel": "%{}".format(numero[-8:])}).fetchone()
                    imovel_id = row[0] if row else 1
                payload_caprino = CaprinoMensagem(telefone=numero, tipo_midia="texto", conteudo=texto, imovel_id=imovel_id)
                resultado = webhook_whatsapp_caprino(payload_caprino)
                await send_msg(numero, resultado["resumo"])
                return

            if numero in sessoes and sessoes[numero].get("_tipo") != "cadastro":
                if texto_upper in ("SIM", "S", "OK", "CONFIRMA"):
                    sess = sessoes.pop(numero)
                    sess["numero"] = numero
                    from app.db import gravar_lancamento
                    lancamento_id = gravar_lancamento(sess)

                    if "_midia" in sess:
                        try:
                            from app.services.drive_handler import upload_para_drive, extensao_por_mime
                            from app.db import vincular_documento
                            from datetime import datetime
                            ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                            ext = extensao_por_mime(sess["_mime"])
                            nome_arquivo = f"{numero}_{ts}{ext}"
                            url_drive = upload_para_drive(sess["_midia"], nome_arquivo, sess["_mime"], subfolder_name=numero)
                            vincular_documento(lancamento_id, url_drive)
                        except Exception as e:
                            print(f"Erro upload drive: {e}")

                    produto_txt = sess.get("produto") or "N/A"
                    resposta = (
                        f"Lancamento #{lancamento_id} gravado!\n"
                        f"Tipo: {sess['tipo'].upper()}\n"
                        f"Conta: {sess['conta']}\n"
                        f"Produto: {produto_txt}\n"
                        f"Valor: R$ {sess['valor']:,.2f}\n"
                        f"Data: {sess['data']}\n\n"
                        f"Envie a foto ou PDF do comprovante para vincular ao lancamento."
                    )
                    await send_msg(numero, resposta)
                    return
                elif texto_upper in ("NAO", "N", "CANCELA"):
                    sessoes.pop(numero)
                    await send_msg(numero, "Cancelado. Pode mandar de novo quando quiser.")
                    return

            from app.services.cadastro_handler import (
                iniciar_cadastro, processar_etapa, confirmar_cadastro, is_cadastro_ativo
            )

            if is_cadastro_ativo(sessoes, numero):
                if texto_upper in ("SIM", "S", "OK", "CONFIRMA"):
                    dados = confirmar_cadastro(sessoes, numero)
                    if dados:
                        from app.db import cadastrar
                        try:
                            produtor_id = cadastrar(dados["produtor"], dados["imovel"])
                            await send_msg(numero,
                                f"Cadastro realizado com sucesso!\n"
                                f"Seu ID: #{produtor_id}\n\n"
                                f"Agora voce pode enviar lancamentos por texto ou audio.\n"
                                f"Ex: 'vendi 10 sacas de soja por 3000 reais'"
                            )
                        except Exception as e:
                            print(f"Erro cadastro: {e}")
                            await send_msg(numero, "Erro ao cadastrar. Tente novamente.")
                else:
                    resposta = processar_etapa(sessoes, numero, texto)
                    if resposta:
                        await send_msg(numero, resposta)
                return

            if texto_upper in ("CADASTRAR", "CADASTRO", "ME CADASTRAR", "QUERO ME CADASTRAR",
                               "OI", "OLA", "INICIO"):
                from app.db import buscar_produtor_por_numero
                prod = buscar_produtor_por_numero(numero)
                if prod:
                    await send_msg(numero,
                        f"Ola, {prod['nome']}! Voce ja esta cadastrado.\n\n"
                        f"Envie um lancamento por texto ou audio, ou mande a foto de uma nota fiscal."
                    )
                    return
                resposta = iniciar_cadastro(sessoes, numero)
                await send_msg(numero, resposta)
                return

            resultado = classificar(texto)
            print(f">>> resultado classificar: {resultado}")
            if not resultado:
                await send_msg(numero, "Nao entendi. Tente: 'vendi 5 bois por 10000 reais'")
                return

            sessoes[numero] = resultado
            if resultado["tipo"] == "receita":
                tipo_label = "[RECEITA]"
            elif resultado["tipo"] == "despesa":
                tipo_label = "[DESPESA]"
            else:
                tipo_label = "[INVESTIMENTO]"

            produto_txt = resultado.get("produto") or "N/A"
            msg_resposta = (
                f"Recebi! Lancamento sugerido:\n\n"
                f"{tipo_label} {resultado['tipo'].upper()}\n"
                f"Valor: R$ {resultado['valor']:,.2f}\n"
                f"Conta: {resultado['conta']}\n"
                f"Produto: {produto_txt}\n"
                f"Confianca: {resultado['confianca']}%\n\n"
                f"Responda SIM para confirmar ou NAO para cancelar."
            )
            await send_msg(numero, msg_resposta)

        elif tipo in ("image", "document"):
            await send_msg(numero, "Documento recebido! Analisando...")
            try:
                from app.services.drive_handler import baixar_midia_whatsapp, upload_para_drive, extensao_por_mime
                from app.services.ocr_handler import extrair_dados_documento, montar_mensagem_ocr, ocr_para_lancamento

                if tipo == "image":
                    media_id  = msg["image"]["id"]
                    mime_type = msg["image"].get("mime_type", "image/jpeg")
                else:
                    media_id  = msg["document"]["id"]
                    mime_type = msg["document"].get("mime_type", "application/pdf")

                conteudo, mime_type = await baixar_midia_whatsapp(media_id, WAPP_TOKEN)
                dados_ocr = await extrair_dados_documento(conteudo, mime_type)
                lancamento = ocr_para_lancamento(dados_ocr)
                sessoes[numero] = {**lancamento, "_ocr": dados_ocr, "_midia": conteudo, "_mime": mime_type}
                msg_confirmacao = montar_mensagem_ocr(dados_ocr, numero)
                await send_msg(numero, msg_confirmacao)

            except Exception as e:
                import traceback
                traceback.print_exc()
                print(f"Erro no OCR: {e}")
                await send_msg(numero, "Nao consegui ler o documento. Tente uma foto mais nitida ou digite o lancamento.")

        else:
            await send_msg(numero, "Envie texto, audio ou foto de documento.")

    except Exception as e:
        import traceback
        print(f"Erro: {e}")
        traceback.print_exc()

@app.get("/produtores/{produtor_id}/dre")
def get_dre(
    produtor_id: int,
    view_type: str = Query("managerial", regex="^(fiscal|managerial|custom)$"),
    year: Optional[int] = Query(None),
    start_date: Optional[date] = Query(None),
    end_date: Optional[date] = Query(None),
    visao_integral: bool = Query(False),
):
    from app.db import engine
    from app.services.dre_service import gerar_dre
    try:
        return gerar_dre(
            engine=engine,
            produtor_id=produtor_id,
            view_type=view_type,
            year=year,
            start_date=start_date,
            end_date=end_date,
            visao_integral=visao_integral,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/produtores/{produtor_id}/dre/periodos")
def get_dre_periodos(produtor_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT DISTINCT EXTRACT(YEAR FROM data_lancamento)::int AS ano
            FROM lancamentos
            WHERE produtor_id = :pid
            ORDER BY ano
        """), {"pid": produtor_id}).fetchall()
        anos = [r[0] for r in rows]
        safras = [f"{a}/{a+1}" for a in anos]
        return {"anos_fiscais": anos, "safras": safras}

@app.get("/imoveis/{imovel_id}/participacoes/resumo")
def get_participacoes_resumo(imovel_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT pi.produtor_id, pi.percentual, pi.nome_participante,
                   COALESCE(p.nome, pi.nome_participante) as nome,
                   pi.vigencia_inicio, pi.vigencia_fim
            FROM participacoes_imovel pi
            LEFT JOIN produtores p ON p.id = pi.produtor_id
            WHERE pi.imovel_id = :iid
              AND (pi.vigencia_fim IS NULL OR pi.vigencia_fim >= CURRENT_DATE)
            ORDER BY pi.percentual DESC
        """), {"iid": imovel_id}).fetchall()

        total = sum(float(r[1]) for r in rows)
        return {
            "imovel_id": imovel_id,
            "total_percentual": round(total, 2),
            "ok": abs(total - 100) < 0.5,
            "participantes": [
                {"produtor_id": r[0], "percentual": float(r[1]),
                 "nome": r[3], "vigencia_fim": str(r[5]) if r[5] else None}
                for r in rows
            ]
        }



@app.get("/imoveis/{imovel_id}/terceiros/validacao")
def get_terceiros_validacao(imovel_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        terceiros = conn.execute(text(
            "SELECT id, nome_contraparte, id_contraparte, tipo_contraparte, perc_contraparte FROM terceiros WHERE imovel_id = :iid"
        ), {"iid": imovel_id}).fetchall()
        part = conn.execute(text(
            "SELECT COALESCE(SUM(percentual),0) FROM participacoes_imovel WHERE imovel_id = :iid AND vigencia_fim IS NULL"
        ), {"iid": imovel_id}).scalar()
        part_count = conn.execute(text(
            "SELECT COUNT(*) FROM participacoes_imovel WHERE imovel_id = :iid AND vigencia_fim IS NULL"
        ), {"iid": imovel_id}).scalar()
        if part_count > 0:
            total_geral = round(float(part), 2)
        else:
            total_terc = sum(float(r[4] or 0) for r in terceiros)
            total_geral = round(total_terc, 2)
        return {
            "imovel_id": imovel_id,
            "total_participacoes": round(float(part), 2),
            "total_terceiros": round(sum(float(r[4] or 0) for r in terceiros), 2),
            "total_geral": total_geral,
            "total_ok": abs(total_geral - 100) < 0.5,
            "terceiros": [
                {"id": r[0], "nome": r[1], "documento": r[2],
                 "tipo": r[3], "percentual": float(r[4] or 0)}
                for r in terceiros
            ]
        }# Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
# PATCH main.py Ã¢â‚¬â€ NF-e Produtor Rural
# Cole no final do main.py (antes da funÃƒÂ§ÃƒÂ£o processar)
# Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â

# Ã¢â€â‚¬Ã¢â€â‚¬ Models Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

class NFeConfigUpdate(BaseModel):
    inscricao_estadual: Optional[str] = None
    caepf: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = None
    cep: Optional[str] = None
    endereco: Optional[str] = None
    numero: Optional[str] = None
    bairro: Optional[str] = None
    serie: Optional[str] = "001"
    ambiente: Optional[str] = "2"

class DestinatarioCreate(BaseModel):
    tipo_doc: str = "F"
    documento: str
    razao_social: str
    ie: Optional[str] = None
    municipio: Optional[str] = None
    uf: Optional[str] = None
    cep: Optional[str] = None
    endereco: Optional[str] = None
    numero: Optional[str] = None
    bairro: Optional[str] = None
    telefone: Optional[str] = None
    email: Optional[str] = None

class ProdutoNFeCreate(BaseModel):
    codigo: Optional[str] = None
    descricao: str
    ncm: Optional[str] = None
    cfop: str = "5101"
    unidade: str = "KG"
    preco_unitario: Optional[float] = None

class ItemNFeCreate(BaseModel):
    produto_id: Optional[int] = None
    descricao: str
    ncm: Optional[str] = None
    cfop: str = "5101"
    unidade: str = "KG"
    quantidade: float
    valor_unitario: float
    valor_desconto: float = 0.0

class NFeCreate(BaseModel):
    destinatario_id: int
    natureza_operacao: str = "Venda de Producao do Estabelecimento"
    cfop: str = "5101"
    data_emissao: Optional[str] = None
    data_saida: Optional[str] = None
    valor_frete: float = 0.0
    valor_seguro: float = 0.0
    valor_desconto: float = 0.0
    aliquota_funrural: float = 1.50
    aliquota_senar: float = 0.20
    modalidade_frete: int = 9
    informacoes_adicionais: Optional[str] = None
    lancamento_id: Optional[int] = None
    itens: List[ItemNFeCreate]

# Ã¢â€â‚¬Ã¢â€â‚¬ Endpoints NF-e Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

@app.get("/produtores/{produtor_id}/nfe/config")
def get_nfe_config(produtor_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        p = conn.execute(text(
            "SELECT id,nome,cpf,inscricao_estadual,caepf,municipio,uf,cep,endereco,numero,bairro FROM produtores WHERE id=:pid"
        ), {"pid": produtor_id}).fetchone()
        if not p: raise HTTPException(404, "Produtor nao encontrado")
        cfg = conn.execute(text(
            "SELECT serie,proxima_numero,ambiente FROM nfe_config WHERE produtor_id=:pid"
        ), {"pid": produtor_id}).fetchone()
        return {
            "produtor": dict(p._mapping),
            "config": dict(cfg._mapping) if cfg else {"serie":"001","proxima_numero":1,"ambiente":"2"},
        }

@app.put("/produtores/{produtor_id}/nfe/config")
def update_nfe_config(produtor_id: int, data: NFeConfigUpdate):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE produtores SET
                inscricao_estadual=COALESCE(:ie, inscricao_estadual),
                caepf=COALESCE(:caepf, caepf),
                municipio=COALESCE(:municipio, municipio),
                uf=COALESCE(:uf, uf),
                cep=COALESCE(:cep, cep),
                endereco=COALESCE(:endereco, endereco),
                numero=COALESCE(:numero, numero),
                bairro=COALESCE(:bairro, bairro)
            WHERE id=:pid
        """), {"ie":data.inscricao_estadual,"caepf":data.caepf,"municipio":data.municipio,
               "uf":data.uf,"cep":data.cep,"endereco":data.endereco,"numero":data.numero,
               "bairro":data.bairro,"pid":produtor_id})
        conn.execute(text("""
            INSERT INTO nfe_config (produtor_id, serie, ambiente)
            VALUES (:pid, :serie, :amb)
            ON CONFLICT (produtor_id) DO UPDATE SET serie=:serie, ambiente=:amb
        """), {"pid":produtor_id,"serie":data.serie,"amb":data.ambiente})
        conn.commit()
    return {"status":"ok"}

@app.get("/produtores/{produtor_id}/nfe/destinatarios")
def get_destinatarios(produtor_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT * FROM nfe_destinatarios WHERE produtor_id=:pid AND ativo=TRUE ORDER BY razao_social"
        ), {"pid": produtor_id}).fetchall()
        return [dict(r._mapping) for r in rows]

@app.post("/produtores/{produtor_id}/nfe/destinatarios")
def create_destinatario(produtor_id: int, data: DestinatarioCreate):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        result = conn.execute(text("""
            INSERT INTO nfe_destinatarios
                (produtor_id,tipo_doc,documento,razao_social,ie,municipio,uf,cep,endereco,numero,bairro,telefone,email)
            VALUES (:pid,:tipo,:doc,:nome,:ie,:mun,:uf,:cep,:end,:num,:bairro,:tel,:email)
            RETURNING id
        """), {"pid":produtor_id,"tipo":data.tipo_doc,"doc":data.documento,"nome":data.razao_social,
               "ie":data.ie,"mun":data.municipio,"uf":data.uf,"cep":data.cep,
               "end":data.endereco,"num":data.numero,"bairro":data.bairro,
               "tel":data.telefone,"email":data.email})
        conn.commit()
        return {"id": result.fetchone()[0]}

@app.get("/produtores/{produtor_id}/nfe/produtos")
def get_produtos_nfe(produtor_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text(
            "SELECT * FROM nfe_produtos WHERE produtor_id=:pid AND ativo=TRUE ORDER BY descricao"
        ), {"pid": produtor_id}).fetchall()
        return [dict(r._mapping) for r in rows]

@app.post("/produtores/{produtor_id}/nfe/produtos")
def create_produto_nfe(produtor_id: int, data: ProdutoNFeCreate):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        result = conn.execute(text("""
            INSERT INTO nfe_produtos (produtor_id,codigo,descricao,ncm,cfop,unidade,preco_unitario)
            VALUES (:pid,:cod,:desc,:ncm,:cfop,:un,:preco) RETURNING id
        """), {"pid":produtor_id,"cod":data.codigo,"desc":data.descricao,"ncm":data.ncm,
               "cfop":data.cfop,"un":data.unidade,"preco":data.preco_unitario})
        conn.commit()
        return {"id": result.fetchone()[0]}

@app.get("/produtores/{produtor_id}/nfe/notas")
def get_notas(produtor_id: int, status: Optional[str] = None):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        filtro = "AND n.status=:status" if status else ""
        rows = conn.execute(text(f"""
            SELECT n.*, d.razao_social as destinatario_nome
            FROM nfe_notas n
            LEFT JOIN nfe_destinatarios d ON d.id=n.destinatario_id
            WHERE n.produtor_id=:pid {filtro}
            ORDER BY n.numero DESC
        """), {"pid":produtor_id, "status":status}).fetchall()
        return [dict(r._mapping) for r in rows]

@app.post("/produtores/{produtor_id}/nfe/notas")
def create_nota(produtor_id: int, data: NFeCreate):
    from app.db import engine
    from sqlalchemy import text
    from app.services.nfe_service import calcular_impostos
    with engine.connect() as conn:
        # PrÃƒÂ³ximo nÃƒÂºmero
        cfg = conn.execute(text(
            "SELECT serie, proxima_numero FROM nfe_config WHERE produtor_id=:pid"
        ), {"pid":produtor_id}).fetchone()
        serie = cfg[0] if cfg else "001"
        numero = cfg[1] if cfg else 1

        # Calcula totais
        valor_produtos = sum(
            round(item.quantidade * item.valor_unitario - item.valor_desconto, 2)
            for item in data.itens
        )
        funrural, senar = calcular_impostos(valor_produtos, data.aliquota_funrural, data.aliquota_senar)
        valor_total = round(valor_produtos + data.valor_frete + data.valor_seguro - data.valor_desconto, 2)

        # Insere nota
        result = conn.execute(text("""
            INSERT INTO nfe_notas (
                produtor_id, destinatario_id, numero, serie, data_emissao, data_saida,
                natureza_operacao, cfop, valor_produtos, valor_frete, valor_seguro,
                valor_desconto, valor_total, valor_funrural, valor_senar,
                aliquota_funrural, aliquota_senar, modalidade_frete,
                informacoes_adicionais, lancamento_id, status
            ) VALUES (
                :pid,:dest,:num,:serie,:demissao,:dsaida,
                :nat,:cfop,:vprod,:vfrete,:vseguro,
                :vdesc,:vtotal,:vfunrural,:vsenar,
                :afunrural,:asenar,:mfrete,
                :info,:lanc,'rascunho'
            ) RETURNING id
        """), {
            "pid":produtor_id,"dest":data.destinatario_id,"num":numero,"serie":serie,
            "demissao":data.data_emissao or date.today().isoformat(),
            "dsaida":data.data_saida,
            "nat":data.natureza_operacao,"cfop":data.cfop,
            "vprod":valor_produtos,"vfrete":data.valor_frete,"vseguro":data.valor_seguro,
            "vdesc":data.valor_desconto,"vtotal":valor_total,
            "vfunrural":funrural,"vsenar":senar,
            "afunrural":data.aliquota_funrural,"asenar":data.aliquota_senar,
            "mfrete":data.modalidade_frete,"info":data.informacoes_adicionais,
            "lanc":data.lancamento_id,
        })
        nota_id = result.fetchone()[0]

        # Insere itens
        for i, item in enumerate(data.itens, 1):
            prod = None
            if item.produto_id:
                prod = conn.execute(text(
                    "SELECT ncm, cfop, unidade FROM nfe_produtos WHERE id=:id"
                ), {"id": item.produto_id}).fetchone()
            conn.execute(text("""
                INSERT INTO nfe_itens
                    (nota_id,produto_id,numero_item,descricao,ncm,cfop,unidade,quantidade,valor_unitario,valor_total,valor_desconto)
                VALUES (:nota,:prod,:num,:desc,:ncm,:cfop,:un,:qtd,:vunit,:vtotal,:vdesc)
            """), {
                "nota":nota_id,"prod":item.produto_id,"num":i,"desc":item.descricao,
                "ncm":item.ncm or (prod[0] if prod else None),
                "cfop":item.cfop or (prod[1] if prod else "5101"),
                "un":item.unidade or (prod[2] if prod else "KG"),
                "qtd":item.quantidade,"vunit":item.valor_unitario,
                "vtotal":round(item.quantidade*item.valor_unitario - item.valor_desconto, 2),
                "vdesc":item.valor_desconto,
            })

        # Incrementa prÃƒÂ³ximo nÃƒÂºmero
        conn.execute(text(
            "UPDATE nfe_config SET proxima_numero=:n WHERE produtor_id=:pid"
        ), {"n":numero+1,"pid":produtor_id})
        conn.commit()
        return {"id": nota_id, "numero": numero, "valor_total": valor_total,
                "valor_funrural": funrural, "valor_senar": senar}

@app.get("/nfe/notas/{nota_id}")
def get_nota(nota_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        nota = conn.execute(text("SELECT * FROM nfe_notas WHERE id=:id"), {"id":nota_id}).fetchone()
        if not nota: raise HTTPException(404, "Nota nao encontrada")
        itens = conn.execute(text("SELECT * FROM nfe_itens WHERE nota_id=:id ORDER BY numero_item"), {"id":nota_id}).fetchall()
        dest = conn.execute(text("SELECT * FROM nfe_destinatarios WHERE id=:id"), {"id":nota.destinatario_id}).fetchone() if nota.destinatario_id else None
        return {
            "nota": dict(nota._mapping),
            "itens": [dict(i._mapping) for i in itens],
            "destinatario": dict(dest._mapping) if dest else None,
        }

@app.put("/nfe/notas/{nota_id}/status")
def update_nota_status(nota_id: int, status: str):
    if status not in ("rascunho","emitida","cancelada"):
        raise HTTPException(400, "Status invalido")
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        conn.execute(text("UPDATE nfe_notas SET status=:s WHERE id=:id"), {"s":status,"id":nota_id})
        conn.commit()
    return {"status":"ok"}

@app.get("/nfe/notas/{nota_id}/pdf")
def get_nota_pdf(nota_id: int):
    from app.db import engine
    from sqlalchemy import text
    from app.services.nfe_service import gerar_pdf_danfe
    from fastapi.responses import Response
    with engine.connect() as conn:
        nota = conn.execute(text("SELECT * FROM nfe_notas WHERE id=:id"), {"id":nota_id}).fetchone()
        if not nota: raise HTTPException(404, "Nota nao encontrada")
        itens = conn.execute(text("SELECT * FROM nfe_itens WHERE nota_id=:id ORDER BY numero_item"), {"id":nota_id}).fetchall()
        dest = conn.execute(text("SELECT * FROM nfe_destinatarios WHERE id=:id"), {"id":nota.destinatario_id}).fetchone() if nota.destinatario_id else {}
        prod = conn.execute(text("SELECT * FROM produtores WHERE id=:id"), {"id":nota.produtor_id}).fetchone()

    try:
        pdf = gerar_pdf_danfe(
            nota=dict(nota._mapping),
            produtor=dict(prod._mapping),
            destinatario=dict(dest._mapping) if dest else {},
            itens=[dict(i._mapping) for i in itens],
        )
        numero = str(nota.numero).zfill(6)
        return Response(
            content=pdf,
            media_type="application/pdf",
            headers={"Content-Disposition": f"attachment; filename=nfe_{numero}.pdf"}
        )
    except Exception as e:
        raise HTTPException(500, str(e))


# nfe-deploy-trigger
# req-fix

from fastapi import UploadFile, File

@app.post("/lancamentos/{lancamento_id}/documento")
async def upload_documento(lancamento_id: str, file: UploadFile = File(...)):
    import psycopg2, os
    from app.services.r2_service import upload_documento as r2_upload
    DB_URL = os.getenv("DATABASE_URL")
    conteudo = await file.read()
    mime_type = file.content_type or "application/octet-stream"
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    try:
        cur.execute("SELECT produtor_id FROM lancamentos WHERE id = %s::uuid", (lancamento_id,))
        lanc = cur.fetchone()
        if not lanc:
            raise HTTPException(404, "Lancamento nao encontrado")
        produtor_id = lanc[0]
        url = r2_upload(conteudo, mime_type, produtor_id, lancamento_id, file.filename)
        cur.execute("UPDATE lancamentos SET documento_url = %s WHERE id = %s::uuid", (url, lancamento_id))
        conn.commit()
        return {"status": "ok", "documento_url": url, "arquivo": file.filename}
    finally:
        cur.close()
        conn.close()

@app.get("/lancamentos/{lancamento_id}/documento")
def get_documento(lancamento_id: str):
    import psycopg2, os
    DB_URL = os.getenv("DATABASE_URL")
    conn = psycopg2.connect(DB_URL)
    cur = conn.cursor()
    try:
        cur.execute("SELECT documento_url, descricao FROM lancamentos WHERE id = %s::uuid", (lancamento_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Lancamento nao encontrado")
        return {"lancamento_id": lancamento_id, "descricao": row[1], "documento_url": row[0]}
    finally:
        cur.close()
        conn.close()
# r2-deploy
# deploy-r2-v2


# Ã¢â€â‚¬Ã¢â€â‚¬ eSocial Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

from fastapi import Body

@app.get("/produtores/{produtor_id}/esocial/config")
def get_esocial_config(produtor_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        cfg = conn.execute(text("SELECT * FROM esocial_config WHERE produtor_id=:id"), {"id": produtor_id}).fetchone()
        prod = conn.execute(text("SELECT nome, cpf FROM produtores WHERE id=:id"), {"id": produtor_id}).fetchone()
        if not prod: raise HTTPException(404, "Produtor nao encontrado")
        return {
            "produtor": {"id": produtor_id, "nome": prod[0], "cpf": prod[1]},
            "config": {"ambiente": cfg[2] if cfg else "2", "versao_layout": cfg[3] if cfg else "S-1.3"}
        }

@app.get("/produtores/{produtor_id}/esocial/trabalhadores")
def listar_trabalhadores(produtor_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        sql = "SELECT id, nome, cpf, cargo, data_admissao, data_demissao, ativo, categoria, municipio, uf FROM esocial_trabalhadores WHERE produtor_id=:id ORDER BY nome"
        rows = conn.execute(text(sql), {"id": produtor_id}).fetchall()
        return [{"id": r[0], "nome": r[1], "cpf": r[2], "cargo": r[3],
                 "data_admissao": str(r[4]), "data_demissao": str(r[5]) if r[5] else None,
                 "ativo": r[6], "categoria": r[7], "municipio": r[8], "uf": r[9]} for r in rows]

@app.post("/produtores/{produtor_id}/esocial/trabalhadores")
def criar_trabalhador(produtor_id: int, dados: dict = Body(...)):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        sql = "INSERT INTO esocial_trabalhadores (produtor_id, imovel_id, cpf, nome, data_nascimento, data_admissao, cargo, cbo, categoria, municipio, uf) VALUES (:pid, :iid, :cpf, :nome, :nasc, :adm, :cargo, :cbo, :cat, :mun, :uf) RETURNING id"
        row = conn.execute(text(sql), {
            "pid": produtor_id, "iid": dados.get("imovel_id"),
            "cpf": dados["cpf"], "nome": dados["nome"],
            "nasc": dados.get("data_nascimento"), "adm": dados["data_admissao"],
            "cargo": dados.get("cargo", "Trabalhador Rural"), "cbo": dados.get("cbo", "613005"),
            "cat": dados.get("categoria", "701"), "mun": dados.get("municipio"), "uf": dados.get("uf")
        })
        conn.commit()
        return {"id": row.fetchone()[0]}

@app.get("/produtores/{produtor_id}/esocial/s1260")
def listar_s1260(produtor_id: int, per_apur: str = None):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        q = "SELECT id, per_apur, nif_adquirente, nome_adquirente, vr_bruto_comerc, vr_rat, vr_senar, status FROM esocial_s1260 WHERE produtor_id=:id"
        params = {"id": produtor_id}
        if per_apur:
            q += " AND per_apur=:per"
            params["per"] = per_apur
        q += " ORDER BY per_apur DESC"
        rows = conn.execute(text(q), params).fetchall()
        return [{"id": r[0], "per_apur": r[1], "nif_adquirente": r[2],
                 "nome_adquirente": r[3], "vr_bruto_comerc": float(r[4]),
                 "vr_rat": float(r[5]), "vr_senar": float(r[6]), "status": r[7]} for r in rows]

@app.post("/produtores/{produtor_id}/esocial/s1260")
def criar_s1260(produtor_id: int, dados: dict = Body(...)):
    from app.db import engine
    from sqlalchemy import text
    vr = float(dados["vr_bruto_comerc"])
    aliq_rat = float(dados.get("aliq_rat", 1.5))
    aliq_senar = float(dados.get("aliq_senar", 0.2))
    vr_rat = round(vr * aliq_rat / 100, 2)
    vr_senar = round(vr * aliq_senar / 100, 2)
    with engine.connect() as conn:
        sql = "INSERT INTO esocial_s1260 (produtor_id, imovel_id, per_apur, tipo_insc_adq, nif_adquirente, nome_adquirente, vr_bruto_comerc, vr_rat, vr_senar, aliq_rat, aliq_senar, lancamento_id) VALUES (:pid, :iid, :per, :tipo, :nif, :nome, :vr, :rat, :senar, :arat, :asenar, :lid) RETURNING id"
        row = conn.execute(text(sql), {
            "pid": produtor_id, "iid": dados.get("imovel_id"),
            "per": dados["per_apur"], "tipo": dados.get("tipo_insc_adq", "2"),
            "nif": dados["nif_adquirente"], "nome": dados.get("nome_adquirente"),
            "vr": vr, "rat": vr_rat, "senar": vr_senar,
            "arat": aliq_rat, "asenar": aliq_senar, "lid": dados.get("lancamento_id")
        })
        conn.commit()
        return {"id": row.fetchone()[0], "vr_rat": vr_rat, "vr_senar": vr_senar}

@app.get("/produtores/{produtor_id}/esocial/s1200")
def listar_s1200(produtor_id: int, per_apur: str = None):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        q = "SELECT s.id, s.per_apur, t.nome, t.cpf, s.vr_salario, s.vr_desconto_inss, s.vr_liquido, s.qtd_dias_trab, s.status FROM esocial_s1200 s JOIN esocial_trabalhadores t ON t.id=s.trabalhador_id WHERE s.produtor_id=:id"
        params = {"id": produtor_id}
        if per_apur:
            q += " AND s.per_apur=:per"
            params["per"] = per_apur
        q += " ORDER BY s.per_apur DESC, t.nome"
        rows = conn.execute(text(q), params).fetchall()
        return [{"id": r[0], "per_apur": r[1], "nome": r[2], "cpf": r[3],
                 "vr_salario": float(r[4]), "vr_desconto_inss": float(r[5]),
                 "vr_liquido": float(r[6]), "qtd_dias_trab": r[7], "status": r[8]} for r in rows]

@app.post("/produtores/{produtor_id}/esocial/s1200")
def criar_s1200(produtor_id: int, dados: dict = Body(...)):
    from app.db import engine
    from sqlalchemy import text
    vr_sal = float(dados["vr_salario"])
    inss = round(vr_sal * 0.09, 2)
    liquido = round(vr_sal - inss, 2)
    with engine.connect() as conn:
        sql = "INSERT INTO esocial_s1200 (produtor_id, trabalhador_id, per_apur, vr_salario, vr_desconto_inss, vr_liquido, qtd_dias_trab) VALUES (:pid, :tid, :per, :sal, :inss, :liq, :dias) RETURNING id"
        row = conn.execute(text(sql), {
            "pid": produtor_id, "tid": dados["trabalhador_id"],
            "per": dados["per_apur"], "sal": vr_sal,
            "inss": dados.get("vr_desconto_inss", inss),
            "liq": dados.get("vr_liquido", liquido),
            "dias": dados.get("qtd_dias_trab", 30)
        })
        conn.commit()
        return {"id": row.fetchone()[0], "vr_desconto_inss": inss, "vr_liquido": liquido}

@app.get("/produtores/{produtor_id}/esocial/resumo")
def resumo_esocial(produtor_id: int, per_apur: str = None):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        p = {"id": produtor_id}
        filtro = " AND per_apur=:per" if per_apur else ""
        if per_apur: p["per"] = per_apur
        r1 = conn.execute(text(f"SELECT COUNT(*), COALESCE(SUM(vr_bruto_comerc),0), COALESCE(SUM(vr_rat),0), COALESCE(SUM(vr_senar),0) FROM esocial_s1260 WHERE produtor_id=:id{filtro}"), p).fetchone()
        r2 = conn.execute(text(f"SELECT COUNT(*), COALESCE(SUM(vr_salario),0), COALESCE(SUM(vr_desconto_inss),0), COALESCE(SUM(vr_liquido),0) FROM esocial_s1200 WHERE produtor_id=:id{filtro}"), p).fetchone()
        r3 = conn.execute(text("SELECT COUNT(*) FROM esocial_trabalhadores WHERE produtor_id=:id AND ativo=TRUE"), {"id": produtor_id}).fetchone()
        return {
            "per_apur": per_apur or "todos",
            "s1260": {"qtd": r1[0], "vr_bruto": float(r1[1]), "vr_rat": float(r1[2]), "vr_senar": float(r1[3])},
            "s1200": {"qtd": r2[0], "vr_salarios": float(r2[1]), "vr_inss": float(r2[2]), "vr_liquido": float(r2[3])},
            "trabalhadores_ativos": r3[0]
        }
# esocial-deploy
# esocial-v3
# dre-fix


# Ã¢â€â‚¬Ã¢â€â‚¬ Aportes de Capital e Participacao Dinamica Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

@app.post("/imoveis/{imovel_id}/aportes")
def registrar_aporte(imovel_id: int, dados: dict = Body(...)):
    from app.db import engine
    from sqlalchemy import text
    from datetime import date
    produtor_id = dados['produtor_id']
    valor = float(dados['valor'])
    data_aporte = dados.get('data_aporte', date.today().isoformat())
    descricao = dados.get('descricao', 'Aporte de capital')
    with engine.connect() as conn:
        conn.execute(text('INSERT INTO aportes_capital (imovel_id, produtor_id, valor, data_aporte, descricao) VALUES (:iid, :pid, :valor, :data, :desc)'),
            {'iid': imovel_id, 'pid': produtor_id, 'valor': valor, 'data': data_aporte, 'desc': descricao})
        conn.execute(text('UPDATE participacoes_imovel SET capital_aportado = COALESCE(capital_aportado, 0) + :valor WHERE imovel_id = :iid AND produtor_id = :pid AND vigencia_fim IS NULL'),
            {'iid': imovel_id, 'pid': produtor_id, 'valor': valor})
        total_row = conn.execute(text('SELECT COALESCE(SUM(capital_aportado), 0) FROM participacoes_imovel WHERE imovel_id=:iid AND vigencia_fim IS NULL'), {'iid': imovel_id}).fetchone()
        total = float(total_row[0]) if total_row else 0
        if total > 0:
            socios = conn.execute(text('SELECT id, produtor_id, capital_aportado, nome_participante FROM participacoes_imovel WHERE imovel_id=:iid AND vigencia_fim IS NULL'), {'iid': imovel_id}).fetchall()
            for s in socios:
                novo_perc = round(float(s[2] or 0) / total * 100, 4)
                conn.execute(text('UPDATE participacoes_imovel SET vigencia_fim = :data WHERE id = :id'), {'id': s[0], 'data': data_aporte})
                conn.execute(text('INSERT INTO participacoes_imovel (imovel_id, produtor_id, percentual, nome_participante, vigencia_inicio, capital_aportado) VALUES (:iid, :pid, :perc, :nome, :data, :cap)'),
                    {'iid': imovel_id, 'pid': s[1], 'perc': novo_perc, 'nome': s[3], 'data': data_aporte, 'cap': float(s[2] or 0)})
        conn.commit()
        rows = conn.execute(text('SELECT p.produtor_id, pr.nome, p.percentual, p.capital_aportado, p.vigencia_inicio FROM participacoes_imovel p JOIN produtores pr ON pr.id = p.produtor_id WHERE p.imovel_id = :iid AND p.vigencia_fim IS NULL ORDER BY p.percentual DESC'), {'iid': imovel_id}).fetchall()
        total_cap = sum(float(r[3] or 0) for r in rows)
        return {'imovel_id': imovel_id, 'data_aporte': data_aporte, 'total_capital': total_cap,
                'participacoes': [{'produtor_id': r[0], 'nome': r[1], 'percentual': float(r[2]), 'capital_aportado': float(r[3] or 0), 'vigencia_inicio': str(r[4])} for r in rows]}


@app.get("/imoveis/{imovel_id}/aportes")
def listar_aportes(imovel_id: int):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        rows = conn.execute(text('SELECT a.id, a.produtor_id, pr.nome, a.valor, a.data_aporte, a.descricao FROM aportes_capital a JOIN produtores pr ON pr.id = a.produtor_id WHERE a.imovel_id = :iid ORDER BY a.data_aporte DESC'), {'iid': imovel_id}).fetchall()
        tots = conn.execute(text('SELECT produtor_id, SUM(valor) as total FROM aportes_capital WHERE imovel_id = :iid GROUP BY produtor_id'), {'iid': imovel_id}).fetchall()
        total_geral = sum(float(r[1]) for r in tots)
        return {'total_capital': total_geral,
                'por_socio': [{'produtor_id': r[0], 'total': float(r[1]), 'percentual': round(float(r[1])/total_geral*100, 2) if total_geral > 0 else 0} for r in tots],
                'historico': [{'id': r[0], 'produtor_id': r[1], 'nome': r[2], 'valor': float(r[3]), 'data_aporte': str(r[4]), 'descricao': r[5]} for r in rows]}

# ovino-redeploy-trigger




# redeploy 102413

# redeploy 103127
