# ============================================================
# RuralCaixa — Módulo Bovino (Leite e Corte)
# routers/bovino.py
# ============================================================
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, validator
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
import sys, os
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from db import get_db_conn

router = APIRouter(prefix="/bovino", tags=["bovino"])

# ─────────────────────────────────────────────────────────────
# SCHEMAS
# ─────────────────────────────────────────────────────────────
class AnimalIn(BaseModel):
    imovel_id: int
    brinco: str
    nome: Optional[str] = None
    raca_id: Optional[int] = None
    sexo: str                       # M ou F
    aptidao_manejo: str             # corte | leite
    categoria: str
    data_nascimento: Optional[date] = None
    peso_nascimento: Optional[float] = None
    mae_id: Optional[int] = None
    pai_id: Optional[int] = None
    lote_id: Optional[int] = None
    data_entrada: Optional[date] = None
    origem: str = "nascimento"
    valor_aquisicao: Optional[float] = None
    observacoes: Optional[str] = None

    @validator('sexo')
    def sexo_valido(cls, v):
        if v not in ('M', 'F'):
            raise ValueError('sexo deve ser M ou F')
        return v

    @validator('aptidao_manejo')
    def aptidao_valida(cls, v):
        if v not in ('corte', 'leite'):
            raise ValueError('aptidao_manejo deve ser corte ou leite')
        return v

class PesagemIn(BaseModel):
    animal_id: int
    data: date
    peso_kg: float
    motivo: str = "rotina"
    observacoes: Optional[str] = None

class ProducaoLeiteIn(BaseModel):
    imovel_id: int
    animal_id: Optional[int] = None
    lote_id: Optional[int] = None
    data: date
    turno: str = "total"
    volume_l: float
    gordura_pct: Optional[float] = None
    proteina_pct: Optional[float] = None
    destinacao: str = "venda"
    preco_litro: Optional[float] = None

class AbateIn(BaseModel):
    animal_id: int
    data: date
    tipo: str
    peso_vivo_kg: Optional[float] = None
    peso_carcaca_kg: Optional[float] = None
    preco_arroba: Optional[float] = None
    valor_total: Optional[float] = None
    comprador: Optional[str] = None
    nota_fiscal: Optional[str] = None
    lancamento_id: Optional[str] = None
    observacoes: Optional[str] = None

class SanitarioIn(BaseModel):
    animal_id: Optional[int] = None
    lote_id: Optional[int] = None
    tipo: str
    produto: str
    dose_ml: Optional[float] = None
    via_aplicacao: Optional[str] = None
    data_aplicacao: date
    data_reforco: Optional[date] = None
    responsavel: Optional[str] = None
    custo_total: Optional[float] = None
    observacoes: Optional[str] = None

class ReproducaoIn(BaseModel):
    femea_id: int
    touro_id: Optional[int] = None
    metodo: str
    data_cobertura: date
    observacoes: Optional[str] = None

class LoteIn(BaseModel):
    imovel_id: int
    nome: str
    aptidao: str
    piquete: Optional[str] = None
    capacidade: Optional[int] = None

# ─────────────────────────────────────────────────────────────
# RAÇAS
# ─────────────────────────────────────────────────────────────
@router.get("/racas")
async def listar_racas(aptidao: Optional[str] = None):
    async with get_db_conn() as conn:
        if aptidao:
            rows = await conn.fetch(
                "SELECT * FROM bovino_racas WHERE ativo = TRUE AND aptidao = $1 ORDER BY nome",
                aptidao
            )
        else:
            rows = await conn.fetch(
                "SELECT * FROM bovino_racas WHERE ativo = TRUE ORDER BY aptidao, nome"
            )
    return [dict(r) for r in rows]

# ─────────────────────────────────────────────────────────────
# LOTES
# ─────────────────────────────────────────────────────────────
@router.get("/lotes/{imovel_id}")
async def listar_lotes(imovel_id: int):
    async with get_db_conn() as conn:
        rows = await conn.fetch(
            """SELECT l.*, COUNT(a.id) AS qtd_animais
               FROM bovino_lotes l
               LEFT JOIN bovino_animais a ON a.lote_id = l.id AND a.status = 'ativo'
               WHERE l.imovel_id = $1 AND l.ativo = TRUE
               GROUP BY l.id ORDER BY l.nome""",
            imovel_id
        )
    return [dict(r) for r in rows]

