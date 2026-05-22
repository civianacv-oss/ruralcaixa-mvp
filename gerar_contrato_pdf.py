# =============================================================
# RURALCAIXA — Gerador de PDF de Contrato Rural
# Arquivo: gerar_contrato_pdf.py
# Dependência: pip install reportlab
# =============================================================
# Uso standalone:
#   python gerar_contrato_pdf.py <contrato_id>
#
# Uso como módulo (importar no contratos_api.py):
#   from gerar_contrato_pdf import gerar_pdf_contrato
# =============================================================

import hashlib
import os
import sys
from datetime import datetime
from io import BytesIO

import psycopg2
import psycopg2.extras
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import cm
from reportlab.platypus import (
    HRFlowable, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle
)

DB_URL = "postgresql://postgres:tkyfcRsbrZuuHoThKgjuTiZWYVXOTdOX@gondola.proxy.rlwy.net:53900/railway"

TIPO_LABEL = {
    "agricola":      "Parceria Agrícola",
    "pecuaria":      "Parceria Pecuária",
    "agroindustrial":"Parceria Agroindustrial",
    "extrativa":     "Parceria Extrativa",
}

FREQ_LABEL = {
    "mensal": "Mensal",
    "safra":  "Por Safra",
    "anual":  "Anual",
}

# ------------------------------------------------------------------
# CORES
# ------------------------------------------------------------------
VERDE_RURAL  = colors.HexColor("#1B4D2E")   # verde escuro
VERDE_CLARO  = colors.HexColor("#EAF3DE")   # fundo de células
CINZA_LINHA  = colors.HexColor("#D3D1C7")
PRETO        = colors.HexColor("#1A1A1A")
CINZA_TEXTO  = colors.HexColor("#5F5E5A")


# ------------------------------------------------------------------
# ESTILOS
# ------------------------------------------------------------------
def build_styles():
    base = getSampleStyleSheet()

    titulo = ParagraphStyle(
        "Titulo",
        parent=base["Normal"],
        fontSize=18,
        fontName="Helvetica-Bold",
        textColor=VERDE_RURAL,
        spaceAfter=4,
    )
    subtitulo = ParagraphStyle(
        "Subtitulo",
        parent=base["Normal"],
        fontSize=11,
        fontName="Helvetica",
        textColor=CINZA_TEXTO,
        spaceAfter=2,
    )
    secao = ParagraphStyle(
        "Secao",
        parent=base["Normal"],
        fontSize=10,
        fontName="Helvetica-Bold",
        textColor=VERDE_RURAL,
        spaceBefore=14,
        spaceAfter=6,
    )
    corpo = ParagraphStyle(
        "Corpo",
        parent=base["Normal"],
        fontSize=9,
        fontName="Helvetica",
        textColor=PRETO,
        leading=14,
        spaceAfter=4,
    )
    clausula = ParagraphStyle(
        "Clausula",
        parent=base["Normal"],
        fontSize=9,
        fontName="Helvetica",
        textColor=PRETO,
        leading=14,
        leftIndent=12,
        spaceAfter=6,
    )
    rodape = ParagraphStyle(
        "Rodape",
        parent=base["Normal"],
        fontSize=7,
        fontName="Helvetica",
        textColor=CINZA_TEXTO,
        alignment=1,  # center
    )
    assinatura_nome = ParagraphStyle(
        "AssinaturaNome",
        parent=base["Normal"],
        fontSize=9,
        fontName="Helvetica-Bold",
        textColor=PRETO,
        alignment=1,
    )
    assinatura_label = ParagraphStyle(
        "AssinaturaLabel",
        parent=base["Normal"],
        fontSize=8,
        fontName="Helvetica",
        textColor=CINZA_TEXTO,
        alignment=1,
    )
    return {
        "titulo": titulo, "subtitulo": subtitulo, "secao": secao,
        "corpo": corpo, "clausula": clausula, "rodape": rodape,
        "assinatura_nome": assinatura_nome, "assinatura_label": assinatura_label,
    }


