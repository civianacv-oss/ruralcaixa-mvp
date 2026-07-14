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
import re
import logging
from datetime import date
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

        # Sub-fluxo: valor não veio no texto original, pedimos e aguardamos
        if sessoes[key].get("_aguardando_valor"):
            valor_digitado = _parse_valor_simples(texto)
            if valor_digitado is None:
                return "Não entendi o valor. Digite só o número, ex: 3500 ou 3500,00"
            sess = sessoes[key]
            sess["valor"] = valor_digitado
            sess.pop("_aguardando_valor", None)
            return _proximo_passo_apos_valor(sess, msg.numero)

        # Sub-fluxo: termo desconhecido pelo classificador — produtor escolhe
        # a conta certa, o sistema aprende e prossegue com o lançamento
        if sessoes[key].get("_aguardando_conta_novo_termo"):
            if texto_up in ("0", "CANCELAR", "CANCELA"):
                sessoes.pop(key, None)
                return "Cancelado. Pode mandar de novo quando quiser."
            escolha = _resolver_escolha_conta(texto)
            if not escolha:
                return _texto_lista_contas(prefixo="Não entendi a escolha. ")
            texto_original = sessoes[key]["_texto_original"]
            conta, label = escolha
            tipo = _tipo_da_conta(conta)
            _aprender_termos(msg.numero, texto_original, conta, tipo)
            from app.services.classifier import extrair_valor
            novo_sess = {
                "conta": conta, "tipo": tipo,
                "valor": extrair_valor(texto_original),
                "data": date.today().isoformat(),
                "confianca": 90, "produto": None, "atividade": "rural",
            }
            sessoes[key] = novo_sess
            prefixo = f"Aprendido! Da próxima vez que aparecer algo parecido, já classifico direto.\n\n"
            if novo_sess["valor"] is None:
                sessoes[key]["_aguardando_valor"] = True
                return prefixo + "Não encontrei o valor dessa transação. Qual foi o valor (em R$)?"
            return prefixo + _texto_confirmacao(novo_sess)

        # Sub-fluxo: direção ambígua (aluguel etc.) — despesa ou receita?
        if sessoes[key].get("_aguardando_direcao"):
            resp = texto_up.strip()
            sess = sessoes[key]
            if resp in ("1", "DESPESA", "PAGUEI"):
                sess["tipo"] = "despesa"
            elif resp in ("2", "RECEITA", "RECEBI"):
                sess["tipo"] = "receita"
            else:
                return _texto_pergunta_direcao(prefixo="Não entendi. ")
            sess.pop("_aguardando_direcao", None)
            sess.pop("ambiguo_direcao", None)
            return _proximo_passo_compra_animal(sess, msg.numero)

        # Sub-fluxo: compra de animal — produtor já tem cadastro de compra-e-
        # venda pra essa espécie, confirma se é revenda ou atividade rural
        if sessoes[key].get("_aguardando_tipo_atividade"):
            resp = texto_up.strip()
            sess = sessoes[key]
            if resp in ("1", "REVENDA"):
                sess.pop("_aguardando_tipo_atividade", None)
                sess["_aguardando_regime"] = True
                return _texto_pergunta_regime()
            elif resp in ("2", "RURAL", "ATIVIDADE RURAL", "CRIA", "ENGORDA"):
                sess.pop("_aguardando_tipo_atividade", None)
                sess.pop("_cv_produto_id", None)
                sess.pop("_cv_especie", None)
                return _texto_confirmacao(sess)
            else:
                return _texto_pergunta_tipo_atividade(sess.get("_cv_especie", "esse animal"), prefixo="Não entendi. ")

        # Sub-fluxo: regime de criação (define o prazo fiscal — 52 ou 138 dias)
        if sessoes[key].get("_aguardando_regime"):
            resp = texto_up.strip()
            sess = sessoes[key]
            if resp in ("1", "PASTO"):
                sess["_cv_regime"] = "pasto"
            elif resp in ("2", "CONFINAMENTO"):
                sess["_cv_regime"] = "confinamento"
            else:
                return _texto_pergunta_regime(prefixo="Não entendi. ")
            sess.pop("_aguardando_regime", None)
            sess["_aguardando_quantidade"] = True
            return "Quantos animais foram comprados?"

        # Sub-fluxo: quantidade — última pergunta antes de gravar no módulo
        # de compra-e-venda (não vira lançamento LCDPR normal)
        if sessoes[key].get("_aguardando_quantidade"):
            qtd = _parse_quantidade_simples(texto)
            if qtd is None:
                return "Não entendi a quantidade. Digite só o número, ex: 10"
            sess = sessoes.pop(key)
            try:
                compra_id = _criar_compra_cv(
                    imovel_id=_resolver_imovel_id(msg.numero),
                    produto_id=sess["_cv_produto_id"],
                    quantidade=qtd,
                    valor_total=sess["valor"],
                    regime=sess["_cv_regime"],
                )
                prazo = "52 dias (confinamento)" if sess["_cv_regime"] == "confinamento" else "138 dias (pasto)"
                return (
                    f"✅ Compra de compra-e-venda #{compra_id} registrada!\n"
                    f"Produto: {sess.get('_cv_especie','')}\n"
                    f"Quantidade: {qtd:g}\n"
                    f"Valor total: R$ {sess['valor']:,.2f}\n"
                    f"Regime: {sess['_cv_regime']}\n\n"
                    f"⚠️ Prazo fiscal pra continuar fora do LCDPR: {prazo} a partir de hoje "
                    f"(Lei 8.023/90 / RIR — Decreto 9.580/2018). Acompanhe em Compra e Venda → Alertas Fiscais."
                )
            except Exception as e:
                logger.error("Erro ao gravar compra CV: %s", e)
                return "Erro ao gravar a compra. Tente novamente ou lance pelo app."

        # Sub-fluxo: usuário já rejeitou a conta sugerida e está escolhendo a certa
        if sessoes[key].get("_aguardando_conta"):
            if texto_up in ("0", "CANCELAR", "CANCELA"):
                sessoes.pop(key, None)
                return "Cancelado. Pode mandar de novo quando quiser."
            escolha = _resolver_escolha_conta(texto)
            if not escolha:
                return _texto_lista_contas(prefixo="Não entendi a escolha. ")
            sess = sessoes[key]
            sess["conta"] = escolha[0]
            sess["tipo"] = _tipo_da_conta(escolha[0])
            sess.pop("_aguardando_conta", None)
            return f"Conta atualizada para {escolha[0]} — {escolha[1]}.\n\n" + _texto_confirmacao(sess)

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
            # Em vez de cancelar direto, oferece trocar a conta sugerida —
            # a maioria dos "não" é sobre a conta estar errada, não sobre
            # desistir do lançamento inteiro. Cancelamento total continua
            # disponível a partir da lista (opção 0).
            sessoes[key]["_aguardando_conta"] = True
            return _texto_lista_contas()

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

    keywords_caprino = ["cabra", "caprino", "bode", "cabrito", "chibato", "cabrita"]
    if any(k in texto.lower() for k in keywords_caprino):
        return await _processar_zootecnico(msg, "caprino", texto)

    keywords_bovino = ["boi", "vaca", "novilho", "bezerro", "bovino",
                       "nelore", "angus", "gado"]
    if any(k in texto.lower() for k in keywords_bovino):
        return await _processar_zootecnico(msg, "bovino", texto)

    keywords_pisc = ["peixe", "tilapia", "tambaqui", "viveiro", "tanque",
                     "aerador", "biometria", "despesca", "alevino"]
    if any(k in texto.lower() for k in keywords_pisc):
        return await _processar_zootecnico(msg, "piscicultura", texto)

    # Classificação financeira via IA (com termos que o produtor já ensinou antes)
    termos_aprendidos = _buscar_termos_aprendidos(msg.numero)
    resultado = classificar(texto, termos_aprendidos=termos_aprendidos)
    if not resultado:
        sessoes[key] = {"_aguardando_conta_novo_termo": True, "_texto_original": texto}
        return _texto_lista_contas(
            prefixo=f"Não reconheci esse tipo de lançamento (\"{texto[:60]}\"). "
        )

    sessoes[key] = resultado

    # Sem sinal de valor confiável no texto — pergunta antes de seguir
    if resultado.get("valor") is None:
        sessoes[key]["_aguardando_valor"] = True
        return "Não encontrei o valor dessa transação. Qual foi o valor (em R$)?"

    return _proximo_passo_apos_valor(resultado, msg.numero)


