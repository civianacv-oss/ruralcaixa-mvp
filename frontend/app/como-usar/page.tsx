"use client";
import { useState } from "react";

const WHATSAPP_BOT = "+55 (98) 99200-2705";

type Tab = "telegram" | "importacao";

export default function ComoUsarPage() {
  const [tab, setTab] = useState<Tab>("telegram");

  const s = {
    page: { maxWidth: 720, margin: "0 auto", padding: "32px 20px" } as React.CSSProperties,
    h1: { fontSize: 22, fontWeight: 500, color: "#1a2e1a", marginBottom: 6 } as React.CSSProperties,
    sub: { fontSize: 14, color: "#6a7a6a", marginBottom: 28 } as React.CSSProperties,
    tabs: { display: "flex", gap: 8, marginBottom: 24 } as React.CSSProperties,
    tab: (active: boolean): React.CSSProperties => ({
      padding: "8px 18px", borderRadius: 10, fontSize: 14, fontWeight: 500,
      cursor: "pointer", border: "1.5px solid",
      borderColor: active ? "#2a5a2a" : "#ddd",
      background: active ? "#f0f8ea" : "#fff",
      color: active ? "#2a5a2a" : "#6a7a6a",
    }),
    section: { marginBottom: 28 } as React.CSSProperties,
    sectionTitle: { fontSize: 12, fontWeight: 600, color: "#8a9a8a", letterSpacing: "0.06em", textTransform: "uppercase" as const, marginBottom: 12 },
    card: { background: "#fff", border: "1px solid #e8e0d0", borderRadius: 12, padding: "16px 20px", marginBottom: 10 } as React.CSSProperties,
    step: { display: "flex", gap: 14, alignItems: "flex-start" } as React.CSSProperties,
    num: { width: 28, height: 28, borderRadius: "50%", background: "#e8f5e8", color: "#2a5a2a", fontSize: 13, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 } as React.CSSProperties,
    stepTitle: { fontSize: 14, fontWeight: 600, color: "#1a2e1a", marginBottom: 3 } as React.CSSProperties,
    stepDesc: { fontSize: 13, color: "#5a6a5a", lineHeight: 1.6 } as React.CSSProperties,
    code: { background: "#f0f4f0", border: "1px solid #d8e0d8", borderRadius: 5, padding: "1px 6px", fontFamily: "monospace", fontSize: 12, color: "#1a2e1a" } as React.CSSProperties,
    tip: { background: "#f0f8ea", border: "1px solid #c8e0b8", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#2a5a2a", marginTop: 10 } as React.CSSProperties,
    warn: { background: "#fff8e1", border: "1px solid #ffe082", borderRadius: 8, padding: "10px 14px", fontSize: 13, color: "#7a5a00", marginTop: 10 } as React.CSSProperties,
    cmdRow: { display: "flex", gap: 10, alignItems: "flex-start", marginBottom: 8 } as React.CSSProperties,
    cmdTag: { background: "#f0f4f0", border: "1px solid #d0d8d0", borderRadius: 6, padding: "2px 8px", fontFamily: "monospace", fontSize: 12, color: "#1a2e1a", whiteSpace: "nowrap" as const, flexShrink: 0 },
    cmdDesc: { fontSize: 13, color: "#5a6a5a", lineHeight: 1.5 } as React.CSSProperties,
    divider: { border: "none", borderTop: "1px solid #e8e0d0", margin: "20px 0" } as React.CSSProperties,
  };

  return (
    <div style={s.page}>
      <h1 style={s.h1}>Como usar o RuralCaixa</h1>
      <p style={s.sub}>Guia rápido para lançar despesas, criar contratos e importar dados históricos.</p>

      <div style={s.tabs}>
        {(["telegram", "importacao"] as Tab[]).map(t => (
          <button key={t} style={s.tab(tab === t)} onClick={() => setTab(t)}>
            {t === "telegram" ? "📱 Telegram / WhatsApp" : "📂 Importação de dados"}
          </button>
        ))}
      </div>

      {tab === "telegram" && (
        <>
          <div style={s.section}>
            <div style={s.sectionTitle}>Primeiro acesso</div>
            {[
              { n: "1", title: "Abra o Telegram e inicie o bot", desc: <>Pesquise pelo bot do RuralCaixa ou use o número <span style={s.code}>{WHATSAPP_BOT}</span> no WhatsApp.</> },
              { n: "2", title: "Envie CADASTRAR", desc: "O bot pede nome, CPF e telefone. Responda uma informação por mensagem." },
              { n: "3", title: "Guarde seu token", desc: <>Após o cadastro o bot envia um código <span style={s.code}>rc_...</span>. Use-o para acessar o app web.</> },
            ].map(item => (
              <div key={item.n} style={s.card}>
                <div style={s.step}>
                  <div style={s.num}>{item.n}</div>
                  <div>
                    <div style={s.stepTitle}>{item.title}</div>
                    <div style={s.stepDesc}>{item.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <hr style={s.divider} />

          <div style={s.section}>
            <div style={s.sectionTitle}>Lançar despesas e receitas</div>
            <div style={s.card}>
              <div style={{ ...s.stepDesc, marginBottom: 12 }}>Basta digitar em linguagem natural:</div>
              {[
                ["comprei ração 350 reais", "lança despesa de R$ 350"],
                ["vendi 5 bois por 12000", "lança receita de R$ 12.000"],
                ["recebi arrendamento 800", "lança receita de arrendamento"],
              ].map(([cmd, desc]) => (
                <div key={cmd} style={s.cmdRow}>
                  <span style={s.cmdTag}>{cmd}</span>
                  <span style={s.cmdDesc}>{desc}</span>
                </div>
              ))}
              <div style={s.tip}>📸 Também funciona enviando uma foto de nota fiscal — o sistema extrai os dados automaticamente.</div>
            </div>
          </div>

          <hr style={s.divider} />

          <div style={s.section}>
            <div style={s.sectionTitle}>Criar contrato rural</div>
            <div style={s.card}>
              <div style={{ ...s.stepDesc, marginBottom: 12 }}>
                Digite <span style={s.code}>contrato</span> e siga o diálogo:
              </div>
              {[
                ["1", "Tipo: Agrícola, Pecuária, Condomínio…"],
                ["2", "Data de início (ex: 01/01/2026)"],
                ["3", "Condôminos: Nome, CPF, % — um por mensagem, depois /fim"],
                ["4", "Confirme com SIM — link de assinatura enviado"],
              ].map(([n, desc]) => (
                <div key={n} style={{ ...s.cmdRow, marginBottom: 6 }}>
                  <span style={{ fontSize: 13, color: "#8a9a8a", width: 20, flexShrink: 0 }}>{n}</span>
                  <span style={s.cmdDesc}>{desc}</span>
                </div>
              ))}
            </div>
          </div>

          <hr style={s.divider} />

          <div style={s.section}>
            <div style={s.sectionTitle}>Comandos úteis</div>
            <div style={s.card}>
              {[
                ["/saldo", "resumo do mês: receitas, despesas e saldo"],
                ["/ajuda", "lista todos os comandos disponíveis"],
                ["contratos", "inicia criação de contrato"],
                ["rebanho", "resumo dos animais cadastrados"],
              ].map(([cmd, desc]) => (
                <div key={cmd} style={s.cmdRow}>
                  <span style={s.cmdTag}>{cmd}</span>
                  <span style={s.cmdDesc}>{desc}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === "importacao" && (
        <>
          <div style={s.section}>
            <div style={s.sectionTitle}>Preparar a planilha</div>
            <div style={s.card}>
              <div style={{ ...s.stepDesc, marginBottom: 12 }}>
                O sistema aceita <strong>Excel (.xlsx)</strong>, <strong>CSV</strong> e <strong>extrato bancário (.OFX)</strong>. Colunas necessárias para lançamentos:
              </div>
              {[
                ["data", "qualquer formato — 01/01/2026 ou 2026-01-01"],
                ["descrição", "o que foi a transação"],
                ["valor", "número positivo — tipo detectado automaticamente"],
                ["tipo", "opcional — receita ou despesa"],
              ].map(([col, desc]) => (
                <div key={col} style={s.cmdRow}>
                  <span style={s.cmdTag}>{col}</span>
                  <span style={s.cmdDesc}>{desc}</span>
                </div>
              ))}
              <div style={s.tip}>💡 Nomes aproximados funcionam: "DT", "VL", "Histórico" — o sistema mapeia automaticamente.</div>
            </div>
          </div>

          <hr style={s.divider} />

          <div style={s.section}>
            <div style={s.sectionTitle}>Passo a passo</div>
            {[
              { n: "1", title: "Acesse Importação no menu lateral", desc: "Escolha o tipo: Lançamentos ou Rebanho." },
              { n: "2", title: "Faça upload do arquivo", desc: "Arraste ou clique para selecionar. O sistema detecta colunas e mostra preview das 10 primeiras linhas." },
              { n: "3", title: "Confirme o mapeamento", desc: "Verifique se cada coluna foi mapeada corretamente. Ajuste se necessário." },
              { n: "4", title: "Importe", desc: "Clique em Confirmar. O sistema mostra quantos registros foram importados, alertas e erros." },
            ].map(item => (
              <div key={item.n} style={s.card}>
                <div style={s.step}>
                  <div style={s.num}>{item.n}</div>
                  <div>
                    <div style={s.stepTitle}>{item.title}</div>
                    <div style={s.stepDesc}>{item.desc}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <hr style={s.divider} />

          <div style={s.section}>
            <div style={s.sectionTitle}>Importar rebanho</div>
            <div style={s.card}>
              <div style={{ ...s.stepDesc, marginBottom: 12 }}>Colunas para importar animais:</div>
              {[
                ["brinco", "identificação do animal (obrigatório)"],
                ["espécie", "bovino, ovino, caprino ou suíno"],
                ["raça", "opcional — Nelore, Girolando, etc."],
                ["data nascimento", "opcional — ativa alertas automáticos"],
                ["peso", "opcional — em kg"],
              ].map(([col, desc]) => (
                <div key={col} style={s.cmdRow}>
                  <span style={s.cmdTag}>{col}</span>
                  <span style={s.cmdDesc}>{desc}</span>
                </div>
              ))}
              <div style={s.warn}>⚠️ Se mais de 20% dos registros tiverem erro, a importação é cancelada. Corrija a planilha e tente novamente.</div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
