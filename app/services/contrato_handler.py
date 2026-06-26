# app/services/contrato_handler.py
import os, json, logging, re
from datetime import date
from typing import Optional
import httpx

logger = logging.getLogger(__name__)

ANTHROPIC_KEY = os.getenv("ANTHROPIC_API_KEY")
API_BASE = os.getenv("API_BASE_URL", "https://ruralcaixa-mvp-production.up.railway.app")
FAZENDA_ID = int(os.getenv("FAZENDA_ID", "1"))

TIPOS_PARCERIA = {"agricola", "pecuaria", "agroindustrial", "extrativa"}
TIPO_ALIASES = {
    "agricola": "agricola", "agricola": "agricola", "agricultura": "agricola",
    "pecuaria": "pecuaria", "gado": "pecuaria", "boi": "pecuaria",
    "bovino": "pecuaria", "ovino": "pecuaria", "agroindustrial": "agroindustrial",
    "extrativa": "extrativa", "extrativista": "extrativa",
    "condominio": "condominio", "arrendamento": "agricola",
}
CAMPOS_OBRIGATORIOS_PARCERIA = ["tipo","data_inicio","outorgante_nome","outorgante_doc","outorgado_nome","outorgado_doc"]
CAMPOS_OBRIGATORIOS_CONDOMINIO = ["tipo","data_inicio"]
PERGUNTAS = {
    "tipo": "Qual o tipo de contrato?\n1 Parceria Agricola\n2 Parceria Pecuaria\n3 Parceria Agroindustrial\n4 Parceria Extrativa\n5 Condominio Rural",
    "data_inicio": "Qual a data de inicio do contrato? (ex: 01/01/2025)",
    "data_fim": "Qual a data de termino? (ex: 31/12/2027)\nOu responda indeterminado para prazo aberto.",
    "outorgante_nome": "Qual o nome completo do outorgante (quem cede)?",
    "outorgante_doc": "Qual o CPF/CNPJ do outorgante?",
    "outorgado_nome": "Qual o nome completo do outorgado (quem recebe)?",
    "outorgado_doc": "Qual o CPF/CNPJ do outorgado?",
    "percentual_outorgante": "Qual o percentual do outorgante? (ex: 60)",
    "area_hectares": "Qual a area em hectares? (opcional — responda /pular)",
    "frequencia": "Frequencia de pagamento?\n1 Por safra\n2 Mensal\n3 Semestral\n4 Anual",
}
FREQ_MAP = {
    "1":"safra","safra":"safra","por safra":"safra",
    "2":"mensal","mensal":"mensal",
    "3":"semestral","semestral":"semestral",
    "4":"anual","anual":"anual",
}
TIPO_NUM_MAP = {"1":"agricola","2":"pecuaria","3":"agroindustrial","4":"extrativa","5":"condominio"}
KEYWORDS_CONTRATO = [
    "contrato","parceria","arrendamento","condominio","fazer contrato",
    "criar contrato","novo contrato","gerar contrato","outorgante","outorgado","cessao",
]

def detectar_intencao_contrato(texto):
    t = texto.lower()
    return any(k in t for k in KEYWORDS_CONTRATO)

PROMPT_EXTRACAO = """Voce extrai dados de contratos rurais. Retorne APENAS JSON puro sem markdown.
Campos: tipo(agricola|pecuaria|agroindustrial|extrativa|condominio), data_inicio(YYYY-MM-DD),
data_fim(YYYY-MM-DD), outorgante_nome, outorgante_doc, outorgado_nome, outorgado_doc,
percentual_outorgante(int), area_hectares(float), frequencia(safra|mensal|semestral|anual).
Regras: arrendamento=agricola; nunca invente dados."""

