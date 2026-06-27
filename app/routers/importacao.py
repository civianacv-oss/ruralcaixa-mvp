# app/routers/importacao.py — RuralCaixa MVP
"""
Endpoints de importação em lote.

POST /importacao/preview     — valida arquivo e retorna preview + erros
POST /importacao/lancamentos — importa lançamentos financeiros em lote
POST /importacao/rebanho     — importa animais em lote
POST /importacao/ofx         — importa extrato bancário OFX
"""

import re
import io
import logging
from datetime import date, datetime
from typing import Optional
from fastapi import APIRouter, UploadFile, File, Form, HTTPException, Request
from fastapi.responses import JSONResponse

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/importacao", tags=["importacao"])

MAX_LINHAS = 500
ROLLBACK_THRESHOLD = 0.20  # 20% de erros → rollback

# ── Mapeamento automático de colunas ─────────────────────────────────

MAPA_DATA = ["data", "date", "dt", "data_lancamento", "data lançamento", "data lanc"]
MAPA_VALOR = ["valor", "value", "amount", "vl", "vl_total", "total", "vlr"]
MAPA_DESCRICAO = ["descricao", "descrição", "description", "historico", "histórico",
                   "obs", "observacao", "memo", "complemento", "detalhe"]
MAPA_TIPO = ["tipo", "type", "natureza", "categoria", "cat", "classificacao"]

PALAVRAS_DESPESA = [
    "ração", "racao", "adubo", "fertilizante", "semente", "defensivo",
    "combustível", "combustivel", "diesel", "gasolina", "energia", "luz",
    "medicamento", "vacina", "sal", "frete", "manutenção", "manutencao",
    "reparo", "serviço", "servico", "mão de obra", "mao de obra",
    "imposto", "taxa", "seguro", "aluguel", "arrendamento", "telefone",
]
PALAVRAS_RECEITA = [
    "venda", "vendi", "receita", "boi", "vaca", "bezerro", "novilho",
    "soja", "milho", "arroz", "café", "cafe", "leite", "peixe", "tilápia",
    "tilapia", "frango", "suíno", "suino", "lã", "la", "subsidio", "subvenção",
]


def detectar_tipo(descricao: str) -> str:
    d = descricao.lower()
    score_desp = sum(1 for p in PALAVRAS_DESPESA if p in d)
    score_rec = sum(1 for p in PALAVRAS_RECEITA if p in d)
    if score_desp > score_rec:
        return "despesa"
    if score_rec > score_desp:
        return "receita"
    return "despesa"  # default conservador


def fuzzy_match(col: str, candidatos: list[str]) -> bool:
    c = col.lower().strip().replace(" ", "_")
    return any(c == cand or c in cand or cand in c for cand in candidatos)


def mapear_colunas(headers: list[str]) -> dict:
    mapa = {}
    for h in headers:
        if fuzzy_match(h, MAPA_DATA):
            mapa.setdefault("data", h)
        elif fuzzy_match(h, MAPA_VALOR):
            mapa.setdefault("valor", h)
        elif fuzzy_match(h, MAPA_DESCRICAO):
            mapa.setdefault("descricao", h)
        elif fuzzy_match(h, MAPA_TIPO):
            mapa.setdefault("tipo", h)
    return mapa


# ── Parsers ───────────────────────────────────────────────────────────

def parse_data(v: str) -> Optional[str]:
    if not v:
        return None
    v = str(v).strip()
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y", "%Y/%m/%d"):
        try:
            return datetime.strptime(v, fmt).date().isoformat()
        except Exception:
            pass
    # Tenta número serial do Excel (dias desde 1900-01-01)
    try:
        n = int(float(v))
        if 20000 < n < 60000:
            from datetime import timedelta
            return (date(1899, 12, 30) + timedelta(days=n)).isoformat()
    except Exception:
        pass
    return None


