# app/services/pdf_converter.py — RuralCaixa MVP
"""
Converte PDF para imagem JPEG para envio à API Claude Vision.
Usa PyMuPDF (fitz) como primeira opção — leve, sem dependência do Poppler.
Fallback: pypdf extrai texto e monta imagem sintética (PDFs puramente textuais).
"""

import io
import logging
from typing import Tuple

logger = logging.getLogger(__name__)


def _pdf_para_jpeg_fitz(pdf_bytes: bytes, pagina: int = 0, dpi: int = 150) -> bytes:
    """Converte primeira página do PDF em JPEG via PyMuPDF."""
    import fitz  # PyMuPDF

    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    total = len(doc)
    logger.info(f"[PDF] Total de páginas: {total}")

    page = doc[pagina]
    mat = fitz.Matrix(dpi / 72, dpi / 72)  # 72 DPI é o padrão PDF
    pix = page.get_pixmap(matrix=mat, alpha=False)

    # Limitar tamanho para não estourar o limite da API Claude (5MB base64)
    max_dim = 1600
    if pix.width > max_dim or pix.height > max_dim:
        scale = max_dim / max(pix.width, pix.height)
        mat2 = fitz.Matrix(scale * dpi / 72, scale * dpi / 72)
        pix = page.get_pixmap(matrix=mat2, alpha=False)

    jpeg_bytes = pix.tobytes("jpeg")
    logger.info(f"[PDF→JPEG] {pix.width}×{pix.height}px · {len(jpeg_bytes)} bytes")
    doc.close()
    return jpeg_bytes


def _pdf_para_jpeg_texto(pdf_bytes: bytes) -> bytes:
    """
    Fallback: extrai texto do PDF via pypdf e renderiza como imagem PNG
    usando Pillow. Útil para PDFs de NF-e com texto nativo (sem scan).
    """
    from pypdf import PdfReader
    from PIL import Image, ImageDraw, ImageFont

    reader = PdfReader(io.BytesIO(pdf_bytes))
    texto = ""
    for page in reader.pages[:2]:
        texto += page.extract_text() or ""
    texto = texto.strip()

    if not texto:
        raise RuntimeError("PDF sem texto extraível e sem renderizador de imagem.")

    # Renderizar texto em imagem simples
    largura, altura = 1000, 1400
    img = Image.new("RGB", (largura, altura), color=(255, 255, 255))
    draw = ImageDraw.Draw(img)

    try:
        font = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14)
    except Exception:
        font = ImageFont.load_default()

    linhas = texto.split("\n")
    y = 20
    for linha in linhas[:80]:  # limita a 80 linhas
        draw.text((20, y), linha[:120], fill=(0, 0, 0), font=font)
        y += 18
        if y > altura - 20:
            break

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    jpeg_bytes = buf.getvalue()
    logger.info(f"[PDF→texto→JPEG] {len(texto)} chars · {len(jpeg_bytes)} bytes")
    return jpeg_bytes


def processar_documento_para_claude(
    arquivo_bytes: bytes,
    mime_type: str,
    nome_arquivo: str = "documento",
) -> Tuple[bytes, str]:
    """
    Ponto de entrada principal.

    Recebe bytes de qualquer documento (PDF ou imagem) e retorna
    (bytes_jpeg, "image/jpeg") prontos para a API Claude Vision.

    Para imagens já suportadas (jpeg, png, webp, gif) retorna sem converter.
    """
    mime_lower = mime_type.lower()

    # Imagens já suportadas — passa direto
    if any(mime_lower.startswith(t) for t in ("image/jpeg", "image/png", "image/webp", "image/gif")):
        logger.info(f"[Converter] Imagem direta: {mime_type}")
        return arquivo_bytes, mime_type

    # PDF
    if "pdf" in mime_lower:
        logger.info(f"[Converter] Iniciando conversão PDF → JPEG")

        # Tentativa 1: PyMuPDF (rápido, sem Poppler)
        try:
            jpeg = _pdf_para_jpeg_fitz(arquivo_bytes)
            return jpeg, "image/jpeg"
        except ImportError:
            logger.warning("[Converter] PyMuPDF não instalado, tentando fallback texto")
        except Exception as e:
            logger.warning(f"[Converter] Fitz falhou: {e}, tentando fallback texto")

        # Tentativa 2: pypdf + Pillow (texto nativo)
        try:
            jpeg = _pdf_para_jpeg_texto(arquivo_bytes)
            return jpeg, "image/jpeg"
        except ImportError:
            raise RuntimeError(
                "Nenhum conversor de PDF disponível. "
                "Instale PyMuPDF: pip install PyMuPDF"
            )
        except Exception as e:
            raise RuntimeError(f"Não foi possível converter o PDF: {e}")

    # Tipo desconhecido — tenta como JPEG mesmo assim
    logger.warning(f"[Converter] Tipo desconhecido {mime_type}, enviando como JPEG")
    return arquivo_bytes, "image/jpeg"
