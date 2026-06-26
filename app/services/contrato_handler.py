# app/services/contrato_handler.py — RuralCaixa MVP
"""
Criação de contratos rurais via chat (Telegram/WhatsApp).
Fluxo híbrido:
  1. Usuário descreve o contrato em linguagem natural
  2. Claude extrai os campos via IA
  3. Sistema confirma o que extraiu e pergunta só o que faltou
  4. Usuário confirma → contrato criado via API + link de assinatura enviado

Tipos suportados:
  - parceria (agricola, pecuaria, agroindustrial, extrativa)
  - condominio

Endpoints utilizados:
  POST /contratos/
  POST /contratos/{id}/condominos
  POST /contratos/{id}/enviar
"""

import os
import json
import logging
import re
from datetime import date, timedelta
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")
API_BASE = os.getenv("API_BASE_URL", "https://ruralcaixa-mvp-production.up.railway.app")
FAZENDA_ID = int(os.getenv("FAZENDA_ID", "1"))

# ── Tipos de contrato ─────────────────────────────────────────────────
TIPOS_PARCERIA = {"agricola", "pecuaria", "agroindustrial", "extrativa"}
TIPO_ALIASES = {
    "agricola": "agricola", "agrícola": "agricola", "agricultura": "agricola",
    "pecuaria": "pecuaria", "pecuária": "pecuaria", "gado": "pecuaria",
    "boi": "pecuaria", "bovino": "pecuaria", "ovino": "pecuaria",
    "agroindustrial": "agroindustrial",
    "extrativa": "extrativa", "extrativista": "extrativa",
    "condominio": "condominio", "condomínio": "condominio",
    "arrendamento": "agricola",  # arrendamento → parceria agrícola
}

CAMPOS_OBRIGATORIOS_PARCERIA = [
    "tipo", "data_inicio",
    "outorgante_nome", "outorgante_doc",
    "outorgado_nome",  "outorgado_doc",
]
CAMPOS_OBRIGATORIOS_CONDOMINIO = [
    "tipo", "data_inicio",
]

PERGUNTAS = {
    "tipo":            "Qual o tipo de contrato?\n1️⃣ Parceria Agrícola\n2️⃣ Parceria Pecuária\n3️⃣ Parceria Agroindustrial\n4️⃣ Parceria Extrativa\n5️⃣ Condomínio Rural",
    "data_inicio":     "Qual a *data de início* do contrato? (ex: 01/01/2025)",
    "data_fim":        "Qual a *data de término* do contrato? (ex: 31/12/2027)\nOu responda *indeterminado* para prazo aberto.",
    "outorgante_nome": "Qual o nome completo do *outorgante* (quem cede a terra/atividade)?",
    "outorgante_doc":  "Qual o CPF/CNPJ do outorgante?",
    "outorgado_nome":  "Qual o nome completo do *outorgado* (quem recebe)?",
    "outorgado_doc":   "Qual o CPF/CNPJ do outorgado?",
    "percentual_outorgante": "Qual o percentual do outorgante? (ex: 60 — o outorgado recebe o restante)",
    "area_hectares":   "Qual a área envolvida em *hectares*? (opcional — pressione /pular para omitir)",
    "frequencia":      "Qual a frequência de pagamento?\n1️⃣ Por safra\n2️⃣ Mensal\n3️⃣ Semestral\n4️⃣ Anual",
}

FREQ_MAP = {
    "1": "safra", "safra": "safra", "por safra": "safra",
    "2": "mensal", "mensal": "mensal",
    "3": "semestral", "semestral": "semestral",
    "4": "anual", "anual": "anual",
}

TIPO_NUM_MAP = {
    "1": "agricola", "2": "pecuaria",
    "3": "agroindustrial", "4": "extrativa", "5": "condominio",
}

# ── Detecção de intenção ──────────────────────────────────────────────

KEYWORDS_CONTRATO = [
    "contrato", "parceria", "arrendamento", "condomínio", "condominio",
    "fazer contrato", "criar contrato", "novo contrato", "gerar contrato",
    "outorgante", "outorgado", "cessão", "cessao",
]


def detectar_intencao_contrato(texto: str) -> bool:
    """Retorna True se o texto indica intenção de criar um contrato."""
    t = texto.lower()
    return any(k in t for k in KEYWORDS_CONTRATO)


