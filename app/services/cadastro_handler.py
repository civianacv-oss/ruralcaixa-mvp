# app/services/cadastro_handler.py

ETAPAS = ["nome", "cpf", "imovel_nome", "municipio", "uf", "area_ha", "confirmar"]

PERGUNTAS = {
    "nome":        "👤 Qual seu *nome completo*?",
    "cpf":         "📋 Qual seu *CPF*? (somente números ou com pontuação)",
    "imovel_nome": "🌾 Qual o *nome do seu imóvel rural*? (ex: Fazenda São João)",
    "municipio":   "📍 Qual o *município* do imóvel?",
    "uf":          "🗺️ Qual o *estado* (UF)? (ex: MT, GO, MS)",
    "area_ha":     "📐 Qual a *área em hectares*? (opcional, pode responder 0)",
    "confirmar":   None,  # mensagem montada dinamicamente
}

def iniciar_cadastro(sessoes: dict, numero: str) -> str:
    sessoes[numero] = {"_etapa": "nome", "_tipo": "cadastro"}
    return (
        "👋 Bem-vindo ao *RuralCaixa*!\n\n"
        "Vou te cadastrar em algumas etapas. Pode cancelar a qualquer momento respondendo *CANCELAR*.\n\n"
        + PERGUNTAS["nome"]
    )

def processar_etapa(sessoes: dict, numero: str, texto: str) -> str:
    sess = sessoes.get(numero, {})
    etapa = sess.get("_etapa")

    if not etapa:
        return None

    texto = texto.strip()

    if texto.upper() == "CANCELAR":
        sessoes.pop(numero, None)
        return "❌ Cadastro cancelado."

    # Validações
    if etapa == "cpf":
        cpf = texto.replace(".", "").replace("-", "").replace(" ", "")
        if len(cpf) != 11 or not cpf.isdigit():
            return "⚠️ CPF inválido. Digite apenas os 11 números. Tente novamente:"
        sess["cpf"] = cpf

    elif etapa == "uf":
        uf = texto.upper().strip()
        UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
               "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]
        if uf not in UFS:
            return f"⚠️ UF inválida. Use a sigla do estado (ex: MT, GO, SP). Tente novamente:"
        sess["uf"] = uf

    elif etapa == "area_ha":
        try:
            area = float(texto.replace(",", "."))
            sess["area_ha"] = area if area > 0 else None
        except:
            sess["area_ha"] = None

    elif etapa == "nome":
        if len(texto) < 3:
            return "⚠️ Nome muito curto. Digite seu nome completo:"
        sess["nome"] = texto

    elif etapa == "imovel_nome":
        sess["imovel_nome"] = texto

    elif etapa == "municipio":
        sess["municipio"] = texto

    # Avança para próxima etapa
    idx = ETAPAS.index(etapa)
    proxima = ETAPAS[idx + 1] if idx + 1 < len(ETAPAS) else None
    sess["_etapa"] = proxima
    sessoes[numero] = sess

    if proxima == "confirmar":
        return _montar_confirmacao(sess)
    elif proxima:
        return PERGUNTAS[proxima]
    return None


def _montar_confirmacao(sess: dict) -> str:
    area = sess.get("area_ha")
    area_txt = f"{area} ha" if area else "Não informada"
    return (
        "✅ *Resumo do cadastro:*\n\n"
        f"👤 Nome: {sess.get('nome')}\n"
        f"📋 CPF: {sess.get('cpf')}\n"
        f"🌾 Imóvel: {sess.get('imovel_nome')}\n"
        f"📍 Município: {sess.get('municipio')} - {sess.get('uf')}\n"
        f"📐 Área: {area_txt}\n\n"
        "Responda *SIM* para confirmar ou *NAO* para cancelar."
    )


def confirmar_cadastro(sessoes: dict, key: str, numero_real: str = None, canal: str = "whatsapp") -> dict | None:
    """
    `key` é a chave da sessão (pode ser um composto "canal:numero" no
    Telegram) — usada só pra recuperar/apagar a sessão em andamento.

    `numero_real` e `canal` identificam de fato quem está se
    cadastrando: se vierem vazios (chamada legada, sem os dois
    parâmetros novos), assume-se WhatsApp e usa `key` como telefone,
    mantendo compatibilidade com o webhook antigo (app/main.py).

    Isso evita o bug de gravar o chat_id do Telegram (ou a chave
    composta "telegram:123456789") na coluna `telefone` — o que fazia
    o cadastro "terminar", mas o produtor nunca ser reconhecido de novo
    porque `telegram_chat_id` ficava sempre NULL.
    """
    sess = sessoes.pop(key, None)
    if not sess or sess.get("_etapa") != "confirmar":
        return None

    numero_real = numero_real or key
    produtor = {
        "nome":     sess["nome"],
        "cpf":      sess["cpf"],
        "nirf":     None,
    }
    if canal == "telegram":
        produtor["telegram_chat_id"] = numero_real
        produtor["telefone"] = None  # não confundir com telefone real — fica pra ser preenchido depois, se precisar
    else:
        produtor["telefone"] = numero_real

    return {
        "produtor": produtor,
        "imovel": {
            "nome":      sess["imovel_nome"],
            "municipio": sess["municipio"],
            "uf":        sess["uf"],
            "area_ha":   sess.get("area_ha"),
            "nirf":      None,
        }
    }

def is_cadastro_ativo(sessoes: dict, numero: str) -> bool:
    return sessoes.get(numero, {}).get("_tipo") == "cadastro"