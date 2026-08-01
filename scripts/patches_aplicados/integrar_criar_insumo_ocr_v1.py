# -*- coding: utf-8 -*-
"""
CORRIGE app/services/mensagem_handler.py: quando um item da nota (OCR)
não bate com NENHUM insumo cadastrado, oferece cadastrar o insumo direto
pelo bot, em vez de cair sempre no fluxo manual de histórico.

Faz 3 coisas:
  1. Atualiza o bloco de inferência (_ambiguo_cpf) pra tratar o novo
     status "sem_match" retornado por inferir_operacao_por_itens.
  2. Insere 2 novos sub-fluxos de sessão (perguntar se quer cadastrar,
     perguntar a categoria) logo antes do sub-fluxo de histórico ambíguo.
  3. Anexa a função _texto_lista_categorias_insumo no final do arquivo.

Rodar localmente:
    python3 integrar_criar_insumo_ocr_v1.py            # dry-run
    python3 integrar_criar_insumo_ocr_v1.py --aplicar   # aplica
"""
import sys
import difflib

CAMINHO = "app/services/mensagem_handler.py"

# ─── Parte 1: bloco de inferência trata status "sem_match" ────────────────
ANTIGO_INFERENCIA = '''                        from app.services.ocr_handler import inferir_operacao_por_itens
                        inferencia = inferir_operacao_por_itens(itens_ocr, imovel_id_ocr)
                        if inferencia:
                            itens_txt = "; ".join(
                                f"{i['descricao']} (R$ {i.get('valor_total', 0):.2f})"
                                for i in inferencia["itens_batidos"]
                            )
                            from app.db import buscar_descricao_conta
                            desc_conta = buscar_descricao_conta(inferencia["conta"])
                            conta_txt = f"{inferencia['conta']} - {desc_conta}" if desc_conta else inferencia["conta"]
                            sessoes[key] = {
                                "conta": inferencia["conta"],
                                "tipo": "despesa",
                                "valor": valor,
                                "data": dados_ocr.get("data") or date.today().isoformat(),
                                "confianca": 70,
                                "produto": itens_txt,
                                "atividade": "rural",
                                "_ocr": dados_ocr,
                                "_midia": msg.midia_bytes,
                                "_mime": msg.mime_type,
                                "_imovel_id": imovel_id_ocr,
                                "_compras_insumo_multiplos": [
                                    i for i in inferencia["itens_batidos"]
                                    if i.get("insumo_id") and i.get("quantidade_estoque")
                                ],
                            }
                            return (
                                f"📄 Não consegui confirmar pelo CPF se você comprou ou vendeu, "
                                f"mas os itens da nota ({itens_txt}) batem com insumos que você "
                                f"já usa.\\n\\n"
                                f"Parece ser compra de insumo, conta {conta_txt}.\\n"
                                f"Valor: R$ {valor:.2f}\\n\\n"
                                f"Responda SIM para confirmar como despesa, ou NAO se não for isso."
                            )'''

NOVO_INFERENCIA = '''                        from app.services.ocr_handler import inferir_operacao_por_itens
                        inferencia = inferir_operacao_por_itens(itens_ocr, imovel_id_ocr)

                        if inferencia and inferencia.get("status") == "sem_match":
                            item_faltante = inferencia["item_faltante"]
                            sessoes[key] = {
                                "_tipo": "aguardando_criar_insumo_ocr",
                                "_item_faltante": item_faltante,
                                "_itens_ocr_originais": itens_ocr,
                                "_imovel_id": imovel_id_ocr,
                                "_ocr_valor": valor,
                                "_ocr_data": dados_ocr.get("data") or date.today().isoformat(),
                                "_midia": msg.midia_bytes,
                                "_mime": msg.mime_type,
                            }
                            return (
                                f"📄 Não encontrei \\"{item_faltante['descricao']}\\" no seu estoque "
                                f"de insumos.\\nQuer cadastrar esse insumo agora? Responda SIM ou NAO."
                            )

                        if inferencia and inferencia.get("status") == "ok":
                            itens_txt = "; ".join(
                                f"{i['descricao']} (R$ {i.get('valor_total', 0):.2f})"
                                for i in inferencia["itens_batidos"]
                            )
                            from app.db import buscar_descricao_conta
                            desc_conta = buscar_descricao_conta(inferencia["conta"])
                            conta_txt = f"{inferencia['conta']} - {desc_conta}" if desc_conta else inferencia["conta"]
                            sessoes[key] = {
                                "conta": inferencia["conta"],
                                "tipo": "despesa",
                                "valor": valor,
                                "data": dados_ocr.get("data") or date.today().isoformat(),
                                "confianca": 70,
                                "produto": itens_txt,
                                "atividade": "rural",
                                "_ocr": dados_ocr,
                                "_midia": msg.midia_bytes,
                                "_mime": msg.mime_type,
                                "_imovel_id": imovel_id_ocr,
                                "_compras_insumo_multiplos": [
                                    i for i in inferencia["itens_batidos"]
                                    if i.get("insumo_id") and i.get("quantidade_estoque")
                                ],
                            }
                            return (
                                f"📄 Não consegui confirmar pelo CPF se você comprou ou vendeu, "
                                f"mas os itens da nota ({itens_txt}) batem com insumos que você "
                                f"já usa.\\n\\n"
                                f"Parece ser compra de insumo, conta {conta_txt}.\\n"
                                f"Valor: R$ {valor:.2f}\\n\\n"
                                f"Responda SIM para confirmar como despesa, ou NAO se não for isso."
                            )'''

