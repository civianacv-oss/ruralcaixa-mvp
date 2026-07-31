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
     adicionar 'transformacao_pendente' na tupla de exclusao E interceptar:

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
    ResolucaoTransformacao,
)
from app.services.transformacao_insumo_v1 import (
    processar_transformacao,
    TransformacaoError,
)


TIPO_TRANSFORMACAO_PENDENTE = "transformacao_pendente"


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

    return mensagem
