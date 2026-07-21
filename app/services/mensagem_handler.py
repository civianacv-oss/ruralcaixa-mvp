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

        # Sub-fluxo: escolha do lote de bovino (piloto de rastreabilidade
        # de custo por unidade de produção)
        if sessoes[key].get("_aguardando_lote_bovino"):
            resultado_pendente = sessoes[key]["_resultado_pendente"]
            lotes = sessoes[key]["_lotes_disponiveis"]
            if texto_up not in ("0",) and not (texto_up.isdigit() and 1 <= int(texto_up) <= len(lotes)):
                linhas = ["Não entendi. Isso foi pra qual lote de bovino?\n"]
                for i, lote in enumerate(lotes, start=1):
                    linhas.append(f"{i}. {lote['nome']}")
                linhas.append("\n0. Não é de um lote específico / custo geral da fazenda")
                return "\n".join(linhas)

            if texto_up != "0":
                lote_escolhido = lotes[int(texto_up) - 1]
                resultado_pendente["_origem_modulo"] = "bovino"
                resultado_pendente["_origem_tipo"] = "lote"
                resultado_pendente["_origem_id"] = lote_escolhido["id"]
                resultado_pendente["_origem_descricao"] = lote_escolhido["nome"]

            sessoes[key] = resultado_pendente
            return _texto_confirmacao_consumo(resultado_pendente)

        # Sub-fluxo: consumo de insumo ambíguo — produtor escolhe qual dos
        # candidatos empatados é o certo
        if sessoes[key].get("_aguardando_escolha_insumo"):
            if texto_up in ("0", "CANCELAR", "CANCELA", "NENHUM"):
                sessoes.pop(key, None)
                return "Cancelado. Pode mandar de novo com o nome mais específico do insumo."
            candidatos = sessoes[key]["_candidatos_insumo"]
            if not texto_up.isdigit() or not (1 <= int(texto_up) <= len(candidatos)):
                linhas = ["Não entendi a escolha. Qual desses?\n"]
                for i, c in enumerate(candidatos, start=1):
                    linhas.append(f"{i}. {c['nome']} ({c['estoque_atual']:g} {c['unidade']} em estoque)")
                linhas.append("\n0. Nenhum desses / cancelar")
                return "\n".join(linhas)

            escolhido = candidatos[int(texto_up) - 1]
            quantidade = sessoes[key]["_quantidade_consumida"]
            from app.db import engine
            from sqlalchemy import text as sqlt
            with engine.connect() as conn:
                row = conn.execute(sqlt("""
                    SELECT id, nome, categoria, unidade, estoque_atual, preco_estimado, custo_medio
                    FROM insumos WHERE id = :iid
                """), {"iid": escolhido["id"]}).fetchone()
            novo_resultado = _montar_resultado_insumo(row, quantidade)
            auth_local = _autorizar_numero(msg.numero, msg.canal)
            return _avancar_consumo_insumo(sessoes, key, novo_resultado, auth_local.get("imovel_id"))

        # Sub-fluxo: valor não veio no texto original, pedimos e aguardamos
        if sessoes[key].get("_aguardando_valor"):
            valor_digitado = _parse_valor_simples(texto)
            if valor_digitado is None:
                return "Não entendi o valor. Digite só o número, ex: 3500 ou 3500,00"
            sess = sessoes[key]
            sess["valor"] = valor_digitado
            sess.pop("_aguardando_valor", None)
            return _proximo_passo_apos_valor(sess, msg.numero)

        # Sub-fluxo NOVO: pergunta o tipo (receita/despesa/investimento)
        # antes de mostrar a lista de contas — reduz a lista de ~13 opções
        # pra só as 2-4 relevantes daquele tipo
        if sessoes[key].get("_aguardando_tipo_novo_termo"):
            if texto_up in ("0", "CANCELAR", "CANCELA"):
                sessoes.pop(key, None)
                return "Cancelado. Pode mandar de novo quando quiser."
            tipo_escolhido = {
                "1": "receita", "RECEITA": "receita",
                "2": "despesa", "DESPESA": "despesa",
                "3": "investimento", "INVESTIMENTO": "investimento",
            }.get(texto_up)
            if not tipo_escolhido:
                return _texto_pergunta_tipo_lancamento(prefixo="Não entendi. ")
            sessoes[key]["_tipo_escolhido"] = tipo_escolhido
            sessoes[key].pop("_aguardando_tipo_novo_termo", None)
            sessoes[key]["_aguardando_conta_novo_termo"] = True
            return _texto_lista_contas_por_tipo(tipo_escolhido)

        # Sub-fluxo: termo desconhecido pelo classificador — produtor escolhe
        # a conta certa, o sistema aprende e prossegue com o lançamento
        if sessoes[key].get("_aguardando_conta_novo_termo"):
            if texto_up in ("0", "CANCELAR", "CANCELA"):
                sessoes.pop(key, None)
                return "Cancelado. Pode mandar de novo quando quiser."
            tipo_filtro = sessoes[key].get("_tipo_escolhido")
            if tipo_filtro:
                escolha = _resolver_escolha_conta_por_tipo(texto, tipo_filtro)
                if not escolha:
                    return _texto_lista_contas_por_tipo(tipo_filtro, prefixo="Não entendi a escolha. ")
            else:
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

        # Sub-fluxo: compra/venda de animal (bovino/ovino/caprino) já tem
        # todos os dados identificados e está esperando confirmação (SIM/
        # NÃO) antes de gravar — envolve valor e classificação fiscal, não
        # deve ser gravado sem o produtor confirmar.
        if sessoes[key].get("_aguardando_confirmacao_compravenda"):
            resp = texto_up.strip()
            dados = sessoes[key]["_dados_pendentes"]
            if resp in ("0", "NAO", "NÃO", "N", "CANCELAR", "CANCELA"):
                sessoes.pop(key, None)
                return "Cancelado. Nada foi gravado."
            if resp in ("SIM", "S", "OK", "CONFIRMA"):
                sessoes.pop(key, None)
                return _executar_acao_compravenda(dados)
            return "Não entendi. Responda SIM para confirmar ou NÃO para cancelar."

        # Sub-fluxo: venda cuja classificação fiscal depende do regime real
        # da compra original (zona cinzenta: 52-138 dias, regime gravado
        # como pasto) — a resposta aqui já serve como confirmação da venda.
        if sessoes[key].get("_aguardando_regime_venda"):
            resp = texto_up.strip()
            dados = sessoes[key]["_dados_pendentes"]
            if resp in ("0", "CANCELAR", "CANCELA"):
                sessoes.pop(key, None)
                return "Cancelado. Nada foi gravado."
            if resp in ("1", "PASTO"):
                sessoes.pop(key, None)
                return _executar_acao_compravenda(dados)
            if resp in ("2", "CONFINAMENTO"):
                sessoes.pop(key, None)
                dados["regime_override"] = {dados["compra_id_ambiguo"]: "confinamento"}
                return _executar_acao_compravenda(dados)
            return "Não entendi. Responda 1 (pasto), 2 (confinamento) ou 0 (cancelar)."

        # Sub-fluxo: módulo zootécnico (bovino/ovino/caprino/piscicultura)
        # pediu um complemento (valor, peso, brinco etc.) e está esperando
        # a resposta — sem isso, a próxima mensagem virava um lançamento
        # novo do zero e perdia todo o contexto (ex: "compra de bezerro" +
        # "300" caindo no fluxo genérico de classificação financeira).
        if sessoes[key].get("_aguardando_complemento_zootecnico"):
            if texto_up in ("0", "CANCELAR", "CANCELA"):
                sessoes.pop(key, None)
                return "Cancelado. Pode mandar de novo quando quiser."
            modulo = sessoes[key]["_zootecnico_modulo"]
            texto_original = sessoes[key]["_zootecnico_texto_original"]
            sessoes.pop(key, None)
            texto_combinado = f"{texto_original} {texto}".strip()
            return await _processar_zootecnico(msg, modulo, texto_combinado, sessoes, key)

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

            # Consumo de insumo já em estoque — NÃO cria despesa nova (o
            # gasto já foi registrado na aquisição). Só dá baixa e aloca o
            # custo pro lote/atividade (regra: aquisição=despesa, baixa=
            # custeio, nunca os dois — evita duplicar o mesmo gasto).
            if sess.get("_consumo_puro"):
                from app.db import get_db
                from app.services.estoque_insumos import aplicar_movimentacao_insumo
                from fastapi import HTTPException as _HTTPException

                conn_estoque = get_db()
                try:
                    cur_estoque = conn_estoque.cursor()
                    alerta_estoque_negativo = ""
                    try:
                        resultado_mov = aplicar_movimentacao_insumo(
                            cur_estoque,
                            fazenda_id=sess.get("_imovel_id") or 1,
                            insumo_id=sess["_insumo_id"],
                            tipo="uso",
                            quantidade=sess["_quantidade_consumida"],
                            origem_modulo=sess.get("_origem_modulo"),
                            origem_tipo=sess.get("_origem_tipo"),
                            origem_id=sess.get("_origem_id"),
                            origem_descricao=sess.get("_origem_descricao") or "Consumo via WhatsApp/Telegram",
                        )
                    except _HTTPException as e:
                        if e.status_code == 400 and "insuficiente" in str(e.detail).lower():
                            # Não bloqueia — deixa ir negativo e avisa, em vez
                            # de travar o produtor por causa de uma divergência
                            # de registro (compra não lançada, erro de digitação
                            # etc.). O estoque negativo já vira alerta "crítico"
                            # automático no painel de Insumos (vw_insumos_alerta).
                            conn_estoque.rollback()
                            cur_estoque = conn_estoque.cursor()
                            resultado_mov = aplicar_movimentacao_insumo(
                                cur_estoque,
                                fazenda_id=sess.get("_imovel_id") or 1,
                                insumo_id=sess["_insumo_id"],
                                tipo="uso",
                                quantidade=sess["_quantidade_consumida"],
                                origem_modulo=sess.get("_origem_modulo"),
                                origem_tipo=sess.get("_origem_tipo"),
                                origem_id=sess.get("_origem_id"),
                                origem_descricao=sess.get("_origem_descricao") or "Consumo via WhatsApp/Telegram",
                                permitir_estoque_negativo=True,
                            )
                            alerta_estoque_negativo = (
                                f"\n\n⚠️ ATENÇÃO: a quantidade registrada é maior do que o "
                                f"estoque tinha ({sess['_insumo_nome']} ficou com "
                                f"{resultado_mov['novo_estoque']:g} no sistema). "
                                f"Confira o estoque físico — pode ter uma compra não "
                                f"lançada ou um erro de quantidade. Isso já apareceu "
                                f"como alerta crítico no painel de Insumos."
                            )
                        else:
                            raise

                    conn_estoque.commit()
                    destino = f" — {sess['_origem_descricao']}" if sess.get("_origem_descricao") else ""
                    return (
                        f"✅ Baixa registrada no estoque!\n\n"
                        f"📦 {sess['_insumo_nome']}\n"
                        f"Quantidade: {sess['_quantidade_consumida']:g}\n"
                        f"Restam: {resultado_mov['novo_estoque']:g}\n"
                        f"Custo alocado: R$ {resultado_mov['custo_total']:.2f}{destino}\n\n"
                        f"(Isso não gera despesa nova — o gasto já foi registrado na compra desse insumo.)"
                        f"{alerta_estoque_negativo}"
                    )
                except Exception as e:
                    logger.error("Erro ao dar baixa no insumo (consumo puro): %s", e)
                    detalhe = getattr(e, "detail", str(e))
                    return f"⚠️ Não consegui dar baixa no estoque: {detalhe}"
                finally:
                    conn_estoque.close()

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

            entrada_insumo_msg = ""
            if sess.get("_compra_insumo_id"):
                try:
                    from app.db import get_db
                    from app.services.estoque_insumos import aplicar_movimentacao_insumo
                    conn_estoque = get_db()
                    try:
                        cur_estoque = conn_estoque.cursor()
                        resultado_mov = aplicar_movimentacao_insumo(
                            cur_estoque,
                            fazenda_id=sess.get("_imovel_id") or 1,
                            insumo_id=sess["_compra_insumo_id"],
                            tipo="compra",
                            quantidade=sess["_compra_quantidade"],
                            custo_unitario=sess.get("_compra_custo_unitario"),
                            origem_modulo="mensageria",
                            origem_tipo="compra",
                            origem_descricao=f"Compra via WhatsApp/Telegram — lançamento #{lancamento_id}",
                        )
                        conn_estoque.commit()
                        entrada_insumo_msg = (
                            f"\n📦 Entrada no estoque: {sess['_compra_insumo_nome']} "
                            f"(+{sess['_compra_quantidade']:g}, novo estoque {resultado_mov['novo_estoque']:g}, "
                            f"custo médio R$ {resultado_mov['novo_custo_medio']:.2f})"
                        )
                    finally:
                        conn_estoque.close()
                except Exception as e:
                    logger.error("Erro ao dar entrada no insumo: %s", e)
                    detalhe = getattr(e, "detail", str(e))
                    entrada_insumo_msg = f"\n⚠️ Lançamento gravado, mas não consegui dar entrada no estoque: {detalhe}"

            return (
                f"✅ Lançamento #{lancamento_id} gravado!\n"
                f"Tipo: {sess.get('tipo','').upper()}\n"
                f"Conta: {sess.get('conta','')}\n"
                f"Valor: R$ {sess.get('valor', 0):,.2f}\n"
                f"Data: {sess.get('data','')}\n\n"
                f"Envie a foto ou PDF do comprovante para vincular."
                f"{entrada_insumo_msg}"
            )
        elif texto_up in ("NAO", "N", "CANCELA"):
            if sessoes[key].get("_consumo_puro"):
                sessoes.pop(key, None)
                return "Cancelado. Pode mandar de novo quando quiser."
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

    # Autorização — só produtor dono ou administrador vinculado podem
    # criar lançamentos/registros. Comandos de consulta e cadastro (acima)
    # continuam livres pra qualquer número.
    auth = _autorizar_numero(msg.numero, msg.canal)
    if not auth["autorizado"]:
        if auth["produtor_id"] is None:
            return (
                "Esse número não está cadastrado no RuralCaixa ainda.\n"
                "Fale com o responsável pela propriedade pra ser adicionado, "
                "ou digite CADASTRAR pra começar um cadastro novo."
            )
        return (
            "Seu número já está cadastrado, mas não está vinculado a nenhuma "
            "propriedade ainda.\n"
            "Peça pro proprietário te adicionar como administrador em "
            "Propriedades → (ícone de pessoas) no painel do RuralCaixa."
        )

    # Detecção módulos zootécnicos
    keywords_ovino = ["brinco", "ovino", "ovelha", "cordeiro", "carneiro",
                      "pesagem", "vacina", "vermifug", "parto", "monta",
                      "famacha", "abate", "desmame"]
    if any(k in texto.lower() for k in keywords_ovino):
        return await _processar_zootecnico(msg, "ovino", texto, sessoes, key)

    keywords_caprino = ["cabra", "caprino", "bode", "cabrito", "chibato", "cabrita"]
    if any(k in texto.lower() for k in keywords_caprino):
        return await _processar_zootecnico(msg, "caprino", texto, sessoes, key)

    keywords_bovino = ["boi", "vaca", "novilho", "bezerro", "bovino",
                       "nelore", "angus", "gado"]
    if any(k in texto.lower() for k in keywords_bovino):
        return await _processar_zootecnico(msg, "bovino", texto, sessoes, key)

    keywords_pisc = ["peixe", "tilapia", "tambaqui", "viveiro", "tanque",
                     "aerador", "biometria", "despesca", "alevino"]
    if any(k in texto.lower() for k in keywords_pisc):
        return await _processar_zootecnico(msg, "piscicultura", texto, sessoes, key)

    # Consumo de insumo já cadastrado no estoque — NUNCA vira lançamento
    # (a despesa já foi registrada na aquisição). É só baixa de estoque +
    # alocação de custo pro lote/atividade, pra não duplicar o gasto.
    resultado_insumo = _detectar_consumo_insumo(texto, auth["imovel_id"])
    if resultado_insumo and resultado_insumo.get("_candidatos_insumo_ambiguo"):
        candidatos = resultado_insumo["_candidatos_insumo_ambiguo"]
        sessoes[key] = {
            "_aguardando_escolha_insumo": True,
            "_candidatos_insumo": candidatos,
            "_quantidade_consumida": resultado_insumo["_quantidade_consumida"],
        }
        linhas = ["Encontrei mais de um insumo parecido no seu estoque. Qual você quis dizer?\n"]
        for i, c in enumerate(candidatos, start=1):
            linhas.append(f"{i}. {c['nome']} ({c['estoque_atual']:g} {c['unidade']} em estoque)")
        linhas.append("\n0. Nenhum desses / cancelar")
        return "\n".join(linhas)

    if resultado_insumo:
        # Piloto: pergunta o lote de bovino quando houver lote ativo
        # cadastrado. Base pra estender depois a ovino/caprino/suino/
        # piscicultura/fruticultura, seguindo o mesmo padrão origem_modulo/
        # tipo/id.
        return _avancar_consumo_insumo(sessoes, key, resultado_insumo, auth["imovel_id"])

    # Classificação financeira via IA (com termos que o produtor já ensinou antes)
    termos_aprendidos = _buscar_termos_aprendidos(msg.numero)
    resultado = classificar(texto, termos_aprendidos=termos_aprendidos)

    if not resultado:
        sessoes[key] = {"_aguardando_tipo_novo_termo": True, "_texto_original": texto}
        return _texto_pergunta_tipo_lancamento(
            prefixo=f"Não reconheci esse tipo de lançamento (\"{texto[:60]}\"). "
        )

    # Compra de insumo já cadastrado no catálogo — além da despesa normal
    # (já classificada acima), dá ENTRADA automática no estoque na
    # confirmação. Espelha o consumo (baixa), fechando o ciclo aquisição
    # -> estoque -> baixa -> custeio.
    if resultado.get("tipo") == "despesa" and resultado.get("valor"):
        compra_insumo = _detectar_compra_insumo(texto, resultado["valor"], auth["imovel_id"])
        if compra_insumo:
            resultado.update(compra_insumo)

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
    linhas.append("\nDigite só o número da lista acima (ex: 1), não o código da conta.")
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
    (ex: '3.1.2', ou '312' sem pontuação). Retorna (codigo, label) ou
    None se não reconhecer."""
    texto_norm = _normalizar_entrada_conta(texto)
    if texto_norm.isdigit():
        idx = int(texto_norm)
        if 1 <= idx <= len(CONTAS_DISPONIVEIS):
            return CONTAS_DISPONIVEIS[idx - 1]
        for codigo, label in CONTAS_DISPONIVEIS:
            if codigo.replace(".", "") == texto_norm:
                return (codigo, label)
        return None
    for codigo, label in CONTAS_DISPONIVEIS:
        if texto_norm == codigo:
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


async def _processar_zootecnico(msg: MsgIn, modulo: str, texto: str,
                                  sessoes: dict = None, key: str = None) -> str:
    def _marcar_pendencia_se_necessario(resultado: dict):
        # Qualquer status "pendente" nesses módulos significa que o bot fez
        # uma pergunta de volta (valor, peso, brinco...) — registra a
        # pendência pra próxima mensagem ser tratada como complemento desse
        # mesmo lançamento, e não como uma mensagem nova do zero.
        if sessoes is None or key is None:
            return
        status = resultado.get("status")
        if status == "pendente":
            sessoes[key] = {
                "_aguardando_complemento_zootecnico": True,
                "_zootecnico_modulo": modulo,
                "_zootecnico_texto_original": texto,
            }
        elif status == "confirmar":
            # Compra/venda com todos os dados já identificados, mas ainda
            # não gravados — espera confirmação explícita (SIM/NÃO) antes
            # de comprometer valor e classificação fiscal.
            sessoes[key] = {
                "_aguardando_confirmacao_compravenda": True,
                "_dados_pendentes": resultado.get("dados_pendentes"),
            }
        elif status == "confirmar_regime":
            # Venda cuja classificação fiscal depende do regime real da
            # compra original (zona cinzenta: 52-138 dias, regime pasto)
            # — pergunta antes de decidir RURAL vs NEGOCIACAO.
            sessoes[key] = {
                "_aguardando_regime_venda": True,
                "_dados_pendentes": resultado.get("dados_pendentes"),
            }

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
            _marcar_pendencia_se_necessario(resultado)
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
            _marcar_pendencia_se_necessario(resultado)
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
            _marcar_pendencia_se_necessario(resultado)
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
            _marcar_pendencia_se_necessario(resultado)
            return resultado.get("resumo", "Registrado.")

        return f"Módulo {modulo} recebido. Acesse o app para detalhes."
    except Exception as e:
        logger.error("Erro zootécnico %s: %s", modulo, e)
        return f"Erro ao processar registro {modulo}."


def _executar_acao_compravenda(dados: dict) -> str:
    """
    Executa de fato a compra/venda de animal já confirmada pelo produtor
    (SIM, ou resposta ao esclarecimento de regime). Só é chamada depois
    da confirmação — nunca grava nada sozinha.
    """
    from app.routers.compravenda import get_db as get_db_cv
    from app.services.compravenda_zootecnico import registrar_compra_zootecnico, registrar_venda_zootecnico

    imovel_id = dados["imovel_id"]
    conn = get_db_cv()
    try:
        cur = conn.cursor()

        if dados["acao"] == "compra":
            resultado = registrar_compra_zootecnico(
                cur, imovel_id, dados["especie"], dados["data_evento"],
                dados["quantidade"], dados["valor_total"], dados["regime"],
                fornecedor=dados.get("fornecedor"),
                observacoes=f"Raça: {dados['raca']}" if dados.get("raca") else None,
            )
            conn.commit()
            return (
                f"✅ Compra registrada no Compra e Venda: {dados['quantidade']} {dados['especie']}(s) "
                f"por R$ {float(dados['valor_total']):,.2f} (regime: {dados['regime']}).\n\n"
                f"⚠️ Prazo fiscal: {resultado['prazo_texto']} a partir de hoje. Se vender antes, fica "
                f"fora do Livro Caixa Rural (declare como ganho de capital na DAA). Depois do prazo, a "
                f"venda já entra automaticamente como receita rural."
            )

        # acao == "venda"
        if dados.get("fallback_lcdpr"):
            cur.execute("SELECT produtor_id FROM imoveis_rurais WHERE id = %s", (imovel_id,))
            row = cur.fetchone()
            produtor_id = row["produtor_id"] if row else None

            modulo = dados["modulo"]
            kwargs = {}
            if modulo == "bovino":
                from app.routers.bovino import _criar_lancamento_lcdpr_bovino as _criar_lanc
                kwargs["subconta_id_fixo"] = "93f28dea-0242-462c-a4ef-65eed3478815"
            elif modulo == "ovino":
                from app.routers.ovino import _criar_lancamento_lcdpr_ovino as _criar_lanc
            else:
                from app.routers.caprino import _criar_lancamento_lcdpr_caprino as _criar_lanc

            lanc_id = _criar_lanc(
                None, produtor_id, dados["data_evento"], "receita", dados["valor_total"],
                f"Venda de {dados['quantidade']} {dados['especie']}(s)"
                + (f" — brinco {dados['brinco']}" if dados.get("brinco") else ""),
                **kwargs,
            )
            conn.commit()
            if lanc_id:
                return f"✅ Venda registrada: {dados['quantidade']} animal(is) por R$ {float(dados['valor_total']):,.2f}."
            return "Não consegui gravar o lançamento financeiro. Confira manualmente."

        regime_overrides = None
        if dados.get("regime_override"):
            regime_overrides = dados["regime_override"]

        resultado = registrar_venda_zootecnico(
            cur, imovel_id, dados["especie"], dados["data_evento"],
            dados["quantidade"], dados["valor_total"],
            comprador=dados.get("comprador"), regime_overrides=regime_overrides,
        )
        conn.commit()
        if resultado["classificacao"] == "RURAL":
            return (
                f"✅ Venda registrada: {dados['quantidade']} animal(is) por R$ {float(dados['valor_total']):,.2f} "
                f"— já passou do prazo fiscal, entrou como receita rural no Livro Caixa."
            )
        return (
            f"✅ Venda registrada: {dados['quantidade']} animal(is) por R$ {float(dados['valor_total']):,.2f}.\n\n"
            f"⚠️ {resultado['aviso'] or 'Dentro do prazo fiscal — fora do Livro Caixa Rural.'}"
        )
    except Exception as e:
        conn.rollback()
        logger.error("Erro ao executar ação compra/venda: %s", e)
        return "Ocorreu um erro ao gravar. Tente novamente ou lance pelo app."
    finally:
        conn.close()


# ═══════════════════════════════════════════════════════════════════════════
# Autorização — dono ou administrador vinculado
# ═══════════════════════════════════════════════════════════════════════════

def _autorizar_numero(numero: str, canal: str) -> dict:
    """
    Verifica se quem está mandando a mensagem é um produtor cadastrado e
    resolve a propriedade que ele está autorizado a lançar.

    IMPORTANTE: "numero" não é telefone em todo canal — no Telegram é o
    chat_id (numérico, sem relação com o telefone real da pessoa). Por
    isso o campo de busca muda conforme o canal:
      - canal == "telegram" -> produtores.telegram_chat_id (match exato)
      - qualquer outro canal -> produtores.telefone (últimos 8 dígitos,
        mesmo padrão já usado em _resolver_imovel_id)

    Resolve a propriedade nesta ordem: imovel_id_padrao (se preenchido) ->
    dono direto (imoveis_rurais.produtor_id) -> administrador vinculado
    (participacoes_imovel, tipo_vinculo 'administrador' ou 'proprietario').
    """
    from app.db import engine
    from sqlalchemy import text as sqlt

    with engine.connect() as conn:
        if canal == "telegram":
            row = conn.execute(sqlt(
                "SELECT id, imovel_id_padrao FROM produtores WHERE telegram_chat_id = :num LIMIT 1"
            ), {"num": numero}).fetchone()
        else:
            row = conn.execute(sqlt(
                "SELECT id, imovel_id_padrao FROM produtores WHERE telefone LIKE :tel LIMIT 1"
            ), {"tel": f"%{numero[-8:]}"}).fetchone()

        if not row:
            # Fallback: nao e produtor, mas pode ser um colaborador
            # operacional (cadastro leve, so nome+telefone, sem CPF) --
            # autorizado so pra reportar consumo de insumo daquele imovel.
            if canal == "telegram":
                colab = conn.execute(sqlt(
                    "SELECT id, imovel_id, nome FROM colaboradores_operacionais "
                    "WHERE telegram_chat_id = :num AND ativo = true LIMIT 1"
                ), {"num": numero}).fetchone()
            else:
                colab = conn.execute(sqlt(
                    "SELECT id, imovel_id, nome FROM colaboradores_operacionais "
                    "WHERE telefone LIKE :tel AND ativo = true LIMIT 1"
                ), {"tel": f"%{numero[-8:]}"}).fetchone()
            if colab:
                return {"produtor_id": None, "imovel_id": colab[1],
                        "papel": "colaborador_operacional", "autorizado": True,
                        "colaborador_nome": colab[2]}
            return {"produtor_id": None, "imovel_id": None, "papel": None, "autorizado": False}
        produtor_id, imovel_padrao = row[0], row[1]

        if imovel_padrao:
            return {"produtor_id": produtor_id, "imovel_id": imovel_padrao,
                    "papel": "proprietario", "autorizado": True}

        row_dono = conn.execute(sqlt(
            "SELECT id FROM imoveis_rurais WHERE produtor_id = :pid LIMIT 1"
        ), {"pid": produtor_id}).fetchone()
        if row_dono:
            return {"produtor_id": produtor_id, "imovel_id": row_dono[0],
                    "papel": "proprietario", "autorizado": True}

        row_admin = conn.execute(sqlt(
            "SELECT imovel_id, tipo_vinculo FROM participacoes_imovel "
            "WHERE produtor_id = :pid AND vigencia_fim IS NULL "
            "AND tipo_vinculo IN ('administrador', 'proprietario') "
            "ORDER BY vigencia_inicio DESC LIMIT 1"
        ), {"pid": produtor_id}).fetchone()
        if row_admin:
            return {"produtor_id": produtor_id, "imovel_id": row_admin[0],
                    "papel": row_admin[1], "autorizado": True}

        return {"produtor_id": produtor_id, "imovel_id": None, "papel": None, "autorizado": False}


# ═══════════════════════════════════════════════════════════════════════════
# Perguntas em duas etapas: tipo primeiro, depois conta filtrada
# ═══════════════════════════════════════════════════════════════════════════

def _texto_pergunta_tipo_lancamento(prefixo: str = "") -> str:
    return (
        f"{prefixo}Esse lançamento é:\n\n"
        f"1. 💰 Receita (entrou dinheiro)\n"
        f"2. 💸 Despesa (saiu dinheiro)\n"
        f"3. 📊 Investimento (máquina, animal, obra)\n\n"
        f"0. Cancelar\n\n"
        f"Responda com o número."
    )


def _normalizar_entrada_conta(texto: str) -> str:
    """Normaliza variações comuns de digitação: vírgula como separador,
    espaços, e código sem pontuação (ex: '53' -> compara com '5.3')."""
    return texto.strip().replace(",", ".").replace(" ", "")


def _contas_por_tipo(tipo: str) -> list:
    return [(c, l) for c, l in CONTAS_DISPONIVEIS if _tipo_da_conta(c) == tipo]


def _texto_lista_contas_por_tipo(tipo: str, prefixo: str = "") -> str:
    contas = _contas_por_tipo(tipo)
    linhas = [f"{prefixo}Qual dessas é a conta certa?\n"]
    for i, (codigo, label) in enumerate(contas, start=1):
        linhas.append(f"{i}. {codigo} — {label}")
    linhas.append("\n0. Cancelar o lançamento")
    linhas.append("\nDigite só o número da lista acima (ex: 1), não o código da conta.")
    return "\n".join(linhas)


def _resolver_escolha_conta_por_tipo(texto: str, tipo: str):
    contas = _contas_por_tipo(tipo)
    texto_norm = _normalizar_entrada_conta(texto)
    if texto_norm.isdigit():
        idx = int(texto_norm)
        if 1 <= idx <= len(contas):
            return contas[idx - 1]
        # Não bateu como índice da lista — tenta como código sem pontuação
        # (ex: usuário digitou "53" querendo dizer "5.3")
        for codigo, label in contas:
            if codigo.replace(".", "") == texto_norm:
                return (codigo, label)
        return None
    for codigo, label in contas:
        if texto_norm == codigo:
            return (codigo, label)
    return None


# ═══════════════════════════════════════════════════════════════════════════
# Consumo de insumo já cadastrado no estoque — baixa automática
# ═══════════════════════════════════════════════════════════════════════════

def _conta_por_categoria_insumo(categoria: str) -> str:
    """Mapeia a categoria do insumo (cadastro em Insumos) pra conta LCDPR,
    seguindo o mesmo padrão de contas já usado no classifier.py."""
    categoria = (categoria or "").lower()
    if categoria in ("combustivel", "combustível"):
        return "3.1.2"
    if categoria in ("racao", "ração", "nutricao", "nutrição", "medicamento",
                     "veterinario", "veterinário", "farmacia", "farmácia"):
        return "3.1.3"
    if categoria in ("manutencao", "manutenção", "peca", "peça", "pecas", "peças"):
        return "3.1.5"
    return "3.1.1"


def _juntar_numero_unidade(texto: str) -> str:
    """Junta 'número + unidade' com espaço num token só (ex: '50 kg' ->
    '50kg'), pra não empatar por engano na hora de comparar com o nome
    do insumo no catálogo (que geralmente não tem espaço: 'Soja 50kg')."""
    import re as _re
    return _re.sub(r'(\d+)\s+(kg|g|l|ml|un|ton)\b', r'\1\2', texto)


_NUMEROS_EXTENSO = {
    "um": 1, "uma": 1, "dois": 2, "duas": 2, "tres": 3, "quatro": 4,
    "cinco": 5, "seis": 6, "sete": 7, "oito": 8, "nove": 9, "dez": 10,
    "onze": 11, "doze": 12, "treze": 13, "quatorze": 14, "catorze": 14,
    "quinze": 15, "dezesseis": 16, "dezessete": 17, "dezoito": 18,
    "dezenove": 19, "cem": 100, "cento": 100,
}
_DEZENAS_EXTENSO = {
    "vinte": 20, "trinta": 30, "quarenta": 40, "cinquenta": 50,
    "sessenta": 60, "setenta": 70, "oitenta": 80, "noventa": 90,
}


def _converter_numeros_extenso(texto: str) -> str:
    """Converte número escrito por extenso em dígito, incluindo compostos
    (ex: 'seis sacos' -> '6 sacos', 'vinte e cinco sacos' -> '25 sacos').
    Sem isso, só dígito puro era reconhecido, não a forma por extenso."""
    palavras = texto.split()
    resultado = []
    i = 0
    while i < len(palavras):
        p = palavras[i]
        if (p in _DEZENAS_EXTENSO and i + 2 < len(palavras)
                and palavras[i + 1] == "e" and palavras[i + 2] in _NUMEROS_EXTENSO
                and _NUMEROS_EXTENSO[palavras[i + 2]] < 10):
            resultado.append(str(_DEZENAS_EXTENSO[p] + _NUMEROS_EXTENSO[palavras[i + 2]]))
            i += 3
            continue
        if p in _DEZENAS_EXTENSO:
            resultado.append(str(_DEZENAS_EXTENSO[p]))
        elif p in _NUMEROS_EXTENSO:
            resultado.append(str(_NUMEROS_EXTENSO[p]))
        else:
            resultado.append(p)
        i += 1
    return " ".join(resultado)


def _detectar_consumo_insumo(texto: str, imovel_id: int) -> dict | None:
    """
    Detecta mensagens de consumo de um insumo já cadastrado no estoque
    (ex: "consumo de 10 sacos de farelo de soja") e monta o lançamento
    já com o valor calculado a partir do custo do insumo, em vez de
    perguntar o valor pro produtor.

    Se o insumo bater mas não tiver custo cadastrado, ainda assim retorna
    o resultado com valor=None — cai no fluxo normal de "aguardando_valor",
    só que já sabendo qual insumo/quantidade dar baixa depois.

    Retorna None se não parecer uma mensagem de consumo de insumo (nesse
    caso o chamador segue pro classificador genérico normalmente).

    CORRIGIDO: antes a query usava fazenda_id fixo em 1 — qualquer produtor
    (ex: Ubiratan, imovel 6) tinha o insumo procurado no estoque errado.
    Agora recebe o imovel_id resolvido pela autorização do numero/chat.
    """
    import re as _re
    from app.services.classifier import normalizar

    texto_norm = _converter_numeros_extenso(normalizar(texto))

    palavras_consumo = ["consumo", "consumi", "gastei", "gasto de", "usei",
                         "utilizei", "baixa de", "baixei", "saiu", "saida de",
                         "saida do estoque", "foi usado", "foi para"]
    tem_verbo_consumo = any(p in texto_norm for p in palavras_consumo)

    # Padrão semântico: mesmo sem verbo explícito, "para o rebanho/lote/..."
    # deixa claro que é uma saída (ex: "seis sacos de soja para rebanho
    # leiteiro" — ninguém fala assim pra descrever uma compra)
    tem_destino_producao = bool(_re.search(
        r'\bpara\s+(o\s+|a\s+|os\s+|as\s+)?'
        r'(rebanho|lote|gado|vacas?|bezerr\w*|leiteir\w*|piquete|'
        r'talh[aã]o|lavoura|plantio|cultivo|criacao|tanque)',
        texto_norm,
    ))

    if not (tem_verbo_consumo or tem_destino_producao):
        return None

    m = _re.search(
        r'(\d+(?:[.,]\d+)?)\s*'
        r'(sacos?|sacas?|kg|quilos?|litros?|unidades?|toneladas?|ton|un)?\s*'
        r'de\s+(.+)$',
        texto_norm,
    )
    if not m:
        return None

    try:
        quantidade = float(m.group(1).replace(",", "."))
    except ValueError:
        return None
    if quantidade <= 0:
        return None

    produto_texto = m.group(3).strip()
    if not produto_texto:
        return None
    produto_texto = _juntar_numero_unidade(produto_texto)

    from app.db import engine
    from sqlalchemy import text as sqlt

    with engine.connect() as conn:
        rows = conn.execute(sqlt("""
            SELECT id, nome, categoria, unidade, estoque_atual, preco_estimado, custo_medio
            FROM insumos
            WHERE fazenda_id = :fid AND ativo = true
        """), {"fid": imovel_id}).fetchall()

    # Casamento exato tem prioridade absoluta — não entra em empate
    for r in rows:
        if produto_texto == _juntar_numero_unidade(normalizar(r.nome)):
            return _montar_resultado_insumo(r, quantidade)

    # Fora do exato, pontua por substring e por sobreposição de palavras,
    # e junta TODOS os candidatos empatados no topo — se houver mais de
    # um, pergunta ao produtor em vez de adivinhar (ex.: "soja" bate tanto
    # em "Farelo de Soja" quanto em "Saca de Soja 50kg")
    candidatos = []  # (score, row)
    for r in rows:
        nome_norm = _juntar_numero_unidade(normalizar(r.nome))
        score = 0
        if produto_texto in nome_norm or nome_norm in produto_texto:
            score = len(produto_texto) if produto_texto in nome_norm else len(nome_norm)
        else:
            palavras_produto = set(produto_texto.split())
            palavras_nome = set(nome_norm.split())
            overlap = palavras_produto & palavras_nome
            if overlap:
                score = len(overlap)
        if score > 0:
            candidatos.append((score, r))

    if not candidatos:
        return None

    melhor_score = max(c[0] for c in candidatos)
    empatados = [r for score, r in candidatos if score == melhor_score]

    if len(empatados) == 1:
        return _montar_resultado_insumo(empatados[0], quantidade)

    # Ambíguo — devolve os candidatos pra quem chamou perguntar ao produtor
    return {
        "_candidatos_insumo_ambiguo": [
            {"id": r.id, "nome": r.nome, "estoque_atual": float(r.estoque_atual or 0), "unidade": r.unidade}
            for r in empatados
        ],
        "_quantidade_consumida": quantidade,
    }


def _montar_resultado_insumo(insumo_row, quantidade: float) -> dict:
    """Monta os dados de uma baixa de estoque pura — NÃO é um lançamento
    financeiro (conta/tipo/valor de despesa). custo_estimado é só
    informativo, pra mostrar na confirmação antes de aplicar a baixa."""
    custo_unitario = insumo_row.custo_medio or insumo_row.preco_estimado
    custo_estimado = round(quantidade * float(custo_unitario), 2) if custo_unitario else None

    return {
        "_consumo_puro": True,
        "_insumo_id": insumo_row.id,
        "_insumo_nome": insumo_row.nome,
        "_quantidade_consumida": quantidade,
        "_insumo_estoque_antes": float(insumo_row.estoque_atual or 0),
        "_custo_estimado": custo_estimado,
        # Valores padrão — sobrescritos se o produtor escolher um lote
        # específico depois. Sem isso, "0. Não é de um lote específico"
        # deixaria origem_modulo nulo, e a coluna não aceita nulo.
        "_origem_modulo": "insumos",
        "_origem_tipo": "consumo_geral",
        "_origem_id": None,
        "_origem_descricao": "Consumo geral (sem lote/atividade específica)",
    }


def _avancar_consumo_insumo(sessoes: dict, key: str, resultado_insumo: dict, imovel_id) -> str:
    """Passo comum depois de identificar o insumo (seja direto, seja depois
    de resolver ambiguidade): pergunta o lote de bovino se houver algum
    ativo, senão confirma a baixa direto. Usado nos dois pontos de entrada
    pra não divergir (bug corrigido: a escolha de insumo ambíguo pulava
    essa pergunta e ia direto pra confirmação sem origem_modulo)."""
    # Guarda o imovel_id na sessão — a gravação da baixa acontece só na
    # mensagem seguinte ("SIM"), quando o contexto original já se perdeu.
    resultado_insumo["_imovel_id"] = imovel_id
    lotes_bovino = _listar_lotes_bovino_ativos(imovel_id)
    if lotes_bovino:
        sessoes[key] = {
            "_aguardando_lote_bovino": True,
            "_resultado_pendente": resultado_insumo,
            "_lotes_disponiveis": lotes_bovino,
        }
        linhas = ["Isso foi pra qual lote de bovino?\n"]
        for i, lote in enumerate(lotes_bovino, start=1):
            linhas.append(f"{i}. {lote['nome']}")
        linhas.append("\n0. Não é de um lote específico / custo geral da fazenda")
        return "\n".join(linhas)

    sessoes[key] = resultado_insumo
    return _texto_confirmacao_consumo(resultado_insumo)


def _texto_confirmacao_consumo(dados: dict) -> str:
    custo_str = (
        f"R$ {dados['_custo_estimado']:.2f}"
        if dados.get("_custo_estimado") is not None
        else "não calculado (insumo sem custo cadastrado)"
    )
    destino_str = f"\nDestino: {dados['_origem_descricao']}" if dados.get("_origem_descricao") else ""
    return (
        f"Recebi! Baixa de estoque:\n\n"
        f"📦 {dados['_insumo_nome']}\n"
        f"Quantidade: {dados['_quantidade_consumida']:g}\n"
        f"Custo alocado: {custo_str}{destino_str}\n\n"
        f"Isso NÃO gera uma despesa nova (o gasto já foi registrado na compra).\n\n"
        f"Responda SIM para confirmar ou NÃO para cancelar."
    )

def _listar_lotes_bovino_ativos(imovel_id: int) -> list:
    """Lista lotes de bovino ativos desse imóvel, pra pergunta de origem
    de custo (rastreabilidade por lote). Retorna [] se não houver nenhum."""
    if not imovel_id:
        return []
    from app.db import engine
    from sqlalchemy import text as sqlt
    with engine.connect() as conn:
        rows = conn.execute(sqlt("""
            SELECT id, nome FROM bovino_lotes
            WHERE imovel_id = :iid AND ativo = true
            ORDER BY nome
        """), {"iid": imovel_id}).fetchall()
    return [{"id": r[0], "nome": r[1]} for r in rows]

def _detectar_compra_insumo(texto: str, valor: float, imovel_id: int) -> dict | None:
    """
    Detecta se uma mensagem de despesa é uma compra de insumo já cadastrado
    no catálogo, pra dar entrada automática no estoque na confirmação —
    espelha _detectar_consumo_insumo, mas pro lado da aquisição.

    Não substitui a classificação normal (conta/tipo/valor já vieram do
    classifier) — só anexa qual insumo/quantidade deu entrada. Retorna
    None se não parecer uma compra de insumo conhecido (mensagem segue
    como despesa normal, sem mexer no estoque).
    """
    import re as _re
    from app.services.classifier import normalizar

    texto_norm = _converter_numeros_extenso(normalizar(texto))

    palavras_compra = ["compra", "comprei", "comprou", "adquiri", "aquisicao"]
    if not any(p in texto_norm for p in palavras_compra):
        return None

    m = _re.search(
        r'(\d+(?:[.,]\d+)?)\s*'
        r'(sacos?|sacas?|kg|quilos?|litros?|unidades?|toneladas?|ton|un)?\s*'
        r'de\s+(.+)$',
        texto_norm,
    )
    if not m:
        return None

    try:
        quantidade = float(m.group(1).replace(",", "."))
    except ValueError:
        return None
    if quantidade <= 0 or not valor:
        return None

    resto = m.group(3).strip()
    produto_texto = _re.split(r'\s+por\s+|\s*,\s*|\s+a\s+r\$', resto)[0].strip()
    if not produto_texto:
        return None
    produto_texto = _juntar_numero_unidade(produto_texto)

    from app.db import engine
    from sqlalchemy import text as sqlt

    with engine.connect() as conn:
        rows = conn.execute(sqlt("""
            SELECT id, nome FROM insumos WHERE fazenda_id = :fid AND ativo = true
        """), {"fid": imovel_id}).fetchall()

    melhor = None
    melhor_score = 0
    empate = False
    for r in rows:
        nome_norm = _juntar_numero_unidade(normalizar(r.nome))
        score = 0
        if produto_texto == nome_norm:
            score = 1000
        elif produto_texto in nome_norm or nome_norm in produto_texto:
            score = len(produto_texto) if produto_texto in nome_norm else len(nome_norm)
        else:
            overlap = set(produto_texto.split()) & set(nome_norm.split())
            if overlap:
                score = len(overlap)
        if score > melhor_score:
            melhor, melhor_score, empate = r, score, False
        elif score == melhor_score and score > 0:
            empate = True

    # Compra ambígua entre insumos: não arrisca dar entrada no errado —
    # segue só como despesa normal, sem mexer no estoque
    if not melhor or empate:
        return None

    return {
        "_compra_insumo_id": melhor.id,
        "_compra_insumo_nome": melhor.nome,
        "_compra_quantidade": quantidade,
        "_compra_custo_unitario": round(valor / quantidade, 4),
        "_imovel_id": imovel_id,
    }