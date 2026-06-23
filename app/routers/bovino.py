"""
RuralCaixa — routers/bovino.py (psycopg2 síncrono)
Compatível com o padrão do ovino.py existente.
"""
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from typing import Optional, List
from datetime import date
import psycopg2
import psycopg2.extras
import os

router = APIRouter(prefix="/bovino", tags=["Bovino"])

DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)

# ── SCHEMAS ──────────────────────────────────────────────────
class AnimalIn(BaseModel):
    imovel_id: int
    brinco: str
    nome: Optional[str] = None
    raca_id: Optional[int] = None
    sexo: str
    aptidao_manejo: str
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

# ── RAÇAS ────────────────────────────────────────────────────
@router.get("/racas")
def listar_racas(aptidao: Optional[str] = None):
    conn = get_db()
    try:
        cur = conn.cursor()
        if aptidao:
            cur.execute("SELECT * FROM bovino_racas WHERE ativo = TRUE AND aptidao = %s ORDER BY nome", (aptidao,))
        else:
            cur.execute("SELECT * FROM bovino_racas WHERE ativo = TRUE ORDER BY aptidao, nome")
        return list(cur.fetchall())
    finally:
        conn.close()

# ── LOTES ────────────────────────────────────────────────────
@router.get("/lotes/{imovel_id}")
def listar_lotes(imovel_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT l.*, COUNT(a.id) AS qtd_animais
            FROM bovino_lotes l
            LEFT JOIN bovino_animais a ON a.lote_id = l.id AND a.status = 'ativo'
            WHERE l.imovel_id = %s AND l.ativo = TRUE
            GROUP BY l.id ORDER BY l.nome
        """, (imovel_id,))
        return list(cur.fetchall())
    finally:
        conn.close()

@router.post("/lotes")
def criar_lote(data: LoteIn):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bovino_lotes (imovel_id, nome, aptidao, piquete, capacidade)
            VALUES (%s,%s,%s,%s,%s) RETURNING *
        """, (data.imovel_id, data.nome, data.aptidao, data.piquete, data.capacidade))
        conn.commit()
        return dict(cur.fetchone())
    finally:
        conn.close()

# ── ANIMAIS ──────────────────────────────────────────────────
@router.get("/animais/{imovel_id}")
def listar_animais(
    imovel_id: int,
    aptidao: Optional[str] = None,
    status: str = "ativo",
    categoria: Optional[str] = None,
    lote_id: Optional[int] = None
):
    conn = get_db()
    try:
        cur = conn.cursor()
        conds = ["a.imovel_id = %s", "a.status = %s"]
        params = [imovel_id, status]
        if aptidao:
            conds.append("a.aptidao_manejo = %s"); params.append(aptidao)
        if categoria:
            conds.append("a.categoria = %s"); params.append(categoria)
        if lote_id:
            conds.append("a.lote_id = %s"); params.append(lote_id)
        where = " AND ".join(conds)
        cur.execute(f"""
            SELECT a.*, r.nome AS raca_nome, l.nome AS lote_nome,
                   p.peso_kg AS ultimo_peso, p.data AS data_ultimo_peso
            FROM bovino_animais a
            LEFT JOIN bovino_racas r ON r.id = a.raca_id
            LEFT JOIN bovino_lotes l ON l.id = a.lote_id
            LEFT JOIN LATERAL (
                SELECT peso_kg, data FROM bovino_pesagens
                WHERE animal_id = a.id ORDER BY data DESC LIMIT 1
            ) p ON TRUE
            WHERE {where} ORDER BY a.brinco
        """, params)
        return list(cur.fetchall())
    finally:
        conn.close()

