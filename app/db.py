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

def gravar_lancamento(dados: dict) -> int:
    with engine.connect() as conn:
        prod = conn.execute(text(
            "SELECT id FROM produtores WHERE telefone = :tel"
        ), {"tel": dados.get("numero", "")}).fetchone()

        produtor_id = prod[0] if prod else 1

        imovel = conn.execute(text(
            "SELECT id FROM imoveis_rurais WHERE produtor_id = :pid LIMIT 1"
        ), {"pid": produtor_id}).fetchone()

        imovel_id = imovel[0] if imovel else None

        result = conn.execute(text("""
            INSERT INTO lancamentos
                (produtor_id, imovel_id, conta_codigo, tipo, descricao, valor, data_lancamento, origem, texto_original, produto, atividade)
            VALUES
                (:produtor_id, :imovel_id, :conta, :tipo, :descricao, :valor, :data, :origem, :texto, :produto, :atividade)
            RETURNING id
        """), {
            "produtor_id": produtor_id,
            "imovel_id":   imovel_id,
            "conta":       dados.get("conta"),
            "tipo":        dados.get("tipo"),
            "descricao":   dados.get("texto_original", ""),
            "valor":       dados.get("valor", 0),
            "data":        dados.get("data"),
            "origem":      dados.get("origem", "whatsapp"),
            "produto":     dados.get("produto"),
            "texto":       dados.get("texto_original", ""),
            "atividade":   dados.get("atividade", "rural"),
        })
        conn.commit()

        lancamento_id = result.fetchone()[0]

        import json as _json
        conn.execute(text("""
            INSERT INTO audit_log (tabela, registro_id, acao, usuario, payload)
            VALUES ('lancamentos', :id, 'INSERT', :usuario, cast(:payload as jsonb))
        """), {
            "id": lancamento_id,
            "usuario": dados.get("numero", "whatsapp"),
            "payload": _json.dumps(dados)
        })
        conn.commit()

        return lancamento_id


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
                COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END), 0)
            FROM lancamentos
            WHERE produtor_id = :pid
            AND date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)
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
        # Verifica se CPF já existe
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

        # Só cadastra imóvel se nome foi fornecido
        if imovel.get("nome"):
            conn.execute(text("""
                INSERT INTO imoveis_rurais (produtor_id, nome, nirf, area_ha, municipio, uf)
                VALUES (:pid, :nome, :nirf, :area, :municipio, :uf)
            """), {
                "pid":       produtor_id,
                "nome":      imovel.get("nome"),
                "nirf":      imovel.get("nirf"),
                "area":      imovel.get("area_ha"),
                "municipio": imovel.get("municipio"),
                "uf":        imovel.get("uf"),
            })
            conn.commit()

        return produtor_id

# ─── Painel do contador ───────────────────────────────────────────────────────

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
                COALESCE(SUM(CASE WHEN tipo = 'receita' THEN valor ELSE 0 END), 0) as receita,
                COALESCE(SUM(CASE WHEN tipo = 'despesa' THEN valor ELSE 0 END), 0) as despesa,
                COUNT(*) as total_lancamentos,
                COUNT(CASE WHEN confirmado = false THEN 1 END) as pendentes
            FROM lancamentos
            WHERE produtor_id = :pid
            AND date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)
        """), {"pid": produtor_id}).fetchone()
        return dict(result._mapping) if result else {}


def atualizar_classificacao(lancamento_id: int, conta: str, tipo: str):
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE lancamentos
            SET conta_codigo = :conta, tipo = :tipo
            WHERE id = :id
        """), {"conta": conta, "tipo": tipo, "id": lancamento_id})
        conn.commit()


def fechar_mes(produtor_id: int):
    with engine.connect() as conn:
        conn.execute(text("""
            UPDATE lancamentos
            SET confirmado = true
            WHERE produtor_id = :pid
            AND date_trunc('month', data_lancamento) = date_trunc('month', CURRENT_DATE)
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