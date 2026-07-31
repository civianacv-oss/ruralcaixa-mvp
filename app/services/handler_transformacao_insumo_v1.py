"""
handler_transformacao_insumo_v1.py (v3 - sem parametro conn: cada camada
abre sua propria conexao SQLAlchemy internamente, seguindo o padrao real
do projeto confirmado em app/db.py)

Segue o padrao "recibo_pendente" (nao o wizard multi-etapa) - a mistura
chega pronta numa unica mensagem, entao so precisa de confirmacao SIM/NAO,
igual ao fluxo ja usado para confirmacao de venda de bois e recibo.

Integracao em app/services/mensagem_handler.py (processar_mensagem):

  1. Logo ANTES do bloco generico de sessao (por volta da linha 241,
     "if key in sessoes and sessoes[key].get('_tipo') not in (...)"),
     adicionar 'transformacao_pendente' E 'transformacao_ambiguidade_pendente'
     na tupla de exclusao, e interceptar (nessa ordem):

         if is_ambiguidade_pendente_ativo(sessoes, key):
             from app.services.handler_transformacao_insumo_v1 import (
                 processar_escolha_ambiguidade,
             )
             return processar_escolha_ambiguidade(sessoes, key, texto)

         if is_transformacao_pendente_ativo(sessoes, key):
             from app.services.handler_transformacao_insumo_v1 import (
                 processar_confirmacao_transformacao_pendente,
             )
             auth = _autorizar_numero(msg.numero, msg.canal)
             return processar_confirmacao_transformacao_pendente(
                 sessoes, key, texto, auth["imovel_id"], auth["produtor_id"],
             )

  2. Junto dos outros classificadores "de um tiro so" (perto de
     _eh_comando_producao_agricola / _eh_comando_vinculo, ANTES do
     bloco generico de classificar()):

         from app.services.handler_transformacao_insumo_v1 import (
             tentar_iniciar_transformacao,
         )
         auth = _autorizar_numero(msg.numero, msg.canal)
         resposta_transformacao = tentar_iniciar_transformacao(
             sessoes, key, texto, auth["imovel_id"], auth["produtor_id"],
         )
         if resposta_transformacao is not None:
             return resposta_transformacao

     (resposta_transformacao is None quando o texto nao parece uma
     transformacao - nesse caso o fluxo normal de classificar() continua.)

NOTA sobre auth["produtor_id"]: confirmado em 31/07 (sed 1720-1745) - as
chaves sao exatamente "produtor_id" e "imovel_id". Colaborador_operacional
tem produtor_id=None (autorizado so por vinculo ao imovel, sem CPF
proprio) - decisao do produtor (31/07): nesse caso, o responsavel
registrado na transformacao passa a ser o DONO do imovel
(imoveis_rurais.produtor_id), resolvido automaticamente por
_resolver_produtor_responsavel() dentro deste modulo. O canal chamador
(mensagem_handler.py) NAO precisa tratar esse caso - so passa
auth["produtor_id"] direto, mesmo que seja None.
"""

from __future__ import annotations

from datetime import date
from typing import Optional

from app.db import get_db
from app.services.parser_transformacao_insumo_v1 import (
    parece_transformacao,
    extrair_transformacao,
)
from app.services.resolver_transformacao_insumo_v1 import (
    resolver_transformacao,
    montar_mensagem_confirmacao_completa,
    atribuir_numeracao_ambiguidade,
    buscar_insumo_por_id,
    ResolucaoTransformacao,
    StatusResolucao,
)
from app.services.transformacao_insumo_v1 import (
    processar_transformacao,
    TransformacaoError,
)


TIPO_TRANSFORMACAO_PENDENTE = "transformacao_pendente"
TIPO_AMBIGUIDADE_PENDENTE = "transformacao_ambiguidade_pendente"


def _resolver_produtor_responsavel(produtor_id: Optional[int], imovel_id: int) -> Optional[int]:
    """
    Colaborador_operacional (autorizado so a reportar consumo/insumo) nao
    tem produtor_id proprio - vem None de _autorizar_numero. Decisao do
    produtor (31/07): nesse caso, usa o DONO do imovel como responsavel
    pelo lancamento de transformacao (movimentacoes_insumo.produtor_id e
    transformacoes_insumo.produtor_id sao NOT NULL).
    """
    if produtor_id is not None:
        return produtor_id

    conn = get_db()
    try:
        cur = conn.cursor()
        try:
            cur.execute(
                "SELECT produtor_id FROM imoveis_rurais WHERE id = %s",
                (imovel_id,),
            )
            row = cur.fetchone()
        finally:
            cur.close()
    finally:
        conn.close()

    return row["produtor_id"] if row else None


