"""
Schemas Pydantic — Módulo Piscicultura
RuralCaixa MVP
"""

from pydantic import BaseModel, Field, validator
from typing import Optional, List
from datetime import date
from decimal import Decimal
from enum import Enum


# ─────────────────────────────────────────
# ENUMS
# ─────────────────────────────────────────

class SistemaEnum(str, Enum):
    extensivo = "extensivo"
    semi_intensivo = "semi_intensivo"
    intensivo = "intensivo"
    superintensivo = "superintensivo"


class StatusCicloEnum(str, Enum):
    ativo = "ativo"
    encerrado = "encerrado"
    cancelado = "cancelado"


class TipoInsumoEnum(str, Enum):
    racao = "racao"
    alevinos = "alevinos"
    calcario = "calcario"
    cal = "cal"
    medicamento = "medicamento"
    aerador = "aerador"
    outro = "outro"


class TipoDespescaEnum(str, Enum):
    total = "total"
    parcial = "parcial"


# ─────────────────────────────────────────
# CICLOS
# ─────────────────────────────────────────

class CicloCreate(BaseModel):
    imovel_id: int
    produtor_id: Optional[int] = None
    nome_ciclo: str = Field(..., min_length=3, max_length=100)
    especie: str = Field(..., min_length=2, max_length=80)
    sistema: SistemaEnum
    area_ha: Decimal = Field(..., gt=0, decimal_places=4)
    data_povoamento: date
    data_despesca_prevista: Optional[date] = None
    qtd_alevinos: int = Field(..., gt=0)
    peso_medio_inicial_g: Decimal = Field(..., gt=0)
    preco_alevino_unit: Optional[Decimal] = Field(None, ge=0)
    meta_peso_final_g: Optional[Decimal] = Field(None, gt=0)
    meta_preco_venda_kg: Optional[Decimal] = Field(None, ge=0)
    observacoes: Optional[str] = None

    @validator("data_despesca_prevista")
    def despesca_apos_povoamento(cls, v, values):
        if v and "data_povoamento" in values and v <= values["data_povoamento"]:
            raise ValueError("Data de despesca prevista deve ser após o povoamento")
        return v


class CicloUpdate(BaseModel):
    nome_ciclo: Optional[str] = Field(None, min_length=3, max_length=100)
    data_despesca_prevista: Optional[date] = None
    meta_peso_final_g: Optional[Decimal] = None
    meta_preco_venda_kg: Optional[Decimal] = None
    status: Optional[StatusCicloEnum] = None
    observacoes: Optional[str] = None


class CicloResponse(BaseModel):
    id: int
    imovel_id: int
    produtor_id: Optional[int]
    nome_ciclo: str
    especie: str
    sistema: str
    area_ha: Decimal
    data_povoamento: date
    data_despesca_prevista: Optional[date]
    data_despesca_real: Optional[date]
    qtd_alevinos: int
    peso_medio_inicial_g: Decimal
    preco_alevino_unit: Optional[Decimal]
    meta_peso_final_g: Optional[Decimal]
    meta_preco_venda_kg: Optional[Decimal]
    status: str
    observacoes: Optional[str]
    # Calculados pelo endpoint
    estoque_vivo: Optional[int] = None
    biomassa_atual_kg: Optional[Decimal] = None
    total_racao_kg: Optional[Decimal] = None
    total_custo_insumos: Optional[Decimal] = None
    ica_atual: Optional[Decimal] = None
    mortalidade_acumulada: Optional[int] = None
    mortalidade_perc: Optional[Decimal] = None

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# BIOMETRIAS
# ─────────────────────────────────────────

class BiometriaCreate(BaseModel):
    ciclo_id: int
    data_biometria: date
    qtd_amostrada: int = Field(..., gt=0)
    peso_total_amostra_g: Decimal = Field(..., gt=0)
    tecnico_responsavel: Optional[str] = None
    observacoes: Optional[str] = None


class BiometriaResponse(BaseModel):
    id: int
    ciclo_id: int
    data_biometria: date
    qtd_amostrada: int
    peso_total_amostra_g: Decimal
    peso_medio_g: Optional[Decimal]
    biomassa_estimada_kg: Optional[Decimal]
    ica_acumulado: Optional[Decimal]
    tecnico_responsavel: Optional[str]
    observacoes: Optional[str]

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# REGISTROS DIÁRIOS
# ─────────────────────────────────────────

