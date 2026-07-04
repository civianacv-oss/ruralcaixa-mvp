from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os

load_dotenv()

engine = create_engine(os.getenv("DATABASE_URL"))

def buscar_imoveis_por_cpf(cpf: str):
    cpf_limpo = cpf.replace(".", "").replace("-", "").replace(" ", "")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT i.id, i.nome, i.municipio, i.uf, i.area_ha, i.nirf
            FROM imoveis_rurais i
            JOIN produtores p ON p.id = i.produtor_id
            WHERE p.cpf = :cpf
        """), {"cpf": cpf_limpo}).fetchall()
        return [dict(r._mapping) for r in result]

def gravar_lancamento(dados: dict):
    with engine.connect() as conn:
        prod = conn.execute(text('SELECT id FROM produtores WHERE telefone = :tel'), {'tel': dados.get('numero', '')}).fetchone()
        produtor_id = prod[0] if prod else 1
        # Busca subconta pelo nome/tipo
        tipo_raw = dados.get('tipo', 'despesa').upper()
        nome_sub = dados.get('produto') or dados.get('subconta') or dados.get('descricao', 'Outros')
        sub = conn.execute(text('SELECT id FROM subcontas WHERE LOWER(nome) LIKE LOWER(:nome) LIMIT 1'), {'nome': f'%{nome_sub[:20]}%'}).fetchone()
        if not sub:
            import uuid as _uuid
            atividade_raw = (dados.get('atividade') or 'rural').upper()
            if atividade_raw == 'RURAL':
                atividade = 'RURAL'
            elif atividade_raw in ('COMERCIO_REVENDA', 'COMERCIO', 'REVENDA'):
                atividade = 'COMERCIO'
            else:
                atividade = 'INVESTIMENTO'
            sub_id = str(_uuid.uuid4())
            conn.execute(text('INSERT INTO subcontas (id, nome, tipo, atividade_tipo) VALUES (:id, :nome, :tipo, :atv)'),
                {'id': sub_id, 'nome': nome_sub[:100], 'tipo': tipo_raw, 'atv': atividade})
        else:
            sub_id = sub[0]
        import uuid as _uuid2
        lanc_id = str(_uuid2.uuid4())
        conn.execute(text('INSERT INTO lancamentos (id, produtor_id, subconta_id, valor, data, documento_url) VALUES (:id, :pid, :sub, :valor, :data, NULL)'),
            {'id': lanc_id, 'pid': produtor_id, 'sub': sub_id, 'valor': abs(float(dados.get('valor', 0))), 'data': dados.get('data')})
        conn.commit()
        import json as _json
        try:
            conn.execute(text('INSERT INTO audit_log (tabela, registro_id, acao, usuario, payload) VALUES (:tab, :id, :acao, :usr, cast(:payload as jsonb))'),
                {'tab': 'lancamentos', 'id': lanc_id, 'acao': 'INSERT', 'usr': dados.get('numero', 'whatsapp'), 'payload': _json.dumps(dados)})
            conn.commit()
        except Exception:
            pass
        return lanc_id

def get_ultimo_lancamento(telefone: str):
    with engine.connect() as conn:
        prod = conn.execute(text(
            "SELECT id FROM produtores WHERE telefone = :tel"
        ), {"tel": telefone}).fetchone()

        if not prod:
            return None

        result = conn.execute(text("""
            SELECT id FROM lancamentos
            WHERE produtor_id = :pid
            ORDER BY created_at DESC
            LIMIT 1
        """), {"pid": prod[0]}).fetchone()

        return result[0] if result else None


def vincular_documento(lancamento_id: int, url_drive: str):
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE lancamentos
            SET documento_url = :url
            WHERE id = :id
        """), {"url": url_drive, "id": lancamento_id})
        conn.commit()


