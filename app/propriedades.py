# app/propriedades.py
# Módulo de Cadastro de Propriedades Rurais
# Hierarquia: CAR > CAEPF > CNPJ > CPF+Geo
#
# Plugar no app/main.py:
#   from app.propriedades import router as propriedades_router
#   app.include_router(propriedades_router)

import re
import uuid as _uuid
from typing import Optional
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import text
from app.db import engine

router = APIRouter(prefix="/propriedades", tags=["propriedades"])

# ── Helpers ───────────────────────────────────────────────────────────────────

def _limpar(v: str) -> str:
    return re.sub(r"\D", "", v or "")

def _validar_car(car: str) -> bool:
    return bool(re.match(
        r"^[A-Z]{2}-\d{7}\.\d{3}\.[A-Z0-9]{5}-\d{4}$",
        (car or "").strip().upper()
    ))

def _validar_cpf(cpf: str) -> bool:
    s = _limpar(cpf)
    if len(s) != 11 or len(set(s)) == 1:
        return False
    def calc(fator):
        return sum(int(s[i]) * (fator - i) for i in range(fator - 1)) * 10 % 11 % 10
    return calc(10) == int(s[9]) and calc(11) == int(s[10])

def _validar_cnpj(cnpj: str) -> bool:
    s = _limpar(cnpj)
    if len(s) != 14 or len(set(s)) == 1:
        return False
    def calc(pesos):
        return (11 - sum(int(s[i]) * pesos[i] for i in range(len(pesos))) % 11) % 11
    d1 = calc([5,4,3,2,9,8,7,6,5,4,3,2])
    d2 = calc([6,5,4,3,2,9,8,7,6,5,4,3,2])
    return d1 == int(s[12]) and d2 == int(s[13])

def _validar_caepf(caepf: str) -> bool:
    return len(_limpar(caepf)) == 14

# ── Pydantic Models ───────────────────────────────────────────────────────────

class PropriedadeCreate(BaseModel):
    car:           Optional[str]   = None
    caepf:         Optional[str]   = None
    cnpj:          Optional[str]   = None
    cpf_titular:   Optional[str]   = None
    nome:          str
    municipio_id:  int
    localidade:    Optional[str]   = None
    area_total:    Optional[float] = None
    area_produtiva: Optional[float] = None
    latitude:      Optional[float] = None
    longitude:     Optional[float] = None
    fazenda_id:    Optional[int]   = None

class PropriedadePatch(BaseModel):
    nome:           Optional[str]   = None
    localidade:     Optional[str]   = None
    area_total:     Optional[float] = None
    area_produtiva: Optional[float] = None
    latitude:       Optional[float] = None
    longitude:      Optional[float] = None
    status:         Optional[str]   = None

class VinculoRequest(BaseModel):
    solicitante_cpf: str
    motivo: Optional[str] = None

# ── Municípios ────────────────────────────────────────────────────────────────

@router.get("/municipios")
def listar_municipios(q: Optional[str] = None, uf: Optional[str] = None):
    params = {}
    sql = "SELECT id, nome, uf, codigo_ibge FROM municipios WHERE 1=1"
    if q:
        params["q"] = f"%{q}%"
        sql += " AND lower(nome) LIKE lower(:q)"
    if uf:
        params["uf"] = uf.upper()
        sql += " AND uf = :uf"
    sql += " ORDER BY uf, nome LIMIT 30"
    with engine.connect() as conn:
        rows = conn.execute(text(sql), params).fetchall()
    return [dict(r._mapping) for r in rows]

# ── Buscas por identificador ──────────────────────────────────────────────────

@router.get("/buscar-car")
def buscar_car(car: str = Query(...)):
    car_norm = car.strip().upper()
    if not _validar_car(car_norm):
        raise HTTPException(422, "Formato de CAR inválido. Ex: MA-1234567.890.ABCDE-0001")
    with engine.connect() as conn:
        row = conn.execute(text(
            """SELECT p.*, m.nome as municipio_nome, m.uf
               FROM propriedades p JOIN municipios m ON m.id = p.municipio_id
               WHERE p.car = :car"""
        ), {"car": car_norm}).fetchone()
    if not row:
        return {"encontrado": False, "car": car_norm}
    return {"encontrado": True, "propriedade": dict(row._mapping)}

@router.get("/buscar-caepf")
def buscar_caepf(caepf: str = Query(...)):
    norm = _limpar(caepf)
    if not _validar_caepf(norm):
        raise HTTPException(422, "CAEPF deve ter 14 dígitos")
    with engine.connect() as conn:
        row = conn.execute(text(
            """SELECT p.*, m.nome as municipio_nome, m.uf
               FROM propriedades p JOIN municipios m ON m.id = p.municipio_id
               WHERE p.caepf = :caepf"""
        ), {"caepf": norm}).fetchone()
    if not row:
        return {"encontrado": False}
    return {"encontrado": True, "propriedade": dict(row._mapping)}