# ── Extração via IA ───────────────────────────────────────────────────

PROMPT_EXTRACAO = """Você extrai dados de contratos rurais de mensagens em linguagem natural.
Extraia os campos disponíveis e retorne APENAS JSON puro, sem markdown.

Campos possíveis:
{
  "tipo": "agricola|pecuaria|agroindustrial|extrativa|condominio ou null",
  "data_inicio": "YYYY-MM-DD ou null",
  "data_fim": "YYYY-MM-DD ou null",
  "outorgante_nome": "nome completo ou null",
  "outorgante_doc": "CPF/CNPJ ou null",
  "outorgado_nome": "nome completo ou null",
  "outorgado_doc": "CPF/CNPJ ou null",
  "percentual_outorgante": número inteiro ou null,
  "area_hectares": número ou null,
  "frequencia": "safra|mensal|semestral|anual ou null",
  "valor_anual": número ou null
}

Regras:
- Datas relativas: "3 anos a partir de hoje" → calcule a partir de hoje
- "arrendamento" → tipo "agricola"
- Se mencionar apenas um nome sem papéis claros, deixe outorgante/outorgado como null
- Percentuais: "60/40", "60% para o dono" → percentual_outorgante = 60
- Nunca invente dados não mencionados
"""


async def extrair_campos_contrato(texto: str) -> dict:
    """Usa Claude para extrair campos do contrato da mensagem."""
    hoje = date.today().isoformat()
    try:
        # Busca token do produtor para autenticar na API
	from app.db import get_db
	token = None
	if produtor_id:
    		with get_db() as conn:
        		with conn.cursor() as cur:
            			cur.execute("SELECT api_token FROM produtores WHERE id=%s", (produtor_id,))
            			row = cur.fetchone()
            			if row:
                			token = row["api_token"]

	headers_api = {"Content-Type": "application/json"}
	if token:
    		headers_api["Authorization"] = f"Bearer {token}"

	async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={
                    "x-api-key": ANTHROPIC_KEY,
                    "anthropic-version": "2023-06-01",
                    "content-type": "application/json",
                },
                json={
                    "model": "claude-haiku-4-5-20251001",
                    "max_tokens": 500,
                    "system": PROMPT_EXTRACAO + f"\n\nHoje é {hoje}.",
                    "messages": [{"role": "user", "content": texto}],
                },
            )
            r.raise_for_status()
            texto_resp = r.json()["content"][0]["text"].strip()
            # Limpa markdown se houver
            if "```" in texto_resp:
                texto_resp = re.sub(r"```[a-z]*\n?", "", texto_resp).strip()
            inicio = texto_resp.find("{")
            fim = texto_resp.rfind("}") + 1
            return json.loads(texto_resp[inicio:fim]) if inicio >= 0 else {}
    except Exception as e:
        logger.error(f"[Contrato] Erro na extração: {e}")
        return {}


# ── Campos faltantes ──────────────────────────────────────────────────

def campos_faltantes(dados: dict) -> list[str]:
    """Retorna lista de campos obrigatórios ainda não preenchidos."""
    tipo = dados.get("tipo")
    if tipo == "condominio":
        obrig = CAMPOS_OBRIGATORIOS_CONDOMINIO
    else:
        obrig = CAMPOS_OBRIGATORIOS_PARCERIA

    faltam = []
    for campo in obrig:
        v = dados.get(campo)
        if v is None or str(v).strip() == "":
            faltam.append(campo)

    # Percentual só é obrigatório para parceria com dois nomes definidos
    if tipo in TIPOS_PARCERIA and dados.get("outorgante_nome") and dados.get("outorgado_nome"):
        if dados.get("percentual_outorgante") is None:
            faltam.append("percentual_outorgante")

    return faltam


# ── Formatação de resumo ──────────────────────────────────────────────

