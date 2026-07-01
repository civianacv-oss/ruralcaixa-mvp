/**
 * alertasEstoque.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Serviço de alertas automáticos de estoque via Telegram.
 *
 * Fluxo:
 *   1. Job agendado chama POST /api/scheduled/alertas-estoque
 *   2. Para cada produtor com alertas ativos, busca insumos críticos/atenção
 *   3. Verifica cooldown (não notifica se já enviou dentro do período configurado)
 *   4. Formata mensagem e envia via Telegram (direto ou grupo)
 *   5. Registra log do envio
 */

import { getDb } from "./db";
import {
  alertasEstoqueLog,
  alertasEstoqueConfig,
  produtorConfig,
  produtorImovel,
} from "../drizzle/schema";
import { eq, and, gte, desc } from "drizzle-orm";
import { RAILWAY_API } from "./railwayProxy";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface InsumoAlerta {
  id: number;
  nome: string;
  categoria: string;
  estoque_atual: number;
  estoque_minimo: number;
  unidade: string;
  status_estoque: "critico" | "baixo" | "atencao" | "ok";
  fornecedor_nome?: string;
}

interface AlertaResult {
  produtorId: number;
  imovelId: number;
  enviado: boolean;
  canal?: string;
  motivo?: string;
}

// ─── Funções de envio Telegram ────────────────────────────────────────────────

/**
 * Envia mensagem direta para o chat_id do produtor.
 */
