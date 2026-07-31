from sqlalchemy import create_engine, text
from dotenv import load_dotenv
import os
import re

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

def buscar_descricao_conta(codigo: str) -> str:
    if not codigo:
        return ""
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT descricao FROM plano_contas WHERE codigo = :codigo"
        ), {"codigo": codigo}).fetchone()
        return result[0] if result else ""


# Mapa direto origem_modulo -> nome da atividade (tabela `atividades`).
# So cobre valores que JA sao nome de modulo de verdade -- "whatsapp_bot"
# e "mensageria" sao rotulos de CANAL, nao de atividade, entao ficam de
# fora de proposito e caem na heuristica por palavra-chave abaixo.
_ORIGEM_MODULO_PARA_ATIVIDADE = {
    'bovino': 'Bovino Leiteiro',
    'piscicultura': 'Piscicultura',
    'acai': 'Açaí',
}

# Mesma heuristica do backfill_atividade_v3.py, resumida pros termos mais
# usados no dia a dia do bot. Se marcar errado, o lancamento ainda pode
# ser corrigido manualmente depois (atividade_id nao e imutavel).
_PALAVRAS_CHAVE_ATIVIDADE = [
    ("Bovino Leiteiro", [
        "leite", "lacta", "ordenh", "vaca", "sucedaneo", "sucedâneo",
        "teteira", "free stal", "freestall", "cmt", "mastite", "mastifin",
        "ocitocina", "milk bar", "milkbar", "bezerra", "resfriamento",
        "lactocina", "peletizada", "pelitizada", "lacmaster",
    ]),
    ("Agricultura", [
        "soja", "milho", "fuba", "adubo", "semente", "colheita", "plantio",
        "agrotoxico", "agrotóxico", "defensivo", "safra", "lavoura",
        "fertilizante", "herbicida", "capim", "silagem", "irrigacao", "irrigação",
    ]),
    ("Ovino", ["ovino", "ovelha", "carneiro", "cordeiro", "borrego"]),
    ("Caprino", ["caprino", "cabra", "bode"]),
    ("Suíno", ["suino", "suíno", "porco", "leitao", "leitão"]),
    ("Piscicultura", ["tilapia", "tilápia", "tanque-rede", "alevino", "piscicultura"]),
    ("Bovino Corte", ["boi", "novilho", "garrote", "touro", "arroba"]),
]


def _termo_bate(termo: str, texto: str) -> bool:
    """Casa por palavra inteira (word-boundary no inicio), nao por
    substring solta -- sem isso, 'ovino' casava dentro de 'Bovino', 'boi'
    dentro de 'Reboice' etc. Permite sufixo (plural: 'ovino' bate em
    'ovinos')."""
    padrao = r'\b' + re.escape(termo) + r'\w*'
    return re.search(padrao, texto) is not None


def _resolver_atividade_id(conn, dados: dict, nome_sub: str):
    """Resolve o id de `atividades` pra um novo lancamento. Nunca lanca
    excecao -- se algo der errado, cai em Geral (ou None se Geral nao
    existir, o que so aconteceria antes da migration_026 rodar)."""
    try:
        origem_modulo = (dados.get('_origem_modulo') or '').lower()
        nome_atividade = _ORIGEM_MODULO_PARA_ATIVIDADE.get(origem_modulo)

        if not nome_atividade:
            texto_busca = (nome_sub or '').lower()
            for atividade, termos in _PALAVRAS_CHAVE_ATIVIDADE:
                if any(_termo_bate(termo, texto_busca) for termo in termos):
                    nome_atividade = atividade
                    break

        if not nome_atividade:
            nome_atividade = 'Geral'

        row = conn.execute(
            text('SELECT id FROM atividades WHERE nome = :nome LIMIT 1'),
            {'nome': nome_atividade},
        ).fetchone()
        return row[0] if row else None
    except Exception:
        return None