def _resolver_imovel_id(numero: str) -> int:
    """Resolve o imovel_id a partir dos últimos 8 dígitos do telefone.
    Mesmo padrão já usado nos 4 blocos de _processar_zootecnico — fatorado
    aqui pra reaproveitar na checagem de compra-e-venda também."""
    from app.db import engine
    from sqlalchemy import text as sqlt
    with engine.connect() as conn:
        row = conn.execute(sqlt(
            "SELECT id FROM imoveis_rurais WHERE produtor_id = "
            "(SELECT id FROM produtores WHERE telefone LIKE :tel LIMIT 1) LIMIT 1"
        ), {"tel": f"%{numero[-8:]}"}).fetchone()
        return row[0] if row else 1


def _produto_compra_venda(imovel_id: int, especie: str):
    """Verifica se o produtor já tem cadastro de compra-e-venda (cv_produtos)
    pra essa espécie neste imóvel. Retorna o id do produto se existir, ou
    None se não tiver — é essa checagem que decide se pergunta a intenção
    (revenda vs rural) ou classifica automaticamente como rural."""
    from app.db import engine
    from sqlalchemy import text as sqlt
    with engine.connect() as conn:
        row = conn.execute(sqlt(
            "SELECT id FROM cv_produtos WHERE imovel_id = :imovel "
            "AND LOWER(especie) = LOWER(:especie) LIMIT 1"
        ), {"imovel": imovel_id, "especie": especie}).fetchone()
        return row[0] if row else None