@router.post("/lotes")
async def criar_lote(data: LoteIn):
    async with get_db_conn() as conn:
        row = await conn.fetchrow(
            """INSERT INTO bovino_lotes (imovel_id, nome, aptidao, piquete, capacidade)
               VALUES ($1,$2,$3,$4,$5) RETURNING *""",
            data.imovel_id, data.nome, data.aptidao, data.piquete, data.capacidade
        )
    return dict(row)

# ─────────────────────────────────────────────────────────────
# ANIMAIS
# ─────────────────────────────────────────────────────────────
@router.get("/animais/{imovel_id}")
async def listar_animais(
    imovel_id: int,
    aptidao: Optional[str] = None,
    status: str = "ativo",
    categoria: Optional[str] = None,
    lote_id: Optional[int] = None
):
    async with get_db_conn() as conn:
        conds = ["a.imovel_id = $1", "a.status = $2"]
        params = [imovel_id, status]
        i = 3
        if aptidao:
            conds.append(f"a.aptidao_manejo = ${i}"); params.append(aptidao); i += 1
        if categoria:
            conds.append(f"a.categoria = ${i}"); params.append(categoria); i += 1
        if lote_id:
            conds.append(f"a.lote_id = ${i}"); params.append(lote_id); i += 1

        where = " AND ".join(conds)
        rows = await conn.fetch(
            f"""SELECT a.*,
                       r.nome AS raca_nome,
                       l.nome AS lote_nome,
                       p.peso_kg AS ultimo_peso,
                       p.data   AS data_ultimo_peso
                FROM bovino_animais a
                LEFT JOIN bovino_racas r ON r.id = a.raca_id
                LEFT JOIN bovino_lotes l ON l.id = a.lote_id
                LEFT JOIN LATERAL (
                    SELECT peso_kg, data FROM bovino_pesagens
                    WHERE animal_id = a.id ORDER BY data DESC LIMIT 1
                ) p ON TRUE
                WHERE {where}
                ORDER BY a.brinco""",
            *params
        )
    return [dict(r) for r in rows]

@router.get("/animais/detalhe/{animal_id}")
async def detalhe_animal(animal_id: int):
    async with get_db_conn() as conn:
        animal = await conn.fetchrow(
            """SELECT a.*, r.nome AS raca_nome, l.nome AS lote_nome
               FROM bovino_animais a
               LEFT JOIN bovino_racas r ON r.id = a.raca_id
               LEFT JOIN bovino_lotes l ON l.id = a.lote_id
               WHERE a.id = $1""",
            animal_id
        )
        if not animal:
            raise HTTPException(404, "Animal não encontrado")

        pesagens = await conn.fetch(
            "SELECT * FROM bovino_pesagens WHERE animal_id = $1 ORDER BY data DESC LIMIT 20",
            animal_id
        )
        sanitario = await conn.fetch(
            "SELECT * FROM bovino_sanitario WHERE animal_id = $1 ORDER BY data_aplicacao DESC",
            animal_id
        )
        reproducao = await conn.fetch(
            "SELECT * FROM bovino_reproducao WHERE femea_id = $1 ORDER BY data_cobertura DESC",
            animal_id
        )

    return {
        "animal": dict(animal),
        "pesagens": [dict(p) for p in pesagens],
        "sanitario": [dict(s) for s in sanitario],
        "reproducao": [dict(r) for r in reproducao],
    }