def parse_valor(v) -> Optional[float]:
    if v is None:
        return None
    s = str(v).strip().replace("R$", "").replace(" ", "")
    s = s.replace(".", "").replace(",", ".")
    try:
        return abs(float(s))
    except Exception:
        return None


def ler_excel_csv(conteudo: bytes, nome: str) -> tuple[list[str], list[list]]:
    """Retorna (headers, linhas) do arquivo."""
    if nome.endswith(".csv"):
        import csv
        text = conteudo.decode("utf-8-sig", errors="replace")
        reader = csv.reader(io.StringIO(text), delimiter=None)
        rows = list(reader)
        if not rows:
            return [], []
        return [str(h).strip() for h in rows[0]], rows[1:]
    else:
        import openpyxl
        wb = openpyxl.load_workbook(io.BytesIO(conteudo), read_only=True, data_only=True)
        ws = wb.active
        rows = list(ws.iter_rows(values_only=True))
        wb.close()
        if not rows:
            return [], []
        headers = [str(h).strip() if h is not None else "" for h in rows[0]]
        return headers, [list(r) for r in rows[1:]]


def ler_ofx(conteudo: bytes) -> tuple[list[str], list[list]]:
    """Extrai transações de arquivo OFX/OFC."""
    text = conteudo.decode("latin-1", errors="replace")
    headers = ["data", "valor", "descricao", "tipo"]
    linhas = []
    transacoes = re.findall(r"<STMTTRN>(.*?)</STMTTRN>", text, re.DOTALL)
    for t in transacoes:
        def get(tag):
            m = re.search(rf"<{tag}>([^\n<]+)", t)
            return m.group(1).strip() if m else ""
        dtpost = get("DTPOSTED")[:8] if get("DTPOSTED") else ""
        data = f"{dtpost[6:8]}/{dtpost[4:6]}/{dtpost[:4]}" if len(dtpost) == 8 else ""
        valor_raw = get("TRNAMT").replace(",", ".")
        try:
            valor = float(valor_raw)
        except Exception:
            valor = 0.0
        memo = get("MEMO") or get("NAME") or ""
        tipo = "receita" if valor > 0 else "despesa"
        linhas.append([data, abs(valor), memo, tipo])
    return headers, linhas


# ── Validação de lançamentos ──────────────────────────────────────────

def validar_lancamentos(headers, linhas, mapa_manual: dict = None) -> dict:
    mapa = mapear_colunas(headers)
    if mapa_manual:
        mapa.update(mapa_manual)

    erros = []
    avisos = []
    validos = []
    vistos = set()  # detecção de duplicatas

    for i, linha in enumerate(linhas[:MAX_LINHAS], start=2):
        row = dict(zip(headers, linha))

        data_raw = row.get(mapa.get("data", ""), "")
        valor_raw = row.get(mapa.get("valor", ""), "")
        desc_raw = str(row.get(mapa.get("descricao", ""), "") or "").strip()
        tipo_raw = str(row.get(mapa.get("tipo", ""), "") or "").strip().lower()

        # Valida data
        data_iso = parse_data(str(data_raw))
        if not data_iso:
            erros.append({"linha": i, "campo": "data", "msg": f"Data inválida: '{data_raw}'"})
            continue

        # Valida ano razoável
        ano = int(data_iso[:4])
        if ano < 2000 or ano > date.today().year + 1:
            avisos.append({"linha": i, "campo": "data", "msg": f"Data fora do intervalo esperado: {data_iso}"})

        # Valida valor
        valor = parse_valor(valor_raw)
        if valor is None or valor == 0:
            erros.append({"linha": i, "campo": "valor", "msg": f"Valor inválido: '{valor_raw}'"})
            continue

        # Tipo: detecta se não informado
        if tipo_raw in ("despesa", "d", "desp", "saída", "saida", "-"):
            tipo = "despesa"
        elif tipo_raw in ("receita", "r", "rec", "entrada", "+"):
            tipo = "receita"
        elif tipo_raw:
            tipo = detectar_tipo(tipo_raw + " " + desc_raw)
            avisos.append({"linha": i, "campo": "tipo",
                           "msg": f"Tipo '{tipo_raw}' inferido como '{tipo}'"})
        else:
            tipo = detectar_tipo(desc_raw)

        # Duplicata
        chave = (data_iso, round(valor, 2), desc_raw[:50])
        if chave in vistos:
            avisos.append({"linha": i, "campo": "duplicata",
                           "msg": f"Possível duplicata: {data_iso} R${valor:.2f} {desc_raw[:30]}"})
        vistos.add(chave)

        validos.append({
            "linha": i,
            "data": data_iso,
            "valor": valor,
            "descricao": desc_raw or "Importado",
            "tipo": tipo,
        })

    return {
        "mapa_detectado": mapa,
        "total_linhas": len(linhas),
        "validos": validos,
        "erros": erros,
        "avisos": avisos,
        "preview": validos[:10],
    }