def _criar_compra_cv(imovel_id: int, produto_id: int, quantidade: float,
                      valor_total: float, regime: str) -> int:
    """Cria o registro de compra no módulo de compra-e-venda (cv_compras),
    de onde o alerta de prazo fiscal (52 dias confinamento / 138 dias pasto)
    já é calculado automaticamente por app/routers/compravenda.py."""
    from app.db import engine
    from sqlalchemy import text as sqlt
    valor_unitario = valor_total / quantidade if quantidade else valor_total
    with engine.connect() as conn:
        row = conn.execute(sqlt("""
            INSERT INTO cv_compras
                (imovel_id, produto_id, data_compra, quantidade, valor_unitario,
                 valor_total, regime, observacoes)
            VALUES (:imovel, :produto, CURRENT_DATE, :qtd, :vu, :vt, :regime,
                    'Lançado via WhatsApp/Telegram')
            RETURNING id
        """), {"imovel": imovel_id, "produto": produto_id, "qtd": quantidade,
               "vu": valor_unitario, "vt": valor_total, "regime": regime}).fetchone()
        conn.commit()
        return row[0]


def _parse_quantidade_simples(texto: str):
    texto = texto.strip().replace(",", ".")
    try:
        q = float(texto)
        return q if q > 0 else None
    except ValueError:
        return None


def _texto_pergunta_tipo_atividade(especie: str, prefixo: str = "") -> str:
    return (
        f"{prefixo}Você tem cadastro de compra-e-venda para {especie}. Essa compra é "
        f"para revenda (entra no controle de compra-e-venda, com alerta de prazo fiscal) "
        f"ou para manter no rebanho (atividade rural normal, entra no LCDPR)?\n\n"
        f"1. Revenda (compra-e-venda)\n"
        f"2. Rural (cria/engorda)"
    )