async function sendTelegramDirect(
  telegramChatId: string,
  mensagem: string
): Promise<boolean> {
  try {
    const res = await fetch(`${RAILWAY_API}/telegram/mensagem-direta`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        telegram_chat_id: telegramChatId,
        mensagem,
        parse_mode: "Markdown",
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Envia alerta genérico para o grupo do Telegram (fallback).
 */
async function sendTelegramGroup(mensagem: string): Promise<boolean> {
  try {
    const res = await fetch(`${RAILWAY_API}/telegram/alerta/generico`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mensagem, parse_mode: "Markdown" }),
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── Formatação da mensagem ───────────────────────────────────────────────────

function formatarMensagem(
  imovelNome: string,
  criticos: InsumoAlerta[],
  atencao: InsumoAlerta[]
): string {
  const dataHora = new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const linhas: string[] = [];

  if (criticos.length > 0) {
    linhas.push("🟥 *URGENTE — Reposição imediata:*");
    for (const ins of criticos.slice(0, 8)) {
      const fornecedor = ins.fornecedor_nome ? ` · ${ins.fornecedor_nome}` : " · ⚠️ Sem fornecedor";
      linhas.push(
        `  • *${ins.nome}* — ${ins.estoque_atual} ${ins.unidade} (mín: ${ins.estoque_minimo})${fornecedor}`
      );
    }
    if (criticos.length > 8) {
      linhas.push(`  _...e mais ${criticos.length - 8} item(ns)_`);
    }
  }

  if (atencao.length > 0) {
    if (linhas.length > 0) linhas.push("");
    linhas.push("🟧 *ATENÇÃO — Estoque baixo:*");
    for (const ins of atencao.slice(0, 5)) {
      linhas.push(
        `  • *${ins.nome}* — ${ins.estoque_atual} ${ins.unidade} (mín: ${ins.estoque_minimo})`
      );
    }
    if (atencao.length > 5) {
      linhas.push(`  _...e mais ${atencao.length - 5} item(ns)_`);
    }
  }

  return [
    `⚠️ *Alerta de Estoque — ${imovelNome}*`,
    "",
    ...linhas,
    "",
    `👉 [Abrir RuralCaixa](https://ruralcaixa.vercel.app/insumos)`,
    "",
    `_${dataHora}_`,
  ].join("\n");
}

// ─── Verificação de cooldown ──────────────────────────────────────────────────

async function verificarCooldown(
  produtorId: number,
  imovelId: number,
  cooldownHoras: number
): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;

  const limite = new Date(Date.now() - cooldownHoras * 60 * 60 * 1000);

  const ultimoLog = await db
    .select()
    .from(alertasEstoqueLog)
    .where(
      and(
        eq(alertasEstoqueLog.produtorId, produtorId),
        eq(alertasEstoqueLog.imovelId, imovelId),
        eq(alertasEstoqueLog.status, "enviado"),
        gte(alertasEstoqueLog.criadoEm, limite)
      )
    )
    .orderBy(desc(alertasEstoqueLog.criadoEm))
    .limit(1);

  return ultimoLog.length > 0; // true = ainda em cooldown
}

// ─── Registrar log ────────────────────────────────────────────────────────────

async function registrarLog(params: {
  imovelId: number;
  produtorId: number;
  totalCriticos: number;
  totalAtencao: number;
  canal: string;
  status: "enviado" | "falhou" | "ignorado";
  erro?: string;
}): Promise<void> {
  const db = await getDb();
  if (!db) return;
  await db.insert(alertasEstoqueLog).values(params);
}

// ─── Buscar insumos com alerta via Railway API ────────────────────────────────

async function buscarInsumosAlerta(
  imovelId: number,
  railwayToken?: string | null
): Promise<{ criticos: InsumoAlerta[]; atencao: InsumoAlerta[] }> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (railwayToken) {
      headers["Authorization"] = `Bearer ${railwayToken}`;
    }

    const res = await fetch(
      `${RAILWAY_API}/insumos/alertas?imovel_id=${imovelId}`,
      { headers }
    );

    if (!res.ok) return { criticos: [], atencao: [] };

    const alertas: InsumoAlerta[] = await res.json();
    const criticos = alertas.filter((a) => a.status_estoque === "critico");
    const atencao = alertas.filter(
      (a) => a.status_estoque === "baixo" || a.status_estoque === "atencao"
    );

    return { criticos, atencao };
  } catch {
    return { criticos: [], atencao: [] };
  }
}

// ─── Buscar nome do imóvel ────────────────────────────────────────────────────

async function buscarNomeImovel(
  imovelId: number,
  railwayToken?: string | null
): Promise<string> {
  try {
    const headers: Record<string, string> = {};
    if (railwayToken) headers["Authorization"] = `Bearer ${railwayToken}`;

    const res = await fetch(`${RAILWAY_API}/imoveis/${imovelId}`, { headers });
    if (!res.ok) return `Imóvel #${imovelId}`;
    const data = await res.json();
    return data.nome ?? data.name ?? `Imóvel #${imovelId}`;
  } catch {
    return `Imóvel #${imovelId}`;
  }
}

// ─── Função principal: processar alertas de um produtor ──────────────────────

export async function processarAlertasProdutor(
  produtorId: number
): Promise<AlertaResult[]> {
  const db = await getDb();
  if (!db) return [];

  // Buscar configuração de alertas do produtor
  const configRows = await db
    .select()
    .from(alertasEstoqueConfig)
    .where(eq(alertasEstoqueConfig.produtorId, produtorId))
    .limit(1);

  const config = configRows[0];

  // Se não tem config ou está desativado, ignorar
  if (!config || !config.ativo) return [];

  // Buscar chat_id do produtor
  const prodConfigRows = await db
    .select()
    .from(produtorConfig)
    .where(eq(produtorConfig.produtorId, produtorId))
    .limit(1);
  const telegramChatId = prodConfigRows[0]?.telegramChatId ?? null;

  // Buscar imóveis do produtor
  const imovelRows = await db
    .select()
    .from(produtorImovel)
    .where(eq(produtorImovel.produtorId, produtorId));

  if (imovelRows.length === 0) return [];

  const resultados: AlertaResult[] = [];

  for (const { imovelId, railwayToken } of imovelRows) {
    // Verificar cooldown
    const emCooldown = await verificarCooldown(
      produtorId,
      imovelId,
      config.cooldownHoras
    );

    if (emCooldown) {
      resultados.push({
        produtorId,
        imovelId,
        enviado: false,
        motivo: "cooldown",
      });
      continue;
    }

    // Buscar insumos com alerta
    const { criticos, atencao } = await buscarInsumosAlerta(
      imovelId,
      railwayToken
    );

    // Filtrar por nível mínimo configurado
    const deveMostrarCriticos =
      config.nivelMinimo === "critico" ||
      config.nivelMinimo === "ambos";
    const deveMostrarAtencao =
      config.nivelMinimo === "atencao" ||
      config.nivelMinimo === "ambos";

    const criticosFiltrados = deveMostrarCriticos ? criticos : [];
    const atencaoFiltrados = deveMostrarAtencao ? atencao : [];

    // Se não há alertas relevantes, ignorar
    if (criticosFiltrados.length === 0 && atencaoFiltrados.length === 0) {
      await registrarLog({
        imovelId,
        produtorId,
        totalCriticos: 0,
        totalAtencao: 0,
        canal: "nenhum",
        status: "ignorado",
      });
      resultados.push({
        produtorId,
        imovelId,
        enviado: false,
        motivo: "sem_alertas",
      });
      continue;
    }

    // Formatar mensagem
    const nomeImovel = await buscarNomeImovel(imovelId, railwayToken);
    const mensagem = formatarMensagem(
      nomeImovel,
      criticosFiltrados,
      atencaoFiltrados
    );

    // Enviar via Telegram
    let enviado = false;
    let canal = "telegram_group";

    if (telegramChatId) {
      enviado = await sendTelegramDirect(telegramChatId, mensagem);
      canal = "telegram_direct";
    }

    if (!enviado) {
      enviado = await sendTelegramGroup(mensagem);
      canal = "telegram_group";
    }

    // Registrar log
    await registrarLog({
      imovelId,
      produtorId,
      totalCriticos: criticosFiltrados.length,
      totalAtencao: atencaoFiltrados.length,
      canal,
      status: enviado ? "enviado" : "falhou",
      erro: enviado ? undefined : "Falha ao enviar via Telegram",
    });

    resultados.push({
      produtorId,
      imovelId,
      enviado,
      canal,
    });
  }

  return resultados;
}

// ─── Função principal: processar todos os produtores ─────────────────────────

export async function processarTodosAlertas(): Promise<{
  processados: number;
  enviados: number;
  falhas: number;
}> {
  const db = await getDb();
  if (!db) return { processados: 0, enviados: 0, falhas: 0 };

  // Buscar todos os produtores com alertas ativos
  const configs = await db
    .select()
    .from(alertasEstoqueConfig)
    .where(eq(alertasEstoqueConfig.ativo, true));

  let processados = 0;
  let enviados = 0;
  let falhas = 0;

  for (const config of configs) {
    const resultados = await processarAlertasProdutor(config.produtorId);
    processados += resultados.length;
    enviados += resultados.filter((r) => r.enviado).length;
    falhas += resultados.filter((r) => !r.enviado && r.motivo !== "cooldown" && r.motivo !== "sem_alertas").length;
  }

  return { processados, enviados, falhas };
}
