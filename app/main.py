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
    atividade: str = "rural"
    perc_participacao: float = 100.0

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

# ─── Endpoints ─────────────────────────────────────────────────────────────── 
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
        # Buscar imóvel e terceiros
        imovel = conn.execute(text(
            "SELECT area_declarante, investimento_declarante FROM imoveis_rurais WHERE id = :id"
        ), {"id": imovel_id}).fetchone()
        terceiros = conn.execute(text(
            "SELECT id, area_ha, investimento FROM terceiros WHERE imovel_id = :id"
        ), {"id": imovel_id}).fetchall()

        if not imovel:
            raise HTTPException(status_code=404, detail="Imóvel não encontrado")

        # Calcular totais
        area_total = float(imovel[0] or 0) + sum(float(t[1] or 0) for t in terceiros)
        inv_total = float(imovel[1] or 0) + sum(float(t[2] or 0) for t in terceiros)

        # Calcular participação do declarante
        c_terra_decl = float(imovel[0] or 0) / area_total if area_total > 0 else 0
        c_inv_decl = float(imovel[1] or 0) / inv_total if inv_total > 0 else 0
        perc_decl = round((alfa * c_terra_decl + beta * c_inv_decl) * 100, 2)

        # Atualizar imóvel
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
        valor_bruto = data.valor
        valor_liquido = round(data.valor * data.perc_participacao / 100, 2)
        result = conn.execute(text("""
            INSERT INTO lancamentos (produtor_id, conta_codigo, tipo, descricao, valor, valor_bruto, data_lancamento, origem, confirmado, atividade, perc_participacao)
            VALUES (:pid, :conta, :tipo, :desc, :valor, :valor_bruto, :data, :origem, :confirmado, :atividade, :perc)
            RETURNING id
        """), {
            "pid": data.produtor_id,
            "conta": data.conta_codigo,
            "tipo": data.tipo,
            "desc": data.descricao,
            "valor": valor_liquido,
            "valor_bruto": valor_bruto,
            "data": data.data_lancamento,
            "origem": data.origem,
            "confirmado": data.confirmado,
            "atividade": data.atividade,
            "perc": data.perc_participacao,
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
            SELECT conta_codigo, 
                   COALESCE(produto, subconta,
                     CASE conta_codigo
                       WHEN '1.1.1' THEN 'Venda Agricola'
                       WHEN '1.1.2' THEN 'Venda Pecuaria'
                       WHEN '1.2' THEN 'Servicos'
                       ELSE conta_codigo
                     END
                   ) as label,
                   SUM(valor) as total
            FROM lancamentos
            WHERE produtor_id = :pid AND tipo = 'receita'
            {filtro_mes}
            GROUP BY conta_codigo, produto, subconta
            ORDER BY total DESC
        """), params).fetchall()

        # Despesas por conta       
        despesas = conn.execute(text(f"""
            SELECT conta_codigo,
                   COALESCE(subconta,
                     CASE conta_codigo
                       WHEN '3.1.1' THEN 'Custeio Agricola'
                       WHEN '3.1.2' THEN 'Combustivel'
                       WHEN '3.1.3' THEN 'Pecuaria'
                       WHEN '3.1.4' THEN 'Mao de obra'
                       WHEN '3.1.5' THEN 'Manutencao'
                       WHEN '3.1.6' THEN 'Energia'
                       WHEN '3.1.7' THEN 'Arrendamento'
                       ELSE conta_codigo
                     END
                   ) as label,
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
def get_lancamentos(produtor_id: int, mes: Optional[str] = None, atividade: Optional[str] = None):
    from app.db import buscar_lancamentos, engine
    from sqlalchemy import text
    lancamentos = buscar_lancamentos(produtor_id, mes, atividade)
    
    # Buscar participação do produtor nos imóveis
    with engine.connect() as conn:
        imoveis = conn.execute(text("""
            SELECT id, participacao FROM imoveis_rurais WHERE produtor_id = :pid
        """), {"pid": produtor_id}).fetchall()
        participacoes = {i[0]: float(i[1] or 100) for i in imoveis}
    
    result = []
    for l in lancamentos:
        imovel_id = l.get("imovel_id")
        perc = l.get("perc_participacao") or participacoes.get(imovel_id, 100)
        valor_original = float(l["valor"])
        valor_proporcional = round(valor_original * perc / 100, 2) if perc != 100 else valor_original
        
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
