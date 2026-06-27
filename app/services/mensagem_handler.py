"""
app/services/mensagem_handler.py — RuralCaixa MVP

Handler compartilhado WhatsApp + Telegram.
Recebe mensagem normalizada e retorna resposta de texto.
Toda lógica de negócio fica aqui; os routers apenas adaptam
o formato de entrada/saída de cada canal.

Estrutura da mensagem normalizada (MsgIn):
    canal       : "whatsapp" | "telegram"
    numero      : identificador do remetente (phone ou chat_id)
    tipo        : "text" | "audio" | "image" | "document"
    texto       : conteúdo textual (se tipo==text)
    midia_bytes : bytes da mídia (se tipo!=text)
    mime_type   : mime da mídia
    nome_arquivo: nome original do arquivo (documentos)
"""

import os
import logging
from dataclasses import dataclass, field
from typing import Optional

logger = logging.getLogger(__name__)

# Sessões em memória — compartilhadas entre canais
# chave: f"{canal}:{numero}"
_sessoes: dict = {}


@dataclass
class MsgIn:
    canal: str          # "whatsapp" | "telegram"
    numero: str         # phone ou chat_id como string
    tipo: str           # "text" | "audio" | "image" | "document"
    texto: str = ""
    midia_bytes: bytes = field(default_factory=bytes)
    mime_type: str = ""
    nome_arquivo: str = ""

    @property
    def key(self) -> str:
        return f"{self.canal}:{self.numero}"


