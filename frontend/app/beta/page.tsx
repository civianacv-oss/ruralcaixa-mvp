"use client";
import React from "react";
// frontend/app/beta/page.tsx — RuralCaixa MVP
// Página pública de apresentação para testadores.

const WHATSAPP_NUM = "5598930223992";
const WHATSAPP_LINK = `https://wa.me/${WHATSAPP_NUM}`;
const APP_URL = "https://ruralcaixa-mvp.vercel.app";

const ST: React.CSSProperties = {
  fontFamily: "'DM Sans', system-ui, sans-serif",
  color: "#1a2e1a",
};

function Section({ children, bg = "#fff" }: { children: React.ReactNode; bg?: string }) {
  return (
    <section style={{ background: bg, padding: "56px 24px" }}>
      <div style={{ maxWidth: 760, margin: "0 auto" }}>{children}</div>
    </section>
  );
}

function Tag({ children, color = "#4a7a3a" }: { children: React.ReactNode; color?: string }) {
  return (
    <span style={{
      background: color + "22", color, border: `1px solid ${color}44`,
      padding: "3px 10px", borderRadius: 20, fontSize: 12, fontWeight: 600,
    }}>{children}</span>
  );
}

export default function BetaPage() {
  return (
    <div style={ST}>

      {/* HERO */}
      <section style={{
        background: "linear-gradient(135deg, #1a2e1a 0%, #2a5a2a 60%, #3a7a3a 100%)",
        padding: "72px 24px 64px", textAlign: "center", color: "#e8f5e8",
      }}>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div style={{ fontSize: 52, marginBottom: 12 }}>🌾</div>
          <Tag color="#a0d890">BETA v0.1</Tag>
          <h1 style={{ fontSize: 36, fontWeight: 800, margin: "16px 0 12px", color: "#fff", lineHeight: 1.2 }}>
            RuralCaixa
          </h1>
          <p style={{ fontSize: 17, color: "#b0d8b0", marginBottom: 32, lineHeight: 1.6 }}>
            Gestão financeira e de rebanho para o produtor rural.<br />
            Simples como mandar uma mensagem no WhatsApp.
          </p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
            <a href={APP_URL} style={{
              background: "#4a9a3a", color: "#fff", textDecoration: "none",
              padding: "14px 28px", borderRadius: 12, fontWeight: 700, fontSize: 15,
            }}>
              Acessar o app →
            </a>
            <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" style={{
              background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.3)",
              color: "#fff", textDecoration: "none",
              padding: "14px 28px", borderRadius: 12, fontWeight: 600, fontSize: 15,
            }}>
              💬 Falar com Cícero
            </a>
          </div>
        </div>
      </section>

      {/* O QUE É */}
      <Section bg="#f5f0e8">
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "center" }}>
          <div>
            <Tag>O que é</Tag>
            <h2 style={{ fontSize: 26, fontWeight: 700, margin: "12px 0 16px" }}>
              Chega de planilha perdida no celular
            </h2>
            <p style={{ fontSize: 15, color: "#4a5a4a", lineHeight: 1.7, marginBottom: 16 }}>
              O produtor rural brasileiro controla receitas, despesas, rebanho e contratos
              em planilhas de Excel espalhadas ou no caderno. Quando precisa do saldo,
              soma na mão. Quando o contador pede o histórico, não encontra.
            </p>
            <p style={{ fontSize: 15, color: "#4a5a4a", lineHeight: 1.7 }}>
              O <strong>RuralCaixa</strong> resolve isso: você manda uma foto da nota fiscal
              pelo WhatsApp e o sistema lança automaticamente. Rebanho, contratos,
              LCDPR e DRE — tudo no mesmo lugar.
            </p>
          </div>
          <div style={{
            background: "#1a2e1a", borderRadius: 16, padding: 24, color: "#e8f5e8",
          }}>
            <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 16 }}>📊 Painel RuralCaixa</div>
            {[
              { label: "💰 Receitas do mês", val: "R$ 48.320,00", color: "#4a9a3a" },
              { label: "💸 Despesas do mês", val: "R$ 21.840,00", color: "#e05a5a" },
              { label: "📋 Saldo", val: "R$ 26.480,00", color: "#a0d890" },
              { label: "🐄 Animais ativos", val: "342 cabeças", color: "#7ab0ea" },
            ].map(item => (
              <div key={item.label} style={{
                display: "flex", justifyContent: "space-between", alignItems: "center",
                padding: "10px 0", borderBottom: "1px solid rgba(255,255,255,0.08)",
              }}>
                <span style={{ fontSize: 13, opacity: 0.8 }}>{item.label}</span>
                <span style={{ fontSize: 15, fontWeight: 700, color: item.color }}>{item.val}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* COMO ACESSAR */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <Tag>Como acessar</Tag>
          <h2 style={{ fontSize: 26, fontWeight: 700, margin: "12px 0 8px" }}>4 passos para entrar</h2>
          <p style={{ fontSize: 14, color: "#6a7a6a" }}>Leva menos de 2 minutos</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 16 }}>
          {[
            { n: "1", icon: "🌐", titulo: "Acesse o app", desc: `Abra ${APP_URL} no seu celular ou computador` },
            { n: "2", icon: "📱", titulo: "Digite seu CPF", desc: "Na tela de login, informe seu CPF cadastrado" },
            { n: "3", icon: "💬", titulo: "Receba o código", desc: "Um código de 6 dígitos chega pelo WhatsApp ou Telegram em segundos" },
            { n: "4", icon: "✅", titulo: "Entre no sistema", desc: "Digite o código e explore todas as funcionalidades" },
          ].map(step => (
            <div key={step.n} style={{
              background: "#faf8f4", border: "1.5px solid #e8e0d0",
              borderRadius: 14, padding: 20, display: "flex", gap: 16, alignItems: "flex-start",
            }}>
              <div style={{
                width: 36, height: 36, borderRadius: "50%", background: "#1a2e1a",
                color: "#fff", display: "flex", alignItems: "center", justifyContent: "center",
                fontSize: 15, fontWeight: 700, flexShrink: 0,
              }}>{step.n}</div>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{step.icon} {step.titulo}</div>
                <div style={{ fontSize: 13, color: "#6a7a6a", lineHeight: 1.5 }}>{step.desc}</div>
              </div>
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 28 }}>
          <p style={{ fontSize: 13, color: "#8a9a8a", marginBottom: 12 }}>
            Ainda não tem cadastro? Fale com Cícero para ser adicionado como testador.
          </p>
          <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            background: "#25D366", color: "#fff", textDecoration: "none",
            padding: "12px 24px", borderRadius: 10, fontWeight: 700, fontSize: 14,
          }}>
            <span>📲</span> Abrir WhatsApp — +55 (98) 3022-3992
          </a>
        </div>
      </Section>

      {/* O QUE TESTAR */}
      <Section bg="#f5f0e8">
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <Tag>O que testar</Tag>
          <h2 style={{ fontSize: 26, fontWeight: 700, margin: "12px 0 8px" }}>Funcionalidades disponíveis</h2>
          <p style={{ fontSize: 14, color: "#6a7a6a" }}>Foco nos fluxos mais críticos para o produtor rural</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
          {[
            { status: "✅", titulo: "Lançamentos via WhatsApp/Telegram", desc: "Envie texto, áudio ou foto de nota fiscal" },
            { status: "✅", titulo: "OCR de documentos fiscais", desc: "NF-e, cupom fiscal e PDF — classificação automática" },
            { status: "✅", titulo: "Dashboard financeiro", desc: "Saldo, DRE gerencial, receitas e despesas por período" },
            { status: "✅", titulo: "Importação de planilha", desc: "Excel, CSV ou extrato OFX com mapeamento automático" },
            { status: "✅", titulo: "Contratos rurais", desc: "Parceria agrícola, pecuária e condomínio com assinatura digital" },
            { status: "✅", titulo: "Gestão de rebanho", desc: "Bovino, ovino, caprino e suíno com alertas automáticos" },
            { status: "✅", titulo: "Criação de contrato via chat", desc: "Descreva o contrato em texto e o sistema gera automaticamente" },
            { status: "🔄", titulo: "Extrato bancário OFX", desc: "Em breve — importação direta do extrato do banco" },
            { status: "🔄", titulo: "Integração CAEPF / Receita Federal", desc: "Em breve — fase 2 do produto" },
          ].map(f => (
            <div key={f.titulo} style={{
              background: "#fff", border: "1px solid #e8e0d0",
              borderRadius: 12, padding: "14px 16px",
              opacity: f.status === "🔄" ? 0.65 : 1,
            }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <span style={{ fontSize: 16, flexShrink: 0 }}>{f.status}</span>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 3 }}>{f.titulo}</div>
                  <div style={{ fontSize: 12, color: "#6a7a6a" }}>{f.desc}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* COMO REPORTAR */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <Tag color="#e05a5a">Como reportar</Tag>
          <h2 style={{ fontSize: 26, fontWeight: 700, margin: "12px 0 8px" }}>Encontrou um problema?</h2>
          <p style={{ fontSize: 14, color: "#6a7a6a" }}>Todo bug reportado vira uma melhoria. Obrigado por ajudar!</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
          {[
            {
              icon: "🐛", titulo: "Dentro do app",
              desc: 'Clique em "Reportar problema" na barra beta no topo de qualquer página',
              destaque: true,
            },
            {
              icon: "💬", titulo: "WhatsApp",
              desc: "Mande mensagem diretamente para o número do sistema: +55 (98) 3022-3992",
              link: WHATSAPP_LINK, linkLabel: "Abrir WhatsApp",
            },
            {
              icon: "📧", titulo: "Telegram (em breve)",
              desc: "Grupo de testadores em criação. Use o app ou WhatsApp por enquanto.",
            },
          ].map(item => (
            <div key={item.titulo} style={{
              background: item.destaque ? "#1a2e1a" : "#faf8f4",
              border: item.destaque ? "none" : "1.5px solid #e8e0d0",
              borderRadius: 14, padding: 22, textAlign: "center",
              color: item.destaque ? "#e8f5e8" : "#1a2e1a",
            }}>
              <div style={{ fontSize: 32, marginBottom: 12 }}>{item.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 8 }}>{item.titulo}</div>
              <div style={{ fontSize: 12, lineHeight: 1.6, opacity: 0.8, marginBottom: item.link ? 12 : 0 }}>{item.desc}</div>
              {item.link && (
                <a href={item.link} target="_blank" rel="noopener noreferrer" style={{
                  display: "inline-block", background: "#25D366", color: "#fff",
                  textDecoration: "none", padding: "7px 16px", borderRadius: 8,
                  fontSize: 12, fontWeight: 600,
                }}>{item.linkLabel}</a>
              )}
            </div>
          ))}
        </div>
        <div style={{
          marginTop: 24, background: "#fff8e1", border: "1px solid #ffe082",
          borderRadius: 12, padding: "16px 20px", fontSize: 13, color: "#7a5a00",
        }}>
          <strong>Priorize reportar:</strong> bugs que impedem uso (tela branca, erro 500),
          fluxos confusos (não entendeu o que fazer), dados incorretos (valor errado, animal duplicado)
          e sugestões de melhoria.
        </div>
      </Section>

      {/* CONTATO */}
      <Section bg="#f5f0e8">
        <div style={{ display: "flex", gap: 32, alignItems: "center", flexWrap: "wrap" }}>
          <div style={{
            width: 80, height: 80, borderRadius: "50%",
            background: "linear-gradient(135deg, #2a5a2a, #4a9a3a)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 36, flexShrink: 0,
          }}>🧑‍🌾</div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700, fontSize: 20, marginBottom: 4 }}>Cícero — Produto</div>
            <div style={{ fontSize: 14, color: "#4a5a4a", lineHeight: 1.6, marginBottom: 16 }}>
              Desenvolvendo o RuralCaixa para simplificar a gestão do produtor rural brasileiro.
              Estou disponível para tirar dúvidas, ouvir sugestões e ajudar no que precisar durante o beta.
            </div>
            <a href={WHATSAPP_LINK} target="_blank" rel="noopener noreferrer" style={{
              display: "inline-flex", alignItems: "center", gap: 8,
              background: "#25D366", color: "#fff", textDecoration: "none",
              padding: "10px 20px", borderRadius: 10, fontWeight: 700, fontSize: 13,
            }}>
              📲 Falar comigo no WhatsApp
            </a>
            <span style={{ fontSize: 12, color: "#8a9a8a", marginLeft: 12 }}>Resposta em até 2h</span>
          </div>
        </div>
      </Section>


      {/* SEÇÃO: COMO USAR */}
      <Section>
        <div style={{ textAlign: "center", marginBottom: 36 }}>
          <Tag color="#2a5a2a">Como usar</Tag>
          <h2 style={{ fontSize: 26, fontWeight: 700, margin: "12px 0 8px" }}>Guia rápido para testadores</h2>
          <p style={{ fontSize: 14, color: "#6a7a6a" }}>Telegram, importação de dados e criação de contratos</p>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          {[
            { icon: "📱", titulo: "Lançamentos via chat", itens: ["Digite 'comprei ração 350' no Telegram", "Envie foto de nota fiscal para OCR automático", "Responda SIM para confirmar o lançamento"] },
            { icon: "📋", titulo: "Criar contrato", itens: ["Digite 'contrato' no Telegram", "Escolha o tipo: Agrícola, Pecuária, Condomínio", "Informe condôminos com Nome, CPF, % e /fim"] },
            { icon: "📂", titulo: "Importar planilha", itens: ["Acesse Importação no menu do app", "Envie Excel, CSV ou OFX", "Confirme o mapeamento de colunas e importe"] },
            { icon: "💬", titulo: "Comandos úteis", itens: ["/saldo — resumo financeiro do mês", "/ajuda — lista todos os comandos", "rebanho — resumo dos animais"] },
          ].map(item => (
            <div key={item.titulo} style={{ background: "#faf8f4", border: "1.5px solid #e8e0d0", borderRadius: 14, padding: 20 }}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>{item.icon}</div>
              <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 10, color: "#1a2e1a" }}>{item.titulo}</div>
              {item.itens.map(it => (
                <div key={it} style={{ fontSize: 12, color: "#5a6a5a", marginBottom: 4, display: "flex", gap: 6 }}>
                  <span style={{ color: "#4a9a3a", flexShrink: 0 }}>→</span>{it}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div style={{ textAlign: "center", marginTop: 28 }}>
          <a href="/como-usar" style={{ display: "inline-block", background: "#1a2e1a", color: "#fff", textDecoration: "none", padding: "12px 28px", borderRadius: 10, fontWeight: 600, fontSize: 14 }}>
            Ver guia completo →
          </a>
        </div>
      </Section>

      {/* FOOTER */}
      <footer style={{
        background: "#1a2e1a", color: "#7a9a6a",
        padding: "24px", textAlign: "center", fontSize: 12,
      }}>
        <div style={{ marginBottom: 6 }}>
          <strong style={{ color: "#e8f5e8" }}>RuralCaixa</strong> — Gestão Rural Inteligente
        </div>
        <div>Beta v0.1 · 2026 · ruralcaixa.app.br</div>
        <div style={{ marginTop: 8 }}>
          <a href={APP_URL} style={{ color: "#7a9a6a", marginRight: 16 }}>Acessar o app</a>
          <a href="/privacidade" style={{ color: "#7a9a6a" }}>Privacidade</a>
        </div>
      </footer>
    </div>
  );
}