class RegistroDiarioCreate(BaseModel):
    ciclo_id: int
    data_registro: date
    racao_kg: Optional[Decimal] = Field(None, ge=0)
    tipo_racao: Optional[str] = Field(None, max_length=80)
    custo_racao_dia: Optional[Decimal] = Field(None, ge=0)
    mortalidade_qtd: int = Field(0, ge=0)
    mortalidade_causa: Optional[str] = None
    oxigenio_dissolvido: Optional[Decimal] = Field(None, ge=0, le=20)
    ph: Optional[Decimal] = Field(None, ge=0, le=14)
    temperatura_c: Optional[Decimal] = Field(None, ge=0, le=45)
    transparencia_secchi_cm: Optional[int] = Field(None, ge=0, le=500)


class RegistroDiarioResponse(BaseModel):
    id: int
    ciclo_id: int
    data_registro: date
    racao_kg: Optional[Decimal]
    tipo_racao: Optional[str]
    custo_racao_dia: Optional[Decimal]
    mortalidade_qtd: int
    mortalidade_causa: Optional[str]
    oxigenio_dissolvido: Optional[Decimal]
    ph: Optional[Decimal]
    temperatura_c: Optional[Decimal]
    transparencia_secchi_cm: Optional[int]
    alertas: Optional[str]

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# COMPRAS DE INSUMOS
# ─────────────────────────────────────────

class CompraInsumoCreate(BaseModel):
    ciclo_id: int
    data_compra: date
    tipo_insumo: TipoInsumoEnum
    descricao: str = Field(..., min_length=3, max_length=200)
    quantidade: Optional[Decimal] = Field(None, gt=0)
    unidade: Optional[str] = Field(None, max_length=20)
    valor_total: Decimal = Field(..., gt=0)
    fornecedor: Optional[str] = Field(None, max_length=150)
    nota_fiscal: Optional[str] = Field(None, max_length=50)


class CompraInsumoResponse(BaseModel):
    id: int
    ciclo_id: int
    data_compra: date
    tipo_insumo: str
    descricao: str
    quantidade: Optional[Decimal]
    unidade: Optional[str]
    valor_total: Decimal
    fornecedor: Optional[str]
    nota_fiscal: Optional[str]
    lancamento_id: Optional[int]

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# DESPESCAS / VENDAS
# ─────────────────────────────────────────

class DespescaCreate(BaseModel):
    ciclo_id: int
    data_despesca: date
    tipo: TipoDespescaEnum = TipoDespescaEnum.total
    qtd_peixes_vendidos: Optional[int] = Field(None, gt=0)
    peso_total_kg: Decimal = Field(..., gt=0)
    preco_kg: Decimal = Field(..., gt=0)
    comprador: Optional[str] = Field(None, max_length=150)
    nota_fiscal: Optional[str] = Field(None, max_length=50)
    observacoes: Optional[str] = None


class DespescaResponse(BaseModel):
    id: int
    ciclo_id: int
    data_despesca: date
    tipo: str
    qtd_peixes_vendidos: Optional[int]
    peso_total_kg: Decimal
    preco_kg: Decimal
    valor_total: Decimal
    comprador: Optional[str]
    nota_fiscal: Optional[str]
    lancamento_id: Optional[int]
    observacoes: Optional[str]

    class Config:
        from_attributes = True


# ─────────────────────────────────────────
# DASHBOARD DO CICLO
# ─────────────────────────────────────────

class DashboardCiclo(BaseModel):
    ciclo: CicloResponse
    # Zootécnico
    estoque_vivo: int
    mortalidade_acumulada: int
    mortalidade_perc: Decimal
    peso_medio_atual_g: Optional[Decimal]
    biomassa_atual_kg: Optional[Decimal]
    ica_atual: Optional[Decimal]
    dias_em_producao: int
    # Econômico
    total_racao_kg: Decimal
    custo_racao_total: Decimal
    custo_alevinos: Decimal
    custo_outros_insumos: Decimal
    custo_total: Decimal
    custo_por_kg_estimado: Optional[Decimal]
    receita_realizada: Decimal          # despescas já realizadas
    receita_projetada: Optional[Decimal]  # biomassa * meta_preco
    lucro_estimado: Optional[Decimal]
    margem_estimada_perc: Optional[Decimal]
    # Últimos 7 dias
    registros_recentes: List[RegistroDiarioResponse]
    # Alertas ativos
    alertas: List[str]