async def extrair_campos_contrato(texto):
    hoje = date.today().isoformat()
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            r = await client.post(
                "https://api.anthropic.com/v1/messages",
                headers={"x-api-key": ANTHROPIC_KEY, "anthropic-version": "2023-06-01", "content-type": "application/json"},
                json={"model": "claude-haiku-4-5-20251001", "max_tokens": 500,
                      "system": PROMPT_EXTRACAO + f"\n\nHoje e {hoje}.",
                      "messages": [{"role": "user", "content": texto}]},
            )
            r.raise_for_status()
            txt = r.json()["content"][0]["text"].strip()
            if "```" in txt:
                txt = re.sub(r"```[a-z]*\n?", "", txt).strip()
            i = txt.find("{"); j = txt.rfind("}") + 1
            return json.loads(txt[i:j]) if i >= 0 else {}
    except Exception as e:
        logger.error(f"[Contrato] extracao: {e}")
        return {}

def campos_faltantes(dados):
    tipo = dados.get("tipo")
    obrig = CAMPOS_OBRIGATORIOS_CONDOMINIO if tipo == "condominio" else CAMPOS_OBRIGATORIOS_PARCERIA
    faltam = [c for c in obrig if not dados.get(c)]
    if tipo in TIPOS_PARCERIA and dados.get("outorgante_nome") and dados.get("outorgado_nome"):
        if dados.get("percentual_outorgante") is None:
            faltam.append("percentual_outorgante")
    return faltam

def formatar_resumo(dados):
    tipo = dados.get("tipo","?")
    labels = {"agricola":"Parceria Agricola","pecuaria":"Parceria Pecuaria",
               "agroindustrial":"Parceria Agroindustrial","extrativa":"Parceria Extrativa","condominio":"Condominio Rural"}
    linhas = [f"Resumo do contrato:", f"Tipo: {labels.get(tipo, tipo)}"]
    if dados.get("data_inicio"): linhas.append(f"Inicio: {_fmt(dados['data_inicio'])}")
    if dados.get("prazo_indeterminado"): linhas.append("Termino: Prazo indeterminado")
    elif dados.get("data_fim"): linhas.append(f"Termino: {_fmt(dados['data_fim'])}")
    if tipo != "condominio":
        if dados.get("outorgante_nome"): linhas.append(f"Outorgante: {dados['outorgante_nome']}")
        if dados.get("outorgado_nome"): linhas.append(f"Outorgado: {dados['outorgado_nome']}")
        if dados.get("percentual_outorgante") is not None:
            p = int(dados["percentual_outorgante"])
            linhas.append(f"Partilha: {p}% / {100-p}%")
    if dados.get("area_hectares"): linhas.append(f"Area: {dados['area_hectares']} ha")
    if dados.get("frequencia"):
        fl = {"safra":"Por safra","mensal":"Mensal","semestral":"Semestral","anual":"Anual"}
        linhas.append(f"Pagamento: {fl.get(dados['frequencia'], dados['frequencia'])}")
    linhas.append("\nResponda SIM para criar ou NAO para cancelar.")
    return "\n".join(linhas)

def _fmt(d):
    try:
        y,m,day = d.split("-"); return f"{day}/{m}/{y}"
    except: return d

def _parse_data(texto):
    if not texto: return None
    texto = str(texto).strip()
    m = re.match(r"(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})", texto)
    if m: return f"{m.group(3)}-{m.group(2).zfill(2)}-{m.group(1).zfill(2)}"
    m = re.match(r"(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})", texto)
    if m: return f"{m.group(1)}-{m.group(2).zfill(2)}-{m.group(3).zfill(2)}"
    return None