def _resolucao_para_ingredientes(resolucao: ResolucaoTransformacao) -> list:
    return [
        {"nome_insumo": item.insumo.nome, "quantidade": item.quantidade_kg}
        for item in resolucao.itens
    ]


def is_transformacao_pendente_ativo(sessoes: dict, key) -> bool:
    return sessoes.get(key, {}).get("_tipo") == TIPO_TRANSFORMACAO_PENDENTE


def processar_confirmacao_transformacao_pendente(
    sessoes: dict,
    key,
    texto: str,
    imovel_id: int,
    produtor_id: Optional[int],
) -> str:
    produtor_id = _resolver_produtor_responsavel(produtor_id, imovel_id)
    if produtor_id is None:
        sessoes.pop(key, None)
        return (
            "Não consegui confirmar o responsável por este imóvel. "
            "Cancelei a mistura - tente novamente ou fale com o proprietário."
        )

    texto_up = texto.strip().upper()
    sess = sessoes.get(key, {})
    resolucao: ResolucaoTransformacao = sess.get("resolucao")
    nome_resultado: str = sess.get("nome_resultado")

    if texto_up in ("SIM", "S", "OK", "CONFIRMA"):
        sessoes.pop(key, None)
        try:
            resultado = processar_transformacao(
                imovel_id=imovel_id,
                produtor_id=produtor_id,
                ingredientes=_resolucao_para_ingredientes(resolucao),
                nome_resultado=nome_resultado,
                data_movimentacao=date.today(),
                peso_real_resultado=None,
            )
        except TransformacaoError as exc:
            return (
                f"❌ Não consegui concluir a mistura: {exc}\n"
                "Confira e tente novamente."
            )

        return (
            f"✅ Mistura registrada! Lote {resultado.lote_resultado}: "
            f"{resultado.quantidade_resultado:g} kg de {nome_resultado} "
            f"(custo médio R$ {resultado.custo_unitario_resultado:.2f}/kg)."
        )

    if texto_up in ("NAO", "N", "CANCELA"):
        sessoes.pop(key, None)
        return "❌ Mistura cancelada."

    return "Não entendi. Responda SIM para confirmar ou NAO para cancelar."


def tentar_iniciar_transformacao(
    sessoes: dict,
    key,
    texto: str,
    imovel_id: int,
    produtor_id: Optional[int],
) -> Optional[str]:
    if not parece_transformacao(texto):
        return None

    produtor_id = _resolver_produtor_responsavel(produtor_id, imovel_id)
    if produtor_id is None:
        return (
            "Não consegui identificar o responsável por este imóvel para "
            "registrar a mistura. Fale com o proprietário para confirmar o "
            "cadastro."
        )

    parse = extrair_transformacao(texto)

    if not parse.itens:
        return (
            "Percebi que você quer registrar uma mistura, mas não consegui "
            "identificar nenhum ingrediente. Pode descrever de novo? Ex: "
            "'misturei 30kg de milho e 20kg de soja pra fazer Racao X'."
        )

    resolucao = resolver_transformacao(imovel_id, parse)
    mensagem = montar_mensagem_confirmacao_completa(resolucao)

    if resolucao.pronto_para_confirmar:
        sessoes[key] = {
            "_tipo": TIPO_TRANSFORMACAO_PENDENTE,
            "resolucao": resolucao,
            "nome_resultado": resolucao.nome_resultado,
        }
    elif any(item.status == StatusResolucao.AMBIGUO for item in resolucao.itens):
        numeracao = atribuir_numeracao_ambiguidade(resolucao)
        sessoes[key] = {
            "_tipo": TIPO_AMBIGUIDADE_PENDENTE,
            "resolucao": resolucao,
            "nome_resultado": resolucao.nome_resultado,
            "numeracao": numeracao,
            "imovel_id": imovel_id,
        }

    return mensagem


def is_ambiguidade_pendente_ativo(sessoes: dict, key) -> bool:
    return sessoes.get(key, {}).get("_tipo") == TIPO_AMBIGUIDADE_PENDENTE


