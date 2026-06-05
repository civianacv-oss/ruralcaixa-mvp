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

print("BOVINO ROUTER LOADED OK")