def gravar_lancamento(dados: dict):
    with engine.connect() as conn:
        numero = (dados.get('numero') or '').strip()
        canal = (dados.get('canal') or '').strip()
        # IMPORTANTE: "numero" nao e telefone em todo canal - no Telegram
        # e o chat_id (numerico, sem relacao com o telefone real da
        # pessoa). Mesmo padrao ja usado em _autorizar_numero
        # (mensagem_handler.py): canal=='telegram' -> telegram_chat_id
        # (match exato); qualquer outro canal -> telefone (ultimos 8
        # digitos, tolerante a formatacao). Bug achado em producao 31/07:
        # a versao anterior so buscava por telefone, entao NUNCA
        # encontrava ninguem vindo do Telegram.
        prod = None
        if canal == 'telegram':
            if numero:
                prod = conn.execute(
                    text('SELECT id FROM produtores WHERE telegram_chat_id = :num LIMIT 1'),
                    {'num': numero}
                ).fetchone()
        else:
            if len(numero) >= 8:
                prod = conn.execute(
                    text('SELECT id FROM produtores WHERE telefone LIKE :tel LIMIT 1'),
                    {'tel': f'%{numero[-8:]}'}
                ).fetchone()
        if not prod:
            # NUNCA mais cair silenciosamente em produtor_id=1 (bug
            # achado em 31/07 - lancamento real do Bira foi parar no
            # Cicero por causa desse fallback). Falhar visivelmente
            # aqui e seguro; o chamador deve tratar este erro.
            raise ValueError(
                f"Nao foi possivel identificar o produtor para o numero "
                f"'{numero}' (canal={canal or 'desconhecido'}). Lancamento NAO foi gravado."
            )
        produtor_id = prod[0]
        # Busca subconta pelo nome/tipo
        tipo_raw = dados.get('tipo', 'despesa').upper()
        nome_sub = dados.get('produto') or dados.get('subconta') or dados.get('descricao', 'Outros')
        sub = conn.execute(text('SELECT id FROM subcontas WHERE LOWER(nome) LIKE LOWER(:nome) AND tipo = :tipo LIMIT 1'), {'nome': f'%{nome_sub[:20]}%', 'tipo': tipo_raw}).fetchone()
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
            conn.execute(text('INSERT INTO subcontas (id, nome, tipo, atividade_tipo, codigo_conta) VALUES (:id, :nome, :tipo, :atv, :conta)'),
                {'id': sub_id, 'nome': nome_sub[:100], 'tipo': tipo_raw, 'atv': atividade, 'conta': dados.get('conta')})
        else:
            sub_id = sub[0]
        atividade_id = _resolver_atividade_id(conn, dados, nome_sub)
        import uuid as _uuid2
        lanc_id = str(_uuid2.uuid4())
        # origem_modulo/tipo/id/descricao: rastreabilidade de custo por lote,
        # ciclo, talhao etc (mesmo padrao de movimentacoes_insumo) - fica NULL
        # quando o lancamento nao esta vinculado a uma unidade de producao
        conn.execute(text(
            "INSERT INTO lancamentos "
            "(id, produtor_id, subconta_id, valor, data, documento_url, "
            " origem_modulo, origem_tipo, origem_id, origem_descricao, atividade_id) "
            "VALUES (:id, :pid, :sub, :valor, :data, NULL, "
            "        :origem_modulo, :origem_tipo, :origem_id, :origem_descricao, :atividade_id)"
        ), {
            'id': lanc_id, 'pid': produtor_id, 'sub': sub_id,
            'valor': abs(float(dados.get('valor', 0))), 'data': dados.get('data'),
            'origem_modulo': dados.get('_origem_modulo'),
            'origem_tipo': dados.get('_origem_tipo'),
            'origem_id': dados.get('_origem_id'),
            'origem_descricao': dados.get('_origem_descricao'),
            'atividade_id': atividade_id,
        })
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


def buscar_produtor_cadastrado_por_canal(numero: str, canal: str):
    """Igual buscar_produtor_por_numero, mas ciente do canal -- no
    Telegram "numero" é o chat_id (produtores.telegram_chat_id), não
    telefone. Sem essa distinção, quem já se cadastrou pelo Telegram e
    manda "oi" de novo nunca é reconhecido e cai no wizard de cadastro
    do zero (a duplicidade só seria pega depois, no passo do CPF).

    Pra telefone (WhatsApp), usa os ULTIMOS 8 DIGITOS (LIKE), nao
    igualdade exata -- mesmo padrao ja usado em _autorizar_numero
    (mensagem_handler.py), porque a API da Meta as vezes manda o
    numero BR sem o 9o digito do celular. Comparacao exata falha
    silenciosamente nesse caso (achado em producao em 28/07).

    Retorna tambem o CPF -- usado pelo OCR de documento pra decidir
    compra vs venda comparando com emitente/destinatario da nota,
    em vez de confiar so no palpite da Claude (achado em 28/07: nota
    de compra do proprio produtor saiu classificada como venda)."""
    with engine.connect() as conn:
        if canal == "telegram":
            result = conn.execute(text(
                "SELECT id, nome, cpf FROM produtores WHERE telegram_chat_id = :num"
            ), {"num": numero}).fetchone()
        else:
            result = conn.execute(text(
                "SELECT id, nome, cpf FROM produtores WHERE telefone LIKE :tel"
            ), {"tel": f"%{numero[-8:]}"}).fetchone()
        if result:
            return {"id": result[0], "nome": result[1], "cpf": result[2]}
        return None