def processar_escolha_ambiguidade(
    sessoes: dict,
    key,
    texto: str,
) -> str:
    """
    Interpreta a resposta do produtor a uma mensagem de ambiguidade -
    espera numeros separados por virgula/espaco, um para cada item
    ambiguo, na numeracao GLOBAL mostrada na mensagem anterior (ex: "1,4").

    Nao exige ordem especifica: cada numero ja carrega a info de qual
    item ele resolve (via `numeracao`), entao a validacao e por
    COBERTURA (cada item ambiguo precisa ser resolvido exatamente uma
    vez), nao por posicao.
    """
    sess = sessoes.get(key, {})
    resolucao: ResolucaoTransformacao = sess.get("resolucao")
    nome_resultado: str = sess.get("nome_resultado")
    numeracao: dict = sess.get("numeracao", {})
    imovel_id: int = sess.get("imovel_id")

    indices_ambiguos = {
        idx for idx, item in enumerate(resolucao.itens)
        if item.status == StatusResolucao.AMBIGUO
    }

    # extrai numeros da resposta (aceita virgula, espaco, ou os dois)
    partes = [p.strip() for p in texto.replace(",", " ").split() if p.strip()]
    if not all(p.isdigit() for p in partes):
        return (
            "Não entendi. Responda só com os números separados por "
            "vírgula (ex: \"1,4\"), um para cada item marcado como AMBIGUO."
        )

    escolhas = [int(p) for p in partes]

    if len(escolhas) != len(indices_ambiguos):
        return (
            f"Preciso de exatamente {len(indices_ambiguos)} número(s), um "
            f"para cada item ambíguo (você mandou {len(escolhas)}). "
            f"Responda de novo, ex: \"1,4\"."
        )

    indices_cobertos = set()
    for numero in escolhas:
        if numero not in numeracao:
            return (
                f"O número {numero} não corresponde a nenhuma opção mostrada. "
                f"Confira e responda de novo."
            )
        idx, _candidato = numeracao[numero]
        if idx in indices_cobertos:
            return (
                "Você repetiu duas opções para o mesmo item. Responda com "
                "um número diferente para cada item ambíguo."
            )
        indices_cobertos.add(idx)

    if indices_cobertos != indices_ambiguos:
        return (
            "As opções escolhidas não cobrem todos os itens ambíguos. "
            "Responda com um número para cada item marcado como AMBIGUO."
        )

    # Aplica as escolhas: busca saldo/custo ATUALIZADOS do insumo escolhido
    for numero in escolhas:
        idx, candidato_original = numeracao[numero]
        insumo_atualizado = buscar_insumo_por_id(imovel_id, candidato_original.id)
        item = resolucao.itens[idx]

        if insumo_atualizado is None:
            # Insumo pode ter sido desativado entre a primeira mensagem e
            # agora - caso raro, mas nao pode quebrar o fluxo.
            sessoes.pop(key, None)
            return (
                f"O insumo '{candidato_original.nome}' não está mais "
                f"disponível. Reenvie a frase da mistura do zero."
            )

        item.insumo = insumo_atualizado
        item.status = StatusResolucao.RESOLVIDO
        item.candidatos = []
        if item.quantidade_kg is not None:
            item.custo_estimado = (item.quantidade_kg * insumo_atualizado.custo_unitario)
            item.saldo_suficiente = insumo_atualizado.saldo >= item.quantidade_kg

    # recalcula custo total agora que tudo (ou quase tudo) esta resolvido
    if all(i.status == StatusResolucao.RESOLVIDO and i.custo_estimado is not None
           for i in resolucao.itens):
        from decimal import Decimal
        resolucao.custo_total_estimado = sum(
            (i.custo_estimado for i in resolucao.itens), Decimal("0")
        )

    mensagem = montar_mensagem_confirmacao_completa(resolucao)

    if resolucao.pronto_para_confirmar:
        sessoes[key] = {
            "_tipo": TIPO_TRANSFORMACAO_PENDENTE,
            "resolucao": resolucao,
            "nome_resultado": nome_resultado,
        }
    else:
        # sobrou outro bloqueio (ex: estoque insuficiente na escolha feita) -
        # nao ha mais ambiguidade pra escolher por numero, entao pede reenvio
        sessoes.pop(key, None)

    return mensagem