@router.post("/animais")
async def cadastrar_animal(data: AnimalIn):
    async with get_db_conn() as conn:
        especie_id = await conn.fetchval(
            "SELECT id FROM especie WHERE codigo = 'BOVINO'"
        )
        row = await conn.fetchrow(
            """INSERT INTO bovino_animais
               (imovel_id, especie_id, brinco, nome, raca_id, sexo, aptidao_manejo,
                categoria, data_nascimento, peso_nascimento, mae_id, pai_id, lote_id,
                data_entrada, origem, valor_aquisicao, observacoes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
               RETURNING *""",
            data.imovel_id, especie_id, data.brinco, data.nome, data.raca_id,
            data.sexo, data.aptidao_manejo, data.categoria, data.data_nascimento,
            data.peso_nascimento, data.mae_id, data.pai_id, data.lote_id,
            data.data_entrada or date.today(), data.origem,
            data.valor_aquisicao, data.observacoes
        )
    return dict(row)

@router.patch("/animais/{animal_id}/status")
async def atualizar_status(animal_id: int, status: str):
    statuses_validos = ('ativo', 'vendido', 'abatido', 'morto', 'descartado')
    if status not in statuses_validos:
        raise HTTPException(400, f"Status inválido. Use: {statuses_validos}")
    async with get_db_conn() as conn:
        row = await conn.fetchrow(
            "UPDATE bovino_animais SET status=$1, updated_at=NOW() WHERE id=$2 RETURNING id, status",
            status, animal_id
        )
    if not row:
        raise HTTPException(404, "Animal não encontrado")
    return dict(row)

# ─────────────────────────────────────────────────────────────
# PESAGENS
# ─────────────────────────────────────────────────────────────
@router.post("/pesagens")
async def registrar_pesagem(data: PesagemIn):
    async with get_db_conn() as conn:
        row = await conn.fetchrow(
            """INSERT INTO bovino_pesagens (animal_id, data, peso_kg, motivo, observacoes)
               VALUES ($1,$2,$3,$4,$5) RETURNING *""",
            data.animal_id, data.data, data.peso_kg, data.motivo, data.observacoes
        )
        # Atualiza updated_at no animal
        await conn.execute(
            "UPDATE bovino_animais SET updated_at=NOW() WHERE id=$1", data.animal_id
        )
    return dict(row)

@router.get("/pesagens/{animal_id}")
async def historico_pesagens(animal_id: int):
    async with get_db_conn() as conn:
        rows = await conn.fetch(
            "SELECT * FROM bovino_pesagens WHERE animal_id = $1 ORDER BY data",
            animal_id
        )
    return [dict(r) for r in rows]

# ─────────────────────────────────────────────────────────────
# PRODUÇÃO DE LEITE
# ─────────────────────────────────────────────────────────────
@router.post("/leite/producao")
async def registrar_producao(data: ProducaoLeiteIn):
    if not data.animal_id and not data.lote_id:
        raise HTTPException(400, "Informe animal_id ou lote_id")
    async with get_db_conn() as conn:
        row = await conn.fetchrow(
            """INSERT INTO bovino_producao_leite
               (imovel_id, animal_id, lote_id, data, turno, volume_l,
                gordura_pct, proteina_pct, destinacao, preco_litro)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING *""",
            data.imovel_id, data.animal_id, data.lote_id, data.data,
            data.turno, data.volume_l, data.gordura_pct, data.proteina_pct,
            data.destinacao, data.preco_litro
        )
    return dict(row)

@router.get("/leite/producao/{imovel_id}")
async def listar_producao(
    imovel_id: int,
    mes: Optional[str] = Query(None, description="YYYY-MM"),
    dias: int = Query(30, ge=1, le=365)
):
    async with get_db_conn() as conn:
        if mes:
            ano, m = map(int, mes.split("-"))
            rows = await conn.fetch(
                """SELECT * FROM bovino_producao_leite
                   WHERE imovel_id = $1
                     AND DATE_TRUNC('month', data) = DATE($2)
                   ORDER BY data DESC""",
                imovel_id, f"{ano}-{m:02d}-01"
            )
        else:
            rows = await conn.fetch(
                """SELECT * FROM bovino_producao_leite
                   WHERE imovel_id = $1 AND data >= CURRENT_DATE - $2
                   ORDER BY data DESC""",
                imovel_id, dias
            )
    return [dict(r) for r in rows]