# ── Endpoints ─────────────────────────────────────────────────────────

@router.post("/preview")
async def preview_importacao(
    request: Request,
    arquivo: UploadFile = File(...),
    tipo_importacao: str = Form("lancamentos"),
):
    """Valida arquivo e retorna preview sem importar."""
    conteudo = await arquivo.read()
    nome = arquivo.filename or "arquivo"

    if len(conteudo) > 10 * 1024 * 1024:  # 10MB
        raise HTTPException(400, "Arquivo muito grande. Máximo 10MB.")

    try:
        if nome.lower().endswith(".ofx") or nome.lower().endswith(".ofc"):
            headers, linhas = ler_ofx(conteudo)
        else:
            headers, linhas = ler_excel_csv(conteudo, nome.lower())
    except Exception as e:
        raise HTTPException(400, f"Erro ao ler arquivo: {str(e)}")

    if not linhas:
        raise HTTPException(400, "Arquivo vazio ou sem dados.")

    if len(linhas) > MAX_LINHAS:
        return JSONResponse({
            "aviso": f"Arquivo tem {len(linhas)} linhas. Apenas as primeiras {MAX_LINHAS} serão importadas.",
            "headers": headers,
            **validar_lancamentos(headers, linhas[:MAX_LINHAS]),
        })

    return {
        "headers": headers,
        **validar_lancamentos(headers, linhas),
    }


