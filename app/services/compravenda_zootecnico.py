"""
RuralCaixa — services/compravenda_zootecnico.py

Ponte entre os módulos zootécnicos (bovino/ovino/caprino, via bot de
WhatsApp/Telegram) e o módulo Compra e Venda (app/routers/compravenda.py).

Antes desta ponte, uma "compra de bezerro" detectada pelo bot ia direto
pro Livro Caixa (investimento/despesa), sem nunca passar pela regra
fiscal dos 52/138 dias (Decreto 9.580/2018) — só entrava nessa regra se
o produtor já tivesse cadastrado o produto manualmente em Compra e
Venda antes. Agora toda compra de animal detectada pelo bot vai direto
pro módulo Compra e Venda, e o lançamento no Livro Caixa só é criado na
hora da VENDA, e só se já tiver passado do prazo fiscal.
"""

from datetime import date, datetime
from typing import Optional


def _para_date(valor) -> date:
    """Aceita tanto um objeto date quanto uma string ISO (é assim que
    vem do bot, via entidades['data_evento']) e sempre devolve um date
    de verdade — necessário pra fazer subtração de dias com segurança."""
    if isinstance(valor, date):
        return valor
    return datetime.strptime(str(valor)[:10], "%Y-%m-%d").date()


def produto_compra_venda(cur, imovel_id: int, especie: str) -> int:
    """Acha o produto de compra-e-venda dessa espécie nesse imóvel, ou
    cria um novo (nome genérico = espécie capitalizada, unidade = cabeça)."""
    cur.execute("""
        SELECT id FROM cv_produtos
        WHERE imovel_id = %s AND LOWER(especie) = LOWER(%s) AND ativo = TRUE
        LIMIT 1
    """, (imovel_id, especie))
    existente = cur.fetchone()
    if existente:
        return existente["id"]

    cur.execute("""
        INSERT INTO cv_produtos (imovel_id, nome, unidade, especie)
        VALUES (%s, %s, 'cab', %s) RETURNING id
    """, (imovel_id, especie.capitalize(), especie))
    return cur.fetchone()["id"]


PRAZO_FISCAL = {"confinamento": 52, "pasto": 138}


def preview_venda_zootecnico(cur, imovel_id: int, especie: str, data_venda: date,
                               quantidade: float) -> dict:
    """
    Simula (sem gravar nada) quais compras seriam consumidas por FIFO
    nessa venda, e sinaliza se alguma porção cai na "zona cinzenta"
    fiscal: regime "pasto" (o padrão quando a IA não identifica) E entre
    52 e 138 dias — faixa em que, se o regime real fosse confinamento em
    vez de pasto, a classificação já teria virado RURAL. Fora dessa
    faixa o regime não muda o resultado (≤52d é sempre NEGOCIACAO,
    >138d é sempre RURAL), então não vale a pena perguntar.

    Levanta ValueError se não houver produto/estoque suficiente — mesmo
    comportamento de registrar_venda_zootecnico.
    """
    data_venda = _para_date(data_venda)
    cur.execute("""
        SELECT id FROM cv_produtos
        WHERE imovel_id = %s AND LOWER(especie) = LOWER(%s) AND ativo = TRUE
        LIMIT 1
    """, (imovel_id, especie))
    produto = cur.fetchone()
    if not produto:
        raise ValueError(f"Nenhum produto de compra-e-venda cadastrado para '{especie}' neste imóvel")
    produto_id = produto["id"]

    cur.execute("""
        SELECT c.id, c.data_compra, c.regime,
               c.quantidade - COALESCE((
                   SELECT SUM(b.quantidade_baixada) FROM cv_vendas_baixas b WHERE b.compra_id = c.id
               ), 0) AS saldo
        FROM cv_compras c
        WHERE c.produto_id = %s AND c.imovel_id = %s
        ORDER BY c.data_compra ASC, c.id ASC
    """, (produto_id, imovel_id))
    compras = [dict(r) for r in cur.fetchall() if float(r["saldo"]) > 0]

    saldo_total = sum(float(c["saldo"]) for c in compras)
    if quantidade > saldo_total:
        raise ValueError(
            f"Estoque de {especie} em Compra e Venda insuficiente (disponível: {saldo_total:g}, "
            f"pedido: {quantidade:g})."
        )

    restante = quantidade
    porcoes = []
    for c in compras:
        if restante <= 0:
            break
        qtd_baixa = min(restante, float(c["saldo"]))
        dias = (data_venda - c["data_compra"]).days
        ambiguo = c["regime"] == "pasto" and 52 < dias <= 138
        porcoes.append({
            "compra_id": c["id"],
            "data_compra": c["data_compra"],
            "quantidade": qtd_baixa,
            "dias_permanencia": dias,
            "regime_atual": c["regime"],
            "ambiguo": ambiguo,
        })
        restante -= qtd_baixa

    compras_ambiguas = [p for p in porcoes if p["ambiguo"]]
    return {
        "produto_id": produto_id,
        "porcoes": porcoes,
        "ambiguo": len(compras_ambiguas) > 0,
        "compras_ambiguas": compras_ambiguas,
    }