@router.post("/animais")
def cadastrar_animal(data: AnimalIn):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id FROM especie WHERE codigo = 'BOVINO'")
        especie_id = cur.fetchone()['id']
        cur.execute("""
            INSERT INTO bovino_animais
            (imovel_id, especie_id, brinco, nome, raca_id, sexo, aptidao_manejo,
             categoria, data_nascimento, peso_nascimento, mae_id, pai_id, lote_id,
             data_entrada, origem, valor_aquisicao, observacoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
        """, (data.imovel_id, especie_id, data.brinco, data.nome, data.raca_id,
              data.sexo, data.aptidao_manejo, data.categoria, data.data_nascimento,
              data.peso_nascimento, data.mae_id, data.pai_id, data.lote_id,
              data.data_entrada or date.today(), data.origem,
              data.valor_aquisicao, data.observacoes))
        conn.commit()
        return dict(cur.fetchone())
    finally:
        conn.close()

@router.patch("/animais/{animal_id}/status")
def atualizar_status(animal_id: int, status: str):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("UPDATE bovino_animais SET status=%s, updated_at=NOW() WHERE id=%s RETURNING id, status", (status, animal_id))
        conn.commit()
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Animal não encontrado")
        return dict(row)
    finally:
        conn.close()

# ── PESAGENS ─────────────────────────────────────────────────
@router.post("/pesagens")
def registrar_pesagem(data: PesagemIn):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bovino_pesagens (animal_id, data, peso_kg, motivo, observacoes)
            VALUES (%s,%s,%s,%s,%s) RETURNING *
        """, (data.animal_id, data.data, data.peso_kg, data.motivo, data.observacoes))
        cur.execute("UPDATE bovino_animais SET updated_at=NOW() WHERE id=%s", (data.animal_id,))
        conn.commit()
        return dict(cur.fetchone()) if cur.rowcount else {}
    finally:
        conn.close()

@router.get("/pesagens/{animal_id}")
def historico_pesagens(animal_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM bovino_pesagens WHERE animal_id = %s ORDER BY data", (animal_id,))
        return list(cur.fetchall())
    finally:
        conn.close()

# ── LEITE ────────────────────────────────────────────────────
@router.post("/leite/producao")
def registrar_producao(data: ProducaoLeiteIn):
    if not data.animal_id and not data.lote_id:
        raise HTTPException(400, "Informe animal_id ou lote_id")
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bovino_producao_leite
            (imovel_id, animal_id, lote_id, data, turno, volume_l,
             gordura_pct, proteina_pct, destinacao, preco_litro)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
        """, (data.imovel_id, data.animal_id, data.lote_id, data.data,
              data.turno, data.volume_l, data.gordura_pct, data.proteina_pct,
              data.destinacao, data.preco_litro))
        conn.commit()
        return dict(cur.fetchone())
    finally:
        conn.close()

@router.get("/leite/producao/{imovel_id}")
def listar_producao(imovel_id: int, dias: int = Query(30, ge=1, le=365)):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM bovino_producao_leite
            WHERE imovel_id = %s AND data >= CURRENT_DATE - %s
            ORDER BY data DESC
        """, (imovel_id, dias))
        return list(cur.fetchall())
    finally:
        conn.close()

@router.get("/leite/resumo/{imovel_id}")
def resumo_leite(imovel_id: int, meses: int = 6):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT * FROM vw_producao_leite_mensal
            WHERE imovel_id = %s
              AND mes >= DATE_TRUNC('month', CURRENT_DATE - (%s * INTERVAL '1 month'))
            ORDER BY mes
        """, (imovel_id, meses))
        return list(cur.fetchall())
    finally:
        conn.close()

# ── ABATES ───────────────────────────────────────────────────
@router.post("/abates")
def registrar_abate(data: AbateIn):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bovino_abates
            (animal_id, data, tipo, peso_vivo_kg, peso_carcaca_kg,
             preco_arroba, valor_total, comprador, nota_fiscal, observacoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
        """, (data.animal_id, data.data, data.tipo, data.peso_vivo_kg,
              data.peso_carcaca_kg, data.preco_arroba, data.valor_total,
              data.comprador, data.nota_fiscal, data.observacoes))
        novo_status = "abatido" if data.tipo in ("abate_proprio", "abate_frigorif") else "vendido"
        cur.execute("UPDATE bovino_animais SET status=%s, updated_at=NOW() WHERE id=%s", (novo_status, data.animal_id))
        conn.commit()
        return dict(cur.fetchone()) if cur.rowcount else {}
    finally:
        conn.close()

@router.get("/abates/{imovel_id}")
def listar_abates(imovel_id: int, dias: int = 90):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT ab.*, a.brinco, a.nome AS animal_nome, a.categoria
            FROM bovino_abates ab
            JOIN bovino_animais a ON a.id = ab.animal_id
            WHERE a.imovel_id = %s AND ab.data >= CURRENT_DATE - %s
            ORDER BY ab.data DESC
        """, (imovel_id, dias))
        return list(cur.fetchall())
    finally:
        conn.close()