@router.get("/leite/resumo/{imovel_id}")
async def resumo_leite(imovel_id: int, meses: int = 6):
    async with get_db_conn() as conn:
        rows = await conn.fetch(
            """SELECT * FROM vw_producao_leite_mensal
               WHERE imovel_id = $1
                 AND mes >= DATE_TRUNC('month', CURRENT_DATE - ($2 * INTERVAL '1 month'))
               ORDER BY mes""",
            imovel_id, meses
        )
    return [dict(r) for r in rows]

# ─────────────────────────────────────────────────────────────
# ABATES / VENDAS (corte)
# ─────────────────────────────────────────────────────────────
@router.post("/abates")
async def registrar_abate(data: AbateIn):
    async with get_db_conn() as conn:
        row = await conn.fetchrow(
            """INSERT INTO bovino_abates
               (animal_id, data, tipo, peso_vivo_kg, peso_carcaca_kg,
                preco_arroba, valor_total, comprador, nota_fiscal, lancamento_id, observacoes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *""",
            data.animal_id, data.data, data.tipo, data.peso_vivo_kg,
            data.peso_carcaca_kg, data.preco_arroba, data.valor_total,
            data.comprador, data.nota_fiscal,
            data.lancamento_id, data.observacoes
        )
        # Marca o animal como abatido/vendido
        novo_status = "abatido" if data.tipo in ("abate_proprio", "abate_frigorif") else "vendido"
        await conn.execute(
            "UPDATE bovino_animais SET status=$1, updated_at=NOW() WHERE id=$2",
            novo_status, data.animal_id
        )
    return dict(row)

@router.get("/abates/{imovel_id}")
async def listar_abates(imovel_id: int, dias: int = 90):
    async with get_db_conn() as conn:
        rows = await conn.fetch(
            """SELECT ab.*, a.brinco, a.nome AS animal_nome, a.categoria
               FROM bovino_abates ab
               JOIN bovino_animais a ON a.id = ab.animal_id
               WHERE a.imovel_id = $1 AND ab.data >= CURRENT_DATE - $2
               ORDER BY ab.data DESC""",
            imovel_id, dias
        )
    return [dict(r) for r in rows]

# ─────────────────────────────────────────────────────────────
# SANITÁRIO
# ─────────────────────────────────────────────────────────────
@router.post("/sanitario")
async def registrar_evento_sanitario(data: SanitarioIn):
    if not data.animal_id and not data.lote_id:
        raise HTTPException(400, "Informe animal_id ou lote_id")
    async with get_db_conn() as conn:
        row = await conn.fetchrow(
            """INSERT INTO bovino_sanitario
               (animal_id, lote_id, tipo, produto, dose_ml, via_aplicacao,
                data_aplicacao, data_reforco, responsavel, custo_total, observacoes)
               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING *""",
            data.animal_id, data.lote_id, data.tipo, data.produto, data.dose_ml,
            data.via_aplicacao, data.data_aplicacao, data.data_reforco,
            data.responsavel, data.custo_total, data.observacoes
        )
    return dict(row)

@router.get("/sanitario/{imovel_id}/proximos")
async def proximos_reforcos(imovel_id: int, dias: int = 30):
    """Retorna vacinas/medicamentos com reforço nos próximos N dias"""
    async with get_db_conn() as conn:
        rows = await conn.fetch(
            """SELECT s.*, a.brinco, a.nome AS animal_nome, l.nome AS lote_nome
               FROM bovino_sanitario s
               LEFT JOIN bovino_animais a ON a.id = s.animal_id
               LEFT JOIN bovino_lotes l ON l.id = s.lote_id
               WHERE (a.imovel_id = $1 OR l.imovel_id = $1)
                 AND s.data_reforco BETWEEN CURRENT_DATE AND CURRENT_DATE + $2
               ORDER BY s.data_reforco""",
            imovel_id, dias
        )
    return [dict(r) for r in rows]

# ─────────────────────────────────────────────────────────────
# REPRODUÇÃO
# ─────────────────────────────────────────────────────────────
@router.post("/reproducao")
async def registrar_cobertura(data: ReproducaoIn):
    async with get_db_conn() as conn:
        row = await conn.fetchrow(
            """INSERT INTO bovino_reproducao
               (femea_id, touro_id, metodo, data_cobertura, observacoes)
               VALUES ($1,$2,$3,$4,$5) RETURNING *""",
            data.femea_id, data.touro_id, data.metodo,
            data.data_cobertura, data.observacoes
        )
    return dict(row)