async def processar_mensagem(msg: MsgIn) -> str:
    """
    Ponto de entrada único.
    Retorna string de resposta (já formatada para texto simples).
    """
    from app.services.classifier import classificar
    from app.db import (
        buscar_produtor_por_numero,
        gravar_lancamento,
    )

    sessoes = _sessoes
    key = msg.key

    # ── Audio ──────────────────────────────────────────────────────────
    if msg.tipo == "audio":
        try:
            from app.services.groq_stt import transcrever_audio
            texto_transcrito = await transcrever_audio(msg.midia_bytes, "audio.ogg")
            # Reprocessa como texto
            msg2 = MsgIn(
                canal=msg.canal, numero=msg.numero,
                tipo="text", texto=texto_transcrito,
            )
            transcricao_prefix = f"🎙️ Transcrição: \"{texto_transcrito}\"\n\n"
            resposta = await processar_mensagem(msg2)
            return transcricao_prefix + resposta
        except Exception as e:
            logger.error("Erro STT: %s", e)
            return "Não consegui transcrever o áudio. Tente digitar o lançamento."

    # ── Imagem / Documento (OCR) ───────────────────────────────────────
    if msg.tipo in ("image", "document"):
        try:
            from app.services.ocr_handler import (
                extrair_dados_documento,
                montar_mensagem_ocr,
                ocr_para_lancamento,
            )
            dados_ocr = await extrair_dados_documento(msg.midia_bytes, msg.mime_type)
            lancamento = ocr_para_lancamento(dados_ocr)
            sessoes[key] = {
                **lancamento,
                "_ocr": dados_ocr,
                "_midia": msg.midia_bytes,
                "_mime": msg.mime_type,
            }
            return montar_mensagem_ocr(dados_ocr, msg.numero)
        except Exception as e:
            logger.error("Erro OCR: %s", e)
            return "Não consegui ler o documento. Tente uma foto mais nítida ou digite o lançamento."

    # ── Texto ──────────────────────────────────────────────────────────
    texto = msg.texto.strip()
    texto_up = texto.upper()

    # Comandos de consulta
    if texto_up in ("/SALDO", "/RESUMO", "SALDO", "RESUMO"):
        return await _cmd_resumo(msg.numero)

    if texto_up in ("/DRE", "DRE"):
        return await _cmd_dre(msg.numero)

    if texto_up in ("/AJUDA", "/HELP", "AJUDA", "HELP", "?"):
        return _cmd_ajuda()

    # ── Fluxo de contrato ativo ──────────────────────────────────────
    from app.services.contrato_handler import (
        detectar_intencao_contrato, iniciar_contrato,
        processar_etapa_contrato, is_contrato_ativo, confirmar_contrato,
    )

    if is_contrato_ativo(sessoes, key):
        if texto_up in ("SIM", "S", "OK", "CONFIRMA"):
            ok, resp = await confirmar_contrato(sessoes, key, msg.numero)
            return resp
        elif texto_up in ("NAO", "N", "CANCELA"):
            sessoes.pop(key, None)
            return "Cancelado. Pode começar de novo quando quiser."
        else:
            return await processar_etapa_contrato(sessoes, key, texto)

    # Fluxo de insumo
    if key in sessoes and sessoes[key].get("_tipo") == "aguard_insumo":
        sess_ins = sessoes[key]
        if texto_up in ("SIM", "S", "1"):
            try:
                import httpx as _hx
                _api = __import__("os").getenv("API_BASE_URL","https://ruralcaixa-mvp-production.up.railway.app")
                _r = _hx.get(f"{_api}/insumos/", timeout=5)
                _ins = _r.json().get("data",[]) if _r.status_code==200 else []
                if _ins:
                    _lista = "\n".join([f"{i+1}. {x["nome"]} ({x["estoque_atual"]} {x["unidade"]})" for i,x in enumerate(_ins[:8])])
                    sessoes[key] = {"_tipo":"aguard_qual_insumo","_lancamento_id":sess_ins["_lancamento_id"],"_insumos":_ins[:8]}
                    return f"📦 Qual insumo?\n\n{_lista}\n\nResponda com o número."
                else:
                    sessoes.pop(key,None)
                    return "📦 Nenhum insumo cadastrado. Acesse /insumos para cadastrar."
            except Exception as _e:
                sessoes.pop(key,None)
                return "⚠️ Erro ao buscar insumos."
        elif texto_up in ("NAO","N","0","2","NAO"):
            sessoes.pop(key,None)
            return f"✅ Lançamento #{sess_ins["_lancamento_id"]} gravado sem vincular ao estoque."
        else:
            return "📦 Essa compra é um insumo?\n1️⃣ Sim\n2️⃣ Não"

    if key in sessoes and sessoes[key].get("_tipo") == "aguard_qual_insumo":
        sess_ins = sessoes[key]
        _insumos = sess_ins.get("_insumos",[])
        _sel = None
        if texto_up.isdigit():
            _idx = int(texto_up)-1
            if 0<=_idx<len(_insumos): _sel=_insumos[_idx]
        else:
            for _x in _insumos:
                if texto_up.lower() in _x["nome"].lower(): _sel=_x; break
        if not _sel:
            return f"Não encontrei. Responda com o número (1 a {len(_insumos)})."
        sessoes[key]={"_tipo":"aguard_qtd_insumo","_lancamento_id":sess_ins["_lancamento_id"],"_insumo":_sel}
        return f"📦 {_sel["nome"]}\nQuantidade recebida? (em {_sel["unidade"]})"

    if key in sessoes and sessoes[key].get("_tipo") == "aguard_qtd_insumo":
        sess_ins = sessoes[key]
        _ins = sess_ins["_insumo"]
        try: _qtd = float(texto.replace(",","."))
        except: return "Quantidade inválida. Use número (ex: 10)"
        try:
            import httpx as _hx
            _api = __import__("os").getenv("API_BASE_URL","https://ruralcaixa-mvp-production.up.railway.app")
            from app.db import get_db as _gdb
            _token = None
            with _gdb() as _c:
                with _c.cursor() as _cu:
                    _cu.execute("SELECT api_token FROM produtores WHERE telefone LIKE %s LIMIT 1",(f"%{msg.numero[-8:]}",))
                    _row=_cu.fetchone()
                    if _row: _token=_row["api_token"] if isinstance(_row,dict) else _row[0]
            _hdrs={"Content-Type":"application/json"}
            if _token: _hdrs["Authorization"]=f"Bearer {_token}"
            _r=_hx.post(f"{_api}/insumos/{_ins["id"]}/movimentar",
                json={"tipo":"compra","quantidade":_qtd,"observacao":f"Lancamento #{sess_ins["_lancamento_id"]}"},
                headers=_hdrs,timeout=10)
            sessoes.pop(key,None)
            if _r.status_code==201:
                _novo=_ins["estoque_atual"]+_qtd
                return f"✅ Entrada registrada!\n📦 {_ins["nome"]}\n+{_qtd} {_ins["unidade"]}\nEstoque: {_ins["estoque_atual"]} → {_novo} {_ins["unidade"]}"
            else:
                return f"⚠️ Erro: {_r.text[:80]}"
        except Exception as _e:
            sessoes.pop(key,None)
            return f"⚠️ Erro ao atualizar estoque: {str(_e)[:80]}"

    # Confirmação de lançamento pendente na sessão
    if key in sessoes and sessoes[key].get("_tipo") not in ("cadastro", "contrato"):
        if texto_up in ("SIM", "S", "OK", "CONFIRMA"):
            sess = sessoes.pop(key)
            sess["numero"] = msg.numero
            lancamento_id = gravar_lancamento(sess)

            # Detecta se pode ser insumo
            tipo_lanc = sess.get("tipo", "")
            desc_lanc = (sess.get("descricao") or sess.get("conta") or "").lower()
            palavras_insumo = ["comprei","compra","racao","semente","adubo",
                "fertilizante","defensivo","vacina","medicamento","sal mineral",
                "combustivel","diesel","gasolina","insumo","fardo","saco"]
            eh_possivel_insumo = (
                tipo_lanc == "despesa" and
                any(p in desc_lanc for p in palavras_insumo)
            )
            if eh_possivel_insumo:
                sessoes[key] = {"_tipo": "aguard_insumo", "_lancamento_id": lancamento_id}

            # Upload de documento se houver mídia na sessão
            if "_midia" in sess:
                try:
                    from app.services.drive_handler import (
                        upload_para_drive, extensao_por_mime,
                    )
                    from app.db import vincular_documento
                    from datetime import datetime
                    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
                    ext = extensao_por_mime(sess["_mime"])
                    nome = f"{msg.numero}_{ts}{ext}"
                    url = upload_para_drive(
                        sess["_midia"], nome, sess["_mime"],
                        subfolder_name=msg.numero,
                    )
                    vincular_documento(lancamento_id, url)
                except Exception as e:
                    logger.error("Erro upload drive: %s", e)

            msg_base = (
                f"✅ Lançamento #{lancamento_id} gravado!\n"
                f"Tipo: {sess.get('tipo','').upper()}\n"
                f"Conta: {sess.get('conta','')}\n"
                f"Valor: R$ {sess.get('valor', 0):,.2f}\n"
                f"Data: {sess.get('data','')}\n"
            )
            if eh_possivel_insumo:
                return msg_base + "\n📦 Essa compra é um insumo?\n1️⃣ Sim — dar entrada no estoque\n2️⃣ Não — só lançamento"
            return msg_base + "\nEnvie a foto ou PDF do comprovante para vincular."
        elif texto_up in ("NAO", "N", "CANCELA"):
            sessoes.pop(key, None)
            return "Cancelado. Pode mandar de novo quando quiser."

    # Fluxo de cadastro
    from app.services.cadastro_handler import (
        iniciar_cadastro, processar_etapa,
        confirmar_cadastro, is_cadastro_ativo,
    )

    if is_cadastro_ativo(sessoes, key):
        if texto_up in ("SIM", "S", "OK", "CONFIRMA"):
            dados = confirmar_cadastro(sessoes, key)
            if dados:
                from app.db import cadastrar
                try:
                    pid = cadastrar(dados["produtor"], dados["imovel"])
                    return (
                        f"✅ Cadastro realizado! ID: #{pid}\n\n"
                        f"Agora envie lançamentos por texto ou áudio.\n"
                        f"Ex: 'vendi 10 sacas de soja por 3000 reais'\n\n"
                        f"Digite /ajuda para ver todos os comandos."
                    )
                except Exception as e:
                    return "Erro ao cadastrar. Tente novamente."
        else:
            resp = processar_etapa(sessoes, key, texto)
            if resp:
                return resp
        return ""

    # Saudação / cadastro inicial
    if texto_up in ("CADASTRAR", "CADASTRO", "OI", "OLA", "INICIO", "/START"):
        prod = buscar_produtor_por_numero(msg.numero)
        if prod:
            return (
                f"Olá, {prod['nome']}! 👋\n\n"
                f"Você já está cadastrado.\n"
                f"Digite /ajuda para ver o que posso fazer."
            )
        return iniciar_cadastro(sessoes, key)

    # Detecção módulos zootécnicos
    keywords_ovino = ["brinco", "ovino", "ovelha", "cordeiro", "carneiro",
                      "pesagem", "vacina", "vermifug", "parto", "monta",
                      "famacha", "abate", "desmame"]
    if any(k in texto.lower() for k in keywords_ovino):
        return await _processar_zootecnico(msg, "ovino", texto)

    keywords_bovino = ["boi", "vaca", "novilho", "bezerro", "bovino",
                       "nelore", "angus", "gado"]
    if any(k in texto.lower() for k in keywords_bovino):
        return await _processar_zootecnico(msg, "bovino", texto)

    keywords_pisc = ["peixe", "tilapia", "tambaqui", "viveiro", "tanque",
                     "aerador", "biometria", "despesca", "alevino"]
    if any(k in texto.lower() for k in keywords_pisc):
        return await _processar_zootecnico(msg, "piscicultura", texto)

    # Detecção de intenção de contrato (nova conversa)
    if detectar_intencao_contrato(texto):
        return await iniciar_contrato(sessoes, key, texto)

    # Classificação financeira via IA
    resultado = classificar(texto)
    if not resultado:
        return (
            "Não entendi. Exemplos:\n"
            "• 'vendi 5 bois por 10000'\n"
            "• 'comprei ração 500 reais'\n"
            "• /saldo — ver resumo do mês\n"
            "• /ajuda — todos os comandos"
        )

    sessoes[key] = resultado
    tipo_label = {"receita": "💰 RECEITA", "despesa": "💸 DESPESA"}.get(
        resultado["tipo"], "📊 INVESTIMENTO"
    )
    return (
        f"Recebi! Lançamento sugerido:\n\n"
        f"{tipo_label}\n"
        f"Valor: R$ {resultado['valor']:,.2f}\n"
        f"Conta: {resultado['conta']}\n"
        f"Produto: {resultado.get('produto') or 'N/A'}\n"
        f"Confiança: {resultado['confianca']}%\n\n"
        f"Responda SIM para confirmar ou NÃO para cancelar."
    )