# ── SANITÁRIO ────────────────────────────────────────────────
@router.post("/sanitario")
def registrar_sanitario(data: SanitarioIn):
    if not data.animal_id and not data.lote_id:
        raise HTTPException(400, "Informe animal_id ou lote_id")
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bovino_sanitario
            (animal_id, lote_id, tipo, produto, dose_ml, via_aplicacao,
             data_aplicacao, data_reforco, responsavel, custo_total, observacoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s) RETURNING *
        """, (data.animal_id, data.lote_id, data.tipo, data.produto, data.dose_ml,
              data.via_aplicacao, data.data_aplicacao, data.data_reforco,
              data.responsavel, data.custo_total, data.observacoes))
        conn.commit()
        return dict(cur.fetchone())
    finally:
        conn.close()

@router.get("/sanitario/{imovel_id}/proximos")
def proximos_reforcos(imovel_id: int, dias: int = 30):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT s.*, a.brinco, a.nome AS animal_nome, l.nome AS lote_nome
            FROM bovino_sanitario s
            LEFT JOIN bovino_animais a ON a.id = s.animal_id
            LEFT JOIN bovino_lotes l ON l.id = s.lote_id
            WHERE (a.imovel_id = %s OR l.imovel_id = %s)
              AND s.data_reforco BETWEEN CURRENT_DATE AND CURRENT_DATE + %s
            ORDER BY s.data_reforco
        """, (imovel_id, imovel_id, dias))
        return list(cur.fetchall())
    finally:
        conn.close()

# ── REPRODUÇÃO ───────────────────────────────────────────────
@router.post("/reproducao")
def registrar_cobertura(data: ReproducaoIn):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bovino_reproducao (femea_id, touro_id, metodo, data_cobertura, observacoes)
            VALUES (%s,%s,%s,%s,%s) RETURNING *
        """, (data.femea_id, data.touro_id, data.metodo, data.data_cobertura, data.observacoes))
        conn.commit()
        return dict(cur.fetchone())
    finally:
        conn.close()

@router.get("/reproducao/{imovel_id}/prenhas")
def femeas_prenhas(imovel_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT r.*, a.brinco, a.nome AS femea_nome,
                   r.data_parto_prev,
                   (r.data_parto_prev - CURRENT_DATE) AS dias_para_parto
            FROM bovino_reproducao r
            JOIN bovino_animais a ON a.id = r.femea_id
            WHERE a.imovel_id = %s
              AND r.resultado = 'positivo'
              AND r.data_parto_real IS NULL
            ORDER BY r.data_parto_prev
        """, (imovel_id,))
        return list(cur.fetchall())
    finally:
        conn.close()