def formatar_resumo(dados: dict) -> str:
    tipo = dados.get("tipo", "?")
    tipo_label = {
        "agricola": "Parceria Agrícola", "pecuaria": "Parceria Pecuária",
        "agroindustrial": "Parceria Agroindustrial", "extrativa": "Parceria Extrativa",
        "condominio": "Condomínio Rural",
    }.get(tipo, tipo)

    linhas = [
        f"📋 *Resumo do contrato:*",
        f"Tipo: {tipo_label}",
    ]

    if dados.get("data_inicio"):
        linhas.append(f"Início: {_fmt_data(dados['data_inicio'])}")
    if dados.get("prazo_indeterminado"):
        linhas.append("Término: Prazo indeterminado")
    elif dados.get("data_fim"):
        linhas.append(f"Término: {_fmt_data(dados['data_fim'])}")

    if tipo != "condominio":
        if dados.get("outorgante_nome"):
            doc = f" ({dados.get('outorgante_doc', '')})" if dados.get("outorgante_doc") else ""
            linhas.append(f"Outorgante: {dados['outorgante_nome']}{doc}")
        if dados.get("outorgado_nome"):
            doc = f" ({dados.get('outorgado_doc', '')})" if dados.get("outorgado_doc") else ""
            linhas.append(f"Outorgado: {dados['outorgado_nome']}{doc}")
        if dados.get("percentual_outorgante") is not None:
            perc_out = int(dados["percentual_outorgante"])
            linhas.append(f"Partilha: {perc_out}% / {100 - perc_out}%")

    if dados.get("area_hectares"):
        linhas.append(f"Área: {dados['area_hectares']} ha")
    if dados.get("frequencia"):
        freq_label = {"safra": "Por safra", "mensal": "Mensal", "semestral": "Semestral", "anual": "Anual"}
        linhas.append(f"Pagamento: {freq_label.get(dados['frequencia'], dados['frequencia'])}")

    # Condôminos se houver
    conds = dados.get("condominos", [])
    if conds:
        linhas.append(f"Condôminos: {len(conds)} parte(s)")

    linhas.append("\nResponda *SIM* para criar e enviar para assinatura ou *NAO* para cancelar.")
    return "\n".join(linhas)


def _fmt_data(d: str) -> str:
    try:
        y, m, day = d.split("-")
        return f"{day}/{m}/{y}"
    except Exception:
        return d


# ── Processamento de resposta do usuário durante o fluxo ─────────────

def processar_resposta_campo(campo: str, texto: str, dados: dict) -> tuple[dict, str | None]:
    """
    Processa a resposta do usuário para um campo específico.
    Retorna (dados_atualizados, erro_ou_None).
    """
    t = texto.strip()

    if campo == "tipo":
        v = TIPO_NUM_MAP.get(t) or TIPO_ALIASES.get(t.lower())
        if not v:
            return dados, "Responda com 1, 2, 3, 4 ou 5."
        dados["tipo"] = v

    elif campo in ("data_inicio", "data_fim"):
        # Aceitar prazo indeterminado para data_fim
        if campo == "data_fim" and t.lower() in (
            "indeterminado", "indeterminada", "prazo indeterminado",
            "sem prazo", "sem fim", "aberto", "indefinido", "nao", "não", "-", "/pular"
        ):
            dados["data_fim"] = None
            dados["prazo_indeterminado"] = True
            return dados, None
        d = _parse_data(t)
        if not d:
            return dados, "Data inválida. Use o formato DD/MM/AAAA (ex: 15/03/2025) ou 'indeterminado' para prazo aberto."
        dados[campo] = d

    elif campo in ("outorgante_nome", "outorgado_nome"):
        if len(t) < 3:
            return dados, "Nome muito curto. Informe o nome completo."
        dados[campo] = t.title()

    elif campo in ("outorgante_doc", "outorgado_doc"):
        doc = re.sub(r"[.\-/]", "", t)
        if len(doc) not in (11, 14):
            return dados, "CPF deve ter 11 dígitos ou CNPJ 14 dígitos (só números)."
        dados[campo] = t

    elif campo == "percentual_outorgante":
        if t in ("/pular", "pular", "-"):
            dados["percentual_outorgante"] = 50  # default
        else:
            try:
                v = float(t.replace(",", ".").replace("%", ""))
                if not 0 < v < 100:
                    return dados, "Percentual deve ser entre 1 e 99."
                dados["percentual_outorgante"] = int(v)
            except ValueError:
                return dados, "Informe um número (ex: 60)."

    elif campo == "area_hectares":
        if t in ("/pular", "pular", "-", ""):
            dados["area_hectares"] = None
        else:
            try:
                dados["area_hectares"] = float(t.replace(",", "."))
            except ValueError:
                return dados, "Informe a área em hectares (ex: 50.5) ou /pular."

    elif campo == "frequencia":
        v = FREQ_MAP.get(t.lower())
        if not v:
            return dados, "Responda com 1 (safra), 2 (mensal), 3 (semestral) ou 4 (anual)."
        dados["frequencia"] = v

    return dados, None


