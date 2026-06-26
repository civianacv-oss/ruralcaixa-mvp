"use client";
import { useState, useEffect, useRef } from "react";

const IMOVEL_ID = 1;

// ── Constantes de código Python ──────────────────────────────────────────────

const INSTALL_CODE = `pip install ultralytics opencv-python matplotlib`;

const PIPELINE_CODE = `import cv2
from ultralytics import YOLO

# Carrega o modelo YOLOv8 nano (download automático na 1ª execução)
modelo = YOLO("yolov8n.pt")

# Classe 18 = sheep no dataset COCO padrão
CLASSE_OVINO = 18

def detectar_ovinos_imagem(caminho_imagem: str):
    """Detecta ovinos em uma imagem estática e exibe as bounding boxes."""
    print(f"[INFO] Processando imagem: {caminho_imagem}")

    resultados = modelo(caminho_imagem, conf=0.25)

    for r in resultados:
        # Filtra apenas a classe ovino (18)
        indices_ovinos = [
            i for i, c in enumerate(r.boxes.cls)
            if int(c) == CLASSE_OVINO
        ]
        print(f"[INFO] {len(indices_ovinos)} ovino(s) detectado(s).")

        for idx in indices_ovinos:
            box = r.boxes[idx]
            # Coordenadas absolutas: x_min, y_min, x_max, y_max
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())
            confianca = float(box.conf[0])
            print(f"  → Bounding box: ({x1}, {y1}) → ({x2}, {y2}) | conf: {confianca:.2f}")

        # Exibe a imagem com as caixas desenhadas
        img_anotada = r.plot()
        cv2.imshow("Detecção de Ovinos", img_anotada)
        cv2.waitKey(0)
        cv2.destroyAllWindows()

# ── Modo vídeo (feed de câmera ou arquivo) ──────────────────────────────────
def detectar_ovinos_video(fonte=0):
    """Processa um feed de vídeo em tempo real (0 = webcam)."""
    print("[INFO] Iniciando detecção em vídeo...")

    for r in modelo(fonte, stream=True, conf=0.30):
        indices_ovinos = [
            i for i, c in enumerate(r.boxes.cls)
            if int(c) == CLASSE_OVINO
        ]
        img = r.plot()
        cv2.putText(img, f"Ovinos: {len(indices_ovinos)}", (10, 30),
                    cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 200, 0), 2)
        cv2.imshow("Pipeline Ovinos — Tempo Real", img)
        if cv2.waitKey(1) & 0xFF == ord("q"):
            break

    cv2.destroyAllWindows()`;

const CROP_CODE = `import cv2
import os
from ultralytics import YOLO

def pipeline_com_recorte(caminho_imagem, pasta_saida="recortes_ovinos"):
    """Detecta ovinos e salva o recorte de cada animal individualmente."""
    if not os.path.exists(pasta_saida):
        os.makedirs(pasta_saida)

    modelo = YOLO("yolov8n.pt")
    CLASSE_OVINO = 18
    imagem_original = cv2.imread(caminho_imagem)

    if imagem_original is None:
        print(f"[ERRO] Não foi possível carregar a imagem.")
        return

    resultados = modelo(caminho_imagem, conf=0.25)
    contador = 0

    for r in resultados:
        indices = [i for i, c in enumerate(r.boxes.cls) if int(c) == CLASSE_OVINO]
        for idx in indices:
            box = r.boxes[idx]
            x1, y1, x2, y2 = map(int, box.xyxy[0].tolist())

            # Recorte via slicing NumPy: img[y1:y2, x1:x2]
            recorte_animal = imagem_original[y1:y2, x1:x2]
            contador += 1
            cv2.imwrite(os.path.join(pasta_saida, f"ovino_{contador}.jpg"), recorte_animal)

    print(f"[FIM] {contador} recorte(s) salvo(s) em '{pasta_saida}'.")`;

const FINETUNE_CODE = `from ultralytics import YOLO

# Carrega o modelo base pré-treinado
modelo = YOLO("yolov8n.pt")

# Treina com seu dataset personalizado
modelo.train(
    data="meu_dataset/dataset.yaml",
    epochs=50,
    imgsz=640,
    batch=16,
    name="ovinos_famacha_v1",
)

# Avalia o desempenho no conjunto de validação
metricas = modelo.val()
print(f"mAP50: {metricas.box.map50:.3f}")`;

const YAML_CODE = `# dataset.yaml — configuração do dataset personalizado
path: ./meu_dataset
train: train/images
val:   val/images

nc: 2  # número de classes
names:
  0: casco_saudavel
  1: pododermatite`;

// ── Dados das tabelas ────────────────────────────────────────────────────────