# ── DASHBOARD ────────────────────────────────────────────────
@router.get("/dashboard/{imovel_id}")
def dashboard(imovel_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM vw_rebanho_atual WHERE imovel_id = %s", (imovel_id,))
        rebanho = list(cur.fetchall())

        cur.execute("""
            SELECT
              COUNT(*) FILTER (WHERE aptidao_manejo='corte') AS total_corte,
              COUNT(*) FILTER (WHERE aptidao_manejo='leite') AS total_leite,
              COUNT(*) AS total_geral
            FROM bovino_animais WHERE imovel_id=%s AND status='ativo'
        """, (imovel_id,))
        totais = dict(cur.fetchone())

        cur.execute("""
            SELECT COALESCE(SUM(volume_l),0) AS volume_l, COALESCE(SUM(valor_total),0) AS receita
            FROM bovino_producao_leite
            WHERE imovel_id=%s AND data >= CURRENT_DATE - 30 AND destinacao='venda'
        """, (imovel_id,))
        leite_30d = dict(cur.fetchone())

        cur.execute("""
            SELECT COUNT(*) FROM bovino_sanitario s
            LEFT JOIN bovino_animais a ON a.id = s.animal_id
            LEFT JOIN bovino_lotes l ON l.id = s.lote_id
            WHERE (a.imovel_id=%s OR l.imovel_id=%s)
              AND s.data_reforco BETWEEN CURRENT_DATE AND CURRENT_DATE+30
        """, (imovel_id, imovel_id))
        reforcos = cur.fetchone()['count']

        cur.execute("""
            SELECT COUNT(*) FROM bovino_reproducao r
            JOIN bovino_animais a ON a.id=r.femea_id
            WHERE a.imovel_id=%s AND r.resultado='positivo' AND r.data_parto_real IS NULL
        """, (imovel_id,))
        prenhas = cur.fetchone()['count']

        return {
            "rebanho_por_categoria": rebanho,
            "totais": totais,
            "leite_30d": leite_30d,
            "alertas": {"reforcos_sanitarios": reforcos, "femeas_prenhas": prenhas}
        }
    finally:
        conn.close()

# ══════════════════════════════════════════════════════════════
# SCHEMAS — Gado Leiteiro
# ══════════════════════════════════════════════════════════════
class OrdenhaIn(BaseModel):
    imovel_id: int
    animal_id: Optional[int] = None
    lote_id: Optional[int] = None
    data: date
    turno: str = "total"
    volume_l: float
    gordura_pct: Optional[float] = None
    proteina_pct: Optional[float] = None
    ccs: Optional[int] = None
    ufc: Optional[int] = None
    destinacao: str = "venda"
    preco_litro: Optional[float] = None
    observacoes: Optional[str] = None

class IatfIn(BaseModel):
    imovel_id: int
    femea_id: int
    lote_id: Optional[int] = None
    protocolo: str
    data_inicio: date
    data_iatf: Optional[date] = None
    touro_id: Optional[int] = None
    semen_touro: Optional[str] = None
    tecnico: Optional[str] = None
    resultado: str = "aguardando"
    data_diagnostico: Optional[date] = None
    observacoes: Optional[str] = None

class DietaTransicaoIn(BaseModel):
    imovel_id: int
    animal_id: int
    fase: str
    data_inicio: date
    data_fim: Optional[date] = None
    dieta_descricao: str
    volumoso_kg_dia: Optional[float] = None
    concentrado_kg_dia: Optional[float] = None
    suplemento: Optional[str] = None
    responsavel: Optional[str] = None
    observacoes: Optional[str] = None

# ══════════════════════════════════════════════════════════════
# SCHEMAS — Gado de Corte
# ══════════════════════════════════════════════════════════════
class ConfinamentoIn(BaseModel):
    imovel_id: int
    lote_id: int
    data_entrada: date
    data_saida_prev: Optional[date] = None
    peso_entrada_kg: Optional[float] = None
    dieta: Optional[str] = None
    custo_diario_cab: Optional[float] = None
    objetivo: str = "terminacao"
    observacoes: Optional[str] = None

class ConfinamentoFechamentoIn(BaseModel):
    data_saida_real: date
    peso_saida_kg: Optional[float] = None
    status: str = "encerrado"

class ClassificacaoCarcacaIn(BaseModel):
    imovel_id: int
    animal_id: int
    abate_id: Optional[int] = None
    data: date
    frigorifico: Optional[str] = None
    maturidade: Optional[str] = None
    acabamento: Optional[str] = None
    conformacao: Optional[str] = None
    peso_carcaca_kg: Optional[float] = None
    rendimento_pct: Optional[float] = None
    preco_arroba: Optional[float] = None
    valor_total: Optional[float] = None
    nota_fiscal: Optional[str] = None
    observacoes: Optional[str] = None

class CustoProducaoIn(BaseModel):
    imovel_id: int
    lote_id: Optional[int] = None
    confinamento_id: Optional[int] = None
    periodo_inicio: date
    periodo_fim: Optional[date] = None
    categoria: str
    descricao: Optional[str] = None
    valor: float

# ══════════════════════════════════════════════════════════════
# ENDPOINTS — tipo_bovino do imóvel
# ══════════════════════════════════════════════════════════════
@router.get("/tipo/{imovel_id}")
def tipo_bovino(imovel_id: int):
    """Retorna o tipo de exploração bovina do imóvel: leite | corte | misto."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COALESCE(tipo_bovino,'corte') AS tipo FROM imoveis_rurais WHERE id=%s", (imovel_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Imóvel não encontrado")
        return {"tipo_bovino": row["tipo"]}
    finally:
        conn.close()

@router.patch("/tipo/{imovel_id}")
def atualizar_tipo_bovino(imovel_id: int, tipo_bovino: str):
    """Atualiza o tipo de exploração bovina do imóvel."""
    if tipo_bovino not in ("leite", "corte", "misto"):
        raise HTTPException(400, "tipo_bovino deve ser leite, corte ou misto")
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute(
            "UPDATE imoveis_rurais SET tipo_bovino=%s WHERE id=%s RETURNING id",
            (tipo_bovino, imovel_id)
        )
        if not cur.fetchone():
            raise HTTPException(404, "Imóvel não encontrado")
        conn.commit()
        return {"ok": True, "tipo_bovino": tipo_bovino}
    finally:
        conn.close()

# ══════════════════════════════════════════════════════════════
# ENDPOINTS — Gado Leiteiro: Ordenha
# ══════════════════════════════════════════════════════════════
@router.post("/leiteiro/ordenha")
def registrar_ordenha(data: OrdenhaIn):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bovino_ordenha
              (imovel_id, animal_id, lote_id, data, turno, volume_l,
               gordura_pct, proteina_pct, ccs, ufc, destinacao, preco_litro, observacoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id, valor_total
        """, (
            data.imovel_id, data.animal_id, data.lote_id, data.data,
            data.turno, data.volume_l, data.gordura_pct, data.proteina_pct,
            data.ccs, data.ufc, data.destinacao, data.preco_litro, data.observacoes
        ))
        row = dict(cur.fetchone())
        conn.commit()
        return {"ok": True, **row}
    finally:
        conn.close()