# ── Comandos de consulta ──────────────────────────────────────────────

async def _cmd_resumo(numero: str) -> str:
    try:
        from app.db import buscar_produtor_por_numero, buscar_resumo_mes
        prod = buscar_produtor_por_numero(numero)
        if not prod:
            return "Produtor não encontrado. Digite CADASTRAR para se cadastrar."
        r = buscar_resumo_mes(prod["id"])
        return (
            f"📊 Resumo do mês — {prod['nome']}\n"
            f"━━━━━━━━━━━━━━━━\n"
            f"💰 Receitas:  R$ {float(r.get('receita', 0)):,.2f}\n"
            f"💸 Despesas:  R$ {float(r.get('despesa', 0)):,.2f}\n"
            f"📋 Lançamentos: {r.get('total_lancamentos', 0)}\n"
            f"⏳ Pendentes: {r.get('pendentes', 0)}"
        )
    except Exception as e:
        logger.error("Erro resumo: %s", e)
        return "Erro ao buscar resumo."


async def _cmd_dre(numero: str) -> str:
    try:
        from app.db import buscar_produtor_por_numero, engine
        from app.services.dre_service import gerar_dre
        prod = buscar_produtor_por_numero(numero)
        if not prod:
            return "Produtor não encontrado."
        dre = gerar_dre(engine=engine, produtor_id=prod["id"], view_type="managerial")
        rec = dre.get("receita_bruta", 0)
        desp = dre.get("total_despesas", 0)
        lucro = dre.get("resultado_liquido", 0)
        return (
            f"📈 DRE — {prod['nome']}\n"
            f"━━━━━━━━━━━━━━━━\n"
            f"Receita bruta:  R$ {float(rec):,.2f}\n"
            f"Total despesas: R$ {float(desp):,.2f}\n"
            f"Resultado:      R$ {float(lucro):,.2f}\n\n"
            f"Para detalhes acesse o RuralCaixa."
        )
    except Exception as e:
        logger.error("Erro DRE: %s", e)
        return "Erro ao gerar DRE."


