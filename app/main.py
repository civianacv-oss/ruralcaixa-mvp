import hmac, hashlib, json, os
import httpx
from datetime import date
from typing import Optional

from fastapi import FastAPI, Request, Query, HTTPException, BackgroundTasks
from fastapi.responses import PlainTextResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from app.services.classifier import classificar

load_dotenv()

app = FastAPI(title="Rural Caixa PF")

VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN")
APP_SECRET   = os.getenv("WHATSAPP_APP_SECRET")
WAPP_TOKEN   = os.getenv("WHATSAPP_TOKEN")
PHONE_ID     = os.getenv("WHATSAPP_PHONE_ID")
GRAPH        = "https://graph.facebook.com/v23.0"

sessoes = {}

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Models ──────────────────────────────────────────────────────────────────

class ClassificarTexto(BaseModel):
    texto: str

class LancamentoCreate(BaseModel):
    produtor_id: int
    conta_codigo: str
    tipo: str
    descricao: str
    valor: float
    data_lancamento: str
    origem: str = "manual"
    confirmado: bool = True

class ProdutorCreate(BaseModel):
    nome: str
    cpf: str
    telefone: str
    nirf: Optional[str] = None

class ImovelCreate(BaseModel):
    nome: str
    nirf: Optional[str] = None
    area_ha: Optional[float] = None
    municipio: str
    uf: str

class CadastroRequest(BaseModel):
    produtor: ProdutorCreate
    imovel: ImovelCreate

class ClassificacaoUpdate(BaseModel):
    conta: str
    tipo: str

# ─── Endpoints ───────────────────────────────────────────────────────────────

@app.get("/")
def root():
    return {"status": "Rural Caixa PF online"}

@app.post("/classificar-texto")
def classificar_texto(data: ClassificarTexto):
    resultado = classificar(data.texto)
    if not resultado:
        return {"erro": "Nao foi possivel classificar"}
    return resultado

@app.post("/lancamentos")
def criar_lancamento(data: LancamentoCreate):
    from app.db import engine
    from sqlalchemy import text
    with engine.connect() as conn:
        result = conn.execute(text("""
            INSERT INTO lancamentos (produtor_id, conta_codigo, tipo, descricao, valor, data_lancamento, origem, confirmado)
            VALUES (:pid, :conta, :tipo, :desc, :valor, :data, :origem, :confirmado)
            RETURNING id
        """), {
            "pid": data.produtor_id,
            "conta": data.conta_codigo,
            "tipo": data.tipo,
            "desc": data.descricao,
            "valor": data.valor,
            "data": data.data_lancamento,
            "origem": data.origem,
            "confirmado": data.confirmado,
        })
        conn.commit()
        return {"id": result.fetchone()[0]}

@app.get("/wapp/inbound")
def wapp_verify(
    hub_mode: str = Query(alias="hub.mode"),
    hub_verify_token: str = Query(alias="hub.verify_token"),
    hub_challenge: str = Query(alias="hub.challenge"),
):
    if hub_mode == "subscribe" and hub_verify_token == VERIFY_TOKEN:
        return PlainTextResponse(hub_challenge)
    raise HTTPException(status_code=403)

@app.post("/wapp/inbound")
async def wapp_inbound(request: Request, background: BackgroundTasks):
    body = await request.body()
    payload = json.loads(body)
    background.add_task(processar, payload)
    return {"status": "ok"}

@app.post("/cadastro")
async def cadastrar_produtor(data: CadastroRequest):
    from app.db import cadastrar
    result = cadastrar(data.produtor.dict(), data.imovel.dict())
    return {"status": "ok", "produtor_id": result}

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
        filtro_mes = "AND to_char(data_lancamento, 'YYYY-MM') = :mes" if mes else "AND date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)"
        params = {"pid": produtor_id}
        if mes:
            params["mes"] = mes

        # Receitas por conta/produto
        receitas = conn.execute(text(f"""
            SELECT conta_codigo, COALESCE(produto, subconta, conta_codigo) as label,
                   SUM(valor) as total
            FROM lancamentos
            WHERE produtor_id = :pid AND tipo = 'receita'
            {filtro_mes}
            GROUP BY conta_codigo, produto, subconta
            ORDER BY total DESC
        """), params).fetchall()

        # Despesas por conta
        despesas = conn.execute(text(f"""
            SELECT conta_codigo, COALESCE(subconta, conta_codigo) as label,
                   SUM(valor) as total
            FROM lancamentos
            WHERE produtor_id = :pid AND tipo = 'despesa'
            {filtro_mes}
            GROUP BY conta_codigo, subconta
            ORDER BY total DESC
        """), params).fetchall()

        # Investimentos por conta
        investimentos = conn.execute(text(f"""
            SELECT conta_codigo, COALESCE(subconta, conta_codigo) as label,
                   SUM(valor) as total
            FROM lancamentos
            WHERE produtor_id = :pid AND tipo = 'investimento'
            {filtro_mes}
            GROUP BY conta_codigo, subconta
            ORDER BY total DESC
        """), params).fetchall()

        # Evolução mensal últimos 6 meses
        evolucao = conn.execute(text("""
            SELECT to_char(data_lancamento, 'YYYY-MM') as mes,
                   tipo, SUM(valor) as total
            FROM lancamentos
            WHERE produtor_id = :pid
            AND data_lancamento >= CURRENT_DATE - INTERVAL '6 months'
            GROUP BY mes, tipo
            ORDER BY mes
        """), {"pid": produtor_id}).fetchall()

        return {
            "receitas_por_produto": [{"conta": r[0], "label": r[1], "total": float(r[2])} for r in receitas],
            "despesas_por_categoria": [{"conta": d[0], "label": d[1], "total": float(d[2])} for d in despesas],
            "investimentos": [{"conta": i[0], "label": i[1], "total": float(i[2])} for i in investimentos],
            "evolucao_mensal": [{"mes": e[0], "tipo": e[1], "total": float(e[2])} for e in evolucao],
        }
        
@app.get("/produtores/{produtor_id}/lancamentos")
def get_lancamentos(produtor_id: int, mes: Optional[str] = None):
    from app.db import buscar_lancamentos
    lancamentos = buscar_lancamentos(produtor_id, mes)
    result = []
    for l in lancamentos:
        result.append({
            "id": l["id"],
            "tipo": l["tipo"],
            "conta_codigo": l["conta_codigo"],
            "descricao": l["descricao"],
            "valor": float(l["valor"]),
            "data_lancamento": str(l["data_lancamento"]),
            "produto": l.get("produto"),
            "documento_url": l.get("documento_url"),
            "confirmado": l.get("confirmado", False),
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

# ─── WhatsApp helpers ─────────────────────────────────────────────────────────

async def send_msg(to: str, body: str):
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{GRAPH}/{PHONE_ID}/messages",
            headers={"Authorization": f"Bearer {WAPP_TOKEN}", "Content-Type": "application/json"},
            json={"messaging_product": "whatsapp", "recipient_type": "individual", "to": to, "type": "text", "text": {"body": body}}
        )

# ─── Processamento WhatsApp ───────────────────────────────────────────────────

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