@router.get("/leiteiro/ordenha/{imovel_id}")
def listar_ordenha(imovel_id: int, dias: int = Query(30, ge=1, le=365)):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT o.*, a.brinco, a.nome AS nome_animal, bl.nome AS nome_lote
            FROM bovino_ordenha o
            LEFT JOIN bovino_animais a ON a.id = o.animal_id
            LEFT JOIN bovino_lotes bl ON bl.id = o.lote_id
            WHERE o.imovel_id=%s AND o.data >= CURRENT_DATE - %s
            ORDER BY o.data DESC, o.turno
        """, (imovel_id, dias))
        return list(cur.fetchall())
    finally:
        conn.close()

@router.get("/leiteiro/ordenha/resumo/{imovel_id}")
def resumo_ordenha(imovel_id: int, meses: int = Query(6, ge=1, le=24)):
    """Resumo mensal de produção de leite por ordenha."""
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT
              DATE_TRUNC('month', data)::date AS mes,
              SUM(volume_l) AS total_l,
              AVG(volume_l) AS media_dia_l,
              SUM(valor_total) AS receita,
              AVG(gordura_pct) AS gordura_media,
              AVG(proteina_pct) AS proteina_media,
              COUNT(*) AS registros
            FROM bovino_ordenha
            WHERE imovel_id=%s AND data >= CURRENT_DATE - (%s * 30)
            GROUP BY 1 ORDER BY 1 DESC
        """, (imovel_id, meses))
        return list(cur.fetchall())
    finally:
        conn.close()