# ─── Parte 2: novos sub-fluxos de sessão ───────────────────────────────────
ANCORA_SUBFLUXO = '''        if sessoes[key].get("_aguardando_historico_ocr_ambiguo"):
            if texto_up in ("0", "CANCELAR", "CANCELA"):
                sessoes.pop(key, None)
                return "Cancelado. Pode mandar de novo quando quiser."
            sess = sessoes[key]
            sess["_historico_ocr"] = texto
            sess.pop("_aguardando_historico_ocr_ambiguo", None)
            sess["_aguardando_tipo_ocr_ambiguo"] = True
            return _texto_pergunta_tipo_lancamento(prefixo="Anotado! Agora me diz: ")'''

NOVO_SUBFLUXO = '''        # Sub-fluxo: perguntar se quer cadastrar insumo que a nota (OCR)
        # menciona mas que ainda não existe no estoque
        if sessoes[key].get("_tipo") == "aguardando_criar_insumo_ocr":
            if texto_up in ("NAO", "N", "CANCELA"):
                sess_ocr = sessoes[key]
                sessoes[key] = {
                    "_aguardando_historico_ocr_ambiguo": True,
                    "_ocr_valor": sess_ocr["_ocr_valor"],
                    "_ocr_data": sess_ocr["_ocr_data"],
                    "_midia": sess_ocr.get("_midia"),
                    "_mime": sess_ocr.get("_mime"),
                }
                return (
                    "Ok, sem cadastrar agora. Antes de lançar, me conta rapidinho: "
                    "qual é o histórico/motivo desse lançamento? (ou digite CANCELAR)"
                )
            if texto_up in ("SIM", "S", "OK", "CONFIRMA"):
                sessoes[key]["_tipo"] = "aguardando_categoria_insumo_ocr"
                return _texto_lista_categorias_insumo()
            return "Não entendi. Responda SIM pra cadastrar ou NAO pra pular."

        # Sub-fluxo: escolher categoria do insumo novo, criar, e tentar
        # classificar de novo com o catálogo já atualizado
        if sessoes[key].get("_tipo") == "aguardando_categoria_insumo_ocr":
            from app.services.ocr_handler import (
                CATEGORIAS_INSUMO_DISPONIVEIS, criar_insumo_a_partir_de_item,
                inferir_operacao_por_itens,
            )
            escolha_cat = next((c for n, c, _ in CATEGORIAS_INSUMO_DISPONIVEIS if n == texto_up), None)
            if not escolha_cat:
                return _texto_lista_categorias_insumo(prefixo="Não entendi. ")

            sess_ocr = sessoes[key]
            criar_insumo_a_partir_de_item(sess_ocr["_imovel_id"], sess_ocr["_item_faltante"], escolha_cat)
            nova_inferencia = inferir_operacao_por_itens(
                sess_ocr["_itens_ocr_originais"], sess_ocr["_imovel_id"]
            )

            if nova_inferencia and nova_inferencia.get("status") == "sem_match":
                item_faltante2 = nova_inferencia["item_faltante"]
                sessoes[key] = {
                    "_tipo": "aguardando_criar_insumo_ocr",
                    "_item_faltante": item_faltante2,
                    "_itens_ocr_originais": sess_ocr["_itens_ocr_originais"],
                    "_imovel_id": sess_ocr["_imovel_id"],
                    "_ocr_valor": sess_ocr["_ocr_valor"],
                    "_ocr_data": sess_ocr["_ocr_data"],
                    "_midia": sess_ocr.get("_midia"),
                    "_mime": sess_ocr.get("_mime"),
                }
                return (
                    f"Cadastrado! Mas também não encontrei \\"{item_faltante2['descricao']}\\" no "
                    f"estoque.\\nQuer cadastrar esse também? Responda SIM ou NAO."
                )

            if nova_inferencia and nova_inferencia.get("status") == "ok":
                itens_txt2 = "; ".join(
                    f"{i['descricao']} (R$ {i.get('valor_total', 0):.2f})"
                    for i in nova_inferencia["itens_batidos"]
                )
                from app.db import buscar_descricao_conta
                desc_conta2 = buscar_descricao_conta(nova_inferencia["conta"])
                conta_txt2 = f"{nova_inferencia['conta']} - {desc_conta2}" if desc_conta2 else nova_inferencia["conta"]
                sessoes[key] = {
                    "conta": nova_inferencia["conta"],
                    "tipo": "despesa",
                    "valor": sess_ocr["_ocr_valor"],
                    "data": sess_ocr["_ocr_data"],
                    "confianca": 70,
                    "produto": itens_txt2,
                    "atividade": "rural",
                    "_midia": sess_ocr.get("_midia"),
                    "_mime": sess_ocr.get("_mime"),
                    "_imovel_id": sess_ocr["_imovel_id"],
                    "_compras_insumo_multiplos": [
                        i for i in nova_inferencia["itens_batidos"]
                        if i.get("insumo_id") and i.get("quantidade_estoque")
                    ],
                }
                return (
                    f"Cadastrado! Agora os itens da nota ({itens_txt2}) batem certinho.\\n\\n"
                    f"Parece ser compra de insumo, conta {conta_txt2}.\\n"
                    f"Valor: R$ {sess_ocr['_ocr_valor']:.2f}\\n\\n"
                    f"Responda SIM para confirmar como despesa, ou NAO se não for isso."
                )

            # Empate, ou categorias diferentes -- cai no fluxo manual
            sessoes[key] = {
                "_aguardando_historico_ocr_ambiguo": True,
                "_ocr_valor": sess_ocr["_ocr_valor"],
                "_ocr_data": sess_ocr["_ocr_data"],
                "_midia": sess_ocr.get("_midia"),
                "_mime": sess_ocr.get("_mime"),
            }
            return (
                "Cadastrado! Mas ainda não deu pra classificar automaticamente. "
                "Antes de lançar, me conta rapidinho: qual é o histórico/motivo "
                "desse lançamento? (ou digite CANCELAR)"
            )

        if sessoes[key].get("_aguardando_historico_ocr_ambiguo"):
            if texto_up in ("0", "CANCELAR", "CANCELA"):
                sessoes.pop(key, None)
                return "Cancelado. Pode mandar de novo quando quiser."
            sess = sessoes[key]
            sess["_historico_ocr"] = texto
            sess.pop("_aguardando_historico_ocr_ambiguo", None)
            sess["_aguardando_tipo_ocr_ambiguo"] = True
            return _texto_pergunta_tipo_lancamento(prefixo="Anotado! Agora me diz: ")'''