@router.get("/buscar-cnpj")
def buscar_cnpj(cnpj: str = Query(...)):
    norm = _limpar(cnpj)
    if not _validar_cnpj(norm):
        raise HTTPException(422, "CNPJ inválido")
    with engine.connect() as conn:
        row = conn.execute(text(
            """SELECT p.*, m.nome as municipio_nome, m.uf
               FROM propriedades p JOIN municipios m ON m.id = p.municipio_id
               WHERE p.cnpj = :cnpj"""
        ), {"cnpj": norm}).fetchone()
    if not row:
        return {"encontrado": False}
    return {"encontrado": True, "propriedade": dict(row._mapping)}

# ── Listagem ──────────────────────────────────────────────────────────────────

@router.get("")
def listar_propriedades(
    fazenda_id: Optional[int] = None,
    cpf:        Optional[str] = None,
    cnpj:       Optional[str] = None,
    status:     Optional[str] = None,
    page:       int = Query(1, ge=1),
    limit:      int = Query(20, ge=1, le=100),
):
    offset = (page - 1) * limit
    params: dict = {}
    where = "WHERE 1=1"

    if fazenda_id is not None:
        params["fazenda_id"] = fazenda_id
        where += " AND p.fazenda_id = :fazenda_id"
    if cpf:
        params["cpf"] = _limpar(cpf)
        where += " AND p.cpf_titular = :cpf"
    if cnpj:
        params["cnpj"] = _limpar(cnpj)
        where += " AND p.cnpj = :cnpj"
    if status:
        params["status"] = status
        where += " AND p.status = :status"

    with engine.connect() as conn:
        total = conn.execute(
            text(f"SELECT COUNT(*) FROM propriedades p {where}"), params
        ).scalar()
        rows = conn.execute(text(f"""
            SELECT p.*, m.nome as municipio_nome, m.uf
            FROM propriedades p
            JOIN municipios m ON m.id = p.municipio_id
            {where}
            ORDER BY p.created_at DESC
            LIMIT :limit OFFSET :offset
        """), {**params, "limit": limit, "offset": offset}).fetchall()

    return {"total": total, "pagina": page, "itens": [dict(r._mapping) for r in rows]}

# ── Detalhe ───────────────────────────────────────────────────────────────────

@router.get("/{prop_id}")
def detalhe_propriedade(prop_id: str):
    with engine.connect() as conn:
        row = conn.execute(text("""
            SELECT p.*, m.nome as municipio_nome, m.uf, m.codigo_ibge
            FROM propriedades p
            JOIN municipios m ON m.id = p.municipio_id
            WHERE p.id = :id
        """), {"id": prop_id}).fetchone()
    if not row:
        raise HTTPException(404, "Propriedade não encontrada")
    return dict(row._mapping)