def buscar_saldo_mes(produtor_id: int) -> float:
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT
                COALESCE(SUM(CASE WHEN s.tipo = 'RECEITA' THEN l.valor ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN s.tipo = 'DESPESA' THEN l.valor ELSE 0 END), 0)
            FROM lancamentos l
            LEFT JOIN subcontas s ON s.id = l.subconta_id
            WHERE l.produtor_id = :pid
            AND date_trunc('month', l.data) = date_trunc('month', CURRENT_DATE)
        """), {"pid": produtor_id}).fetchone()
        return float(result[0]) if result else 0.0


def buscar_produtor_por_numero(telefone: str):
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT id, nome FROM produtores WHERE telefone = :tel"
        ), {"tel": telefone}).fetchone()
        if result:
            return {"id": result[0], "nome": result[1]}
        return None

def cadastrar(produtor: dict, imovel: dict) -> int:
    with engine.connect() as conn:
        # Verifica se CPF jÃ¡ existe
        cpf_limpo = produtor.get("cpf", "").replace(".", "").replace("-", "").replace(" ", "")
        existente = conn.execute(text(
            "SELECT id FROM produtores WHERE cpf = :cpf"
        ), {"cpf": cpf_limpo}).fetchone()

        if existente:
            produtor_id = existente[0]
        else:
            result = conn.execute(text("""
                INSERT INTO produtores (cpf, nome, telefone, nirf)
                VALUES (:cpf, :nome, :telefone, :nirf)
                RETURNING id
            """), {
                "cpf":      cpf_limpo,
                "nome":     produtor.get("nome"),
                "telefone": produtor.get("telefone", "").replace("(","").replace(")","").replace("-","").replace(" ",""),
                "nirf":     produtor.get("nirf"),
            })
            conn.commit()
            produtor_id = result.fetchone()[0]

        # SÃ³ cadastra imÃ³vel se nome foi fornecido
        # Se imovel_id foi fornecido, vincula ao imovel existente
        if imovel.get("imovel_id"):
            conn.execute(text("""
                INSERT INTO imoveis_rurais (produtor_id, nome, nirf, area_ha, municipio, uf, participacao)
                SELECT :pid, nome, nirf, area_ha, municipio, uf, :part
                FROM imoveis_rurais WHERE id = :iid
                ON CONFLICT DO NOTHING
            """), {
                "pid":  produtor_id,
                "iid":  imovel.get("imovel_id"),
                "part": imovel.get("participacao", 0),
            })
            conn.commit()
        # Caso contrario, cria novo imovel
        elif imovel.get("nome"):
            conn.execute(text("""
                INSERT INTO imoveis_rurais (produtor_id, nome, nirf, area_ha, municipio, uf, participacao)
                VALUES (:pid, :nome, :nirf, :area, :municipio, :uf, :part)
            """), {
                "pid":       produtor_id,
                "nome":      imovel.get("nome"),
                "nirf":      imovel.get("nirf"),
                "area":      imovel.get("area_ha"),
                "municipio": imovel.get("municipio"),
                "uf":        imovel.get("uf"),
                "part":      imovel.get("participacao", 100),
            })
            conn.commit()

        return produtor_id

# â”€â”€â”€ Painel do contador â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

def listar_produtores():
    with engine.connect() as conn:
        rows = conn.execute(text("""
            SELECT
                p.id, p.nome, p.cpf, p.telefone,
                i.municipio, i.uf,
                COALESCE(SUM(CASE WHEN s.tipo = 'RECEITA' THEN l.valor ELSE 0 END), 0) as receita,
                COALESCE(SUM(CASE WHEN s.tipo = 'DESPESA' THEN l.valor ELSE 0 END), 0) as despesa,
                0 as pendentes
            FROM produtores p
            LEFT JOIN imoveis_rurais i ON i.produtor_id = p.id
            LEFT JOIN lancamentos l ON l.produtor_id = p.id
                AND date_trunc('month', l.data) = date_trunc('month', CURRENT_DATE)
            LEFT JOIN subcontas s ON s.id = l.subconta_id
            GROUP BY p.id, p.nome, p.cpf, p.telefone, i.municipio, i.uf
            ORDER BY p.nome
        """)).fetchall()
        return [dict(r._mapping) for r in rows]


def buscar_lancamentos(produtor_id: int, mes: str = None, atividade: str = None):
    with engine.connect() as conn:
        params = {'pid': produtor_id}
        filtro_atv = ' AND s.atividade_tipo = :atv' if atividade else ''
        if atividade: params['atv'] = atividade.upper()
        if mes:
            filtro_data = "AND to_char(l.data, 'YYYY-MM') = :mes"
            params['mes'] = mes
        else:
            filtro_data = "AND date_trunc('month', l.data) = date_trunc('month', CURRENT_DATE)"
        sql = f"""
            SELECT l.id, LOWER(s.tipo) as tipo, s.nome as descricao, l.valor,
                   l.data as data_lancamento, l.documento_url, l.created_at,
                   s.atividade_tipo as atividade, '' as conta_codigo,
                   FALSE as confirmado
            FROM lancamentos l
            LEFT JOIN subcontas s ON s.id = l.subconta_id
            WHERE l.produtor_id = :pid
            {filtro_data}
            {filtro_atv}
            ORDER BY l.data DESC
        """
        rows = conn.execute(text(sql), params).fetchall()
        return [dict(r._mapping) for r in rows]

def buscar_resumo_mes(produtor_id: int):
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT
                COALESCE(SUM(CASE WHEN s.tipo = 'RECEITA' THEN l.valor ELSE 0 END), 0) as receita,
                COALESCE(SUM(CASE WHEN s.tipo = 'DESPESA' THEN l.valor ELSE 0 END), 0) as despesa,
                COUNT(*) as total_lancamentos,
                0 as pendentes
            FROM lancamentos l
            LEFT JOIN subcontas s ON s.id = l.subconta_id
            WHERE l.produtor_id = :pid
            AND date_trunc('month', l.data) = date_trunc('month', CURRENT_DATE)
        """), {"pid": produtor_id}).fetchone()
        return dict(result._mapping) if result else {}


def atualizar_classificacao(lancamento_id: int, conta: str, tipo: str):
    # Schema novo usa subcontas - classificacao e feita via subconta_id
    pass


def fechar_mes(produtor_id: int):
    with engine.connect() as conn:
        conn.execute(text("""
            -- fechar_mes: no schema novo nao ha campo confirmado
            SELECT 1
        """), {"pid": produtor_id})
        conn.commit()

def buscar_imoveis_por_cpf(cpf: str):
    cpf_limpo = cpf.replace(".", "").replace("-", "").replace(" ", "")
    with engine.connect() as conn:
        result = conn.execute(text("""
            SELECT i.id, i.nome, i.municipio, i.uf, i.area_ha, i.nirf
            FROM imoveis_rurais i
            JOIN produtores p ON p.id = i.produtor_id
            WHERE REPLACE(REPLACE(REPLACE(p.cpf, '.', ''), '-', ''), ' ', '') = :cpf
        """), {"cpf": cpf_limpo}).fetchall()
        return [dict(r._mapping) for r in result]


import psycopg2
import psycopg2.extras
import os

DB_URL = os.getenv("DATABASE_URL", "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway")

def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