const MODELOS = [
  { nome: "YOLOv8n", tamanho: "6 MB",  map50: "37.3%", cpu: "~80 ms",  gpu: "~1.5 ms", uso: "Edge / Raspberry Pi", rec: true },
  { nome: "YOLOv8s", tamanho: "22 MB", map50: "44.9%", cpu: "~120 ms", gpu: "~2.5 ms", uso: "Smartphone / Tablet",   rec: false },
  { nome: "YOLOv8m", tamanho: "52 MB", map50: "50.2%", cpu: "~230 ms", gpu: "~5 ms",   uso: "Servidor local",        rec: false },
  { nome: "YOLOv8l", tamanho: "87 MB", map50: "52.9%", cpu: "~400 ms", gpu: "~8 ms",   uso: "Servidor com GPU",      rec: false },
  { nome: "YOLOv8x", tamanho: "136 MB",map50: "53.9%", cpu: "~700 ms", gpu: "~14 ms",  uso: "Nuvem / Batch",         rec: false },
];

const HARDWARE = [
  { device: "Raspberry Pi 5",    cpu: "Cortex-A76 2.4GHz", ram: "8 GB",  fps: "~3–5",  consumo: "~5–8 W",  preco: "~R$ 450",  uso: "Monitoramento fixo no curral", rec: false },
  { device: "Jetson Nano",       cpu: "128 CUDA cores",    ram: "4 GB",  fps: "~12–18",consumo: "~5–10 W", preco: "~R$ 900",  uso: "Câmera de manejo em tempo real", rec: true },
  { device: "Jetson Orin Nano",  cpu: "1024 CUDA cores",   ram: "8 GB",  fps: "~40+",  consumo: "~7–15 W", preco: "~R$ 2.200",uso: "Múltiplas câmeras simultâneas", rec: false },
  { device: "Google Coral USB",  cpu: "Edge TPU 4 TOPS",   ram: "—",     fps: "~25",   consumo: "~2 W",    preco: "~R$ 300",  uso: "Acoplado ao Raspberry Pi", rec: false },
  { device: "Smartphone Android",cpu: "Snapdragon/Tensor",  ram: "6–12 GB",fps: "~8–15",consumo: "Bateria", preco: "Existente",uso: "Inspeção manual no campo", rec: false },
];

const GLOSSARIO = [
  { termo: "Bounding Box", abrev: "bbox",    def: "Retângulo delimitador que envolve o objeto detectado, definido pelas coordenadas (x_min, y_min, x_max, y_max)." },
  { termo: "IoU",          abrev: "IoU",     def: "Intersection over Union — razão entre a área de sobreposição e a área de união entre a bbox prevista e a real. Mede a precisão da localização." },
  { termo: "mAP50",        abrev: "mAP50",   def: "Mean Average Precision com limiar IoU de 0,50. Principal métrica de avaliação de detectores de objetos." },
  { termo: "Fine-Tuning",  abrev: "FT",      def: "Ajuste fino de um modelo pré-treinado com dados específicos do domínio, reduzindo o volume de imagens necessárias para treinar." },
  { termo: "Overfitting",  abrev: "OF",      def: "Quando o modelo memoriza os dados de treino e perde capacidade de generalizar para imagens novas." },
  { termo: "TensorRT",     abrev: "TRT",     def: "SDK da NVIDIA para otimização de inferência em GPU, capaz de reduzir a latência em até 3× com quantização INT8." },
  { termo: "Edge Computing",abrev: "Edge",   def: "Processamento realizado no próprio dispositivo de campo (Raspberry Pi, Jetson), sem envio de dados para a nuvem." },
  { termo: "Confidence",   abrev: "conf",    def: "Grau de certeza do modelo sobre uma detecção, de 0 a 1. Detecções abaixo do limiar (ex: 0,25) são descartadas." },
  { termo: "COCO",         abrev: "COCO",    def: "Dataset de referência com 80 classes. A classe 18 corresponde a 'sheep' e é usada pelo YOLOv8n pré-treinado." },
  { termo: "Transfer Learning", abrev: "TL", def: "Técnica de reutilizar pesos de um modelo treinado em grande escala para acelerar o treinamento em datasets menores." },
];