# ------------------------------------------------------------------
# BUSCA DADOS DO CONTRATO
# ------------------------------------------------------------------
def buscar_contrato(contrato_id: str) -> dict:
    conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
    cur = conn.cursor()

    cur.execute("SELECT * FROM vw_contratos_resumo WHERE id = %s", (contrato_id,))
    contrato = cur.fetchone()
    if not contrato:
        conn.close()
        raise ValueError(f"Contrato {contrato_id} não encontrado")

    # Dados da fazenda
    cur.execute("SELECT * FROM imoveis_rurais WHERE id = %s", (contrato["fazenda_id"],))
    fazenda = cur.fetchone()

    # Assinaturas
    cur.execute("""
        SELECT a.papel, a.status, a.assinado_em, a.ip_assinatura,
               p.nome AS produtor_nome, p.cpf AS produtor_cpf,
               pe.nome AS externo_nome, pe.documento AS externo_doc
        FROM assinaturas a
        LEFT JOIN produtores p  ON p.id  = a.socio_id
        LEFT JOIN parceiros_externos pe ON pe.id = a.parceiro_externo_id
        WHERE a.contrato_id = %s
        ORDER BY a.criado_em
    """, (contrato_id,))
    assinaturas = cur.fetchall()

    conn.close()
    return {
        "contrato": dict(contrato),
        "fazenda": dict(fazenda) if fazenda else {},
        "assinaturas": [dict(a) for a in assinaturas],
    }


