from fastapi import FastAPI, Request, Query, HTTPException, BackgroundTasks
from fastapi.responses import PlainTextResponse
import hmac, hashlib, json, os, httpx
from dotenv import load_dotenv
from app.services.classifier import classificar
from pydantic import BaseModel
from typing import Optional

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

load_dotenv()

app = FastAPI(title="Rural Caixa PF")

VERIFY_TOKEN = os.getenv("WHATSAPP_VERIFY_TOKEN")
APP_SECRET   = os.getenv("WHATSAPP_APP_SECRET")
WAPP_TOKEN   = os.getenv("WHATSAPP_TOKEN")
PHONE_ID     = os.getenv("WHATSAPP_PHONE_ID")
GRAPH        = "https://graph.facebook.com/v23.0"

sessoes = {}

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["https://ruralcaixa-mvp.vercel.app", "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def root():
    return {"status": "Rural Caixa PF online"}

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

async def send_msg(to: str, body: str):
    async with httpx.AsyncClient() as client:
        await client.post(
            f"{GRAPH}/{PHONE_ID}/messages",
            headers={"Authorization": f"Bearer {WAPP_TOKEN}", "Content-Type": "application/json"},
            json={"messaging_product": "whatsapp", "recipient_type": "individual", "to": to, "type": "text", "text": {"body": body}}
        )

@app.post("/cadastro")
async def cadastrar_produtor(data: CadastroRequest):
    from app.db import cadastrar
    result = cadastrar(data.produtor.dict(), data.imovel.dict())
    return {"status": "ok", "produtor_id": result}

async def processar(payload: dict):
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
            texto_upper = texto.upper()

            if numero in sessoes:
                if texto_upper in ("SIM", "S", "OK", "CONFIRMA"):
                    sess = sessoes.pop(numero)
                    sess["numero"] = numero
                    from app.db import gravar_lancamento
                    lancamento_id = gravar_lancamento(sess)
                    produto_txt = sess.get("produto") or "N/A"
                    resposta = (
                        f"Lancamento #{lancamento_id} gravado!\n"
                        f"Tipo: {sess['tipo'].upper()}\n"
                        f"Conta: {sess['conta']}\n"
                        f"Produto: {produto_txt}\n"
                        f"Valor: R$ {sess['valor']:,.2f}\n"
                        f"Data: {sess['data']}\n\n"
                        f"📎 Envie a foto ou PDF do comprovante para vincular ao lançamento."
                    )
                    await send_msg(numero, resposta)
                    return
                elif texto_upper in ("NAO", "N", "CANCELA"):
                    sessoes.pop(numero)
                    await send_msg(numero, "Cancelado. Pode mandar de novo quando quiser.")
                    return

            resultado = classificar(texto)
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
            await send_msg(numero, "📎 Documento recebido! Fazendo upload...")
            try:
                from app.services.drive_handler import baixar_midia_whatsapp, upload_para_drive, extensao_por_mime
                from app.db import get_ultimo_lancamento, vincular_documento

                if tipo == "image":
                    media_id  = msg["image"]["id"]
                    mime_type = msg["image"].get("mime_type", "image/jpeg")
                else:
                    media_id  = msg["document"]["id"]
                    mime_type = msg["document"].get("mime_type", "application/pdf")

                conteudo, mime_type = await baixar_midia_whatsapp(media_id, WAPP_TOKEN)

                from datetime import datetime
                ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                ext = extensao_por_mime(mime_type)
                nome_arquivo = f"{numero}_{ts}{ext}"

                url_drive = upload_para_drive(conteudo, nome_arquivo, mime_type, subfolder_name=numero)

                lancamento_id = get_ultimo_lancamento(numero)
                if lancamento_id:
                    vincular_documento(lancamento_id, url_drive)
                    await send_msg(numero, f"✅ Documento vinculado ao lançamento #{lancamento_id}!\n🔗 {url_drive}")
                else:
                    await send_msg(numero, f"✅ Documento salvo!\n🔗 {url_drive}\n\n(Nenhum lançamento recente para vincular)")

            except Exception as e:
                print(f"Erro no upload: {e}")
                await send_msg(numero, "❌ Erro ao processar documento. Tente novamente.")

    except Exception as e:
        print(f"Erro: {e}")