def buscar_produtor_por_cpf(cpf: str):
    """Usado pelo wizard de cadastro (cadastro_handler.py) pra checar
    duplicidade assim que o CPF é digitado, antes de perguntar o resto —
    evita recadastro duplicado (produtor + imóvel) quando a pessoa já
    tem cadastro e confirma de novo, inclusive por outro canal."""
    with engine.connect() as conn:
        result = conn.execute(text(
            "SELECT id, nome FROM produtores WHERE cpf = :cpf"
        ), {"cpf": cpf}).fetchone()
        if result:
            return {"id": result[0], "nome": result[1]}
        return None


def listar_imoveis_acessiveis(produtor_id: int):
    """Resolve TODOS os imóveis que um produtor pode acessar: os que ele
    é dono (imoveis_rurais.produtor_id) + os que tem vínculo ativo em
    participacoes_imovel (administrador, procurador, contador, cotitular
    com percentual > 0.01 real).

    Criada pra resolver a pendência "administrador/procurador vinculado
    não dá acesso ao painel web" -- hoje /auth/me e as rotas do painel só
    enxergam imoveis_rurais.produtor_id, sem consultar participacoes_
    imovel. Essa função é o primeiro passo (o "habilitador"); os
    endpoints que retornam dados por imovel_id ainda precisam ser
    atualizados, um a um, pra usar essa lista em vez de só produtor_id
    direto -- isso fica pra depois, é uma mudança grande demais pra
    fazer de uma vez em todas as rotas do painel.

    Retorna lista de dicts: {"imovel_id", "nome", "papel", "municipio", "uf",
    "area_ha", "nirf", "total_produtores"} -- os 4 últimos campos foram
    adicionados (29/07) pra alimentar diretamente o endpoint autenticado
    /produtores/me/imoveis, consumido pelo Node (server/otp.ts e
    server/routers/railway.ts) no lugar do endpoint quebrado
    /imoveis/buscar?cpf=... (que ignorava o cpf e retornava os 10 primeiros
    imóveis do sistema em ordem alfabética -- ver handoff 29-30/07).

    "papel" é "proprietario" (dono) ou o tipo_vinculo de participacoes_imovel
    (administrador, procurador, contador, cotitular)."""
    with engine.connect() as conn:
        proprios = conn.execute(text("""
            SELECT id AS imovel_id, nome, 'proprietario' AS papel,
                   municipio, uf, area_ha, nirf
            FROM imoveis_rurais
            WHERE produtor_id = :pid
        """), {"pid": produtor_id}).fetchall()

        vinculados = conn.execute(text("""
            SELECT ir.id AS imovel_id, ir.nome, pi.tipo_vinculo AS papel,
                   ir.municipio, ir.uf, ir.area_ha, ir.nirf
            FROM participacoes_imovel pi
            JOIN imoveis_rurais ir ON ir.id = pi.imovel_id
            WHERE pi.produtor_id = :pid
              AND pi.vigencia_fim IS NULL
              AND pi.produtor_id != ir.produtor_id
        """), {"pid": produtor_id}).fetchall()

        vistos = set()
        resultado = []
        for row in list(proprios) + list(vinculados):
            if row[0] in vistos:
                continue
            vistos.add(row[0])
            resultado.append({
                "imovel_id": row[0],
                "nome": row[1],
                "papel": row[2],
                "municipio": row[3],
                "uf": row[4],
                "area_ha": float(row[5]) if row[5] is not None else None,
                "nirf": row[6],
            })

        if resultado:
            ids = [r["imovel_id"] for r in resultado]
            contagem = conn.execute(text("""
                SELECT imovel_id, COUNT(*) AS total
                FROM (
                    SELECT id AS imovel_id FROM imoveis_rurais WHERE id = ANY(:ids)
                    UNION ALL
                    SELECT imovel_id FROM participacoes_imovel
                    WHERE imovel_id = ANY(:ids) AND vigencia_fim IS NULL
                ) t
                GROUP BY imovel_id
            """), {"ids": ids}).fetchall()
            totais = {row[0]: row[1] for row in contagem}
            for r in resultado:
                r["total_produtores"] = totais.get(r["imovel_id"], 1)

        return resultado


