"""
patch_cadastro_handler_v2.py

SUBSTITUI o patch_cadastro_handler_v1.py (não aplicado ainda) — desenho
final acordado em 28/07:

  1. Primeira pergunta agora é "você é dono(a) de um imóvel, ou vai ser
     vinculado(a) à propriedade de outra pessoa (administrador, procurador
     ou contador)?" — decide se o resto do wizard pergunta sobre imóvel
     ou pula direto pra confirmação depois do telefone.
  2. CPF é perguntado logo em seguida (era a segunda pergunta antes,
     depois do nome) e checado no banco (buscar_produtor_por_cpf) — se já
     existir, preenche o nome automaticamente e avisa, evitando duplicar
     cadastro/imóvel (bug achado em 28/07).
  3. Telefone agora é perguntado explicitamente, nos dois canais — antes
     nunca era perguntado (WhatsApp usava o número de quem mandou a
     mensagem; Telegram ficava sempre NULL).
  4. Se "vinculado": pula nome do imóvel/município/UF/área por completo.
     cadastrar() em app/db.py já lida bem com isso (só cria imóvel se
     receber um nome), nenhuma mudança necessária lá.

Substitui o arquivo inteiro (mais seguro que fragmentos, dado o tanto de
reestruturação). Faz backup automático.

USO:
    python3 patch_cadastro_handler_v2.py            # dry-run
    python3 patch_cadastro_handler_v2.py --aplicar   # grava
"""

import sys
import shutil
from pathlib import Path

ARQUIVO = Path("app/services/cadastro_handler.py")
BACKUP = Path("app/services/cadastro_handler.py.bak_v2")

