"""
pdf_converter_ruralcaixa.py — Conversor PDF para Imagem para RuralCaixa MVP

Módulo otimizado para converter PDFs em imagens JPEG de alta qualidade,
pronto para envio à Claude Vision API.

Características:
- Suporta PDFs de múltiplas páginas (processa primeira página)
- Otimização de tamanho para limites da API do Claude
- Pré-processamento de imagem (contraste, brilho)
- Validação de arquivo
"""

import io
import logging
from typing import Optional, Tuple
from PIL import Image, ImageEnhance

logger = logging.getLogger(__name__)


def converter_pdf_para_imagem(
    pdf_bytes: bytes,
    dpi: int = 200,
    max_width: int = 2000,
    max_height: int = 2000,
    quality: int = 85,
) -> Tuple[bytes, str]:
    """
    Converte PDF para JPEG otimizado para Claude Vision.
    
    Args:
        pdf_bytes: Conteúdo do arquivo PDF em bytes
        dpi: Resolução para conversão (padrão 200 DPI)
        max_width: Largura máxima da imagem resultante
        max_height: Altura máxima da imagem resultante
        quality: Qualidade JPEG (1-100, padrão 85)
    
    Returns:
        Tuple[bytes, str]: (imagem_jpeg_bytes, mime_type)
    
    Raises:
        ValueError: Se o arquivo não for um PDF válido
        RuntimeError: Se a conversão falhar
    """
    try:
        # Validar assinatura PDF
        if not pdf_bytes.startswith(b"%PDF"):
            raise ValueError("Arquivo não é um PDF válido (assinatura ausente)")
        
        if len(pdf_bytes) > 50 * 1024 * 1024:  # 50 MB limit
            raise ValueError("Arquivo PDF muito grande (máximo 50 MB)")
        
        # Importar pdf2image
        try:
            from pdf2image import convert_from_bytes
        except ImportError:
            raise RuntimeError(
                "Biblioteca 'pdf2image' não instalada. "
                "Execute: pip install pdf2image"
            )
        
        # Converter primeira página do PDF para imagem PIL
        logger.info(f"Convertendo PDF ({len(pdf_bytes)} bytes) para imagem...")
        imagens = convert_from_bytes(
            pdf_bytes,
            first_page=1,
            last_page=1,
            dpi=dpi,
            fmt="ppm",  # Formato intermediário rápido
        )
        
        if not imagens:
            raise RuntimeError("PDF não contém páginas válidas")
        
        imagem = imagens[0]
        logger.info(f"PDF convertido: {imagem.size}")
        
        # Redimensionar se necessário
        if imagem.width > max_width or imagem.height > max_height:
            imagem.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)
            logger.info(f"Imagem redimensionada para: {imagem.size}")
        
        # Aplicar pré-processamento (melhorar contraste)
        imagem = _preprocessar_imagem(imagem)
        
        # Converter para JPEG
        jpeg_buffer = io.BytesIO()
        imagem.save(jpeg_buffer, format="JPEG", quality=quality, optimize=True)
        jpeg_bytes = jpeg_buffer.getvalue()
        
        logger.info(
            f"Conversão concluída: {len(jpeg_bytes)} bytes "
            f"(compressão: {len(jpeg_bytes) / len(pdf_bytes) * 100:.1f}%)"
        )
        
        return jpeg_bytes, "image/jpeg"
    
    except ValueError as e:
        logger.error(f"Erro de validação: {e}")
        raise
    except RuntimeError as e:
        logger.error(f"Erro de conversão: {e}")
        raise
    except Exception as e:
        logger.error(f"Erro inesperado na conversão PDF: {e}", exc_info=True)
        raise RuntimeError(f"Falha ao converter PDF: {str(e)}")


def _preprocessar_imagem(imagem: Image.Image) -> Image.Image:
    """
    Aplica pré-processamento para melhorar qualidade do OCR.
    
    Operações:
    - Converter para RGB (se necessário)
    - Aumentar contraste (CLAHE equivalente)
    - Aumentar nitidez
    """
    try:
        # Garantir RGB
        if imagem.mode != "RGB":
            imagem = imagem.convert("RGB")
        
        # Aumentar contraste (similar a CLAHE)
        enhancer = ImageEnhance.Contrast(imagem)
        imagem = enhancer.enhance(1.3)
        
        # Aumentar nitidez
        enhancer = ImageEnhance.Sharpness(imagem)
        imagem = enhancer.enhance(1.2)
        
        logger.debug("Pré-processamento aplicado com sucesso")
        return imagem
    
    except Exception as e:
        logger.warning(f"Erro no pré-processamento: {e}. Continuando sem pré-processamento.")
        return imagem


def detectar_tipo_arquivo(mime_type: str) -> str:
    """
    Detecta o tipo de arquivo baseado no MIME type.
    
    Returns:
        "pdf" | "image" | "unknown"
    """
    mime_lower = mime_type.lower()
    
    if "pdf" in mime_lower:
        return "pdf"
    elif any(img in mime_lower for img in ["image", "jpeg", "png", "gif", "webp"]):
        return "image"
    else:
        return "unknown"


def processar_documento_para_claude(
    arquivo_bytes: bytes,
    mime_type: str,
    nome_arquivo: Optional[str] = None,
) -> Tuple[bytes, str]:
    """
    Processa documento (PDF ou imagem) para envio à Claude Vision.
    
    Args:
        arquivo_bytes: Conteúdo do arquivo em bytes
        mime_type: MIME type do arquivo
        nome_arquivo: Nome original do arquivo (para logging)
    
    Returns:
        Tuple[bytes, str]: (imagem_jpeg_bytes, mime_type_final)
    """
    tipo = detectar_tipo_arquivo(mime_type)
    
    if tipo == "pdf":
        logger.info(f"Processando PDF: {nome_arquivo or 'desconhecido'}")
        return converter_pdf_para_imagem(arquivo_bytes)
    
    elif tipo == "image":
        logger.info(f"Processando imagem: {nome_arquivo or 'desconhecido'}")
        # Se for imagem, retornar como está (Claude aceita JPEG, PNG, GIF, WebP)
        return arquivo_bytes, mime_type
    
    else:
        raise ValueError(
            f"Tipo de arquivo não suportado: {mime_type}. "
            f"Envie PDF ou imagem (JPEG, PNG, GIF, WebP)."
        )