@router.patch("/reproducao/{id}/resultado")
async def atualizar_resultado(id: int, resultado: str, cria_id: Optional[int] = None):
    resultados_validos = ('positivo', 'negativo', 'aborto', 'gemeos')
    if resultado not in resultados_validos:
        raise HTTPException(400, f"resultado inválido. Use: {resultados_validos}")
    async with get_db_conn() as conn:
        row = await conn.fetchrow(
            """UPDATE bovino_reproducao
               SET resultado=$1, cria_id=$2, data_parto_real=CURRENT_DATE
               WHERE id=$3 RETURNING *""",
            resultado, cria_id, id
        )
    if not row:
        raise HTTPException(404, "Registro não encontrado")
    return dict(row)

@router.get("/reproducao/{imovel_id}/prenhas")
async def femeas_prenhas(imovel_id: int):
    async with get_db_conn() as conn:
        rows = await conn.fetch(
            """SELECT r.*, a.brinco, a.nome AS femea_nome,
                      r.data_parto_prev,
                      (r.data_parto_prev - CURRENT_DATE) AS dias_para_parto
               FROM bovino_reproducao r
               JOIN bovino_animais a ON a.id = r.femea_id
               WHERE a.imovel_id = $1
                 AND r.resultado = 'positivo'
                 AND r.data_parto_real IS NULL
               ORDER BY r.data_parto_prev""",
            imovel_id
        )
    return [dict(r) for r in rows]

# ─────────────────────────────────────────────────────────────
# DASHBOARD / INDICADORES
# ─────────────────────────────────────────────────────────────
@router.get("/dashboard/{imovel_id}")
async def dashboard(imovel_id: int):
    async with get_db_conn() as conn:
        # Rebanho atual
        rebanho = await conn.fetch(
            "SELECT * FROM vw_rebanho_atual WHERE imovel_id = $1",
            imovel_id
        )

        # Total por aptidão
        totais = await conn.fetchrow(
            """SELECT
               COUNT(*) FILTER (WHERE aptidao_manejo='corte') AS total_corte,
               COUNT(*) FILTER (WHERE aptidao_manejo='leite') AS total_leite,
               COUNT(*) AS total_geral
               FROM bovino_animais WHERE imovel_id=$1 AND status='ativo'""",
            imovel_id
        )

        # Produção de leite últimos 30 dias
        leite_30d = await conn.fetchrow(
            """SELECT COALESCE(SUM(volume_l),0) AS volume_l,
                      COALESCE(SUM(valor_total),0) AS receita
               FROM bovino_producao_leite
               WHERE imovel_id=$1 AND data >= CURRENT_DATE - 30 AND destinacao='venda'""",
            imovel_id
        )

        # Vacinas com reforço em até 30 dias
        reforcos = await conn.fetchval(
            """SELECT COUNT(*) FROM bovino_sanitario s
               LEFT JOIN bovino_animais a ON a.id = s.animal_id
               LEFT JOIN bovino_lotes l ON l.id = s.lote_id
               WHERE (a.imovel_id=$1 OR l.imovel_id=$1)
                 AND s.data_reforco BETWEEN CURRENT_DATE AND CURRENT_DATE+30""",
            imovel_id
        )

        # Fêmeas prenhas
        prenhas = await conn.fetchval(
            """SELECT COUNT(*) FROM bovino_reproducao r
               JOIN bovino_animais a ON a.id=r.femea_id
               WHERE a.imovel_id=$1 AND r.resultado='positivo' AND r.data_parto_real IS NULL""",
            imovel_id
        )

    return {
        "rebanho_por_categoria": [dict(r) for r in rebanho],
        "totais": dict(totais),
        "leite_30d": dict(leite_30d),
        "alertas": {
            "reforcos_sanitarios": reforcos,
            "femeas_prenhas": prenhas,
        }
    }
