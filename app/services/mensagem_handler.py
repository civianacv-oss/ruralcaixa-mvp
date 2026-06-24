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

    # Confirmação de lançamento pendente na sessão
    if key in sessoes and sessoes[key].get("_tipo") != "cadastro":
        if texto_up in ("SIM", "S", "OK", "CONFIRMA"):
            sess = sessoes.pop(key)
            sess["numero"] = msg.numero
            lancamento_id = gravar_lancamento(sess)

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

            return (
                f"✅ Lançamento #{lancamento_id} gravado!\n"
                f"Tipo: {sess.get('tipo','').upper()}\n"
                f"Conta: {sess.get('conta','')}\n"
                f"Valor: R$ {sess.get('valor', 0):,.2f}\n"
                f"Data: {sess.get('data','')}\n\n"
                f"Envie a foto ou PDF do comprovante para vincular."
            )
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
