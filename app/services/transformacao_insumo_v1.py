"""
transformacao_insumo_v1.py (v2 - adaptado ao padrao real do projeto:
SQLAlchemy engine.connect() + text(), nao psycopg2 cru)

Modulo de TRANSFORMACAO de insumo (mistura de materias-primas em produto
acabado, ex: milho + soja + nucleo -> Racao X).

Terceiro tipo de movimento de estoque, distinto de:
  - compra          -> entrada (movimentacoes_insumo)
  - producao_propria -> entrada (movimentacoes_insumo)
  - transformacao    -> saida das MPs + entrada do resultado, com
                        rastreabilidade completa via transformacoes_insumo
                        e transformacao_ingredientes.

Padrao de acesso a banco (confirmado em app/db.py:gravar_lancamento,
31/07): SQLAlchemy `engine.connect()` como context manager, `text()` com
parametros nomeados (:nome), commit explicito. Este modulo abre sua
PROPRIA conexao internamente (nao recebe conn de fora) - mesmo estilo de
gravar_lancamento.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from decimal import Decimal, ROUND_HALF_UP
from typing import Optional
import logging

from sqlalchemy import text

from app.db import engine

logger = logging.getLogger("ruralcaixa.transformacao_insumo")


# ---------------------------------------------------------------------------
# Excecoes especificas do modulo
# ---------------------------------------------------------------------------

class TransformacaoError(Exception):
    """Erro generico de negocio no fluxo de transformacao."""


class InsumoNaoEncontradoError(TransformacaoError):
    def __init__(self, nome_insumo: str):
        super().__init__(
            f"Insumo '{nome_insumo}' nao encontrado no catalogo deste imovel."
        )
        self.nome_insumo = nome_insumo


class EstoqueInsuficienteError(TransformacaoError):
    def __init__(self, nome_insumo: str, solicitado: Decimal, disponivel: Decimal):
        super().__init__(
            f"Estoque insuficiente de '{nome_insumo}': "
            f"solicitado {solicitado} kg, disponivel {disponivel} kg."
        )
        self.nome_insumo = nome_insumo
        self.solicitado = solicitado
        self.disponivel = disponivel


@dataclass
class TransformacaoResultado:
    transformacao_id: int
    insumo_resultado_id: int
    movimentacao_entrada_id: int
    lote_resultado: str
    quantidade_resultado: Decimal
    custo_total_resultado: Decimal
    custo_unitario_resultado: Decimal
    perda_processual: Decimal
    ingredientes_processados: list


# ---------------------------------------------------------------------------
# Helpers de acesso a dados (recebem `conn` = conexao SQLAlchemy ja aberta,
# dentro da MESMA transacao - nunca abrem conexao propria, para manter
# tudo dentro de uma unica transacao atomica controlada por
# processar_transformacao)
# ---------------------------------------------------------------------------

def _buscar_insumo_por_nome(conn, imovel_id: int, nome_insumo: str) -> Optional[dict]:
    row = conn.execute(
        text(
            """
            SELECT id, nome, categoria
            FROM insumos
            WHERE imovel_id = :imovel_id
              AND LOWER(nome) = LOWER(:nome)
              AND ativo = TRUE
            LIMIT 1
            """
        ),
        {"imovel_id": imovel_id, "nome": nome_insumo},
    ).fetchone()
    if row is None:
        return None
    return {"id": row[0], "nome": row[1], "categoria": row[2]}


def _buscar_saldo_e_custo_atual(conn, imovel_id: int, insumo_id: int) -> dict:
    row = conn.execute(
        text(
            """
            SELECT
                COALESCE(SUM(
                    CASE WHEN direcao = 'entrada' THEN quantidade ELSE -quantidade END
                ), 0) AS saldo,
                COALESCE(
                    SUM(CASE WHEN direcao = 'entrada' THEN quantidade * custo_unitario ELSE 0 END)
                    / NULLIF(SUM(CASE WHEN direcao = 'entrada' THEN quantidade ELSE 0 END), 0),
                    0
                ) AS custo_medio
            FROM movimentacoes_insumo
            WHERE imovel_id = :imovel_id AND insumo_id = :insumo_id
            """
        ),
        {"imovel_id": imovel_id, "insumo_id": insumo_id},
    ).fetchone()
    return {"saldo": Decimal(row[0]), "custo_medio": Decimal(row[1])}


def _gerar_lote_resultado(conn, imovel_id: int, data_movimentacao: date) -> str:
    prefixo = f"MIST-{imovel_id}-{data_movimentacao.strftime('%Y%m%d')}"
    row = conn.execute(
        text(
            """
            SELECT COUNT(*) FROM transformacoes_insumo
            WHERE imovel_id = :imovel_id AND data_movimentacao = :data
            """
        ),
        {"imovel_id": imovel_id, "data": data_movimentacao},
    ).fetchone()
    seq = row[0] + 1
    return f"{prefixo}-{seq:03d}"


def _criar_insumo_resultado(conn, imovel_id: int, nome_resultado: str) -> int:
    row = conn.execute(
        text(
            """
            INSERT INTO insumos (imovel_id, nome, categoria, ativo, criado_em)
            VALUES (:imovel_id, :nome, 'racao_processada', TRUE, NOW())
            RETURNING id
            """
        ),
        {"imovel_id": imovel_id, "nome": nome_resultado},
    ).fetchone()
    return row[0]


def _inserir_movimentacao(
    conn,
    imovel_id: int,
    produtor_id: int,
    insumo_id: int,
    direcao: str,
    quantidade: Decimal,
    custo_unitario: Decimal,
    data_movimentacao: date,
    observacao: str,
) -> int:
    row = conn.execute(
        text(
            """
            INSERT INTO movimentacoes_insumo (
                imovel_id, produtor_id, insumo_id, tipo, direcao,
                quantidade, custo_unitario, data_movimentacao, observacao, criado_em
            )
            VALUES (:imovel_id, :produtor_id, :insumo_id, 'transformacao', :direcao,
                    :quantidade, :custo_unitario, :data, :observacao, NOW())
            RETURNING id
            """
        ),
        {
            "imovel_id": imovel_id,
            "produtor_id": produtor_id,
            "insumo_id": insumo_id,
            "direcao": direcao,
            "quantidade": quantidade,
            "custo_unitario": custo_unitario,
            "data": data_movimentacao,
            "observacao": observacao,
        },
    ).fetchone()
    return row[0]


# ---------------------------------------------------------------------------
# Funcao principal
# ---------------------------------------------------------------------------

def processar_transformacao(
    imovel_id: int,
    produtor_id: int,
    ingredientes: list,
    nome_resultado: str,
    data_movimentacao: Optional[date] = None,
    peso_real_resultado: Optional[Decimal] = None,
) -> TransformacaoResultado:
    """
    Processa uma transformacao (mistura) completa em UMA UNICA transacao
    SQLAlchemy (mesmo padrao de gravar_lancamento em app/db.py, mas com
    commit unico ao final e rollback completo em caso de qualquer erro -
    diferente de gravar_lancamento, que faz commits intermediarios, pois
    aqui a atomicidade entre baixa de MP e entrada do resultado e
    obrigatoria: nao pode sobrar mistura "pela metade").

    ingredientes: lista de dicts {"nome_insumo": str, "quantidade": number}
    """
    if not ingredientes:
        raise TransformacaoError("Nenhum ingrediente informado para a transformacao.")

    data_movimentacao = data_movimentacao or date.today()

    ingredientes_parsed = [
        (str(i["nome_insumo"]).strip(), Decimal(str(i["quantidade"])))
        for i in ingredientes
    ]

    with engine.connect() as conn:
        try:
            # ---------------------------------------------------------
            # Passo 1: validar TODOS os ingredientes antes de mexer no estoque
            # ---------------------------------------------------------
            materias_primas = []
            for nome_insumo, quantidade in ingredientes_parsed:
                insumo_mp = _buscar_insumo_por_nome(conn, imovel_id, nome_insumo)
                if insumo_mp is None:
                    raise InsumoNaoEncontradoError(nome_insumo)

                saldo_info = _buscar_saldo_e_custo_atual(conn, imovel_id, insumo_mp["id"])
                if saldo_info["saldo"] < quantidade:
                    raise EstoqueInsuficienteError(
                        nome_insumo, quantidade, saldo_info["saldo"]
                    )

                materias_primas.append(
                    {
                        "insumo_id": insumo_mp["id"],
                        "nome": insumo_mp["nome"],
                        "quantidade_usada": quantidade,
                        "custo_unitario_na_data": saldo_info["custo_medio"],
                    }
                )

            # ---------------------------------------------------------
            # Passo 2: baixar cada materia-prima (saida) e acumular custo/qtd
            # ---------------------------------------------------------
            quantidade_total_mp = Decimal("0")
            custo_total_resultado = Decimal("0")
            ingredientes_processados = []

            for mp in materias_primas:
                mov_saida_id = _inserir_movimentacao(
                    conn,
                    imovel_id=imovel_id,
                    produtor_id=produtor_id,
                    insumo_id=mp["insumo_id"],
                    direcao="saida",
                    quantidade=mp["quantidade_usada"],
                    custo_unitario=mp["custo_unitario_na_data"],
                    data_movimentacao=data_movimentacao,
                    observacao=f"Baixa para transformacao em '{nome_resultado}'",
                )

                custo_total_mp = (
                    mp["quantidade_usada"] * mp["custo_unitario_na_data"]
                ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

                quantidade_total_mp += mp["quantidade_usada"]
                custo_total_resultado += custo_total_mp

                mp["movimentacao_saida_id"] = mov_saida_id
                mp["custo_total"] = custo_total_mp
                ingredientes_processados.append(mp)

            # ---------------------------------------------------------
            # Passo 3: resolver o insumo resultado (criar ou reaproveitar)
            # ---------------------------------------------------------
            insumo_resultado = _buscar_insumo_por_nome(conn, imovel_id, nome_resultado)
            if insumo_resultado is None:
                insumo_resultado_id = _criar_insumo_resultado(conn, imovel_id, nome_resultado)
            else:
                insumo_resultado_id = insumo_resultado["id"]

            # ---------------------------------------------------------
            # Passo 3b: definir quantidade final e perda processual
            # ---------------------------------------------------------
            if peso_real_resultado is not None:
                quantidade_resultado = Decimal(str(peso_real_resultado))
                perda_processual = quantidade_total_mp - quantidade_resultado
                if perda_processual < 0:
                    logger.warning(
                        "Transformacao '%s' no imovel %s: peso real informado "
                        "(%s) maior que soma das MPs (%s). Perda ajustada para 0.",
                        nome_resultado, imovel_id, quantidade_resultado, quantidade_total_mp,
                    )
                    perda_processual = Decimal("0")
            else:
                quantidade_resultado = quantidade_total_mp
                perda_processual = Decimal("0")

            custo_unitario_resultado = (
                custo_total_resultado / quantidade_resultado
            ).quantize(Decimal("0.0001"), rounding=ROUND_HALF_UP)

            # ---------------------------------------------------------
            # Passo 4: entrada do resultado no ledger (PMP recalcula normal)
            # ---------------------------------------------------------
            mov_entrada_id = _inserir_movimentacao(
                conn,
                imovel_id=imovel_id,
                produtor_id=produtor_id,
                insumo_id=insumo_resultado_id,
                direcao="entrada",
                quantidade=quantidade_resultado,
                custo_unitario=custo_unitario_resultado,
                data_movimentacao=data_movimentacao,
                observacao=f"Entrada por transformacao ({len(materias_primas)} materias-primas)",
            )

            # ---------------------------------------------------------
            # Passo 5: cabecalho da transformacao (com rastreabilidade)
            # ---------------------------------------------------------
            lote_resultado = _gerar_lote_resultado(conn, imovel_id, data_movimentacao)

            row = conn.execute(
                text(
                    """
                    INSERT INTO transformacoes_insumo (
                        imovel_id, produtor_id, insumo_resultado_id,
                        quantidade_resultado, custo_total_resultado,
                        movimentacao_entrada_id, perda_processual,
                        data_movimentacao, data_registro, lote_resultado
                    )
                    VALUES (:imovel_id, :produtor_id, :insumo_resultado_id,
                            :quantidade_resultado, :custo_total_resultado,
                            :movimentacao_entrada_id, :perda_processual,
                            :data_movimentacao, NOW(), :lote_resultado)
                    RETURNING id
                    """
                ),
                {
                    "imovel_id": imovel_id,
                    "produtor_id": produtor_id,
                    "insumo_resultado_id": insumo_resultado_id,
                    "quantidade_resultado": quantidade_resultado,
                    "custo_total_resultado": custo_total_resultado,
                    "movimentacao_entrada_id": mov_entrada_id,
                    "perda_processual": perda_processual,
                    "data_movimentacao": data_movimentacao,
                    "lote_resultado": lote_resultado,
                },
            ).fetchone()
            transformacao_id = row[0]

            # ---------------------------------------------------------
            # Passo 6: ingredientes (rastreabilidade linha a linha)
            # ---------------------------------------------------------
            for mp in ingredientes_processados:
                conn.execute(
                    text(
                        """
                        INSERT INTO transformacao_ingredientes (
                            transformacao_id, insumo_mp_id, movimentacao_saida_id,
                            quantidade_usada, custo_unitario_na_data, custo_total
                        )
                        VALUES (:transformacao_id, :insumo_mp_id, :movimentacao_saida_id,
                                :quantidade_usada, :custo_unitario_na_data, :custo_total)
                        """
                    ),
                    {
                        "transformacao_id": transformacao_id,
                        "insumo_mp_id": mp["insumo_id"],
                        "movimentacao_saida_id": mp["movimentacao_saida_id"],
                        "quantidade_usada": mp["quantidade_usada"],
                        "custo_unitario_na_data": mp["custo_unitario_na_data"],
                        "custo_total": mp["custo_total"],
                    },
                )

            conn.commit()

            logger.info(
                "Transformacao %s concluida no imovel %s: %s -> %s kg de '%s' "
                "(custo unit. R$ %s, perda %s kg)",
                transformacao_id, imovel_id, quantidade_total_mp,
                quantidade_resultado, nome_resultado, custo_unitario_resultado,
                perda_processual,
            )

            return TransformacaoResultado(
                transformacao_id=transformacao_id,
                insumo_resultado_id=insumo_resultado_id,
                movimentacao_entrada_id=mov_entrada_id,
                lote_resultado=lote_resultado,
                quantidade_resultado=quantidade_resultado,
                custo_total_resultado=custo_total_resultado,
                custo_unitario_resultado=custo_unitario_resultado,
                perda_processual=perda_processual,
                ingredientes_processados=ingredientes_processados,
            )

        except Exception:
            conn.rollback()
            logger.exception(
                "Transformacao revertida (ROLLBACK) no imovel %s para resultado '%s'",
                imovel_id, nome_resultado,
            )
            raise


# ---------------------------------------------------------------------------
# DDL de referencia (ja aplicado em producao via
# scripts/criar_tabelas_transformacao_v1.py em 31/07 - mantido aqui so
# como documentacao do schema)
# ---------------------------------------------------------------------------

DDL_REFERENCIA = """
CREATE TABLE IF NOT EXISTS transformacoes_insumo (
    id SERIAL PRIMARY KEY,
    imovel_id INTEGER NOT NULL REFERENCES imoveis_rurais(id),
    produtor_id INTEGER NOT NULL REFERENCES produtores(id),
    insumo_resultado_id INTEGER NOT NULL REFERENCES insumos(id),
    quantidade_resultado DECIMAL(12,3) NOT NULL,
    custo_total_resultado DECIMAL(12,2) NOT NULL,
    movimentacao_entrada_id INTEGER NOT NULL REFERENCES movimentacoes_insumo(id),
    perda_processual DECIMAL(12,3) NOT NULL DEFAULT 0,
    formula_id INTEGER NULL,
    data_movimentacao DATE NOT NULL,
    data_registro TIMESTAMP DEFAULT NOW(),
    observacao TEXT,
    lote_resultado VARCHAR(50)
);

CREATE TABLE IF NOT EXISTS transformacao_ingredientes (
    id SERIAL PRIMARY KEY,
    transformacao_id INTEGER NOT NULL REFERENCES transformacoes_insumo(id) ON DELETE CASCADE,
    insumo_mp_id INTEGER NOT NULL REFERENCES insumos(id),
    movimentacao_saida_id INTEGER NOT NULL REFERENCES movimentacoes_insumo(id),
    quantidade_usada DECIMAL(12,3) NOT NULL,
    custo_unitario_na_data DECIMAL(12,4) NOT NULL,
    custo_total DECIMAL(12,2) NOT NULL,
    lote_mp VARCHAR(50) NULL
);
"""