const FAQ = [
  { q: "Qual o mínimo de imagens para fine-tuning?", a: "Para resultados aceitáveis, recomenda-se pelo menos 200–300 imagens por classe, bem distribuídas entre condições de luz, ângulo e distância. Com menos de 100 imagens por classe, o risco de overfitting é alto." },
  { q: "Posso usar YOLOv11 no lugar do YOLOv8?", a: "Sim. O YOLOv11 usa a mesma API da biblioteca Ultralytics. Basta substituir 'yolov8n.pt' por 'yolo11n.pt'. O YOLOv11 apresenta mAP ligeiramente superior com menor número de parâmetros." },
  { q: "Como lidar com ovinos parcialmente ocluídos?", a: "Inclua imagens com oclusão parcial no dataset de treino. O parâmetro 'overlap_mask=True' no treinamento também ajuda. Em produção, reduza o limiar de confiança para 0,20 e aplique NMS (Non-Maximum Suppression) com IoU de 0,45." },
  { q: "O pipeline funciona sem GPU?", a: "Sim. O YOLOv8n processa a ~80 ms/frame em CPU moderna. Para uso em tempo real (>15 FPS), use o Jetson Nano ou exporte o modelo para TensorRT/ONNX antes do deploy em hardware embarcado." },
  { q: "Como exportar o modelo para o Jetson Nano?", a: "Use modelo.export(format='engine') para gerar um arquivo .engine otimizado com TensorRT. No Jetson, carregue com YOLO('modelo.engine') — a latência cai de ~80 ms para ~25 ms por frame." },
  { q: "O dataset COCO já detecta pododermatite?", a: "Não. O modelo base detecta apenas a presença do animal (classe 18 = sheep). Para detectar patologias específicas como pododermatite ou grau Famacha, é obrigatório fazer fine-tuning com imagens anotadas das condições clínicas de interesse." },
];

// ── Componente CodeBlock ─────────────────────────────────────────────────────