def _texto_pergunta_direcao(prefixo: str = "") -> str:
    return (
        f"{prefixo}Isso é uma despesa (você pagou pra alugar de alguém) ou "
        f"receita (você recebeu por alugar algo seu)?\n\n"
        f"1. Despesa (paguei)\n"
        f"2. Receita (recebi)"
    )


def _proximo_passo_apos_valor(sess: dict, numero: str) -> str:
    """Chamado sempre que um lançamento já tem valor definido — verifica
    primeiro se a direção (receita/despesa) ficou ambígua (ex: aluguel sem
    dizer quem pagou/recebeu) antes de seguir pro fluxo de compra de animal
    e a confirmação final."""
    if sess.get("ambiguo_direcao"):
        sess["_aguardando_direcao"] = True
        return _texto_pergunta_direcao()
    return _proximo_passo_compra_animal(sess, numero)


def _proximo_passo_compra_animal(sess: dict, numero: str) -> str:
    """Chamado sempre que uma compra de animal (conta 5.3) já tem valor
    definido — decide se pergunta revenda-vs-rural (produtor já tem cadastro
    de compra-e-venda pra essa espécie) ou segue direto pra confirmação
    normal como atividade rural (produtor não tem esse cadastro)."""
    if sess.get("conta") == "5.3" and sess.get("produto"):
        imovel_id = _resolver_imovel_id(numero)
        produto_cv_id = _produto_compra_venda(imovel_id, sess["produto"])
        if produto_cv_id:
            sess["_aguardando_tipo_atividade"] = True
            sess["_cv_produto_id"] = produto_cv_id
            sess["_cv_especie"] = sess["produto"]
            return _texto_pergunta_tipo_atividade(sess["produto"])
    return _texto_confirmacao(sess)


def _texto_pergunta_regime(prefixo: str = "") -> str:
    return (
        f"{prefixo}Qual o regime de criação?\n\n"
        f"1. Pasto (prazo fiscal: 138 dias)\n"
        f"2. Confinamento (prazo fiscal: 52 dias)"
    )


def _parse_valor_simples(texto: str):
    """Parse direto de um valor digitado em resposta à pergunta 'qual o valor?'
    Aceita '3500', '3500,00', '3.500,00', 'R$ 3500'."""
    texto = texto.strip().upper().replace("R$", "").replace(" ", "")
    texto = texto.replace(".", "").replace(",", ".")
    try:
        v = float(texto)
        return v if v > 0 else None
    except ValueError:
        return None


ATIVIDADE_LABELS = {
    "rural": "Rural (LCDPR)",
    "intermediacao": "Comercial (intermediação — fora do LCDPR)",
    "servico": "Serviço prestado (fora do LCDPR)",
}


def _texto_confirmacao(sess: dict) -> str:
    tipo_label = {"receita": "💰 RECEITA", "despesa": "💸 DESPESA"}.get(
        sess["tipo"], "📊 INVESTIMENTO"
    )
    atividade_label = ATIVIDADE_LABELS.get(sess.get("atividade", "rural"), "Rural (LCDPR)")
    return (
        f"Recebi! Lançamento sugerido:\n\n"
        f"{tipo_label}\n"
        f"Valor: R$ {sess['valor']:,.2f}\n"
        f"Conta: {sess['conta']}\n"
        f"Atividade: {atividade_label}\n"
        f"Produto: {sess.get('produto') or 'N/A'}\n"
        f"Confiança: {sess['confianca']}%\n\n"
        f"Responda SIM para confirmar ou NÃO para escolher outra conta."
    )