@router.post("/lancamentos")
async def importar_lancamentos(
    request: Request,
    arquivo: UploadFile = File(...),
    produtor_id: int = Form(...),
    imovel_id: int = Form(...),
    mapa_data: str = Form(""),
    mapa_valor: str = Form(""),
    mapa_descricao: str = Form(""),
    mapa_tipo: str = Form(""),
    safra_id: Optional[str] = Form(None),
):
    """Importa lançamentos financeiros em lote."""
    conteudo = await arquivo.read()
    nome = arquivo.filename or "arquivo"

    try:
        if nome.lower().endswith(".ofx") or nome.lower().endswith(".ofc"):
            headers, linhas = ler_ofx(conteudo)
        else:
            headers, linhas = ler_excel_csv(conteudo, nome.lower())
    except Exception as e:
        raise HTTPException(400, f"Erro ao ler arquivo: {str(e)}")

    mapa_manual = {}
    if mapa_data:
        mapa_manual["data"] = mapa_data
    if mapa_valor:
        mapa_manual["valor"] = mapa_valor
    if mapa_descricao:
        mapa_manual["descricao"] = mapa_descricao
    if mapa_tipo:
        mapa_manual["tipo"] = mapa_tipo

    resultado = validar_lancamentos(headers, linhas[:MAX_LINHAS], mapa_manual)
    validos = resultado["validos"]
    erros = resultado["erros"]

    # Rollback se muitos erros
    total = len(linhas[:MAX_LINHAS])
    if total > 0 and len(erros) / total > ROLLBACK_THRESHOLD:
        raise HTTPException(422, {
            "msg": f"Muitos erros ({len(erros)} de {total} linhas). Verifique o mapeamento de colunas.",
            "erros": erros[:20],
        })

    # Busca subconta padrão para importação
    from app.db import get_db
    importados = 0
    falhas = []

    with get_db() as conn:
        with conn.cursor() as cur:
            # Busca subconta padrão por tipo
            cur.execute(
                "SELECT id, codigo FROM subcontas WHERE codigo IN ('3.1.1','1.1.1') ORDER BY codigo",
            )
            subcontas = {r["codigo"]: r["id"] for r in cur.fetchall()}
            subconta_despesa = subcontas.get("3.1.1")
            subconta_receita = subcontas.get("1.1.1")

            for item in validos:
                try:
                    subconta_id = subconta_receita if item["tipo"] == "receita" else subconta_despesa
                    cur.execute("""
                        INSERT INTO lancamentos
                            (produtor_id, subconta_id, valor, data, origem, safra_id)
                        VALUES (%s, %s, %s, %s, 'importacao', %s)
                        ON CONFLICT DO NOTHING
                    """, (
                        produtor_id,
                        subconta_id,
                        item["valor"],
                        item["data"],
                        safra_id,
                    ))
                    importados += 1
                except Exception as e:
                    falhas.append({"linha": item["linha"], "erro": str(e)})

        conn.commit()

    return {
        "importados": importados,
        "avisos": len(resultado["avisos"]),
        "ignorados": len(falhas) + len(erros),
        "erros_validacao": erros[:20],
        "erros_insercao": falhas[:10],
        "detalhes_avisos": resultado["avisos"][:20],
    }


@router.post("/rebanho")
async def importar_rebanho(
    request: Request,
    arquivo: UploadFile = File(...),
    produtor_id: int = Form(...),
    imovel_id: int = Form(...),
    especie: str = Form("bovino"),
    mapa_brinco: str = Form(""),
    mapa_raca: str = Form(""),
    mapa_peso: str = Form(""),
    mapa_nascimento: str = Form(""),
    mapa_categoria: str = Form(""),
):
    """Importa animais do rebanho em lote."""
    conteudo = await arquivo.read()
    nome = arquivo.filename or "arquivo"

    try:
        headers, linhas = ler_excel_csv(conteudo, nome.lower())
    except Exception as e:
        raise HTTPException(400, f"Erro ao ler arquivo: {str(e)}")

    # Mapeia colunas
    mapa = mapear_colunas(headers)
    if mapa_brinco:
        mapa["brinco"] = mapa_brinco
    if mapa_raca:
        mapa["raca"] = mapa_raca
    if mapa_peso:
        mapa["peso"] = mapa_peso
    if mapa_nascimento:
        mapa["nascimento"] = mapa_nascimento
    if mapa_categoria:
        mapa["categoria"] = mapa_categoria

    # Auto-detecta brinco
    for h in headers:
        hl = h.lower()
        if any(k in hl for k in ["brinco", "número", "numero", "tag", "id animal", "identificacao"]):
            mapa.setdefault("brinco", h)

    TABELA = {
        "bovino": "bovino_animais",
        "ovino": "ovino_animais",
        "caprino": "caprino_animais",
        "suino": "suino_animais",
    }.get(especie, "bovino_animais")

    from app.db import get_db
    importados = 0
    duplicatas = 0
    erros = []

    with get_db() as conn:
        with conn.cursor() as cur:
            for i, linha in enumerate(linhas[:MAX_LINHAS], start=2):
                row = dict(zip(headers, linha))

                brinco = str(row.get(mapa.get("brinco", ""), "") or "").strip()
                if not brinco:
                    erros.append({"linha": i, "msg": "Brinco/identificação ausente"})
                    continue

                raca = str(row.get(mapa.get("raca", ""), "") or "").strip() or "Não informado"
                peso_raw = row.get(mapa.get("peso", ""), "")
                peso = parse_valor(str(peso_raw)) if peso_raw else None
                nasc_raw = row.get(mapa.get("nascimento", ""), "")
                nascimento = parse_data(str(nasc_raw)) if nasc_raw else None
                categoria = str(row.get(mapa.get("categoria", ""), "") or "").strip() or "adulto"

                # Valida nascimento futuro
                if nascimento and nascimento > date.today().isoformat():
                    erros.append({"linha": i, "msg": f"Data de nascimento futura: {nascimento}"})
                    continue

                try:
                    cur.execute(f"""
                        INSERT INTO {TABELA}
                            (numero_brinco, raca, peso_atual, data_nascimento,
                             categoria, imovel_id, status)
                        VALUES (%s, %s, %s, %s, %s, %s, 'ativo')
                        ON CONFLICT (numero_brinco, imovel_id) DO NOTHING
                    """, (brinco, raca, peso, nascimento, categoria, imovel_id))

                    if cur.rowcount == 0:
                        duplicatas += 1
                    else:
                        importados += 1
                except Exception as e:
                    erros.append({"linha": i, "msg": str(e)})

        conn.commit()

    return {
        "importados": importados,
        "duplicatas": duplicatas,
        "ignorados": len(erros),
        "erros": erros[:20],
    }