function CodeBlock({ code, lang = "python", filename }: { code: string; lang?: string; filename?: string }) {
  const [copied, setCopied] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    if (!filename) return;
    const blob = new Blob([code], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 2000);
  }

  function highlight(src: string) {
    if (lang !== "python") return src;
    return src
      .replace(/(#[^\n]*)/g, '<span style="color:#6b7280;font-style:italic">$1</span>')
      .replace(/\b(import|from|def|return|if|else|elif|for|in|not|and|or|True|False|None|class|with|as|try|except|raise|pass|break|continue|while|lambda|yield)\b/g,
        '<span style="color:#6082B6;font-weight:600">$1</span>')
      .replace(/("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|"""[\s\S]*?""")/g,
        '<span style="color:#FFBF00">$1</span>');
  }

  return (
    <div style={{ borderRadius: 10, overflow: "hidden", marginBottom: 20, border: "1px solid #d1d5db" }}>
      <div style={{ background: "#1e1e1e", padding: "10px 16px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#ef4444" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#f59e0b" }} />
          <div style={{ width: 12, height: 12, borderRadius: "50%", background: "#22c55e" }} />
          <span style={{ marginLeft: 8, fontSize: 12, color: "#9ca3af" }}>{lang}</span>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {filename && (
            <button onClick={handleDownload} style={{
              background: downloaded ? "#15803d" : "rgba(255,255,255,0.1)",
              border: "1px solid rgba(255,255,255,0.2)",
              color: downloaded ? "#fff" : "#d1d5db",
              fontSize: 12, fontWeight: 600, padding: "4px 12px",
              borderRadius: 6, cursor: "pointer",
            }}>
              {downloaded ? "✓ Baixado!" : `↓ ${filename}`}
            </button>
          )}
          <button onClick={handleCopy} style={{
            background: copied ? "#15803d" : "rgba(255,255,255,0.1)",
            border: "1px solid rgba(255,255,255,0.2)",
            color: copied ? "#fff" : "#d1d5db",
            fontSize: 12, fontWeight: 600, padding: "4px 12px",
            borderRadius: 6, cursor: "pointer",
          }}>
            {copied ? "✓ Copiado!" : "Copiar"}
          </button>
        </div>
      </div>
      <pre style={{
        background: "#1e1e1e", color: "#f8f8f2", margin: 0,
        padding: "16px", overflowX: "auto", fontSize: 13,
        lineHeight: 1.6, fontFamily: "'Courier New', monospace",
      }}>
        <code dangerouslySetInnerHTML={{ __html: highlight(code) }} />
      </pre>
    </div>
  );
}

// ── Componente principal ─────────────────────────────────────────────────────

export default function PipelineIA() {
  const [secaoAtiva, setSecaoAtiva] = useState("ambiente");
  const [faqAberto, setFaqAberto] = useState<number | null>(null);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [buscaSec, setBuscaSec] = useState("");
  const mainRef = useRef<HTMLDivElement>(null);

  const secoes = [
    { id: "ambiente",     label: "01 / Ambiente",      emoji: "⚙️" },
    { id: "pipeline",     label: "02 / Pipeline Base", emoji: "🔍" },
    { id: "recorte",      label: "03 / Recorte",       emoji: "✂️" },
    { id: "especializacao",label: "04 / Especialização",emoji: "🎯" },
    { id: "anotacao",     label: "05 / Anotação",      emoji: "🏷️" },
    { id: "diagnostico",  label: "06 / Diagnóstico",   emoji: "🩺" },
    { id: "hardware",     label: "07 / Hardware",      emoji: "💻" },
    { id: "faq",          label: `08 / FAQ (${FAQ.length})`, emoji: "❓" },
    { id: "glossario",    label: "09 / Glossário",     emoji: "📖" },
  ];

  const secoesFiltradas = secoes.filter(s =>
    s.label.toLowerCase().includes(buscaSec.toLowerCase())
  );

  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const onScroll = () => {
      const pct = el.scrollTop / (el.scrollHeight - el.clientHeight);
      setScrollProgress(Math.min(pct * 100, 100));
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, []);

  function scrollTo(id: string) {
    const el = document.getElementById(id);
    if (el && mainRef.current) {
      mainRef.current.scrollTo({ top: el.offsetTop - 20, behavior: "smooth" });
    }
    setSecaoAtiva(id);
  }

  function copiarLink(ancora: string) {
    const url = `${window.location.origin}${window.location.pathname}#${ancora}`;
    navigator.clipboard.writeText(url).then(() => {
      alert(`Link copiado: ${url}`);
    });
  }

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif", background: "#f5f0e8", overflow: "hidden" }}>

      {/* ── SIDEBAR ──────────────────────────────────────────────────────── */}
      <aside style={{
        width: 220, minWidth: 220, background: "#1a2e1a", color: "#e8e0d0",
        display: "flex", flexDirection: "column", flexShrink: 0, overflowY: "auto",
      }}>
        {/* Logo */}
        <div style={{ padding: "16px 16px 10px", borderBottom: "1px solid #2d4a2d" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ background: "#5a8a3a", borderRadius: 8, width: 32, height: 32, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🌿</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: "#e8e0d0" }}>RuralCaixa</div>
              <div style={{ fontSize: 9, color: "#7a9a6a", letterSpacing: "2px", textTransform: "uppercase" }}>Pipeline IA</div>
            </div>
          </div>
        </div>

        {/* Busca */}
        <div style={{ padding: "10px 12px 4px" }}>
          <input
            value={buscaSec}
            onChange={e => setBuscaSec(e.target.value)}
            placeholder="Buscar seção..."
            style={{
              width: "100%", padding: "7px 10px", borderRadius: 6,
              border: "1px solid #3d5a3d", background: "#243824",
              color: "#e8e0d0", fontSize: 12, outline: "none", boxSizing: "border-box",
            }}
          />
        </div>

        {/* Nav */}
        <div style={{ padding: "8px 8px", flex: 1 }}>
          <div style={{ fontSize: 9, color: "#5a7a5a", letterSpacing: "2px", textTransform: "uppercase", padding: "0 10px", marginBottom: 6 }}>Documentação</div>
          {secoesFiltradas.map(s => (
            <button key={s.id} onClick={() => scrollTo(s.id)} style={{
              display: "flex", alignItems: "center", gap: 8,
              width: "100%", padding: "8px 10px", borderRadius: 7, marginBottom: 2,
              background: secaoAtiva === s.id ? "#2d4a2d" : "transparent",
              color: secaoAtiva === s.id ? "#c8e6b0" : "#a0b890",
              border: "none", cursor: "pointer", fontSize: 12.5,
              fontWeight: secaoAtiva === s.id ? 600 : 400,
              textAlign: "left",
            }}>
              <span style={{ fontSize: 13 }}>{s.emoji}</span>
              {s.label}
              {secaoAtiva === s.id && <div style={{ marginLeft: "auto", width: 5, height: 5, borderRadius: "50%", background: "#7ac05a" }} />}
            </button>
          ))}
        </div>

        {/* Fazenda */}
        <div style={{ padding: "10px 14px", borderTop: "1px solid #2d4a2d", fontSize: 11, color: "#7a9a6a" }}>
          <div style={{ fontWeight: 600, color: "#a8c890", marginBottom: 2 }}>Fazenda Boa Esperança</div>
          <div>Imóvel #{IMOVEL_ID} · Maranhão</div>
        </div>
      </aside>

      {/* ── MAIN ─────────────────────────────────────────────────────────── */}
      <div ref={mainRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column" }}>

        {/* Barra de progresso */}
        <div style={{ position: "sticky", top: 0, zIndex: 20, height: 3, background: "#e5e7eb" }}>
          <div style={{ height: "100%", background: "linear-gradient(90deg, #15803d, #f59e0b)", width: `${scrollProgress}%`, transition: "width 0.1s" }} />
        </div>

        {/* Header */}
        <div style={{ background: "#15803d", color: "white", padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <a href="/" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "white", fontSize: 13, fontWeight: 600, textDecoration: "none", borderRadius: 8, padding: "6px 14px" }}>🏠 Painel Principal</a>
            <a href="/ovino" style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)", color: "white", fontSize: 13, fontWeight: 600, textDecoration: "none", borderRadius: 8, padding: "6px 14px" }}>← Ovinos</a>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 26 }}>🤖</span>
            <div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>Pipeline IA — Detecção de Ovinos</div>
              <div style={{ fontSize: 12, opacity: 0.8 }}>YOLOv8 / YOLOv11 · Visão Computacional · Diagnóstico Veterinário</div>
            </div>
          </div>
          <div style={{ width: 160 }} />
        </div>

        {/* Hero */}
        <div style={{ background: "#fff", borderBottom: "1px solid #e5e7eb", padding: "20px 28px" }}>
          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#15803d" }}>classe: 18 · sheep</div>
            <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#92400e" }}>COCO dataset</div>
            <div style={{ background: "#ede9fe", border: "1px solid #ddd6fe", borderRadius: 8, padding: "6px 14px", fontSize: 12, fontWeight: 600, color: "#5b21b6" }}>YOLOv8 · YOLOv11</div>
            <div style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>
              🕐 Leitura: ~12 min · {secoes.length} seções
            </div>
          </div>
          <p style={{ margin: "14px 0 0", fontSize: 14, color: "#4b5563", maxWidth: 720, lineHeight: 1.6 }}>
            Pipeline completo de detecção de ovinos com YOLOv8/YOLOv11 — do modelo base ao fine-tuning especializado em diagnóstico veterinário (Famacha, pododermatite). Inclui código comentado, tabelas comparativas de hardware e glossário técnico.
          </p>
        </div>

        {/* Conteúdo */}
        <div style={{ padding: "24px 28px", maxWidth: 900, width: "100%", margin: "0 auto" }}>

          {/* ── SEÇÃO 01: Ambiente ─────────────────────────────────────────── */}
          <section id="ambiente" style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, borderBottom: "2px solid #e5e7eb", paddingBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase" }}>01</span>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>Preparação do Ambiente</h2>
              <button onClick={() => copiarLink("ambiente")} title="Copiar link" style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, padding: "0 4px" }}>🔗</button>
            </div>
            <p style={{ color: "#4b5563", lineHeight: 1.7, marginBottom: 16 }}>
              Antes de executar o script, instale as três dependências via <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, fontSize: 13 }}>pip</code>. O YOLOv8 requer Python 3.8 ou superior; recomenda-se o uso de um ambiente virtual (<code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, fontSize: 13 }}>venv</code> ou <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 4, fontSize: 13 }}>conda</code>).
            </p>
            <div style={{ background: "#fef3c7", border: "1px solid #fde68a", borderRadius: 8, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #f59e0b" }}>
              <strong style={{ color: "#92400e" }}>Pré-requisito:</strong> <span style={{ color: "#78350f" }}>Python 3.8+ com pip atualizado. Na primeira execução, o modelo <code>yolov8n.pt</code> (~6 MB) é baixado automaticamente da Ultralytics.</span>
            </div>
            <CodeBlock code={INSTALL_CODE} lang="bash" />
          </section>

          {/* ── SEÇÃO 02: Pipeline Base ────────────────────────────────────── */}
          <section id="pipeline" style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, borderBottom: "2px solid #e5e7eb", paddingBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase" }}>02</span>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>Pipeline Básico de Detecção</h2>
              <button onClick={() => copiarLink("pipeline")} title="Copiar link" style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, padding: "0 4px" }}>🔗</button>
            </div>
            <p style={{ color: "#4b5563", lineHeight: 1.7, marginBottom: 16 }}>
              O script abaixo faz o download automático do modelo pré-treinado, realiza a inferência em imagem ou vídeo, filtra os resultados para manter apenas a <strong>classe 18 (sheep)</strong> do dataset COCO e exibe o resultado com as bounding boxes desenhadas.
            </p>
            <CodeBlock code={PIPELINE_CODE} lang="python" filename="pipeline_ovinos.py" />
          </section>

          {/* ── SEÇÃO 03: Recorte ─────────────────────────────────────────── */}
          <section id="recorte" style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, borderBottom: "2px solid #e5e7eb", paddingBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase" }}>03</span>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>Pipeline com Recorte Automático</h2>
              <button onClick={() => copiarLink("recorte")} title="Copiar link" style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, padding: "0 4px" }}>🔗</button>
            </div>

            {/* Diagrama de fluxo */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20, flexWrap: "wrap" }}>
              {["📷 Imagem", "→", "🔍 YOLO Detect", "→", "✂️ NumPy Crop", "→", "🩺 Modelo Secundário"].map((item, i) => (
                item === "→"
                  ? <span key={i} style={{ color: "#9ca3af", fontWeight: 700 }}>→</span>
                  : <div key={i} style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "8px 14px", fontSize: 13, fontWeight: 600, color: "#15803d" }}>{item}</div>
              ))}
            </div>

            <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: 8, padding: "12px 16px", marginBottom: 16, borderLeft: "4px solid #16a34a" }}>
              <strong style={{ color: "#15803d" }}>Técnica de recorte:</strong> <span style={{ color: "#166534" }}>O slicing NumPy <code>img[y1:y2, x1:x2]</code> extrai a região de interesse em memória sem cópia adicional, tornando a operação O(1) em tempo de CPU.</span>
            </div>
            <CodeBlock code={CROP_CODE} lang="python" filename="pipeline_recorte_ovinos.py" />
          </section>

          {/* ── SEÇÃO 04: Especialização ──────────────────────────────────── */}
          <section id="especializacao" style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, borderBottom: "2px solid #e5e7eb", paddingBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase" }}>04</span>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>Especialização do Modelo (Fine-Tuning)</h2>
              <button onClick={() => copiarLink("especializacao")} title="Copiar link" style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, padding: "0 4px" }}>🔗</button>
            </div>
            <p style={{ color: "#4b5563", lineHeight: 1.7, marginBottom: 16 }}>
              Para detectar patologias específicas (pododermatite, grau Famacha), é necessário treinar o modelo com imagens próprias anotadas. A estrutura de pastas abaixo é o formato exigido pelo YOLO.
            </p>
            <div style={{ background: "#1e1e1e", borderRadius: 10, padding: 16, marginBottom: 16, fontFamily: "monospace", fontSize: 13, color: "#f8f8f2", lineHeight: 1.8 }}>
              <div style={{ color: "#6b7280", marginBottom: 8 }}># Estrutura de pastas do dataset</div>
              <div>meu_dataset/</div>
              <div style={{ paddingLeft: 20 }}>├── <span style={{ color: "#FFBF00" }}>dataset.yaml</span></div>
              <div style={{ paddingLeft: 20 }}>├── train/</div>
              <div style={{ paddingLeft: 40 }}>├── images/</div>
              <div style={{ paddingLeft: 40 }}>└── labels/</div>
              <div style={{ paddingLeft: 20 }}>└── val/</div>
              <div style={{ paddingLeft: 40 }}>├── images/</div>
              <div style={{ paddingLeft: 40 }}>└── labels/</div>
            </div>
            <CodeBlock code={YAML_CODE} lang="yaml" />
            <CodeBlock code={FINETUNE_CODE} lang="python" filename="fine_tuning.py" />

            {/* Tabela de modelos */}
            <h3 style={{ fontSize: 16, fontWeight: 700, color: "#111827", marginBottom: 12 }}>Comparativo de Variantes YOLOv8</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {["Modelo", "Tamanho", "mAP50", "CPU (ms/frame)", "GPU (ms/frame)", "Uso Ideal"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: "2px solid #e5e7eb", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MODELOS.map((m, i) => (
                    <tr key={m.nome} style={{ background: m.rec ? "#f0fdf4" : i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", fontWeight: 700, color: "#111827" }}>
                        {m.nome} {m.rec && <span style={{ background: "#16a34a", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4, marginLeft: 4 }}>Recomendado</span>}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{m.tamanho}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{m.map50}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{m.cpu}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{m.gpu}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{m.uso}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── SEÇÃO 05: Anotação ────────────────────────────────────────── */}
          <section id="anotacao" style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, borderBottom: "2px solid #e5e7eb", paddingBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase" }}>05</span>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>Anotação de Dados — Formato YOLO</h2>
              <button onClick={() => copiarLink("anotacao")} title="Copiar link" style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, padding: "0 4px" }}>🔗</button>
            </div>
            <p style={{ color: "#4b5563", lineHeight: 1.7, marginBottom: 16 }}>
              Cada imagem de treino precisa de um arquivo <code style={{ background: "#f3f4f6", padding: "2px 6px", borderRadius: 4 }}>.txt</code> com as coordenadas normalizadas das bounding boxes. Para uma imagem de largura W e altura H, as fórmulas são:
            </p>
            <div style={{ background: "#1e1e1e", borderRadius: 10, padding: 16, marginBottom: 16, fontFamily: "monospace", fontSize: 13, color: "#f8f8f2", lineHeight: 2 }}>
              <div style={{ color: "#6b7280" }}># Formato: classe  x_centro  y_centro  largura  altura</div>
              <div><span style={{ color: "#FFBF00" }}>x_centro</span> = (x_min + x_max) / (2 × W)</div>
              <div><span style={{ color: "#FFBF00" }}>y_centro</span> = (y_min + y_max) / (2 × H)</div>
              <div><span style={{ color: "#FFBF00" }}>largura</span>  = (x_max - x_min) / W</div>
              <div><span style={{ color: "#FFBF00" }}>altura</span>   = (y_max - y_min) / H</div>
              <div style={{ marginTop: 8, color: "#6b7280" }}># Exemplo: ovino saudável no centro da imagem</div>
              <div><span style={{ color: "#6082B6" }}>0</span>  0.512  0.488  0.340  0.420</div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 16 }}>
              {[
                { nome: "Roboflow (Nuvem)", icon: "☁️", desc: "Crie um projeto, faça upload das fotos, anote com o mouse e exporte em formato YOLOv8 PyTorch. Gratuito até 10k imagens.", url: "https://roboflow.com" },
                { nome: "Label Studio (Local)", icon: "🖥️", desc: "Open-source, instala via pip install label-studio. Ideal quando as imagens não podem sair da fazenda por questões de privacidade.", url: "https://labelstud.io" },
              ].map(f => (
                <div key={f.nome} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
                  <div style={{ fontSize: 22, marginBottom: 8 }}>{f.icon}</div>
                  <div style={{ fontWeight: 700, fontSize: 14, color: "#111827", marginBottom: 6 }}>{f.nome}</div>
                  <p style={{ margin: "0 0 10px", fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>{f.desc}</p>
                  <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: "#15803d", fontWeight: 600, textDecoration: "none" }}>Acessar →</a>
                </div>
              ))}
            </div>
          </section>

          {/* ── SEÇÃO 06: Diagnóstico ─────────────────────────────────────── */}
          <section id="diagnostico" style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, borderBottom: "2px solid #e5e7eb", paddingBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase" }}>06</span>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>Diagnósticos Veterinários</h2>
              <button onClick={() => copiarLink("diagnostico")} title="Copiar link" style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, padding: "0 4px" }}>🔗</button>
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginBottom: 10 }}>Método FAMACHA — Grau de Anemia</h3>
            <div style={{ overflowX: "auto", marginBottom: 24 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {["Grau", "Cor da Mucosa", "Diagnóstico", "Ação do Sistema"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: "2px solid #e5e7eb", fontWeight: 600, color: "#374151" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { grau: "1", cor: "Vermelho vivo", diag: "Sem anemia", acao: "Monitoramento normal", bg: "#f0fdf4", tc: "#15803d" },
                    { grau: "2", cor: "Rosa avermelhado", diag: "Leve", acao: "Registrar e monitorar", bg: "#f0fdf4", tc: "#15803d" },
                    { grau: "3", cor: "Rosa pálido", diag: "Moderado", acao: "Alerta — avaliar tratamento", bg: "#fef3c7", tc: "#92400e" },
                    { grau: "4", cor: "Rosa muito pálido", diag: "Grave", acao: "Tratamento imediato", bg: "#fef2f2", tc: "#dc2626" },
                    { grau: "5", cor: "Branco / Cinza", diag: "Crítico", acao: "Emergência veterinária", bg: "#fef2f2", tc: "#dc2626" },
                  ].map(r => (
                    <tr key={r.grau} style={{ background: r.bg }}>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", fontWeight: 700, color: r.tc }}>Grau {r.grau}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{r.cor}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{r.diag}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: r.tc, fontWeight: 600 }}>{r.acao}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <h3 style={{ fontSize: 15, fontWeight: 700, color: "#374151", marginBottom: 10 }}>Pododermatite — Grau de Lesão nos Cascos</h3>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {["Grau", "Sinais Clínicos", "Alerta do Sistema"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: "2px solid #e5e7eb", fontWeight: 600, color: "#374151" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[
                    { grau: "0", sinais: "Casco íntegro, sem lesão", alerta: "Normal", bg: "#f0fdf4", tc: "#15803d" },
                    { grau: "1", sinais: "Leve vermelhidão ou maciez", alerta: "Monitorar", bg: "#f0fdf4", tc: "#15803d" },
                    { grau: "2", sinais: "Erosão superficial, claudicação leve", alerta: "Agendar inspeção", bg: "#fef3c7", tc: "#92400e" },
                    { grau: "3", sinais: "Úlcera profunda, claudicação evidente", alerta: "Tratamento urgente", bg: "#fef2f2", tc: "#dc2626" },
                    { grau: "4", sinais: "Necrose, separação da parede do casco", alerta: "⚠️ Emergência", bg: "#fef2f2", tc: "#dc2626" },
                  ].map(r => (
                    <tr key={r.grau} style={{ background: r.bg }}>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", fontWeight: 700, color: r.tc }}>Grau {r.grau}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{r.sinais}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: r.tc, fontWeight: 600 }}>{r.alerta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── SEÇÃO 07: Hardware ────────────────────────────────────────── */}
          <section id="hardware" style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, borderBottom: "2px solid #e5e7eb", paddingBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase" }}>07</span>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>Hardware de Campo (Edge Computing)</h2>
              <button onClick={() => copiarLink("hardware")} title="Copiar link" style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, padding: "0 4px" }}>🔗</button>
            </div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ background: "#f9fafb" }}>
                    {["Dispositivo", "CPU/GPU", "RAM", "FPS (YOLOv8n)", "Consumo", "Preço (aprox.)", "Uso Ideal"].map(h => (
                      <th key={h} style={{ padding: "10px 12px", textAlign: "left", borderBottom: "2px solid #e5e7eb", fontWeight: 600, color: "#374151", whiteSpace: "nowrap" }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {HARDWARE.map((h, i) => (
                    <tr key={h.device} style={{ background: h.rec ? "#f0fdf4" : i % 2 === 0 ? "#fff" : "#f9fafb" }}>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", fontWeight: 700, color: "#111827", whiteSpace: "nowrap" }}>
                        {h.device} {h.rec && <span style={{ background: "#16a34a", color: "#fff", fontSize: 10, padding: "2px 6px", borderRadius: 4, marginLeft: 4 }}>Recomendado</span>}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{h.cpu}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{h.ram}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{h.fps}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{h.consumo}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{h.preco}</td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f3f4f6", color: "#374151" }}>{h.uso}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* ── SEÇÃO 08: FAQ ─────────────────────────────────────────────── */}
          <section id="faq" style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, borderBottom: "2px solid #e5e7eb", paddingBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase" }}>08</span>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>Perguntas Frequentes</h2>
              <button onClick={() => copiarLink("faq")} title="Copiar link" style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, padding: "0 4px" }}>🔗</button>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {FAQ.map((item, i) => (
                <div key={i} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
                  <button
                    onClick={() => setFaqAberto(faqAberto === i ? null : i)}
                    style={{
                      width: "100%", padding: "14px 16px", display: "flex", alignItems: "center", gap: 12,
                      background: "none", border: "none", cursor: "pointer", textAlign: "left",
                    }}>
                    <span style={{ background: "#f0fdf4", color: "#15803d", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6, whiteSpace: "nowrap" }}>Q{String(i + 1).padStart(2, "0")}</span>
                    <span style={{ fontWeight: 600, fontSize: 14, color: "#111827", flex: 1 }}>{item.q}</span>
                    <span style={{ color: "#9ca3af", fontSize: 18, transform: faqAberto === i ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>⌄</span>
                  </button>
                  {faqAberto === i && (
                    <div style={{ padding: "0 16px 16px 52px", fontSize: 14, color: "#4b5563", lineHeight: 1.7 }}>
                      {item.a}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ── SEÇÃO 09: Glossário ───────────────────────────────────────── */}
          <section id="glossario" style={{ marginBottom: 40 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16, borderBottom: "2px solid #e5e7eb", paddingBottom: 10 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: "#9ca3af", letterSpacing: 2, textTransform: "uppercase" }}>09</span>
              <h2 style={{ margin: 0, fontSize: 22, fontWeight: 700, color: "#111827" }}>Glossário Técnico</h2>
              <button onClick={() => copiarLink("glossario")} title="Copiar link" style={{ background: "none", border: "none", cursor: "pointer", color: "#9ca3af", fontSize: 16, padding: "0 4px" }}>🔗</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 12 }}>
              {GLOSSARIO.map(g => (
                <div key={g.termo} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 10, padding: 16 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <span style={{ background: "#f0fdf4", color: "#15803d", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>{g.abrev}</span>
                    <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>{g.termo}</span>
                  </div>
                  <p style={{ margin: 0, fontSize: 13, color: "#4b5563", lineHeight: 1.6 }}>{g.def}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Rodapé da seção */}
          <div style={{ borderTop: "1px solid #e5e7eb", paddingTop: 24, marginTop: 8, display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
            <div style={{ fontSize: 12, color: "#9ca3af" }}>
              {secoes.length} seções · {FAQ.length} perguntas · {GLOSSARIO.length} termos
            </div>
            <button
              onClick={() => window.print()}
              style={{ background: "#15803d", color: "#fff", border: "none", borderRadius: 8, padding: "10px 20px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
              📄 Exportar como PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