# ── IATF ─────────────────────────────────────────────────────
@router.post("/leiteiro/iatf")
def registrar_iatf(data: IatfIn):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bovino_protocolo_iatf
              (imovel_id, femea_id, lote_id, protocolo, data_inicio, data_iatf,
               touro_id, semen_touro, tecnico, resultado, data_diagnostico, observacoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (
            data.imovel_id, data.femea_id, data.lote_id, data.protocolo,
            data.data_inicio, data.data_iatf, data.touro_id, data.semen_touro,
            data.tecnico, data.resultado, data.data_diagnostico, data.observacoes
        ))
        row = dict(cur.fetchone())
        conn.commit()
        return {"ok": True, **row}
    finally:
        conn.close()

@router.get("/leiteiro/iatf/{imovel_id}")
def listar_iatf(imovel_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT i.*, a.brinco, a.nome AS nome_femea
            FROM bovino_protocolo_iatf i
            JOIN bovino_animais a ON a.id = i.femea_id
            WHERE i.imovel_id=%s
            ORDER BY i.data_inicio DESC
        """, (imovel_id,))
        return list(cur.fetchall())
    finally:
        conn.close()

@router.patch("/leiteiro/iatf/{iatf_id}/resultado")
def atualizar_resultado_iatf(iatf_id: int, resultado: str, data_diagnostico: Optional[date] = None):
    if resultado not in ("aguardando", "positivo", "negativo", "aborto"):
        raise HTTPException(400, "resultado inválido")
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE bovino_protocolo_iatf
            SET resultado=%s, data_diagnostico=COALESCE(%s, data_diagnostico)
            WHERE id=%s RETURNING id
        """, (resultado, data_diagnostico, iatf_id))
        if not cur.fetchone():
            raise HTTPException(404, "Registro não encontrado")
        conn.commit()
        return {"ok": True}
    finally:
        conn.close()

# ── Dieta de Transição ────────────────────────────────────────
@router.post("/leiteiro/dieta-transicao")
def registrar_dieta(data: DietaTransicaoIn):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bovino_dieta_transicao
              (imovel_id, animal_id, fase, data_inicio, data_fim,
               dieta_descricao, volumoso_kg_dia, concentrado_kg_dia,
               suplemento, responsavel, observacoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (
            data.imovel_id, data.animal_id, data.fase, data.data_inicio,
            data.data_fim, data.dieta_descricao, data.volumoso_kg_dia,
            data.concentrado_kg_dia, data.suplemento, data.responsavel, data.observacoes
        ))
        row = dict(cur.fetchone())
        conn.commit()
        return {"ok": True, **row}
    finally:
        conn.close()

