"""
RuralCaixa — app/routers/contratos_assistente.py
Assistente Inteligente de Contratos Rurais.

Endpoints:
  GET  /contratos-assistente/tipos              — lista tipos ativos + cláusulas + alertas
  POST /contratos-assistente/tipos               — cria um tipo novo (produtor pode expandir)
  POST /contratos-assistente/recomendar          — motor de recomendação a partir das respostas
  POST /contratos-assistente/rascunho            — gera texto de rascunho pra um tipo escolhido

Motor de recomendação — ordem de decisão:
  0. VÍNCULO (triagem) — se indicar subordinação + remuneração fixa periódica, isso não é
     nenhum dos contratos rurais listados; é risco de vínculo empregatício (CLT). Sai um
     alerta forte e a recomendação normal não roda.
  1. RELAÇÃO — define o universo: transferência definitiva só combina com compra_venda;
     co-propriedade só combina com condominio.
  2. REMUNERAÇÃO — critério eliminatório entre os demais tipos (mesma lógica do Decreto
     59.566/66 pra distinguir arrendamento de parceria).
  3. ATIVIDADE — especializa qual parceria (agrícola/pecuária/agroindustrial/extrativa).
  4. PRAZO / RISCO / INFRAESTRUTURA — ajustes finos de score + alertas de inconsistência
     (ex: remuneração diz "divisão de resultado" mas risco diz "só o proprietário assume" —
     isso é uma contradição que vale alertar, pode ser arrendamento disfarçado de parceria).
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import Optional, List, Dict, Any
import psycopg2
import psycopg2.extras
import os
import json

router = APIRouter(prefix="/contratos-assistente", tags=["Assistente de Contratos Rurais"])

DB_URL = os.getenv("DATABASE_URL") or "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"


def get_db():
    return psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)


# ── SCHEMAS ──────────────────────────────────────────────────

class ClausulaIn(BaseModel):
    titulo: str
    descricao: Optional[str] = None
    obrigatoria: bool = True


class AlertaIn(BaseModel):
    texto: str
    nivel: str = "aviso"   # aviso | alerta | proibicao


class TipoContratoIn(BaseModel):
    slug: str
    nome: str
    emoji: Optional[str] = "📄"
    descricao: str
    quando_usar: str
    clausulas: List[ClausulaIn] = []
    alertas: List[AlertaIn] = []


class RespostasQuestionario(BaseModel):
    vinculo: str                # "autonomo" | "subordinado_remuneracao_fixa"
    relacao: str                # "cede_uso" | "co_propriedade" | "transferencia_definitiva"
    remuneracao: str            # "divisao_resultado" | "valor_fixo" | "gratuito" | "rateio_cotas" | "preco_unico" | "por_servico_executado"
    atividade: Optional[str] = None   # "agricola" | "pecuaria" | "agroindustrial" | "extrativa" — só relevante se remuneracao == divisao_resultado
    prazo: Optional[str] = None       # "curto" | "medio" | "longo" | "indeterminado"
    risco: Optional[str] = None       # "proprietario" | "terceiro" | "dividido"
    infraestrutura: Optional[str] = None  # "proprietario" | "terceiro" | "ambos"


class RecomendarRequest(BaseModel):
    respostas: RespostasQuestionario
    imovel_id: Optional[int] = None
    produtor_id: Optional[int] = None


class RascunhoRequest(BaseModel):
    tipo_slug: str
    partes: List[Dict[str, Any]] = []
    dados_extra: Optional[Dict[str, Any]] = {}


# ── GET /tipos ───────────────────────────────────────────────

@router.get("/tipos")
def listar_tipos():
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM tipos_contrato_rural WHERE ativo = TRUE ORDER BY ordem")
        tipos = [dict(r) for r in cur.fetchall()]
        for t in tipos:
            cur.execute(
                "SELECT titulo, descricao, obrigatoria FROM clausulas_contrato "
                "WHERE tipo_contrato_id = %s ORDER BY ordem",
                (t["id"],),
            )
            t["clausulas"] = [dict(r) for r in cur.fetchall()]
            cur.execute(
                "SELECT texto, nivel FROM alertas_contrato WHERE tipo_contrato_id = %s",
                (t["id"],),
            )
            t["alertas"] = [dict(r) for r in cur.fetchall()]
        return tipos
    finally:
        conn.close()


# ── POST /tipos ──────────────────────────────────────────────

@router.post("/tipos", status_code=201)
def criar_tipo(body: TipoContratoIn):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT COALESCE(MAX(ordem), 0) + 1 AS proxima FROM tipos_contrato_rural")
        proxima_ordem = cur.fetchone()["proxima"]

        try:
            cur.execute(
                """
                INSERT INTO tipos_contrato_rural (slug, nome, emoji, descricao, quando_usar, ordem)
                VALUES (%s,%s,%s,%s,%s,%s)
                RETURNING id
                """,
                (body.slug, body.nome, body.emoji, body.descricao, body.quando_usar, proxima_ordem),
            )
        except psycopg2.errors.UniqueViolation:
            conn.rollback()
            raise HTTPException(409, f"Já existe um tipo de contrato com o slug '{body.slug}'")

        tipo_id = cur.fetchone()["id"]

        for i, c in enumerate(body.clausulas):
            cur.execute(
                "INSERT INTO clausulas_contrato (tipo_contrato_id, ordem, titulo, descricao, obrigatoria) "
                "VALUES (%s,%s,%s,%s,%s)",
                (tipo_id, i, c.titulo, c.descricao, c.obrigatoria),
            )
        for a in body.alertas:
            cur.execute(
                "INSERT INTO alertas_contrato (tipo_contrato_id, texto, nivel) VALUES (%s,%s,%s)",
                (tipo_id, a.texto, a.nivel),
            )

        conn.commit()
        return {"id": tipo_id, "slug": body.slug, "nome": body.nome}
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ── MOTOR DE RECOMENDAÇÃO ────────────────────────────────────

# Tipos que representam "parceria" especializada por atividade
_PARCERIAS = {"agricola", "pecuaria", "agroindustrial", "extrativa"}

# Todos os slugs que o motor sabe pontuar por padrão (tipos "core" do app)
_TODOS_TIPOS_CORE = _PARCERIAS | {"arrendamento", "comodato", "condominio", "compra_venda", "prestacao_servico"}


def _calcular_recomendacao(respostas: RespostasQuestionario, tipos_disponiveis: List[dict]) -> dict:
    """
    Retorna dict com:
      alerta_vinculo: str | None  -> se veio, PARE, não é um contrato rural padrão
      scores: {slug: score}
      alertas_inconsistencia: list[str]
    """
    slugs_disponiveis = {t["slug"] for t in tipos_disponiveis}
    scores = {slug: 50 for slug in slugs_disponiveis}  # score base neutro
    alertas_inconsistencia: List[str] = []

    # 0) TRIAGEM DE VÍNCULO — vem antes de tudo
    if respostas.vinculo == "subordinado_remuneracao_fixa":
        return {
            "alerta_vinculo": (
                "As respostas indicam subordinação direta (ordens, horário, remuneração fixa "
                "periódica) — isso não é caracterizado como nenhum dos contratos rurais listados "
                "aqui. Pode configurar vínculo empregatício (CLT), com risco de passivo trabalhista "
                "retroativo se formalizado apenas como 'contrato rural'. Recomenda-se orientação "
                "jurídica/trabalhista antes de prosseguir."
            ),
            "scores": {},
            "alertas_inconsistencia": [],
        }

    # 1) RELAÇÃO — define o universo
    if respostas.relacao == "transferencia_definitiva":
        for slug in scores:
            scores[slug] = 100 if slug == "compra_venda" else 0
        return {"alerta_vinculo": None, "scores": scores, "alertas_inconsistencia": []}

    if respostas.relacao == "co_propriedade":
        for slug in scores:
            scores[slug] = 100 if slug == "condominio" else max(0, scores[slug] - 40)

    # 2) REMUNERAÇÃO — eliminatório (zera TODOS os tipos não alinhados, não só alguns)
    rem = respostas.remuneracao
    grupo_por_remuneracao = {
        "divisao_resultado": _PARCERIAS,
        "valor_fixo": {"arrendamento"},
        "gratuito": {"comodato"},
        "rateio_cotas": {"condominio"},
        "preco_unico": {"compra_venda"},
        "por_servico_executado": {"prestacao_servico"},
    }
    grupo_alvo = grupo_por_remuneracao.get(rem)
    if grupo_alvo is not None:
        bonus = 30 if rem == "divisao_resultado" else 40
        for slug in scores:
            if slug in grupo_alvo:
                scores[slug] += bonus
            else:
                scores[slug] = 0

    # 3) ATIVIDADE — especializa a parceria
    if respostas.atividade and rem == "divisao_resultado":
        for slug in _PARCERIAS:
            if slug not in scores:
                continue
            scores[slug] = scores[slug] + 30 if slug == respostas.atividade else max(0, scores[slug] - 20)

    # 4) AJUSTES FINOS + alertas de inconsistência
    if respostas.risco == "dividido" and rem == "valor_fixo":
        alertas_inconsistencia.append(
            "Você disse que o pagamento é um valor fixo, mas também que o risco é dividido entre "
            "as partes — isso é uma contradição típica de 'arrendamento disfarçado de parceria' "
            "(ou vice-versa). Revise: se o risco é mesmo dividido, o pagamento não deveria ser fixo."
        )
    if respostas.risco == "proprietario" and rem == "divisao_resultado":
        alertas_inconsistencia.append(
            "Você disse que a remuneração é por divisão de resultado, mas que o risco fica só com "
            "o proprietário — numa parceria de verdade, o risco costuma ser dividido também. "
            "Confirme se não é o caso de simplificar pra arrendamento."
        )

    if respostas.risco == "dividido" and rem == "divisao_resultado":
        for slug in _PARCERIAS:
            if slug in scores and scores[slug] > 0:
                scores[slug] += 10

    if respostas.infraestrutura == "ambos" and rem == "divisao_resultado":
        for slug in _PARCERIAS:
            if slug in scores and scores[slug] > 0:
                scores[slug] += 5

    if respostas.prazo == "indeterminado":
        for slug in ("comodato", "condominio"):
            if slug in scores and scores[slug] > 0:
                scores[slug] += 5
        if "arrendamento" in scores and scores["arrendamento"] > 0:
            alertas_inconsistencia.append(
                "Arrendamento rural tem prazo mínimo legal conforme a atividade — 'prazo "
                "indeterminado' não é o padrão nesse tipo. Confirme o prazo antes de formalizar."
            )

    scores = {slug: max(0, min(100, s)) for slug, s in scores.items()}
    return {"alerta_vinculo": None, "scores": scores, "alertas_inconsistencia": alertas_inconsistencia}


def _gerar_justificativa(slug_recomendado: str, respostas: RespostasQuestionario, tipos_por_slug: dict) -> str:
    nome = tipos_por_slug.get(slug_recomendado, {}).get("nome", slug_recomendado)
    partes = [f"Recomendado: {nome}."]
    if respostas.relacao == "co_propriedade":
        partes.append("Vocês são coproprietários da mesma área, não há um lado cedendo pro outro.")
    elif respostas.remuneracao == "divisao_resultado":
        partes.append("A remuneração combinada é uma divisão do resultado (produção/lucro), não um valor fixo.")
    elif respostas.remuneracao == "valor_fixo":
        partes.append("A remuneração combinada é um valor fixo, independente do resultado da safra.")
    elif respostas.remuneracao == "gratuito":
        partes.append("Não há cobrança envolvida — é uma cessão de uso gratuita.")
    elif respostas.remuneracao == "preco_unico":
        partes.append("Há transferência definitiva de propriedade mediante um preço único.")
    elif respostas.remuneracao == "por_servico_executado":
        partes.append("O pagamento é por um serviço executado, não pelo uso da terra nem por resultado de produção.")
    if respostas.atividade:
        partes.append(f"Atividade envolvida: {respostas.atividade}.")
    return " ".join(partes)


@router.post("/recomendar")
def recomendar(body: RecomendarRequest):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT id, slug, nome, emoji FROM tipos_contrato_rural WHERE ativo = TRUE")
        tipos = [dict(r) for r in cur.fetchall()]
        tipos_por_slug = {t["slug"]: t for t in tipos}

        resultado = _calcular_recomendacao(body.respostas, tipos)

        if resultado["alerta_vinculo"]:
            cur.execute(
                """
                INSERT INTO recomendacoes_contrato
                    (imovel_id, produtor_id, respostas, contrato_recomendado, score,
                     alternativas, alertas_disparados, status)
                VALUES (%s,%s,%s,NULL,0,'[]','%s','descartado')
                """.replace("'%s'", "%s"),
                (
                    body.imovel_id, body.produtor_id,
                    json.dumps(body.respostas.dict()),
                    json.dumps([resultado["alerta_vinculo"]]),
                ),
            )
            conn.commit()
            return {
                "recomendado": None,
                "alerta_vinculo": resultado["alerta_vinculo"],
                "alternativas": [],
                "justificativa": None,
            }

        scores = resultado["scores"]
        ranking = sorted(scores.items(), key=lambda kv: kv[1], reverse=True)
        ranking = [(slug, score) for slug, score in ranking if slug in tipos_por_slug]

        if not ranking or ranking[0][1] == 0:
            raise HTTPException(
                422,
                "Não foi possível identificar um tipo de contrato adequado com essas respostas. "
                "Revise o questionário ou cadastre um tipo de contrato personalizado.",
            )

        slug_top, score_top = ranking[0]
        alternativas = [
            {**tipos_por_slug[slug], "score": s}
            for slug, s in ranking[1:4] if s > 0
        ]

        justificativa = _gerar_justificativa(slug_top, body.respostas, tipos_por_slug)

        cur.execute(
            """
            INSERT INTO recomendacoes_contrato
                (imovel_id, produtor_id, respostas, contrato_recomendado, score,
                 alternativas, alertas_disparados, status)
            VALUES (%s,%s,%s,%s,%s,%s,%s,'rascunho')
            """,
            (
                body.imovel_id, body.produtor_id,
                json.dumps(body.respostas.dict()),
                slug_top, score_top,
                json.dumps([a["slug"] for a in alternativas]),
                json.dumps(resultado["alertas_inconsistencia"]),
            ),
        )
        conn.commit()

        # Busca cláusulas/alertas completos do tipo recomendado pra devolver junto
        cur.execute(
            "SELECT titulo, descricao, obrigatoria FROM clausulas_contrato "
            "WHERE tipo_contrato_id = %s ORDER BY ordem",
            (tipos_por_slug[slug_top]["id"],),
        )
        clausulas = [dict(r) for r in cur.fetchall()]
        cur.execute(
            "SELECT texto, nivel FROM alertas_contrato WHERE tipo_contrato_id = %s",
            (tipos_por_slug[slug_top]["id"],),
        )
        alertas_tipo = [dict(r) for r in cur.fetchall()]

        return {
            "recomendado": {**tipos_por_slug[slug_top], "score": score_top,
                             "clausulas": clausulas, "alertas": alertas_tipo},
            "alerta_vinculo": None,
            "alternativas": alternativas,
            "alertas_inconsistencia": resultado["alertas_inconsistencia"],
            "justificativa": justificativa,
        }
    except HTTPException:
        raise
    except Exception as e:
        conn.rollback()
        raise HTTPException(500, str(e))
    finally:
        conn.close()


# ── POST /rascunho ───────────────────────────────────────────

@router.post("/rascunho")
def gerar_rascunho(body: RascunhoRequest):
    conn = get_db()
    try:
        cur = conn.cursor()
        cur.execute("SELECT * FROM tipos_contrato_rural WHERE slug = %s", (body.tipo_slug,))
        tipo = cur.fetchone()
        if not tipo:
            raise HTTPException(404, f"Tipo de contrato '{body.tipo_slug}' não encontrado")
        tipo = dict(tipo)

        cur.execute(
            "SELECT titulo, descricao FROM clausulas_contrato WHERE tipo_contrato_id = %s ORDER BY ordem",
            (tipo["id"],),
        )
        clausulas = [dict(r) for r in cur.fetchall()]

        linhas = [f"{tipo['nome'].upper()}", ""]
        for p in body.partes:
            linhas.append(f"- {p.get('tipo', 'parte')}: {p.get('nome', '')} (CPF/CNPJ: {p.get('cpfCnpj', '')})")
        linhas.append("")
        for i, c in enumerate(clausulas, start=1):
            linhas.append(f"Cláusula {i} — {c['titulo']}")
            if c.get("descricao"):
                linhas.append(f"  {c['descricao']}")
            linhas.append("")

        rascunho_texto = "\n".join(linhas)
        return {"rascunho": rascunho_texto, "tipo": tipo["slug"]}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(500, str(e))
    finally:
        conn.close()