def registrar_compra_zootecnico(cur, imovel_id: int, especie: str, data_compra: date,
                                  quantidade: float, valor_total: float, regime: str,
                                  fornecedor: Optional[str] = None,
                                  observacoes: Optional[str] = None) -> dict:
    """
    Registra a compra de animal detectada pelo bot direto no módulo
    Compra e Venda (cv_compras) — NÃO cria lançamento no Livro Caixa
    agora. O lançamento só é criado na venda, via
    `registrar_venda_zootecnico`, e só entra como receita rural se já
    tiver passado do prazo fiscal (52d confinamento / 138d pasto).
    """
    produto_id = produto_compra_venda(cur, imovel_id, especie)
    data_compra = _para_date(data_compra)
    valor_unitario = valor_total / quantidade if quantidade else valor_total

    cur.execute("""
        INSERT INTO cv_compras
            (imovel_id, produto_id, data_compra, quantidade, valor_unitario,
             valor_total, regime, fornecedor, observacoes)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        RETURNING id
    """, (imovel_id, produto_id, data_compra, quantidade, valor_unitario,
          valor_total, regime, fornecedor,
          observacoes or "Lançado via WhatsApp/Telegram"))
    compra_id = cur.fetchone()["id"]

    prazo = "52 dias (confinamento)" if regime == "confinamento" else "138 dias (pasto)"
    return {
        "compra_id": compra_id,
        "produto_id": produto_id,
        "prazo_texto": prazo,
    }


def registrar_venda_zootecnico(cur, imovel_id: int, especie: str, data_venda: date,
                                 quantidade: float, valor_total: float,
                                 comprador: Optional[str] = None,
                                 regime_overrides: Optional[dict] = None) -> dict:
    """
    Registra a venda de um animal que tem histórico de compra no módulo
    Compra e Venda — usa o mesmo FIFO + classificação fiscal automática
    (RURAL vs NEGOCIACAO) do módulo Compra e Venda. Levanta ValueError
    se não houver produto/estoque cadastrado pra essa espécie (nesse
    caso o chamador deve cair no fluxo antigo de venda direta no Livro
    Caixa, já que não há nada pra dar baixa via FIFO).

    `regime_overrides`: {compra_id: "confinamento"|"pasto"} — usado
    quando o produtor confirma, via pergunta de esclarecimento, que o
    regime de uma compra específica estava diferente do que foi gravado
    (ex: gravado como pasto, mas na verdade era confinamento).
    """
    from app.routers.compravenda import _registrar_venda_fifo

    data_venda = _para_date(data_venda)

    if regime_overrides:
        for compra_id, regime_correto in regime_overrides.items():
            cur.execute(
                "UPDATE cv_compras SET regime = %s WHERE id = %s",
                (regime_correto, compra_id),
            )

    cur.execute("""
        SELECT id FROM cv_produtos
        WHERE imovel_id = %s AND LOWER(especie) = LOWER(%s) AND ativo = TRUE
        LIMIT 1
    """, (imovel_id, especie))
    produto = cur.fetchone()
    if not produto:
        raise ValueError(f"Nenhum produto de compra-e-venda cadastrado para '{especie}' neste imóvel")

    produto_id = produto["id"]

    cur.execute("""
        SELECT COALESCE(SUM(
            c.quantidade - COALESCE((
                SELECT SUM(b.quantidade_baixada) FROM cv_vendas_baixas b WHERE b.compra_id = c.id
            ), 0)
        ), 0) AS saldo
        FROM cv_compras c WHERE c.produto_id = %s AND c.imovel_id = %s
    """, (produto_id, imovel_id))
    saldo = float(cur.fetchone()["saldo"])
    if quantidade > saldo:
        raise ValueError(
            f"Estoque de {especie} em Compra e Venda insuficiente (disponível: {saldo:g}, "
            f"pedido: {quantidade:g}). Confira se todos os animais desse lote foram "
            f"comprados pelo bot ou cadastre a diferença manualmente."
        )

    valor_unitario = valor_total / quantidade if quantidade else valor_total
    return _registrar_venda_fifo(
        cur, imovel_id, produto_id, data_venda, quantidade, valor_unitario,
        comprador=comprador, observacoes="Venda lançada via WhatsApp/Telegram",
    )