# ── Cadastro ──────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
def criar_propriedade(body: PropriedadeCreate):
    erros = []
    if not body.nome.strip():
        erros.append("Nome da propriedade é obrigatório")

    tem_car   = bool(body.car   and body.car.strip())
    tem_caepf = bool(body.caepf and body.caepf.strip())
    tem_cnpj  = bool(body.cnpj  and body.cnpj.strip())
    tem_cpf   = bool(body.cpf_titular and body.cpf_titular.strip())

    if not any([tem_car, tem_caepf, tem_cnpj, tem_cpf]):
        erros.append("Informe pelo menos um identificador: CAR, CAEPF, CNPJ ou CPF")

    if tem_car and not _validar_car(body.car.strip().upper()):
        erros.append("Formato de CAR inválido. Ex: MA-1234567.890.ABCDE-0001")
    if tem_caepf and not _validar_caepf(body.caepf):
        erros.append("CAEPF deve ter 14 dígitos")
    if tem_cnpj and not _validar_cnpj(body.cnpj):
        erros.append("CNPJ inválido")
    if tem_cpf and not _validar_cpf(body.cpf_titular):
        erros.append("CPF inválido")

    if not tem_car and not tem_caepf and not tem_cnpj:
        if body.latitude is None or body.longitude is None:
            erros.append("Geolocalização obrigatória para produtores sem CAR/CAEPF/CNPJ")

    if erros:
        raise HTTPException(422, {"erros": erros})

    with engine.connect() as conn:
        # Município existe?
        mun = conn.execute(
            text("SELECT id FROM municipios WHERE id = :id"), {"id": body.municipio_id}
        ).fetchone()
        if not mun:
            raise HTTPException(422, {"erros": ["Município não encontrado"]})

        # Conflito CAR
        if tem_car:
            car_norm = body.car.strip().upper()
            dup = conn.execute(
                text("SELECT id FROM propriedades WHERE car = :car"), {"car": car_norm}
            ).fetchone()
            if dup:
                raise HTTPException(409, {"codigo": "CAR_DUPLICADO",
                    "erro": "CAR já cadastrado.", "propriedade_id": str(dup[0])})

        # Conflito CAEPF
        if tem_caepf:
            cn = _limpar(body.caepf)
            row = conn.execute(
                text("SELECT id, cpf_titular FROM propriedades WHERE caepf = :caepf"), {"caepf": cn}
            ).fetchone()
            if row:
                cpf_existente = row._mapping.get("cpf_titular")
                msg = ("CAEPF já vinculado a outro CPF — inconsistência. Contate o suporte."
                       if cpf_existente and cpf_existente != _limpar(body.cpf_titular or "")
                       else "CAEPF já cadastrado.")
                raise HTTPException(409, {"codigo": "CAEPF_DUPLICADO", "erro": msg,
                                          "propriedade_id": str(row[0])})

        # Conflito CNPJ
        if tem_cnpj:
            cn = _limpar(body.cnpj)
            dup = conn.execute(
                text("SELECT id FROM propriedades WHERE cnpj = :cnpj"), {"cnpj": cn}
            ).fetchone()
            if dup:
                raise HTTPException(409, {"codigo": "CNPJ_DUPLICADO",
                    "erro": "CNPJ já cadastrado.", "propriedade_id": str(dup[0])})

        # Conflito CPF+Geo
        if not tem_car and not tem_caepf and not tem_cnpj and tem_cpf:
            row = conn.execute(text("""
                SELECT id, status FROM propriedades
                WHERE car IS NULL AND caepf IS NULL AND cnpj IS NULL
                  AND cpf_titular = :cpf
                  AND municipio_id = :mun
                  AND lower(COALESCE(localidade,'')) = lower(COALESCE(:loc,''))
                  AND lower(nome) = lower(:nome)
            """), {
                "cpf":  _limpar(body.cpf_titular),
                "mun":  body.municipio_id,
                "loc":  body.localidade or "",
                "nome": body.nome,
            }).fetchone()
            if row:
                raise HTTPException(409, {
                    "codigo": "CPF_GEO_DUPLICADO",
                    "erro": "Esta propriedade já existe. Deseja solicitar vínculo?",
                    "propriedade_id": str(row[0]),
                    "status_existente": row[1],
                })

        # Inserir
        prop_id = str(_uuid.uuid4())
        conn.execute(text("""
            INSERT INTO propriedades
              (id, car, caepf, cnpj, cpf_titular, nome, municipio_id, localidade,
               area_total, area_produtiva, latitude, longitude, fazenda_id, status)
            VALUES
              (:id, :car, :caepf, :cnpj, :cpf, :nome, :mun, :loc,
               :area_total, :area_prod, :lat, :lng, :faz, 'ativo')
        """), {
            "id":        prop_id,
            "car":       body.car.strip().upper() if tem_car  else None,
            "caepf":     _limpar(body.caepf)      if tem_caepf else None,
            "cnpj":      _limpar(body.cnpj)        if tem_cnpj  else None,
            "cpf":       _limpar(body.cpf_titular) if tem_cpf   else None,
            "nome":      body.nome.strip(),
            "mun":       body.municipio_id,
            "loc":       body.localidade.strip() if body.localidade else None,
            "area_total": body.area_total,
            "area_prod": body.area_produtiva,
            "lat":       body.latitude,
            "lng":       body.longitude,
            "faz":       body.fazenda_id,
        })
        conn.commit()

        row = conn.execute(text("""
            SELECT p.*, m.nome as municipio_nome, m.uf
            FROM propriedades p
            JOIN municipios m ON m.id = p.municipio_id
            WHERE p.id = :id
        """), {"id": prop_id}).fetchone()

    return dict(row._mapping)

# ── Solicitar vínculo ─────────────────────────────────────────────────────────

@router.post("/{prop_id}/solicitar-vinculo")
def solicitar_vinculo(prop_id: str, body: VinculoRequest):
    if not body.solicitante_cpf:
        raise HTTPException(400, "CPF do solicitante é obrigatório")
    with engine.connect() as conn:
        row = conn.execute(text("""
            UPDATE propriedades
            SET status = 'vinculo_pendente', updated_at = NOW()
            WHERE id = :id
            RETURNING id, nome, status
        """), {"id": prop_id}).fetchone()
        conn.commit()
    if not row:
        raise HTTPException(404, "Propriedade não encontrada")
    return {"sucesso": True, "propriedade": dict(row._mapping)}

# ── Atualizar ─────────────────────────────────────────────────────────────────

@router.patch("/{prop_id}")
def atualizar_propriedade(prop_id: str, body: PropriedadePatch):
    campos = body.model_dump(exclude_none=True)
    if not campos:
        raise HTTPException(400, "Nenhum campo para atualizar")
    sets   = ", ".join(f"{k} = :{k}" for k in campos)
    params = {**campos, "id": prop_id}
    with engine.connect() as conn:
        row = conn.execute(text(f"""
            UPDATE propriedades
            SET {sets}, updated_at = NOW()
            WHERE id = :id
            RETURNING *
        """), params).fetchone()
        conn.commit()
    if not row:
        raise HTTPException(404, "Propriedade não encontrada")
    return dict(row._mapping)