# ── Importação de fornecedores ───────────────────────────────────────

MAPA_FORN_NOME  = ["nome","name","fornecedor","razao_social","empresa","supplier"]
MAPA_FORN_CNPJ  = ["cnpj","cpf","cnpj_cpf","documento","doc","cgc"]
MAPA_FORN_WPP   = ["whatsapp","wpp","celular","telefone","fone","phone","contato"]
MAPA_FORN_TEL   = ["telegram","tg","telegram_id"]
MAPA_FORN_EMAIL = ["email","e-mail","mail","correio"]
MAPA_FORN_END   = ["endereco","endereço","address","logradouro","cidade","municipio"]
MAPA_FORN_PRAZO = ["prazo","prazo_entrega","lead_time","dias","delivery"]
MAPA_FORN_PGTO  = ["pagamento","forma_pagamento","payment","condicao"]
MAPA_FORN_OBS   = ["observacao","observações","obs","notas","notes","comentario"]

PGTO_ALIASES = {
    "vista":"a_vista","avista":"a_vista","30":"30_dias","60":"60_dias","90":"90_dias",
    "consig":"consignacao","prazo":"30_dias",
}

def detectar_pagamento(val: str) -> str:
    v = val.lower().strip().replace(" ","").replace("/","")
    for k, pgto in PGTO_ALIASES.items():
        if k in v:
            return pgto
    return "a_vista"

def mapear_colunas_forn(headers: list) -> dict:
    mapa = {}
    for h in headers:
        if fuzzy_match(h, MAPA_FORN_NOME)  and "nome"  not in mapa: mapa["nome"]  = h
        elif fuzzy_match(h, MAPA_FORN_CNPJ) and "cnpj" not in mapa: mapa["cnpj"]  = h
        elif fuzzy_match(h, MAPA_FORN_WPP)  and "wpp"  not in mapa: mapa["wpp"]   = h
        elif fuzzy_match(h, MAPA_FORN_TEL)  and "tg"   not in mapa: mapa["tg"]    = h
        elif fuzzy_match(h, MAPA_FORN_EMAIL)and "email" not in mapa: mapa["email"] = h
        elif fuzzy_match(h, MAPA_FORN_END)  and "end"  not in mapa: mapa["end"]   = h
        elif fuzzy_match(h, MAPA_FORN_PRAZO)and "prazo" not in mapa:mapa["prazo"] = h
        elif fuzzy_match(h, MAPA_FORN_PGTO) and "pgto" not in mapa: mapa["pgto"]  = h
        elif fuzzy_match(h, MAPA_FORN_OBS)  and "obs"  not in mapa: mapa["obs"]   = h
    return mapa