def processar_resposta_campo(campo, texto, dados):
    t = texto.strip()
    if campo == "tipo":
        v = TIPO_NUM_MAP.get(t) or TIPO_ALIASES.get(t.lower())
        if not v: return dados, "Responda com 1, 2, 3, 4 ou 5."
        dados["tipo"] = v
    elif campo in ("data_inicio","data_fim"):
        if campo == "data_fim" and t.lower() in ("indeterminado","indeterminada","sem prazo","aberto","nao","nao","pular","/pular","-"):
            dados["data_fim"] = None; dados["prazo_indeterminado"] = True; return dados, None
        d = _parse_data(t)
        if not d: return dados, "Data invalida. Use DD/MM/AAAA ou indeterminado."
        dados[campo] = d
    elif campo in ("outorgante_nome","outorgado_nome"):
        if len(t) < 3: return dados, "Nome muito curto."
        dados[campo] = t.title()
    elif campo in ("outorgante_doc","outorgado_doc"):
        doc = re.sub(r"[.\-/]","",t)
        if len(doc) not in (11,14): return dados, "CPF (11 digitos) ou CNPJ (14 digitos)."
        dados[campo] = t
    elif campo == "percentual_outorgante":
        if t in ("/pular","pular","-"): dados["percentual_outorgante"] = 50
        else:
            try:
                v = float(t.replace(",",".").replace("%",""))
                if not 0 < v < 100: return dados, "Percentual entre 1 e 99."
                dados["percentual_outorgante"] = int(v)
            except: return dados, "Informe um numero (ex: 60)."
    elif campo == "area_hectares":
        if t in ("/pular","pular","-",""): dados["area_hectares"] = None
        else:
            try: dados["area_hectares"] = float(t.replace(",","."))
            except: return dados, "Informe a area em hectares ou /pular."
    elif campo == "frequencia":
        v = FREQ_MAP.get(t.lower())
        if not v: return dados, "Responda 1, 2, 3 ou 4."
        dados["frequencia"] = v
    return dados, None

def _buscar_token(produtor_id=None, numero=None):
    try:
        from app.db import get_db
        with get_db() as conn:
            with conn.cursor() as cur:
                if numero:
                    # Tenta por telegram_chat_id primeiro
                    cur.execute("SELECT api_token FROM produtores WHERE telegram_chat_id=%s LIMIT 1", (str(numero),))
                    row = cur.fetchone()
                    if not row:
                        # Fallback por telefone
                        cur.execute("SELECT api_token FROM produtores WHERE telefone LIKE %s LIMIT 1", (f"%{str(numero)[-8:]}",))
                        row = cur.fetchone()
                elif produtor_id:
                    cur.execute("SELECT api_token FROM produtores WHERE id=%s LIMIT 1", (produtor_id,))
                    row = cur.fetchone()
                else:
                    cur.execute("SELECT api_token FROM produtores ORDER BY id LIMIT 1")
                    row = cur.fetchone()
                if row:
                    return row["api_token"] if isinstance(row, dict) else row[0]
    except Exception as e:
        logger.error(f"[Contrato] token: {e}")
    return None