# ── Catálogo de contas (plano de contas simplificado, mesmos códigos de
# app/services/classifier.py) — usado quando o produtor rejeita a conta
# sugerida pela IA e precisa escolher a correta numa lista. ──────────────
CONTAS_DISPONIVEIS = [
    ("1.1", "Receita geral (venda não especificada)"),
    ("1.1.1", "Receita — produção agrícola (grãos, café, cana...)"),
    ("1.1.2", "Receita — produção animal (bovino, suíno, aves, leite...)"),
    ("3.1.1", "Despesa — insumos agrícolas (semente, adubo, defensivo)"),
    ("3.1.2", "Despesa — combustível"),
    ("3.1.3", "Despesa — ração/medicamento animal"),
    ("3.1.4", "Despesa — mão de obra/salários"),
    ("3.1.5", "Despesa — manutenção/reparo"),
    ("3.1.6", "Despesa — energia"),
    ("3.1.7", "Despesa — arrendamento/aluguel rural"),
    ("5.1", "Investimento — máquinas/equipamentos"),
    ("5.2", "Investimento — obras/benfeitorias"),
    ("5.3", "Investimento — compra de animais (matriz/plantel)"),
]


def _texto_lista_contas(prefixo: str = "") -> str:
    linhas = [f"{prefixo}Qual é a conta correta?\n"]
    for i, (codigo, label) in enumerate(CONTAS_DISPONIVEIS, start=1):
        linhas.append(f"{i}. {codigo} — {label}")
    linhas.append("\n0. Cancelar o lançamento")
    linhas.append("\nResponda com o número da conta.")
    return "\n".join(linhas)


STOPWORDS_APRENDIZADO = {
    "de", "da", "do", "das", "dos", "a", "o", "e", "para", "pra", "pro", "por",
    "com", "em", "um", "uma", "uns", "umas", "no", "na", "nos", "nas", "ao",
    "aos", "as", "os", "reais", "real", "rs", "comprei", "compra", "comprar",
    "vendi", "venda", "vender", "paguei", "recebi", "gastei",
}


def _extrair_termos_significativos(texto: str) -> list:
    """Extrai palavras que valem a pena aprender de uma frase — remove
    números, moeda e palavras muito comuns/genéricas."""
    palavras = re.findall(r"[a-zà-úA-ZÀ-Ú]+", texto.lower())
    return [p for p in palavras if len(p) >= 4 and p not in STOPWORDS_APRENDIZADO]


def _buscar_termos_aprendidos(numero: str) -> dict:
    """Busca os termos que esse produtor já ensinou antes (correções
    manuais de lançamentos que o classificador não reconheceu)."""
    from app.db import engine
    from sqlalchemy import text as sqlt
    produtor_id = _resolver_produtor_id(numero)
    if not produtor_id:
        return {}
    with engine.connect() as conn:
        rows = conn.execute(sqlt("""
            SELECT termo, conta, tipo FROM termos_aprendidos_financeiro
            WHERE produtor_id = :produtor_id
        """), {"produtor_id": produtor_id}).fetchall()
        return {r[0]: (r[1], r[2]) for r in rows}


def _resolver_produtor_id(numero: str):
    from app.db import engine
    from sqlalchemy import text as sqlt
    with engine.connect() as conn:
        row = conn.execute(sqlt(
            "SELECT id FROM produtores WHERE telefone LIKE :tel LIMIT 1"
        ), {"tel": f"%{numero[-8:]}"}).fetchone()
        return row[0] if row else None


def _aprender_termos(numero: str, texto_original: str, conta: str, tipo: str):
    """Grava os termos significativos da frase como aprendizado — da
    próxima vez que qualquer uma dessas palavras aparecer, classifica
    direto sem perguntar de novo."""
    from app.db import engine
    from sqlalchemy import text as sqlt
    produtor_id = _resolver_produtor_id(numero)
    if not produtor_id:
        return
    termos = _extrair_termos_significativos(texto_original)
    if not termos:
        return
    with engine.connect() as conn:
        for termo in termos:
            conn.execute(sqlt("""
                INSERT INTO termos_aprendidos_financeiro (termo, conta, tipo, produtor_id)
                VALUES (:termo, :conta, :tipo, :produtor_id)
                ON CONFLICT (termo, produtor_id) DO UPDATE SET
                    conta = EXCLUDED.conta, tipo = EXCLUDED.tipo,
                    vezes_usado = termos_aprendidos_financeiro.vezes_usado + 1,
                    atualizado_em = NOW()
            """), {"termo": termo, "conta": conta, "tipo": tipo, "produtor_id": produtor_id})
        conn.commit()