def _parse_data(texto: str) -> Optional[str]:
    """Tenta converter texto em data YYYY-MM-DD."""
    if not texto:
        return None
    texto = str(texto).strip()
    # DD/MM/AAAA ou DD-MM-AAAA
    m = re.match(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})", texto)
    if m:
        return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    # YYYY-MM-DD
    m = re.match(r"(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})", texto)
    if m:
        return f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
    return None


# ── Criação do contrato via API ───────────────────────────────────────

async def criar_contrato_api(dados: dict, produtor_id: Optional[int] = None) -> dict:
    """
    Envia os dados para o backend e cria o contrato.
    Retorna dict com id, status e link.
    """
    tipo = dados.get("tipo", "agricola")
    perc_out = int(dados.get("percentual_outorgante") or 50)

    body: dict = {
        "fazenda_id": FAZENDA_ID,
        "tipo": tipo,
        "data_inicio": dados["data_inicio"],
        "data_fim": dados.get("data_fim"),  # None = prazo indeterminado
        "frequencia_pagamento": dados.get("frequencia", "safra"),
        "area_parceria_hectares": dados.get("area_hectares"),
        "percentual_outorgante": perc_out if tipo in TIPOS_PARCERIA else 0,
        "percentual_outorgado": (100 - perc_out) if tipo in TIPOS_PARCERIA else 0,
    }

    if tipo in TIPOS_PARCERIA:
        # Outorgante
        if dados.get("outorgante_id"):
            body["outorgante_socio_id"] = dados["outorgante_id"]
        else:
            body["outorgante_externo"] = {
                "nome": dados["outorgante_nome"],
                "tipo_documento": "CPF" if len(re.sub(r"\D", "", dados.get("outorgante_doc", ""))) == 11 else "CNPJ",
                "documento": dados.get("outorgante_doc", ""),
                "telefone": dados.get("outorgante_tel"),
            }
        # Outorgado
        if dados.get("outorgado_id"):
            body["outorgado_socio_id"] = dados["outorgado_id"]
        else:
            body["outorgado_externo"] = {
                "nome": dados["outorgado_nome"],
                "tipo_documento": "CPF" if len(re.sub(r"\D", "", dados.get("outorgado_doc", ""))) == 11 else "CNPJ",
                "documento": dados.get("outorgado_doc", ""),
                "telefone": dados.get("outorgado_tel"),
            }

    # Busca token do produtor para autenticar
    _token = None
    try:
        from app.db import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                if produtor_id:
                    cur.execute("SELECT api_token FROM produtores WHERE id=%s", (produtor_id,))
                else:
                    cur.execute("SELECT api_token FROM produtores ORDER BY id LIMIT 1")
                row = cur.fetchone()
                if row:
                    _token = row["api_token"] if isinstance(row, dict) else row[0]
    except Exception as _e:
        import logging; logging.getLogger(__name__).error(f"token lookup: {_e}")

    _headers = {"Content-Type": "application/json"}
    if _token:
        _headers["Authorization"] = f"Bearer {_token}"

    async with httpx.AsyncClient(timeout=30) as client:
        # Criar contrato
        r = await client.post(
            f"{API_BASE}/contratos/",
            headers=_headers,
            json=body,
        )
        r.raise_for_status()
        contrato = r.json().get("data", {})
        contrato_id = contrato.get("id")

        if not contrato_id:
            raise RuntimeError("Backend não retornou ID do contrato.")

        # Adicionar condôminos se for condomínio
        if tipo == "condominio":
            for cond in dados.get("condominos", []):
                cb: dict = {
                    "percentual_cota": cond.get("percentual", 0),
                    "data_entrada": dados["data_inicio"],
                }
                if cond.get("produtor_id"):
                    cb["produtor_id"] = cond["produtor_id"]
                else:
                    cb["parceiro_externo"] = {
                        "nome": cond["nome"],
                        "tipo_documento": "CPF",
                        "documento": cond.get("doc", ""),
                    }
                await client.post(
                    f"{API_BASE}/contratos/{contrato_id}/condominos",
                    headers={"Content-Type": "application/json"},
                    json=cb,
                )

        # Enviar para assinatura
        r2 = await client.post(f"{API_BASE}/contratos/{contrato_id}/enviar", headers=_headers)
        envio = r2.json() if r2.status_code == 200 else {}
        partes = envio.get("partes_notificadas", [])

        return {
            "id": contrato_id,
            "partes_notificadas": len(partes),
            "link": f"https://ruralcaixa-mvp.vercel.app/assinar/{contrato_id}",
        }