@router.get("/leiteiro/dieta-transicao/{imovel_id}")
def listar_dietas(imovel_id: int):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT d.*, a.brinco, a.nome AS nome_animal
            FROM bovino_dieta_transicao d
            JOIN bovino_animais a ON a.id = d.animal_id
            WHERE d.imovel_id=%s
            ORDER BY d.data_inicio DESC
        """, (imovel_id,))
        return list(cur.fetchall())
    finally:
        conn.close()

# ══════════════════════════════════════════════════════════════
# ENDPOINTS — Gado de Corte: Confinamento
# ══════════════════════════════════════════════════════════════
@router.post("/corte/confinamento")
def iniciar_confinamento(data: ConfinamentoIn):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bovino_confinamento
              (imovel_id, lote_id, data_entrada, data_saida_prev,
               peso_entrada_kg, dieta, custo_diario_cab, objetivo)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (
            data.imovel_id, data.lote_id, data.data_entrada, data.data_saida_prev,
            data.peso_entrada_kg, data.dieta, data.custo_diario_cab, data.objetivo
        ))
        row = dict(cur.fetchone())
        conn.commit()
        return {"ok": True, **row}
    finally:
        conn.close()

@router.get("/corte/confinamento/{imovel_id}")
def listar_confinamentos(imovel_id: int, status: Optional[str] = None):
    conn = get_db()
    try:
        cur = conn.cursor()
        filtro = "AND cf.status=%s" if status else ""
        params = (imovel_id, status) if status else (imovel_id,)
        cur.execute(f"""
            SELECT cf.*, bl.nome AS nome_lote,
                   (SELECT COUNT(*) FROM bovino_animais a WHERE a.lote_id = cf.lote_id AND a.status='ativo') AS qtd_animais
            FROM bovino_confinamento cf
            JOIN bovino_lotes bl ON bl.id = cf.lote_id
            WHERE cf.imovel_id=%s {filtro}
            ORDER BY cf.data_entrada DESC
        """, params)
        return list(cur.fetchall())
    finally:
        conn.close()

@router.patch("/corte/confinamento/{confinamento_id}/fechar")
def fechar_confinamento(confinamento_id: int, data: ConfinamentoFechamentoIn):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            UPDATE bovino_confinamento
            SET data_saida_real=%s, peso_saida_kg=%s, status=%s
            WHERE id=%s RETURNING id, gmd_kg
        """, (data.data_saida_real, data.peso_saida_kg, data.status, confinamento_id))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Confinamento não encontrado")
        conn.commit()
        return {"ok": True, "id": row["id"], "gmd_kg": row["gmd_kg"]}
    finally:
        conn.close()

# ── Classificação de Carcaça ──────────────────────────────────
@router.post("/corte/classificacao-carcaca")
def registrar_classificacao(data: ClassificacaoCarcacaIn):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bovino_classificacao_carcaca
              (imovel_id, animal_id, abate_id, data, frigorifico,
               maturidade, acabamento, conformacao, peso_carcaca_kg,
               rendimento_pct, preco_arroba, valor_total, nota_fiscal, observacoes)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (
            data.imovel_id, data.animal_id, data.abate_id, data.data,
            data.frigorifico, data.maturidade, data.acabamento, data.conformacao,
            data.peso_carcaca_kg, data.rendimento_pct, data.preco_arroba,
            data.valor_total, data.nota_fiscal, data.observacoes
        ))
        row = dict(cur.fetchone())
        conn.commit()
        return {"ok": True, **row}
    finally:
        conn.close()