# ------------------------------------------------------------------
# GERADOR PRINCIPAL
# ------------------------------------------------------------------
def gerar_pdf_contrato(contrato_id: str, salvar_em: str = None) -> bytes:
    """
    Gera o PDF do contrato e retorna os bytes.
    Se salvar_em for informado, salva também em disco.
    Atualiza pdf_hash_sha256 no banco automaticamente.
    """
    dados   = buscar_contrato(contrato_id)
    c       = dados["contrato"]
    fazenda = dados["fazenda"]
    assinaturas = dados["assinaturas"]
    s       = build_styles()

    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        leftMargin=2.5*cm, rightMargin=2.5*cm,
        topMargin=2.5*cm,  bottomMargin=2.5*cm,
        title=f"Contrato de {TIPO_LABEL.get(c['tipo'], c['tipo'])}",
        author="RuralCaixa",
    )

    story = []

    # ------------------------------------------------------------------
    # CABEÇALHO
    # ------------------------------------------------------------------
    story.append(Paragraph("RURALCAIXA", s["titulo"]))
    story.append(Paragraph(
        f"Contrato de {TIPO_LABEL.get(c['tipo'], c['tipo'])} — Estatuto da Terra, Art. 96",
        s["subtitulo"]
    ))
    story.append(HRFlowable(width="100%", thickness=1.5, color=VERDE_RURAL, spaceAfter=10))

    # Metadados rápidos em tabela
    data_inicio = _fmt_data(c.get("data_inicio"))
    data_fim    = _fmt_data(c.get("data_fim"))
    area        = f"{float(c['area_parceria_hectares']):.2f} ha" if c.get("area_parceria_hectares") else "—"

    meta_data = [
        ["Nº do Contrato", str(c["id"])[:8].upper() + "...", "Emitido em", _fmt_data(c.get("criado_em"))],
        ["Vigência",       f"{data_inicio} a {data_fim}", "Área", area],
        ["Tipo",           TIPO_LABEL.get(c["tipo"], c["tipo"]), "Pagamento", FREQ_LABEL.get(c["frequencia_pagamento"], "—")],
        ["Status",         c["status"].replace("_", " ").title(), "Fazenda", fazenda.get("nome") or f"ID {c['fazenda_id']}"],
    ]
    meta_table = Table(meta_data, colWidths=[3.5*cm, 7*cm, 3*cm, 3*cm])
    meta_table.setStyle(TableStyle([
        ("FONTNAME",    (0,0), (-1,-1), "Helvetica"),
        ("FONTSIZE",    (0,0), (-1,-1), 8),
        ("FONTNAME",    (0,0), (0,-1),  "Helvetica-Bold"),
        ("FONTNAME",    (2,0), (2,-1),  "Helvetica-Bold"),
        ("TEXTCOLOR",   (0,0), (0,-1),  VERDE_RURAL),
        ("TEXTCOLOR",   (2,0), (2,-1),  VERDE_RURAL),
        ("BACKGROUND",  (0,0), (-1,-1), VERDE_CLARO),
        ("ROWBACKGROUNDS", (0,0), (-1,-1), [VERDE_CLARO, colors.white]),
        ("GRID",        (0,0), (-1,-1), 0.5, CINZA_LINHA),
        ("PADDING",     (0,0), (-1,-1), 5),
        ("VALIGN",      (0,0), (-1,-1), "MIDDLE"),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 14))

    # ------------------------------------------------------------------
    # CLÁUSULA I — PARTES
    # ------------------------------------------------------------------
    story.append(Paragraph("CLÁUSULA I — DAS PARTES", s["secao"]))

    outorgante_nome = c.get("outorgante_nome") or "—"
    outorgado_nome  = c.get("outorgado_nome")  or "—"

    partes_data = [
        ["", "OUTORGANTE (cede)", "OUTORGADO (recebe)"],
        ["Nome",       outorgante_nome, outorgado_nome],
        ["Participação", f"{float(c['percentual_outorgante']):.1f}%", f"{float(c['percentual_outorgado']):.1f}%"],
    ]
    partes_table = Table(partes_data, colWidths=[3*cm, 7.5*cm, 7.5*cm])
    partes_table.setStyle(TableStyle([
        ("FONTNAME",    (0,0), (-1,-1),  "Helvetica"),
        ("FONTSIZE",    (0,0), (-1,-1),  9),
        ("FONTNAME",    (0,0), (-1,0),   "Helvetica-Bold"),
        ("FONTNAME",    (0,0), (0,-1),   "Helvetica-Bold"),
        ("BACKGROUND",  (0,0), (-1,0),   VERDE_RURAL),
        ("TEXTCOLOR",   (0,0), (-1,0),   colors.white),
        ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, VERDE_CLARO]),
        ("GRID",        (0,0), (-1,-1),  0.5, CINZA_LINHA),
        ("PADDING",     (0,0), (-1,-1),  6),
        ("ALIGN",       (1,0), (-1,-1),  "CENTER"),
        ("VALIGN",      (0,0), (-1,-1),  "MIDDLE"),
    ]))
    story.append(partes_table)
    story.append(Spacer(1, 10))

    # ------------------------------------------------------------------
    # CLÁUSULA II — OBJETO
    # ------------------------------------------------------------------
    story.append(Paragraph("CLÁUSULA II — DO OBJETO", s["secao"]))
    story.append(Paragraph(
        f"O presente instrumento tem por objeto a celebração de contrato de "
        f"<b>{TIPO_LABEL.get(c['tipo'], c['tipo']).lower()}</b>, nos termos do Art. 96 da Lei nº 4.504/1964 "
        f"(Estatuto da Terra), mediante as condições estabelecidas neste contrato.",
        s["clausula"]
    ))
    if fazenda:
        story.append(Paragraph(
            f"O imóvel objeto da parceria está localizado em <b>{fazenda.get('municipio', '—')}/{fazenda.get('uf', '—')}</b>, "
            f"com área total de parceria de <b>{area}</b>.",
            s["clausula"]
        ))

    # ------------------------------------------------------------------
    # CLÁUSULA III — PRAZO
    # ------------------------------------------------------------------
    story.append(Paragraph("CLÁUSULA III — DO PRAZO", s["secao"]))
    story.append(Paragraph(
        f"O presente contrato terá vigência de <b>{data_inicio}</b> a <b>{data_fim}</b>, "
        f"podendo ser renovado mediante acordo escrito entre as partes.",
        s["clausula"]
    ))

    # ------------------------------------------------------------------
    # CLÁUSULA IV — PARTILHA DE RESULTADOS
    # ------------------------------------------------------------------
    story.append(Paragraph("CLÁUSULA IV — DA PARTILHA DE RESULTADOS", s["secao"]))
    story.append(Paragraph(
        f"Os resultados líquidos da atividade serão partilhados na proporção de "
        f"<b>{float(c['percentual_outorgante']):.1f}%</b> para o Outorgante e "
        f"<b>{float(c['percentual_outorgado']):.1f}%</b> para o Outorgado, "
        f"com frequência de pagamento <b>{FREQ_LABEL.get(c['frequencia_pagamento'], '—').lower()}</b>.",
        s["clausula"]
    ))
    story.append(Paragraph(
        "O cálculo dos resultados partilháveis tomará por base as receitas líquidas apuradas, "
        "deduzidas as despesas previamente acordadas entre as partes.",
        s["clausula"]
    ))

    # ------------------------------------------------------------------
    # CLÁUSULA V — OBRIGAÇÕES
    # ------------------------------------------------------------------
    story.append(Paragraph("CLÁUSULA V — DAS OBRIGAÇÕES DAS PARTES", s["secao"]))
    story.append(Paragraph(
        "<b>5.1 Obrigações do Outorgante:</b> manter o imóvel em condições de uso; "
        "providenciar os títulos e documentos necessários; respeitar os direitos do Outorgado "
        "durante a vigência do contrato.",
        s["clausula"]
    ))
    story.append(Paragraph(
        "<b>5.2 Obrigações do Outorgado:</b> utilizar o imóvel/bens cedidos conforme a finalidade "
        "estabelecida; zelar pela conservação dos recursos naturais; prestar contas dos resultados "
        "nas datas acordadas; devolver o imóvel/bens nas condições recebidas ao término do contrato.",
        s["clausula"]
    ))

    # ------------------------------------------------------------------
    # CLÁUSULA VI — FORO
    # ------------------------------------------------------------------
    story.append(Paragraph("CLÁUSULA VI — DO FORO", s["secao"]))
    municipio_foro = fazenda.get("municipio", "domicílio do Outorgante") if fazenda else "domicílio do Outorgante"
    uf_foro = fazenda.get("uf", "") if fazenda else ""
    story.append(Paragraph(
        f"Para dirimir eventuais controvérsias oriundas do presente contrato, as partes elegem o "
        f"foro da comarca de <b>{municipio_foro}/{uf_foro}</b>, com renúncia expressa a qualquer outro, "
        f"por mais privilegiado que seja.",
        s["clausula"]
    ))

    # ------------------------------------------------------------------
    # ASSINATURAS ELETRÔNICAS
    # ------------------------------------------------------------------
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=CINZA_LINHA, spaceAfter=8))
    story.append(Paragraph("ASSINATURAS ELETRÔNICAS", s["secao"]))
    story.append(Paragraph(
        "Este contrato foi assinado eletronicamente nos termos da Lei nº 14.063/2020 "
        "(Assinatura Eletrônica Avançada). As assinaturas abaixo possuem validade jurídica "
        "equivalente à firma reconhecida em cartório para contratos privados.",
        s["corpo"]
    ))
    story.append(Spacer(1, 10))

    if assinaturas:
        sig_data = [["Parte", "Nome", "Status", "Data/Hora", "IP"]]
        for a in assinaturas:
            nome = a.get("produtor_nome") or a.get("externo_nome") or "—"
            status = "✓ Assinado" if a["status"] == "assinado" else "Pendente"
            quando = _fmt_data(a.get("assinado_em"), com_hora=True) if a.get("assinado_em") else "—"
            ip = str(a.get("ip_assinatura") or "—")
            sig_data.append([a["papel"].title(), nome, status, quando, ip])

        sig_table = Table(sig_data, colWidths=[2.5*cm, 5.5*cm, 2.5*cm, 4.5*cm, 3*cm])
        sig_table.setStyle(TableStyle([
            ("FONTNAME",    (0,0), (-1,-1),  "Helvetica"),
            ("FONTSIZE",    (0,0), (-1,-1),  8),
            ("FONTNAME",    (0,0), (-1,0),   "Helvetica-Bold"),
            ("BACKGROUND",  (0,0), (-1,0),   VERDE_RURAL),
            ("TEXTCOLOR",   (0,0), (-1,0),   colors.white),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, VERDE_CLARO]),
            ("GRID",        (0,0), (-1,-1),  0.5, CINZA_LINHA),
            ("PADDING",     (0,0), (-1,-1),  5),
            ("VALIGN",      (0,0), (-1,-1),  "MIDDLE"),
        ]))
        story.append(sig_table)
    else:
        story.append(Paragraph("Nenhuma assinatura registrada até o momento.", s["corpo"]))

    # ------------------------------------------------------------------
    # RODAPÉ COM HASH
    # ------------------------------------------------------------------
    story.append(Spacer(1, 20))
    story.append(HRFlowable(width="100%", thickness=0.5, color=CINZA_LINHA, spaceAfter=6))
    gerado_em = datetime.now().strftime("%d/%m/%Y %H:%M:%S")
    story.append(Paragraph(
        f"Documento gerado em {gerado_em} | ID: {c['id']} | RuralCaixa — ruralcaixa-mvp.vercel.app",
        s["rodape"]
    ))

    # ------------------------------------------------------------------
    # BUILD
    # ------------------------------------------------------------------
    doc.build(story)
    pdf_bytes = buffer.getvalue()

    # Calcular hash SHA-256
    pdf_hash = hashlib.sha256(pdf_bytes).hexdigest()

    # Salvar hash no banco
    _salvar_hash_no_banco(contrato_id, pdf_hash)

    # Salvar em disco se solicitado
    if salvar_em:
        os.makedirs(os.path.dirname(salvar_em) or ".", exist_ok=True)
        with open(salvar_em, "wb") as f:
            f.write(pdf_bytes)
        print(f"[OK] PDF salvo em: {salvar_em}")
        print(f"[OK] SHA-256: {pdf_hash}")

    return pdf_bytes, pdf_hash


