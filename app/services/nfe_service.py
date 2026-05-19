"""
RuralCaixa — NF-e Service (endpoints para main.py)
Salvar em: app/services/nfe_service.py
"""
from datetime import date
from decimal import Decimal
from typing import Optional


# ── Cálculo de impostos rurais ────────────────────────────────────────────────

def calcular_impostos(valor_produtos: float, aliq_funrural: float = 1.50, aliq_senar: float = 0.20):
    """
    Pessoa Física: FUNRURAL 1.5% + SENAR 0.2% sobre receita bruta.
    Segurado Especial: FUNRURAL 1.2% + SENAR 0.1%.
    """
    funrural = round(valor_produtos * aliq_funrural / 100, 2)
    senar    = round(valor_produtos * aliq_senar / 100, 2)
    return funrural, senar


# ── Gerador de PDF DANFE simplificado ────────────────────────────────────────

def gerar_pdf_danfe(nota: dict, produtor: dict, destinatario: dict, itens: list) -> bytes:
    """
    Gera PDF do DANFE simplificado usando reportlab.
    Retorna bytes do PDF.
    """
    try:
        from reportlab.lib.pagesizes import A4
        from reportlab.lib import colors
        from reportlab.lib.units import mm
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer, HRFlowable
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
        from reportlab.lib.enums import TA_CENTER, TA_RIGHT, TA_LEFT
        import io

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(buffer, pagesize=A4,
                                leftMargin=10*mm, rightMargin=10*mm,
                                topMargin=10*mm, bottomMargin=10*mm)

        styles = getSampleStyleSheet()
        normal  = ParagraphStyle("normal",  fontSize=8,  leading=10)
        bold    = ParagraphStyle("bold",    fontSize=8,  leading=10, fontName="Helvetica-Bold")
        center  = ParagraphStyle("center",  fontSize=8,  leading=10, alignment=TA_CENTER)
        title   = ParagraphStyle("title",   fontSize=11, leading=14, fontName="Helvetica-Bold", alignment=TA_CENTER)
        small   = ParagraphStyle("small",   fontSize=7,  leading=9,  textColor=colors.grey)

        GREEN = colors.HexColor("#166534")
        LIGHT = colors.HexColor("#f0fdf4")

        fmt = lambda v: f"R$ {float(v):,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")

        elements = []

        # ── Cabeçalho ──────────────────────────────────────────────────────────
        header_data = [[
            Paragraph(f"<b>{produtor.get('nome','').upper()}</b><br/>"
                      f"CPF: {produtor.get('cpf','')} &nbsp; IE: {produtor.get('inscricao_estadual','N/A')}<br/>"
                      f"CAEPF: {produtor.get('caepf','N/A')}<br/>"
                      f"{produtor.get('endereco','')}, {produtor.get('numero','')} - {produtor.get('municipio','')}-{produtor.get('uf','')}", normal),
            Paragraph("<b>NF-e PRODUTOR RURAL</b><br/>"
                      f"<font size=16><b>N° {str(nota.get('numero',0)).zfill(6)}</b></font><br/>"
                      f"Série: {nota.get('serie','001')}<br/>"
                      f"Emissão: {nota.get('data_emissao','')}", center),
        ]]
        header_table = Table(header_data, colWidths=[110*mm, 75*mm])
        header_table.setStyle(TableStyle([
            ("BOX",         (0,0), (-1,-1), 0.5, GREEN),
            ("INNERGRID",   (0,0), (-1,-1), 0.5, GREEN),
            ("BACKGROUND",  (1,0), (1,0),   LIGHT),
            ("VALIGN",      (0,0), (-1,-1), "MIDDLE"),
            ("PADDING",     (0,0), (-1,-1), 6),
        ]))
        elements.append(header_table)
        elements.append(Spacer(1, 3*mm))

        # ── Natureza da operação ────────────────────────────────────────────────
        nat_data = [[
            Paragraph(f"<b>NATUREZA DA OPERAÇÃO:</b> {nota.get('natureza_operacao','')}", bold),
            Paragraph(f"<b>CFOP:</b> {nota.get('cfop','5101')}", bold),
            Paragraph(f"<b>AMBIENTE:</b> {'HOMOLOGAÇÃO' if nota.get('ambiente','2')=='2' else 'PRODUÇÃO'}", bold),
        ]]
        nat_table = Table(nat_data, colWidths=[95*mm, 40*mm, 50*mm])
        nat_table.setStyle(TableStyle([
            ("BOX",       (0,0), (-1,-1), 0.5, GREEN),
            ("INNERGRID", (0,0), (-1,-1), 0.5, GREEN),
            ("PADDING",   (0,0), (-1,-1), 4),
            ("BACKGROUND",(0,0), (-1,-1), LIGHT),
        ]))
        elements.append(nat_table)
        elements.append(Spacer(1, 3*mm))

        # ── Destinatário ───────────────────────────────────────────────────────
        elements.append(Paragraph("<b>DESTINATÁRIO / REMETENTE</b>", bold))
        elements.append(Spacer(1, 1*mm))
        dest_doc = destinatario.get("documento","")
        dest_tipo = "CNPJ" if len(dest_doc.replace(".","").replace("/","").replace("-","")) == 14 else "CPF"
        dest_data = [[
            Paragraph(f"<b>NOME/RAZÃO SOCIAL:</b> {destinatario.get('razao_social','')}", normal),
            Paragraph(f"<b>{dest_tipo}:</b> {dest_doc}", normal),
            Paragraph(f"<b>IE:</b> {destinatario.get('ie','')}", normal),
        ],[
            Paragraph(f"<b>ENDEREÇO:</b> {destinatario.get('endereco','')}, {destinatario.get('numero','')}", normal),
            Paragraph(f"<b>MUNICÍPIO:</b> {destinatario.get('municipio','')}-{destinatario.get('uf','')}", normal),
            Paragraph(f"<b>CEP:</b> {destinatario.get('cep','')}", normal),
        ]]
        dest_table = Table(dest_data, colWidths=[85*mm, 55*mm, 45*mm])
        dest_table.setStyle(TableStyle([
            ("BOX",       (0,0), (-1,-1), 0.5, GREEN),
            ("INNERGRID", (0,0), (-1,-1), 0.5, GREEN),
            ("PADDING",   (0,0), (-1,-1), 4),
        ]))
        elements.append(dest_table)
        elements.append(Spacer(1, 3*mm))

        # ── Itens ──────────────────────────────────────────────────────────────
        elements.append(Paragraph("<b>DADOS DOS PRODUTOS / SERVIÇOS</b>", bold))
        elements.append(Spacer(1, 1*mm))

        itens_header = ["#", "DESCRIÇÃO", "NCM", "CFOP", "UN", "QTD", "VL UNIT", "VL TOTAL"]
        itens_data = [itens_header]
        for item in itens:
            itens_data.append([
                str(item.get("numero_item", "")),
                Paragraph(item.get("descricao",""), normal),
                item.get("ncm",""),
                item.get("cfop",""),
                item.get("unidade",""),
                f"{float(item.get('quantidade',0)):,.3f}".replace(",","X").replace(".",",").replace("X","."),
                fmt(item.get("valor_unitario",0)),
                fmt(item.get("valor_total",0)),
            ])

        itens_table = Table(itens_data,
                            colWidths=[8*mm, 55*mm, 18*mm, 12*mm, 10*mm, 20*mm, 22*mm, 22*mm],
                            repeatRows=1)
        itens_table.setStyle(TableStyle([
            ("BOX",         (0,0), (-1,-1), 0.5, GREEN),
            ("INNERGRID",   (0,0), (-1,-1), 0.3, colors.lightgrey),
            ("BACKGROUND",  (0,0), (-1,0),  GREEN),
            ("TEXTCOLOR",   (0,0), (-1,0),  colors.white),
            ("FONTNAME",    (0,0), (-1,0),  "Helvetica-Bold"),
            ("FONTSIZE",    (0,0), (-1,-1), 7),
            ("PADDING",     (0,0), (-1,-1), 3),
            ("ROWBACKGROUNDS", (0,1), (-1,-1), [colors.white, LIGHT]),
            ("ALIGN",       (5,0), (-1,-1), "RIGHT"),
        ]))
        elements.append(itens_table)
        elements.append(Spacer(1, 3*mm))

        # ── Totais + Impostos ──────────────────────────────────────────────────
        totais_data = [
            ["VALOR DOS PRODUTOS",  fmt(nota.get("valor_produtos",0))],
            ["VALOR DO FRETE",      fmt(nota.get("valor_frete",0))],
            ["VALOR DO DESCONTO",   f"({fmt(nota.get('valor_desconto',0))})"],
            ["FUNRURAL " + f"({nota.get('aliquota_funrural',1.5):.2f}%)",
             fmt(nota.get("valor_funrural",0))],
            ["SENAR " + f"({nota.get('aliquota_senar',0.2):.2f}%)",
             fmt(nota.get("valor_senar",0))],
            ["VALOR TOTAL DA NOTA", fmt(nota.get("valor_total",0))],
        ]
        totais_table = Table(totais_data, colWidths=[130*mm, 55*mm])
        totais_table.setStyle(TableStyle([
            ("BOX",         (0,0), (-1,-1), 0.5, GREEN),
            ("INNERGRID",   (0,0), (-1,-1), 0.3, colors.lightgrey),
            ("ALIGN",       (1,0), (1,-1),  "RIGHT"),
            ("FONTNAME",    (0,-1),(-1,-1), "Helvetica-Bold"),
            ("BACKGROUND",  (0,-1),(-1,-1), GREEN),
            ("TEXTCOLOR",   (0,-1),(-1,-1), colors.white),
            ("FONTSIZE",    (0,0), (-1,-1), 8),
            ("PADDING",     (0,0), (-1,-1), 4),
        ]))
        elements.append(totais_table)
        elements.append(Spacer(1, 3*mm))

        # ── Informações adicionais ─────────────────────────────────────────────
        info = nota.get("informacoes_adicionais") or ""
        status = nota.get("status","rascunho").upper()
        if status == "RASCUNHO":
            info = "*** DOCUMENTO SEM VALOR FISCAL — RASCUNHO *** " + info

        if info:
            elements.append(Paragraph("<b>INFORMAÇÕES ADICIONAIS</b>", bold))
            elements.append(Spacer(1, 1*mm))
            elements.append(Paragraph(info, small))

        # ── Rodapé ─────────────────────────────────────────────────────────────
        elements.append(Spacer(1, 5*mm))
        elements.append(HRFlowable(width="100%", thickness=0.5, color=GREEN))
        elements.append(Spacer(1, 1*mm))
        elements.append(Paragraph(
            "Documento gerado pelo RuralCaixa — Sistema de Gestão para Produtor Rural Pessoa Física",
            ParagraphStyle("footer", fontSize=6, textColor=colors.grey, alignment=TA_CENTER)
        ))

        doc.build(elements)
        return buffer.getvalue()

    except ImportError:
        raise RuntimeError("reportlab nao instalado. Execute: pip install reportlab --break-system-packages")