def _cmd_ajuda() -> str:
    return (
        "🌾 RuralCaixa — Comandos\n"
        "━━━━━━━━━━━━━━━━━━━━━\n"
        "💰 Lançamentos:\n"
        "  Envie texto livre ou áudio\n"
        "  Ex: 'vendi 10 sacas de soja 3000'\n\n"
        "📄 Documentos:\n"
        "  Envie foto de NF, contrato ou recibo\n\n"
        "📊 Consultas:\n"
        "  /saldo   — resumo do mês\n"
        "  /dre     — resultado financeiro\n"
        "  /ajuda   — esta mensagem\n\n"
        "🐄 Zootécnico:\n"
        "  Mencione a espécie no texto\n"
        "  Ex: 'pesagem boi 450kg'\n\n"
        "📋 Cadastro:\n"
        "  Digite CADASTRAR para se registrar"
    )


async def _processar_zootecnico(msg: MsgIn, modulo: str, texto: str) -> str:
    try:
        if modulo == "ovino":
            from app.routers.ovino import webhook_whatsapp_ovino, WhatsAppMensagem
            from app.db import engine
            from sqlalchemy import text as sqlt
            with engine.connect() as conn:
                row = conn.execute(sqlt(
                    "SELECT id FROM imoveis_rurais WHERE produtor_id = "
                    "(SELECT id FROM produtores WHERE telefone LIKE :tel LIMIT 1) LIMIT 1"
                ), {"tel": f"%{msg.numero[-8:]}"}).fetchone()
                imovel_id = row[0] if row else 1
            payload = WhatsAppMensagem(
                telefone=msg.numero, tipo_midia="texto",
                conteudo=texto, imovel_id=imovel_id,
            )
            resultado = webhook_whatsapp_ovino(payload)
            return resultado.get("resumo", "Registrado.")
        return f"Módulo {modulo} recebido. Acesse o app para detalhes."
    except Exception as e:
        logger.error("Erro zootécnico %s: %s", modulo, e)
        return f"Erro ao processar registro {modulo}."