def _tipo_da_conta(codigo: str) -> str:
    """Deriva receita/despesa/investimento a partir do prefixo do código da
    conta (1.x = receita, 3.x = despesa, 5.x = investimento) — usado quando
    o produtor escolhe uma conta diferente da sugerida, pra não deixar o
    tipo desatualizado (ex: mudar pra uma conta de receita mas continuar
    mostrando 'DESPESA')."""
    if codigo.startswith("1."):
        return "receita"
    if codigo.startswith("3."):
        return "despesa"
    return "investimento"


def _resolver_escolha_conta(texto: str):
    """Aceita tanto o número da lista (ex: '3') quanto o código direto
    (ex: '3.1.2'). Retorna (codigo, label) ou None se não reconhecer."""
    texto = texto.strip()
    if texto.isdigit():
        idx = int(texto)
        if 1 <= idx <= len(CONTAS_DISPONIVEIS):
            return CONTAS_DISPONIVEIS[idx - 1]
        return None
    for codigo, label in CONTAS_DISPONIVEIS:
        if texto == codigo:
            return (codigo, label)
    return None


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

        if modulo == "caprino":
            from app.routers.caprino import webhook_whatsapp_caprino, WhatsAppMensagem as WhatsAppMensagemCaprino
            from app.db import engine
            from sqlalchemy import text as sqlt
            with engine.connect() as conn:
                row = conn.execute(sqlt(
                    "SELECT id FROM imoveis_rurais WHERE produtor_id = "
                    "(SELECT id FROM produtores WHERE telefone LIKE :tel LIMIT 1) LIMIT 1"
                ), {"tel": f"%{msg.numero[-8:]}"}).fetchone()
                imovel_id = row[0] if row else 1
            payload = WhatsAppMensagemCaprino(
                telefone=msg.numero, tipo_midia="texto",
                conteudo=texto, imovel_id=imovel_id,
            )
            resultado = webhook_whatsapp_caprino(payload)
            return resultado.get("resumo", "Registrado.")

        if modulo == "bovino":
            from app.routers.bovino import webhook_whatsapp_bovino, WhatsAppMensagemBovino
            from app.db import engine
            from sqlalchemy import text as sqlt
            with engine.connect() as conn:
                row = conn.execute(sqlt(
                    "SELECT id FROM imoveis_rurais WHERE produtor_id = "
                    "(SELECT id FROM produtores WHERE telefone LIKE :tel LIMIT 1) LIMIT 1"
                ), {"tel": f"%{msg.numero[-8:]}"}).fetchone()
                imovel_id = row[0] if row else 1
            payload = WhatsAppMensagemBovino(
                telefone=msg.numero, tipo_midia="texto",
                conteudo=texto, imovel_id=imovel_id,
            )
            resultado = webhook_whatsapp_bovino(payload)
            return resultado.get("resumo", "Registrado.")

        if modulo == "piscicultura":
            from app.routers.piscicultura import webhook_whatsapp_piscicultura, WhatsAppMensagemPiscicultura
            from app.db import engine
            from sqlalchemy import text as sqlt
            with engine.connect() as conn:
                row = conn.execute(sqlt(
                    "SELECT id FROM imoveis_rurais WHERE produtor_id = "
                    "(SELECT id FROM produtores WHERE telefone LIKE :tel LIMIT 1) LIMIT 1"
                ), {"tel": f"%{msg.numero[-8:]}"}).fetchone()
                imovel_id = row[0] if row else 1
            payload = WhatsAppMensagemPiscicultura(
                telefone=msg.numero, tipo_midia="texto",
                conteudo=texto, imovel_id=imovel_id,
            )
            resultado = webhook_whatsapp_piscicultura(payload)
            return resultado.get("resumo", "Registrado.")

        return f"Módulo {modulo} recebido. Acesse o app para detalhes."
    except Exception as e:
        logger.error("Erro zootécnico %s: %s", modulo, e)
        return f"Erro ao processar registro {modulo}."