async def criar_contrato_api(dados, produtor_id=None, numero=None):
    tipo = dados.get("tipo","agricola")
    perc_out = int(dados.get("percentual_outorgante") or 50)
    token = _buscar_token(produtor_id=produtor_id, numero=numero)
    hdrs = {"Content-Type": "application/json"}
    if token: hdrs["Authorization"] = f"Bearer {token}"

    body = {
        "fazenda_id": FAZENDA_ID, "tipo": tipo,
        "data_inicio": dados["data_inicio"], "data_fim": dados.get("data_fim"),
        "frequencia_pagamento": dados.get("frequencia","safra"),
        "area_parceria_hectares": dados.get("area_hectares"),
        "percentual_outorgante": perc_out if tipo in TIPOS_PARCERIA else 0,
        "percentual_outorgado": (100-perc_out) if tipo in TIPOS_PARCERIA else 0,
    }
    if tipo in TIPOS_PARCERIA:
        if dados.get("outorgante_id"): body["outorgante_socio_id"] = dados["outorgante_id"]
        else: body["outorgante_externo"] = {"nome": dados.get("outorgante_nome",""), "tipo_documento": "CPF" if len(re.sub(r"\D","",dados.get("outorgante_doc",""))) == 11 else "CNPJ", "documento": dados.get("outorgante_doc","")}
        if dados.get("outorgado_id"): body["outorgado_socio_id"] = dados["outorgado_id"]
        else: body["outorgado_externo"] = {"nome": dados.get("outorgado_nome",""), "tipo_documento": "CPF" if len(re.sub(r"\D","",dados.get("outorgado_doc",""))) == 11 else "CNPJ", "documento": dados.get("outorgado_doc","")}

    async with httpx.AsyncClient(timeout=30) as client:
        r = await client.post(f"{API_BASE}/contratos/", headers=hdrs, json=body)
        r.raise_for_status()
        contrato_id = r.json().get("data",{}).get("id")
        if not contrato_id: raise RuntimeError("Backend nao retornou ID.")
        if tipo == "condominio":
            for c in dados.get("condominos",[]):
                cb = {"percentual_cota": c.get("percentual",0), "data_entrada": dados["data_inicio"]}
                if c.get("produtor_id"): cb["produtor_id"] = c["produtor_id"]
                else: cb["parceiro_externo"] = {"nome": c["nome"], "tipo_documento": "CPF", "documento": c.get("doc","")}
                await client.post(f"{API_BASE}/contratos/{contrato_id}/condominos", headers=hdrs, json=cb)
        r2 = await client.post(f"{API_BASE}/contratos/{contrato_id}/enviar", headers=hdrs)
        partes = r2.json().get("partes_notificadas",[]) if r2.status_code == 200 else []
        return {"id": contrato_id, "partes_notificadas": len(partes), "link": f"https://ruralcaixa-mvp.vercel.app/assinar/{contrato_id}"}

async def iniciar_contrato(sessoes, key, texto):
    dados = await extrair_campos_contrato(texto)
    if dados.get("tipo"): dados["tipo"] = TIPO_ALIASES.get(dados["tipo"].lower(), dados["tipo"])
    if not dados.get("frequencia"): dados["frequencia"] = "safra"
    sessoes[key] = {"_tipo": "contrato", **dados, "_campo_atual": None}
    return _proxima(sessoes, key)

async def processar_etapa_contrato(sessoes, key, texto):
    dados = sessoes.get(key, {})
    campo = dados.get("_campo_atual")
    if campo:
        dados, erro = processar_resposta_campo(campo, texto, dados)
        if erro: return f"Erro: {erro}\n\n{PERGUNTAS[campo]}"
        dados["_campo_atual"] = None
        sessoes[key] = dados
    return _proxima(sessoes, key)

def _proxima(sessoes, key):
    dados = sessoes[key]
    faltam = campos_faltantes(dados)
    opcionals = {"area_hectares"}
    if "data_fim" in dados or dados.get("prazo_indeterminado"): opcionals.add("data_fim")
    criticos = [f for f in faltam if f not in opcionals]
    if criticos:
        campo = criticos[0]
        dados["_campo_atual"] = campo
        sessoes[key] = dados
        return f"? {PERGUNTAS[campo]}"
    dados["_campo_atual"] = None
    sessoes[key] = dados
    return formatar_resumo(dados)

def is_contrato_ativo(sessoes, key):
    return sessoes.get(key, {}).get("_tipo") == "contrato"

async def confirmar_contrato(sessoes, key, numero=""):
    dados = sessoes.pop(key, {})
    try:
        r = await criar_contrato_api(dados, numero=numero)
        cid = str(r["id"])[:8]
        partes = r["partes_notificadas"]
        link = r["link"]
        return True, (f"Contrato criado! ID: #{cid}\n"
                      f"{'%s parte(s) notificada(s)' % partes if partes else 'Aguardando assinaturas'}\n\n"
                      f"Link para assinatura:\n{link}")
    except Exception as e:
        logger.error(f"[Contrato] criar: {e}")
        return False, f"Erro ao criar contrato: {str(e)}\n\nTente novamente ou acesse o app."