def _salvar_hash_no_banco(contrato_id: str, pdf_hash: str):
    try:
        conn = psycopg2.connect(DB_URL)
        cur = conn.cursor()
        cur.execute("""
            UPDATE contratos
            SET pdf_hash_sha256 = %s, pdf_gerado_em = NOW(), atualizado_em = NOW()
            WHERE id = %s
        """, (pdf_hash, contrato_id))
        conn.commit()
        conn.close()
    except Exception as e:
        print(f"[WARN] Não foi possível salvar hash no banco: {e}")


def _fmt_data(valor, com_hora=False) -> str:
    if not valor:
        return "—"
    if isinstance(valor, str):
        try:
            valor = datetime.fromisoformat(valor.replace("Z", "+00:00"))
        except Exception:
            return valor
    if com_hora:
        return valor.strftime("%d/%m/%Y %H:%M")
    return valor.strftime("%d/%m/%Y")


# ------------------------------------------------------------------
# USO STANDALONE: python gerar_contrato_pdf.py <contrato_id>
# ------------------------------------------------------------------
if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Uso: python gerar_contrato_pdf.py <contrato_id>")
        print("\nContratos disponíveis:")
        conn = psycopg2.connect(DB_URL, cursor_factory=psycopg2.extras.RealDictCursor)
        cur = conn.cursor()
        cur.execute("SELECT id, tipo, status, outorgante_nome, outorgado_nome FROM vw_contratos_resumo ORDER BY criado_em DESC LIMIT 10")
        for r in cur.fetchall():
            print(f"  {r['id']}  {r['tipo']:<15} {r['status']:<25} {r['outorgante_nome']} / {r['outorgado_nome']}")
        conn.close()
        sys.exit(0)

    contrato_id = sys.argv[1]
    output_path = f"contrato_{contrato_id[:8]}.pdf"
    gerar_pdf_contrato(contrato_id, salvar_em=output_path)