# ── Ponto de entrada principal ────────────────────────────────────────

async def iniciar_contrato(sessoes: dict, key: str, texto: str) -> str:
    """
    Inicia o fluxo de criação de contrato.
    Extrai campos da mensagem inicial e retorna confirmação ou próxima pergunta.
    """
    dados = await extrair_campos_contrato(texto)

    # Normaliza tipo
    if dados.get("tipo"):
        dados["tipo"] = TIPO_ALIASES.get(dados["tipo"].lower(), dados["tipo"])

    # Frequência padrão
    if not dados.get("frequencia"):
        dados["frequencia"] = "safra"

    sessoes[key] = {"_tipo": "contrato", **dados, "_campo_atual": None}
    return _proxima_pergunta_ou_resumo(sessoes, key)


async def processar_etapa_contrato(sessoes: dict, key: str, texto: str) -> str:
    """
    Processa resposta do usuário durante o fluxo de contrato.
    """
    dados = sessoes.get(key, {})
    campo_atual = dados.get("_campo_atual")

    if campo_atual:
        dados, erro = processar_resposta_campo(campo_atual, texto, dados)
        if erro:
            return f"⚠️ {erro}\n\n{PERGUNTAS[campo_atual]}"
        dados["_campo_atual"] = None
        sessoes[key] = dados

    return _proxima_pergunta_ou_resumo(sessoes, key)


def _proxima_pergunta_ou_resumo(sessoes: dict, key: str) -> str:
    dados = sessoes[key]
    faltam = campos_faltantes(dados)

    # data_fim é opcional (prazo indeterminado é válido)
    # area_hectares também é opcional
    opcionals = {"area_hectares"}
    # Só pergunta data_fim se ainda não foi respondida (nem definida como indeterminado)
    if "data_fim" not in dados and not dados.get("prazo_indeterminado"):
        pass  # data_fim está em faltam, será perguntado
    else:
        opcionals.add("data_fim")
    faltam_criticos = [f for f in faltam if f not in opcionals]

    if faltam_criticos:
        campo = faltam_criticos[0]
        dados["_campo_atual"] = campo
        sessoes[key] = dados
        return f"❓ {PERGUNTAS[campo]}"

    # Tudo preenchido — mostra resumo
    dados["_campo_atual"] = None
    sessoes[key] = dados
    return formatar_resumo(dados)


def is_contrato_ativo(sessoes: dict, key: str) -> bool:
    return sessoes.get(key, {}).get("_tipo") == "contrato"


async def confirmar_contrato(sessoes: dict, key: str) -> tuple[bool, str]:
    """
    Confirma e cria o contrato. Retorna (sucesso, mensagem).
    """
    dados = sessoes.pop(key, {})
    try:
        resultado = await criar_contrato_api(dados)
        cid = str(resultado["id"])[:8]
        partes = resultado["partes_notificadas"]
        link = resultado["link"]
        return True, (
            f"✅ *Contrato criado!*\n"
            f"ID: #{cid}\n"
            f"{'✉️ ' + str(partes) + ' parte(s) notificada(s) por WhatsApp/Telegram' if partes else '📋 Aguardando envio para assinatura'}\n\n"
            f"🔗 Link para assinatura:\n{link}"
        )
    except Exception as e:
        logger.error(f"[Contrato] Erro ao criar: {e}")
        return False, f"❌ Erro ao criar contrato: {str(e)}\n\nTente novamente ou acesse o app."