NOVO_CONTEUDO = '''# app/services/cadastro_handler.py

# Duas sequências possíveis, escolhidas pela resposta à pergunta inicial
# "_tipo_cadastro" (dono de imóvel vs vinculado à propriedade de outra
# pessoa). Decidido em 28/07: quem vai ser só administrador/procurador/
# contador de propriedade alheia não deve ser obrigado a cadastrar um
# imóvel próprio.
SEQ_DONO = ["cpf", "nome", "telefone", "imovel_nome", "municipio", "uf", "area_ha", "confirmar"]
SEQ_VINCULADO = ["cpf", "nome", "telefone", "confirmar"]

PERGUNTAS = {
    "cpf":         "📋 Qual seu *CPF*? (somente números ou com pontuação)",
    "nome":        "👤 Qual seu *nome completo*?",
    "telefone":    "📱 Qual o seu *telefone (com DDD)*? (ex: 98991234567)",
    "imovel_nome": "🌾 Qual o *nome do seu imóvel rural*? (ex: Fazenda São João)",
    "municipio":   "📍 Qual o *município* do imóvel?",
    "uf":          "🗺️ Qual o *estado* (UF)? (ex: MT, GO, MS)",
    "area_ha":     "📐 Qual a *área em hectares*? (opcional, pode responder 0)",
    "confirmar":   None,  # mensagem montada dinamicamente
}

TEXTO_PERGUNTA_TIPO = (
    "Antes de começar: você é *dono(a) de um imóvel rural*, ou vai ser "
    "*vinculado(a) à propriedade de outra pessoa* (como administrador, "
    "procurador ou contador)?\\n\\n"
    "1️⃣ Sou dono(a) de um imóvel\\n"
    "2️⃣ Vou ser vinculado(a) à propriedade de outra pessoa"
)


def iniciar_cadastro(sessoes: dict, numero: str) -> str:
    sessoes[numero] = {"_etapa": "tipo_cadastro", "_tipo": "cadastro"}
    return (
        "👋 Bem-vindo ao *RuralCaixa*!\\n\\n"
        "Vou te cadastrar em algumas etapas. Pode cancelar a qualquer momento respondendo *CANCELAR*.\\n\\n"
        + TEXTO_PERGUNTA_TIPO
    )


def _proxima_etapa(etapa_atual: str, seq: list, forcada: str = None) -> str | None:
    if forcada:
        return forcada
    idx = seq.index(etapa_atual)
    return seq[idx + 1] if idx + 1 < len(seq) else None


def processar_etapa(sessoes: dict, numero: str, texto: str) -> str:
    sess = sessoes.get(numero, {})
    etapa = sess.get("_etapa")

    if not etapa:
        return None

    texto = texto.strip()

    if texto.upper() == "CANCELAR":
        sessoes.pop(numero, None)
        return "❌ Cadastro cancelado."

    # Primeira pergunta: define qual sequência de etapas seguir.
    if etapa == "tipo_cadastro":
        resp = texto.strip().upper()
        if resp in ("1", "DONO", "SOU DONO", "SOU DONO(A)"):
            sess["_dono"] = True
        elif resp in ("2", "VINCULADO", "VINCULADO(A)"):
            sess["_dono"] = False
        else:
            return "⚠️ Não entendi. Responda *1* (dono de imóvel) ou *2* (vinculado a outra propriedade):"
        sess["_etapa"] = "cpf"
        sessoes[numero] = sess
        return PERGUNTAS["cpf"]

    seq = SEQ_DONO if sess.get("_dono", True) else SEQ_VINCULADO
    proxima_forcada = None
    prefixo_extra = ""

    # Validações
    if etapa == "cpf":
        cpf = texto.replace(".", "").replace("-", "").replace(" ", "")
        if len(cpf) != 11 or not cpf.isdigit():
            return "⚠️ CPF inválido. Digite apenas os 11 números. Tente novamente:"
        sess["cpf"] = cpf

        # Checa duplicidade assim que o CPF é digitado (achado em 28/07:
        # recadastrar um CPF já existente sem essa checagem duplicava o
        # imóvel do produtor). Se já existir, preenche o nome e pula essa
        # pergunta — mas continua perguntando telefone (e imóvel, se dono).
        from app.db import buscar_produtor_por_cpf
        existente = buscar_produtor_por_cpf(cpf)
        if existente:
            sess["nome"] = existente["nome"]
            sess["_produtor_existente_id"] = existente["id"]
            proxima_forcada = "telefone"
            prefixo_extra = f"✅ Encontrei seu cadastro, {existente['nome']}! Vamos confirmar mais alguns dados.\\n\\n"

    elif etapa == "nome":
        if len(texto) < 3:
            return "⚠️ Nome muito curto. Digite seu nome completo:"
        sess["nome"] = texto

    elif etapa == "telefone":
        tel = texto.replace("(", "").replace(")", "").replace("-", "").replace(" ", "")
        if not tel.isdigit() or len(tel) not in (10, 11, 12, 13):
            return "⚠️ Telefone inválido. Digite com DDD (ex: 98991234567):"
        if len(tel) in (10, 11):
            tel = "55" + tel
        sess["telefone"] = tel

    elif etapa == "uf":
        uf = texto.upper().strip()
        UFS = ["AC","AL","AP","AM","BA","CE","DF","ES","GO","MA","MT","MS","MG",
               "PA","PB","PR","PE","PI","RJ","RN","RS","RO","RR","SC","SP","SE","TO"]
        if uf not in UFS:
            return "⚠️ UF inválida. Use a sigla do estado (ex: MT, GO, SP). Tente novamente:"
        sess["uf"] = uf

    elif etapa == "area_ha":
        try:
            area = float(texto.replace(",", "."))
            sess["area_ha"] = area if area > 0 else None
        except ValueError:
            sess["area_ha"] = None

    elif etapa == "imovel_nome":
        sess["imovel_nome"] = texto

    elif etapa == "municipio":
        sess["municipio"] = texto

    proxima = _proxima_etapa(etapa, seq, proxima_forcada)
    sess["_etapa"] = proxima
    sessoes[numero] = sess

    if proxima == "confirmar":
        return _montar_confirmacao(sess)
    elif proxima:
        return prefixo_extra + PERGUNTAS[proxima]
    return None


def _montar_confirmacao(sess: dict) -> str:
    linhas = [
        "✅ *Resumo do cadastro:*\\n",
        f"👤 Nome: {sess.get('nome')}",
        f"📋 CPF: {sess.get('cpf')}",
        f"📱 Telefone: {sess.get('telefone')}",
    ]
    if sess.get("_dono", True):
        area = sess.get("area_ha")
        area_txt = f"{area} ha" if area else "Não informada"
        linhas += [
            f"🌾 Imóvel: {sess.get('imovel_nome')}",
            f"📍 Município: {sess.get('municipio')} - {sess.get('uf')}",
            f"📐 Área: {area_txt}",
        ]
    else:
        linhas.append("ℹ️ Cadastro sem imóvel próprio (será vinculado por quem administra a propriedade).")
    linhas.append("\\nResponda *SIM* para confirmar ou *NAO* para cancelar.")
    return "\\n".join(linhas)


def confirmar_cadastro(sessoes: dict, key: str, numero_real: str = None, canal: str = "whatsapp") -> dict | None:
    """
    `key` é a chave da sessão (pode ser um composto "canal:numero" no
    Telegram) — usada só pra recuperar/apagar a sessão em andamento.

    `numero_real` e `canal` identificam de fato quem está confirmando —
    usados pra gravar telegram_chat_id no canal Telegram. O TELEFONE em
    si vem sempre do que a pessoa digitou no wizard (sess["telefone"]),
    inclusive no WhatsApp — permite corrigir se a pessoa estiver mandando
    de um número diferente do cadastro.
    """
    sess = sessoes.pop(key, None)
    if not sess or sess.get("_etapa") != "confirmar":
        return None

    numero_real = numero_real or key
    produtor = {
        "nome":     sess["nome"],
        "cpf":      sess["cpf"],
        "nirf":     None,
        "telefone": sess.get("telefone"),
    }
    if canal == "telegram":
        produtor["telegram_chat_id"] = numero_real

    imovel = {}
    if sess.get("_dono", True):
        imovel = {
            "nome":      sess.get("imovel_nome"),
            "municipio": sess.get("municipio"),
            "uf":        sess.get("uf"),
            "area_ha":   sess.get("area_ha"),
            "nirf":      None,
        }

    return {"produtor": produtor, "imovel": imovel}


def is_cadastro_ativo(sessoes: dict, numero: str) -> bool:
    return sessoes.get(numero, {}).get("_tipo") == "cadastro"
'''


def main():
    aplicar = "--aplicar" in sys.argv

    if not ARQUIVO.exists():
        print(f"ERRO: {ARQUIVO} não encontrado. Rode a partir da raiz do repo.")
        sys.exit(1)

    if not aplicar:
        print("=== DRY RUN (nada foi gravado) ===")
        print(f"Arquivo atual: {len(ARQUIVO.read_text(encoding='utf-8'))} chars")
        print(f"Conteúdo novo: {len(NOVO_CONTEUDO)} chars")
        print("\nRevise o conteúdo (abra este .py num editor) e, se estiver")
        print("certo, rode de novo com --aplicar.")
        return

    shutil.copy2(ARQUIVO, BACKUP)
    print(f"Backup salvo em: {BACKUP}")
    ARQUIVO.write_text(NOVO_CONTEUDO, encoding="utf-8")
    print(f"Arquivo substituído: {ARQUIVO}")


if __name__ == "__main__":
    main()