FUNCAO_NOVA = '''

def _texto_lista_categorias_insumo(prefixo: str = "") -> str:
    from app.services.ocr_handler import CATEGORIAS_INSUMO_DISPONIVEIS
    linhas = [f"{prefixo}Qual categoria é esse insumo?\\n"]
    for numero, _, label in CATEGORIAS_INSUMO_DISPONIVEIS:
        linhas.append(f"{numero}. {label}")
    return "\\n".join(linhas)
'''


def aplicar(nome, antigo, novo, aplicar_de_verdade, conteudo):
    qtd = conteudo.count(antigo)
    if qtd != 1:
        print(f"✗ '{nome}': esperava 1 ocorrência, achei {qtd}. Abortando sem gravar nada.")
        return None
    return conteudo.replace(antigo, novo, 1)


def main():
    aplicar_de_verdade = "--aplicar" in sys.argv
    with open(CAMINHO, "r", encoding="utf-8") as f:
        original = f.read()

    corrigido = original
    for nome, antigo, novo in [
        ("bloco de inferência (status sem_match/ok)", ANTIGO_INFERENCIA, NOVO_INFERENCIA),
        ("novos sub-fluxos de sessão", ANCORA_SUBFLUXO, NOVO_SUBFLUXO),
    ]:
        resultado = aplicar(nome, antigo, novo, aplicar_de_verdade, corrigido)
        if resultado is None:
            print("Abortando sem gravar nada.")
            return
        corrigido = resultado

    corrigido = corrigido.rstrip("\n") + "\n" + FUNCAO_NOVA

    if aplicar_de_verdade:
        with open(CAMINHO, "w", encoding="utf-8") as f:
            f.write(corrigido)
        print("✓ Arquivo corrigido e gravado.")
    else:
        print(">>> DRY-RUN — diff do que seria alterado:\n")
        diff = difflib.unified_diff(
            original.splitlines(keepends=True), corrigido.splitlines(keepends=True),
            fromfile="antes", tofile="depois",
        )
        sys.stdout.writelines(diff)
        print("\n\nSe fizer sentido, rode de novo com --aplicar.")


if __name__ == "__main__":
    main()