@router.get("/corte/classificacao-carcaca/{imovel_id}")
def listar_classificacoes(imovel_id: int, dias: int = Query(90, ge=1, le=730)):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            SELECT cc.*, a.brinco, a.nome AS nome_animal
            FROM bovino_classificacao_carcaca cc
            JOIN bovino_animais a ON a.id = cc.animal_id
            WHERE cc.imovel_id=%s AND cc.data >= CURRENT_DATE - %s
            ORDER BY cc.data DESC
        """, (imovel_id, dias))
        return list(cur.fetchall())
    finally:
        conn.close()

# ── Custo de Produção ─────────────────────────────────────────
@router.post("/corte/custo-producao")
def registrar_custo(data: CustoProducaoIn):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("""
            INSERT INTO bovino_custo_producao
              (imovel_id, lote_id, confinamento_id, periodo_inicio, periodo_fim,
               categoria, descricao, valor)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)
            RETURNING id
        """, (
            data.imovel_id, data.lote_id, data.confinamento_id,
            data.periodo_inicio, data.periodo_fim,
            data.categoria, data.descricao, data.valor
        ))
        row = dict(cur.fetchone())
        conn.commit()
        return {"ok": True, **row}
    finally:
        conn.close()

@router.get("/corte/custo-producao/{imovel_id}")
def listar_custos(imovel_id: int, lote_id: Optional[int] = None):
    conn = get_db()
    try:
        cur = conn.cursor()
        filtro = "AND lote_id=%s" if lote_id else ""
        params = (imovel_id, lote_id) if lote_id else (imovel_id,)
        cur.execute(f"""
            SELECT cp.*, bl.nome AS nome_lote
            FROM bovino_custo_producao cp
            LEFT JOIN bovino_lotes bl ON bl.id = cp.lote_id
            WHERE cp.imovel_id=%s {filtro}
            ORDER BY cp.periodo_inicio DESC
        """, params)
        return list(cur.fetchall())
    finally:
        conn.close()

@router.get("/corte/custo-producao/resumo/{imovel_id}")
def resumo_custos(imovel_id: int, lote_id: Optional[int] = None):
    """Resumo de custos por categoria para o imóvel/lote."""
    conn = get_db()
    try:
        cur = conn.cursor()
        filtro = "AND lote_id=%s" if lote_id else ""
        params = (imovel_id, lote_id) if lote_id else (imovel_id,)
        cur.execute(f"""
            SELECT categoria, SUM(valor) AS total, COUNT(*) AS registros
            FROM bovino_custo_producao
            WHERE imovel_id=%s {filtro}
            GROUP BY categoria ORDER BY total DESC
        """, params)
        return list(cur.fetchall())
    finally:
        conn.close()

# ══════════════════════════════════════════════════════════════
# DASHBOARD UNIFICADO (leiteiro + corte)
# ══════════════════════════════════════════════════════════════
@router.get("/dashboard-v2/{imovel_id}")
def dashboard_v2(imovel_id: int):
    """Dashboard unificado com dados condicionais por tipo_bovino."""
    conn = get_db()
    try:
        cur = conn.cursor()
        # tipo do imóvel
        cur.execute("SELECT COALESCE(tipo_bovino,'corte') AS tipo FROM imoveis_rurais WHERE id=%s", (imovel_id,))
        row = cur.fetchone()
        if not row:
            raise HTTPException(404, "Imóvel não encontrado")
        tipo = row["tipo"]

        # plantel
        cur.execute("""
            SELECT
              COUNT(*) FILTER (WHERE status='ativo') AS total,
              COUNT(*) FILTER (WHERE aptidao_manejo='leite' AND status='ativo') AS leite,
              COUNT(*) FILTER (WHERE aptidao_manejo='corte' AND status='ativo') AS corte
            FROM bovino_animais WHERE imovel_id=%s
        """, (imovel_id,))
        plantel = dict(cur.fetchone())

        result = {"tipo_bovino": tipo, "plantel": plantel}

        # dados leiteiro
        if tipo in ("leite", "misto"):
            cur.execute("""
                SELECT
                  COALESCE(SUM(volume_l),0) AS total_l_30d,
                  COALESCE(AVG(volume_l),0) AS media_dia_l,
                  COALESCE(SUM(valor_total),0) AS receita_30d
                FROM bovino_ordenha
                WHERE imovel_id=%s AND data >= CURRENT_DATE - 30
            """, (imovel_id,))
            result["leiteiro"] = dict(cur.fetchone())

            cur.execute("""
                SELECT COUNT(*) AS iatf_aguardando
                FROM bovino_protocolo_iatf
                WHERE imovel_id=%s AND resultado='aguardando'
            """, (imovel_id,))
            result["leiteiro"]["iatf_aguardando"] = cur.fetchone()["iatf_aguardando"]

        # dados corte
        if tipo in ("corte", "misto"):
            cur.execute("""
                SELECT
                  COUNT(*) FILTER (WHERE status='ativo') AS confinamentos_ativos,
                  COALESCE(SUM(custo_diario_cab) FILTER (WHERE status='ativo'), 0) AS custo_diario_total
                FROM bovino_confinamento WHERE imovel_id=%s
            """, (imovel_id,))
            result["corte"] = dict(cur.fetchone())

            cur.execute("""
                SELECT COALESCE(SUM(valor_total),0) AS receita_abates_90d
                FROM bovino_abates ab
                JOIN bovino_animais a ON a.id=ab.animal_id
                WHERE a.imovel_id=%s AND ab.data >= CURRENT_DATE - 90
            """, (imovel_id,))
            result["corte"]["receita_abates_90d"] = cur.fetchone()["receita_abates_90d"]

        return result
    finally:
        conn.close()

print("BOVINO ROUTER LOADED OK")
