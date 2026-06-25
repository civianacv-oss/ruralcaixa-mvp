"""
app/services/mensagem_handler.py – RuralCaixa MVP

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

# Sessões em memória – compartilhadas entre canais
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

    # ── Audio ──────────────────────────────────────────────────────────────
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

    # ── Imagem / Documento (OCR) ──────────────────────────────────────────
    if msg.tipo in ("image", "document"):
        try:
            from app.services.ocr_handler import (
                extrair_dados_documento,
                montar_mensagem_ocr,
            )
            
            # ✅ Extrair dados do documento
            dados_ocr = await extrair_dados_documento(msg.midia_bytes, msg.mime_type)
            
            # ✅ Preparar lançamento a partir dos dados OCR
            lancamento = {
                "tipo": dados_ocr.get("tipo_operacao", "outros"),
                "conta": dados_ocr.get("tipo_documento", "documento"),
                "valor": dados_ocr.get("valor_total", 0),
                "data": dados_ocr.get("data", ""),
                "descricao": f"{dados_ocr.get('tipo_documento', 'Documento')} - {dados_ocr.get('emitente', 'N/A')}",
            }
            
            # ✅ Armazenar na sessão
            sessoes[key] = {
                **lancamento,
                "_ocr": dados_ocr,
                "_midia": msg.midia_bytes,
                "_mime": msg.mime_type,
            }
            
            # ✅ Retornar mensagem de confirmação
            return montar_mensagem_ocr(dados_ocr, msg.numero)
            
        except RuntimeError as e:
            # ✅ Erro esperado (ex: PDF não suportado)
            logger.warning(f"[OCR] Erro esperado: {str(e)}")
            return str(e)
            
        except Exception as e:
            logger.error(f"[OCR] Erro inesperado: {type(e).__name__}: {str(e)}", exc_info=True)
            return "Não consegui ler o documento. Tente uma foto mais nítida ou digite o lançamento."

    # ── Texto ──────────────────────────────────────────────────────────────
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
    if key in sessoes and sessoes[key].get("_tipo") == "cadastro":
        # Lógica de cadastro aqui
        pass

    # Classificação automática
    try:
        classificacao = classificar(texto)
        if classificacao["tipo"] == "lancamento":
            return await _processar_lancamento_texto(msg.numero, texto, classificacao)
        elif classificacao["tipo"] == "consulta":
            return await _processar_consulta(msg.numero, classificacao)
        else:
            return _cmd_ajuda()
    except Exception as e:
        logger.error("Erro classificação: %s", e)
        return _cmd_ajuda()


async def _cmd_resumo(numero: str) -> str:
    """Retorna resumo do mês."""
    try:
        from app.db import buscar_resumo_produtor
        resumo = buscar_resumo_produtor(numero)
        if not resumo:
            return "Nenhum lançamento encontrado."
        
        return (
            f"📊 **Resumo do Mês**\n\n"
            f"💰 Receitas: R$ {resumo.get('receitas', 0):,.2f}\n"
            f"💸 Despesas: R$ {resumo.get('despesas', 0):,.2f}\n"
            f"📈 Saldo: R$ {resumo.get('saldo', 0):,.2f}"
        )
    except Exception as e:
        logger.error("Erro resumo: %s", e)
        return "Erro ao buscar resumo."


async def _cmd_dre(numero: str) -> str:
    """Retorna DRE (Demonstração de Resultado)."""
    try:
        from app.db import buscar_dre_produtor
        dre = buscar_dre_produtor(numero)
        if not dre:
            return "Nenhum dado de DRE encontrado."
        
        return (
            f"📈 **DRE - Demonstração de Resultado**\n\n"
            f"Receitas: R$ {dre.get('receitas', 0):,.2f}\n"
            f"Despesas: R$ {dre.get('despesas', 0):,.2f}\n"
            f"Lucro: R$ {dre.get('lucro', 0):,.2f}"
        )
    except Exception as e:
        logger.error("Erro DRE: %s", e)
        return "Erro ao buscar DRE."


def _cmd_ajuda() -> str:
    """Retorna mensagem de ajuda."""
    return (
        "Não entendi. Exemplos:\n"
        "• 'vendi 5 bois por 10000'\n"
        "• 'comprei ração 500 reais'\n"
        "• /saldo — ver resumo do mês\n"
        "• /ajuda — todos os comandos"
    )


async def _processar_lancamento_texto(numero: str, texto: str, classificacao: dict) -> str:
    """Processa lançamento a partir de texto."""
    try:
        # Extrair dados do texto usando classificação
        lancamento = {
            "tipo": classificacao.get("tipo_operacao", "outros"),
            "conta": classificacao.get("conta", ""),
            "valor": classificacao.get("valor", 0),
            "data": classificacao.get("data", ""),
            "descricao": texto,
        }
        
        key = f"telegram:{numero}"
        _sessoes[key] = lancamento
        
        return (
            f"📝 **Lançamento**\n\n"
            f"Tipo: {lancamento['tipo'].upper()}\n"
            f"Valor: R$ {lancamento['valor']:,.2f}\n"
            f"Descrição: {lancamento['descricao']}\n\n"
            f"Confirma? (sim/não)"
        )
    except Exception as e:
        logger.error("Erro processar lançamento: %s", e)
        return "Erro ao processar lançamento."


async def _processar_consulta(numero: str, classificacao: dict) -> str:
    """Processa consulta."""
    tipo_consulta = classificacao.get("tipo_consulta", "")
    
    if tipo_consulta == "saldo":
        return await _cmd_resumo(numero)
    elif tipo_consulta == "dre":
        return await _cmd_dre(numero)
    else:
        return _cmd_ajuda()