@router.post("/importacao/fornecedores")
async def importar_fornecedores(
    arquivo: UploadFile = File(...),
    request: Request = None,
):
    conteudo = await arquivo.read()
    nome_arq = arquivo.filename or ""
    try:
        if nome_arq.endswith(".csv"):
            import io, csv
            linhas = list(csv.DictReader(io.StringIO(conteudo.decode("utf-8", errors="replace"))))
            headers = list(linhas[0].keys()) if linhas else []
        else:
            import openpyxl, io
            wb = openpyxl.load_workbook(io.BytesIO(conteudo), data_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(values_only=True))
            headers = [str(h or "").strip() for h in rows[0]]
            linhas = [dict(zip(headers, [str(v or "").strip() for v in r])) for r in rows[1:] if any(v for v in r)]
    except Exception as e:
        raise HTTPException(400, f"Erro ao ler arquivo: {e}")

    mapa = mapear_colunas_forn(headers)
    if "nome" not in mapa:
        raise HTTPException(400, f"Coluna 'nome' nao encontrada. Colunas: {headers}")

    from app.db import get_db
    importados = 0
    erros = []
    with get_db() as conn:
        with conn.cursor() as cur:
            for i, row in enumerate(linhas, start=2):
                nome_forn = row.get(mapa.get("nome",""), "").strip()
                if not nome_forn:
                    continue
                try:
                    cnpj  = row.get(mapa.get("cnpj",""),  "") or None
                    wpp   = row.get(mapa.get("wpp",""),   "") or None
                    tg    = row.get(mapa.get("tg",""),    "") or None
                    email = row.get(mapa.get("email",""), "") or None
                    end   = row.get(mapa.get("end",""),   "") or None
                    obs   = row.get(mapa.get("obs",""),   "") or None
                    pgto_raw  = row.get(mapa.get("pgto",""),  "a_vista")
                    prazo_raw = row.get(mapa.get("prazo",""), "7")

                    pgto = detectar_pagamento(pgto_raw) if pgto_raw else "a_vista"
                    try: prazo = int(float(prazo_raw)) if prazo_raw else 7
                    except: prazo = 7

                    # Limpa WhatsApp — só números
                    if wpp:
                        wpp = re.sub(r"\D", "", wpp)
                        if not wpp.startswith("55") and len(wpp) <= 11:
                            wpp = "55" + wpp

                    # Verifica se já existe
                    cur.execute(
                        "SELECT id FROM fornecedores WHERE fazenda_id=1 AND lower(nome)=lower(%s) LIMIT 1",
                        (nome_forn,)
                    )
                    existente = cur.fetchone()
                    if existente:
                        eid = existente["id"] if isinstance(existente, dict) else existente[0]
                        cur.execute(
                            "UPDATE fornecedores SET cnpj_cpf=%s,whatsapp=%s,telegram=%s,"
                            "email=%s,endereco=%s,forma_pagamento=%s,prazo_entrega_dias=%s,"
                            "observacoes=%s,atualizado_em=NOW() WHERE id=%s",
                            (cnpj,wpp,tg,email,end,pgto,prazo,obs,eid)
                        )
                    else:
                        cur.execute(
                            "INSERT INTO fornecedores (fazenda_id,nome,cnpj_cpf,whatsapp,telegram,"
                            "email,endereco,forma_pagamento,prazo_entrega_dias,observacoes)"
                            " VALUES (1,%s,%s,%s,%s,%s,%s,%s,%s,%s)",
                            (nome_forn,cnpj,wpp,tg,email,end,pgto,prazo,obs)
                        )
                    importados += 1
                except Exception as e:
                    erros.append({"linha": i, "msg": str(e)})

            conn.commit()

    return {
        "importados": importados,
        "erros": erros,
        "total_linhas": len(linhas),
    }
