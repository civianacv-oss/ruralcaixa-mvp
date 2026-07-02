"""
RuralCaixa — app/routers/importacao.py
Router de importacao em lote — restaura o endpoint POST /importacao/lancamentos
que a procedure tRPC `importarLancamentos` (server/routers/railway.ts) ja
chama, mas que estava ausente desde a reestruturacao de 243 arquivos.

Contrato esperado pelo frontend (multipart/form-data):
    arquivo         : arquivo .csv ou .xlsx
    produtor_id     : int
    imovel_id       : int (recebido, mas atualmente nao usado no INSERT —
                      LancamentoCreate/criar_lancamento nao tem esse campo)
    mapa_data       : nome da coluna que contem a data (opcional, default "data")
    mapa_valor      : nome da coluna que contem o valor (opcional, default "valor")
    mapa_descricao  : nome da coluna que contem a descricao (opcional, default "descricao")
    mapa_tipo       : nome da coluna que contem o tipo receita/despesa (opcional, default "tipo")

Resposta:
    { criados: int, erros: int, total: int, mensagem?: str }

Reaproveita a MESMA logica de classificacao automatica (regras_classificacao +
classificar()) que o endpoint manual POST /lancamentos ja usa, chamando
diretamente a funcao criar_lancamento() de app.main — import feito dentro da
funcao para evitar import circular (main.py importa este router).
"""
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from typing import Optional
from datetime import datetime, date
import io
import csv
import re

router = APIRouter(prefix="/importacao", tags=["Importacao Generica"])


def normalizar_cabecalho(nome: str) -> str:
    nome = nome.strip().lower()
    nome = re.sub(r"[áàâã]", "a", nome)
    nome = re.sub(r"[éê]", "e", nome)
    nome = re.sub(r"[íî]", "i", nome)
    nome = re.sub(r"[óôõ]", "o", nome)
    nome = re.sub(r"[úû]", "u", nome)
    nome = re.sub(r"[^a-z0-9_]", "_", nome)
    return nome


def parse_data(valor) -> Optional[str]:
    if valor is None:
        return None
    # openpyxl retorna date/datetime nativos para celulas de data
    if isinstance(valor, datetime):
        return valor.date().isoformat()
    if isinstance(valor, date):
        return valor.isoformat()
    valor = str(valor).strip()
    if not valor:
        return None
    # remove hora se vier junto (ex: "01/07/2026 00:00:00")
    valor = valor.split(" ")[0]
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(valor, fmt).date().isoformat()
        except ValueError:
            continue
    return None


def parse_valor(valor) -> Optional[float]:
    if valor is None:
        return None
    if isinstance(valor, (int, float)):
        return float(valor)
    valor = str(valor).strip()
    if not valor:
        return None
    valor = valor.replace("R$", "").replace(" ", "")
    if "," in valor and "." in valor:
        valor = valor.replace(".", "").replace(",", ".")
    elif "," in valor:
        valor = valor.replace(",", ".")
    try:
        return float(valor)
    except ValueError:
        return None


def ler_linhas_csv(conteudo: bytes) -> list[dict]:
    texto = conteudo.decode("utf-8-sig", errors="replace")
    primeira_linha = texto.splitlines()[0] if texto.splitlines() else ""
    leitor = csv.reader(io.StringIO(texto), delimiter=";" if ";" in primeira_linha else ",")
    linhas = list(leitor)
    if not linhas:
        return []
    cabecalho = [normalizar_cabecalho(c) for c in linhas[0]]
    resultado = []
    for linha in linhas[1:]:
        if not any(c.strip() for c in linha):
            continue
        resultado.append(dict(zip(cabecalho, linha)))
    return resultado


def ler_linhas_xlsx(conteudo: bytes) -> list[dict]:
    try:
        from openpyxl import load_workbook
    except ImportError:
        raise HTTPException(
            status_code=500,
            detail="openpyxl nao instalado no servidor. Adicione 'openpyxl' ao requirements.txt.",
        )
    wb = load_workbook(io.BytesIO(conteudo), data_only=True)
    ws = wb.active
    linhas_raw = list(ws.iter_rows(values_only=True))
    if not linhas_raw:
        return []
    cabecalho = [normalizar_cabecalho(str(c or "")) for c in linhas_raw[0]]
    resultado = []
    for linha in linhas_raw[1:]:
        if not any(c is not None and str(c).strip() for c in linha):
            continue
        valores = [("" if c is None else c) for c in linha]
        resultado.append(dict(zip(cabecalho, valores)))
    return resultado


@router.post("/lancamentos")
async def importar_lancamentos(
    arquivo: UploadFile = File(...),
    produtor_id: int = Form(...),
    imovel_id: Optional[int] = Form(None),
    mapa_data: str = Form("data"),
    mapa_valor: str = Form("valor"),
    mapa_descricao: str = Form("descricao"),
    mapa_tipo: str = Form("tipo"),
):
    # Import tardio para evitar dependencia circular com app.main
    from app.main import criar_lancamento, LancamentoCreate

    conteudo = await arquivo.read()
    nome = (arquivo.filename or "").lower()

    if nome.endswith(".xlsx") or nome.endswith(".xls"):
        linhas = ler_linhas_xlsx(conteudo)
    elif nome.endswith(".csv"):
        linhas = ler_linhas_csv(conteudo)
    else:
        raise HTTPException(status_code=400, detail="Formato não suportado. Envie .csv ou .xlsx")

    col_data = normalizar_cabecalho(mapa_data)
    col_valor = normalizar_cabecalho(mapa_valor)
    col_descricao = normalizar_cabecalho(mapa_descricao)
    col_tipo = normalizar_cabecalho(mapa_tipo)

    criados = 0
    erros_lista = []

    for i, linha in enumerate(linhas, start=2):
        try:
            data_lanc = parse_data(linha.get(col_data))
            valor = parse_valor(linha.get(col_valor))
            descricao = str(linha.get(col_descricao, "")).strip()
            tipo = str(linha.get(col_tipo, "despesa")).strip().lower() or "despesa"

            if not data_lanc:
                valor_bruto = linha.get(col_data)
                erros_lista.append(f"Linha {i}: data inválida ou ausente (valor recebido: {valor_bruto!r}, coluna buscada: '{col_data}')")
                continue
            if valor is None or valor == 0:
                erros_lista.append(f"Linha {i}: valor inválido ou ausente")
                continue
            if not descricao:
                erros_lista.append(f"Linha {i}: descrição ausente")
                continue
            if tipo not in ("receita", "despesa"):
                tipo = "despesa"

            payload = LancamentoCreate(
                produtor_id=produtor_id,
                valor=valor,
                data=data_lanc,
                data_lancamento=data_lanc,
                descricao=descricao,
                tipo=tipo,
                origem="importacao",
            )
            criar_lancamento(payload)
            criados += 1
        except Exception as e:
            erros_lista.append(f"Linha {i}: {str(e)}")

    return {
        "criados": criados,
        "erros": len(erros_lista),
        "total": len(linhas),
        "mensagem": "; ".join(erros_lista[:10]) if erros_lista else None,
    }