def cadastrar(produtor: dict, imovel: dict) -> int:
    with engine.connect() as conn:
        # Verifica se CPF jÃ¡ existe
        cpf_limpo = produtor.get("cpf", "").replace(".", "").replace("-", "").replace(" ", "")
        existente = conn.execute(text(
            "SELECT id FROM produtores WHERE cpf = :cpf"
        ), {"cpf": cpf_limpo}).fetchone()

        telefone_bruto = produtor.get("telefone")
        telefone_limpo = (
            telefone_bruto.replace("(", "").replace(")", "").replace("-", "").replace(" ", "")
            if telefone_bruto else None
        )
        telegram_chat_id = produtor.get("telegram_chat_id")

        if existente:
            produtor_id = existente[0]
            # Nao sobrescreve o que ja tiver — so preenche o que estiver
            # faltando (ex: alguem que ja tinha cadastro por CPF/telefone
            # e agora tambem confirmou pelo Telegram).
            conn.execute(text("""
                UPDATE produtores
                SET telegram_chat_id = COALESCE(telegram_chat_id, :chat_id),
                    telefone         = COALESCE(telefone, :telefone)
                WHERE id = :pid
            """), {"pid": produtor_id, "chat_id": telegram_chat_id, "telefone": telefone_limpo})
            conn.commit()
        else:
            result = conn.execute(text("""
                INSERT INTO produtores (cpf, nome, telefone, nirf, telegram_chat_id)
                VALUES (:cpf, :nome, :telefone, :nirf, :chat_id)
                RETURNING id
            """), {
                "cpf":      cpf_limpo,
                "nome":     produtor.get("nome"),
                "telefone": telefone_limpo,
                "nirf":     produtor.get("nirf"),
                "chat_id":  telegram_chat_id,
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
        # Caso contrario, cria novo imovel — mas so depois de checar
        # duplicidade em dois niveis (achados em 27-28/07):
        elif imovel.get("nome"):
            # 1) Mesma propriedade sob OUTRO produtor (ex: Fernando tentando
            #    se cadastrar como "dono" do Condominio Rural Coqueiro, que
            #    ja e do Cicero) -- BLOQUEIA, nao duplica a fazenda fisica
            #    sob dois produtor_id diferentes.
            imovel_de_outro = conn.execute(text("""
                SELECT id, produtor_id FROM imoveis_rurais
                WHERE produtor_id != :pid
                  AND lower(unaccent(nome)) = lower(unaccent(:nome))
                  AND lower(unaccent(COALESCE(municipio, ''))) = lower(unaccent(COALESCE(:municipio, '')))
                  AND uf = :uf
                LIMIT 1
            """), {
                "pid": produtor_id, "nome": imovel.get("nome"),
                "municipio": imovel.get("municipio"), "uf": imovel.get("uf"),
            }).fetchone()
            if imovel_de_outro:
                raise ValueError(
                    f"A propriedade \"{imovel.get('nome')}\" já está cadastrada no "
                    f"RuralCaixa por outra pessoa. Peça pro proprietário rodar o comando "
                    f"\"vincular administrador {cpf_limpo}\" (ou procurador/contador, "
                    f"conforme seu papel) pra te vincular a essa propriedade, em vez de "
                    f"criar um cadastro novo."
                )

            # 2) MESMO produtor recadastrando com nome equivalente (bug do
            #    teste "joao de deus"/Cicero em 27/07) -- reaproveita o
            #    imovel existente em vez de duplicar.
            imovel_similar = conn.execute(text("""
                SELECT id FROM imoveis_rurais
                WHERE produtor_id = :pid
                  AND lower(unaccent(nome)) = lower(unaccent(:nome))
                LIMIT 1
            """), {"pid": produtor_id, "nome": imovel.get("nome")}).fetchone()

            if not imovel_similar:
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
