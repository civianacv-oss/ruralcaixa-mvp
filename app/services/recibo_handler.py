# app/services/recibo_handler.py
"""
Assistente conversacional para criar um Recibo via WhatsApp quando a
mensagem inicial nao tem todos os dados estruturados (CPF, telefone, etc).
Segue o mesmo padrao do cadastro_handler.py: uma sessao por numero, com
etapas sequenciais ate juntar tudo e pedir confirmacao (SIM/NAO).
"""
import re

ETAPAS = ["nome", "documento", "telefone", "valor", "objeto", "confirmar"]

PERGUNTAS = {
    "nome":      "👤 Qual o *nome completo* de quem vai receber o recibo?",
    "documento": "📋 Qual o *CPF ou CNPJ* dessa pessoa? (só números ou com pontuação)",
    "telefone":  "📱 Qual o *telefone (WhatsApp)* dessa pessoa? (com DDD)",
    "valor":     "💰 Qual o *valor* do recibo? (ex: 350 ou 350,00)",
    "objeto":    "📝 Referente a quê? (ex: diária de trator, serviço de frete...)",
    "confirmar": None,  # mensagem montada dinamicamente
}

# Palavras que sugerem intencao de emitir um recibo, mesmo sem CPF/telefone
# no texto. So sao usadas como "plano B" - depois que a classificacao normal
# de lancamento (classificar()) ja tentou e nao reconheceu nenhuma categoria.
# Isso evita desviar mensagens comuns como "paguei a conta de luz" (que ja
# tem categoria propria) para o assistente de recibo por engano.
TRIGGERS_RECIBO = ["recibo", "servico", "serviço"]


def detectar_intencao_recibo(texto: str) -> bool:
    texto_lower = texto.lower()
    return any(t in texto_lower for t in TRIGGERS_RECIBO)


def iniciar_recibo_wizard(sessoes: dict, numero: str) -> str:
    sessoes[numero] = {"_etapa": "nome", "_tipo": "recibo_wizard"}
    return (
        "🧾 Vamos criar um recibo! Pode cancelar a qualquer momento respondendo *CANCELAR*.\n\n"
        + PERGUNTAS["nome"]
    )


def processar_etapa_recibo(sessoes: dict, numero: str, texto: str) -> str:
    sess = sessoes.get(numero, {})
    etapa = sess.get("_etapa")
    if not etapa:
        return None

    texto = texto.strip()
    if texto.upper() == "CANCELAR":
        sessoes.pop(numero, None)
        return "❌ Recibo cancelado."

    if etapa == "nome":
        if len(texto) < 3:
            return "⚠️ Nome muito curto. Digite o nome completo:"
        sess["destinatario_nome"] = texto

    elif etapa == "documento":
        doc = re.sub(r"\D", "", texto)
        if len(doc) not in (11, 14):
            return "⚠️ CPF/CNPJ inválido. Digite só os números (11 para CPF ou 14 para CNPJ):"
        sess["destinatario_documento"] = doc

    elif etapa == "telefone":
        tel = re.sub(r"\D", "", texto)
        if len(tel) not in (10, 11, 12, 13):
            return "⚠️ Telefone inválido. Digite com DDD (ex: 98991234567):"
        if len(tel) in (10, 11):
            tel = "55" + tel
        sess["destinatario_telefone"] = tel

    elif etapa == "valor":
        try:
            valor = float(texto.replace("R$", "").replace(".", "").replace(",", ".").strip())
            if valor <= 0:
                raise ValueError
            sess["valor"] = valor
        except ValueError:
            return "⚠️ Valor inválido. Digite só o número (ex: 350 ou 350,00):"

    elif etapa == "objeto":
        if len(texto) < 3:
            return "⚠️ Descreva melhor o que é o recibo:"
        sess["objeto"] = texto

    idx = ETAPAS.index(etapa)
    proxima = ETAPAS[idx + 1] if idx + 1 < len(ETAPAS) else None
    sess["_etapa"] = proxima
    sessoes[numero] = sess

    if proxima == "confirmar":
        # Transforma o tipo pra "recibo_pendente" assim que chega na
        # confirmacao, pra reutilizar o MESMO tratamento de SIM/NAO que ja
        # existe em main.py para o caminho direto (classificar_recibo).
        sess["_tipo"] = "recibo_pendente"
        return _montar_confirmacao(sess)
    elif proxima:
        return PERGUNTAS[proxima]
    return None


def _montar_confirmacao(sess: dict) -> str:
    return (
        "✅ *Resumo do recibo:*\n\n"
        f"👤 Destinatário: {sess.get('destinatario_nome')}\n"
        f"📋 CPF/CNPJ: {sess.get('destinatario_documento')}\n"
        f"📱 Telefone: {sess.get('destinatario_telefone')}\n"
        f"💰 Valor: R$ {sess.get('valor', 0):,.2f}\n"
        f"📝 Objeto: {sess.get('objeto')}\n\n"
        "Responda *SIM* para criar e enviar o recibo, ou *NAO* para cancelar."
    )


def is_recibo_wizard_ativo(sessoes: dict, numero: str) -> bool:
    return sessoes.get(numero, {}).get("_tipo") == "recibo_wizard"
