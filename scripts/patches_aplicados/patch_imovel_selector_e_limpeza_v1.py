"""
patch_imovel_selector_e_limpeza_v1.py

Achado em 02/08 (revisão da pendência #7 "módulos que falham
silenciosamente no deploy"):

1. app/routers/propriedades_rural.py e app/services/insumo_cron.py
   nunca existiram no repositório -- só havia import morto em
   app/main.py, engolido por try/except a cada deploy. Removidos.

2. Indo atrás de "por que ImovelSelector nunca funcionou" (hipótese
   registrada nessa mesma pendência), achei a causa raiz de verdade:

   - ImovelSelector.tsx chamava GET /propriedades?cpf=... e
     DELETE /propriedades/{id} -- endpoints que NUNCA existiram em
     lugar nenhum do backend (nem no propriedades_rural.py fantasma).
     Além disso, seria o padrão antigo/inseguro (CPF em query param)
     já abandonado em 29-30/07 depois do bug do /imoveis/buscar?cpf=...

   - Pior: <ImovelSelector/> nunca era renderizado em NENHUM lugar do
     app, e <ImovelProvider> também não. O mecanismo real que todas as
     páginas usam (getImovelId(), em hooks/useImovel.ts) só lê
     localStorage.rc_imovel_id -- e nada em lugar nenhum grava esse
     valor, exceto o próprio ImovelSelector (que nunca rodava). Ou
     seja: o painel inteiro ficava fixo em imovel_id=1 (sandbox do
     Cícero) pra QUALQUER usuário, sempre. Não mordeu ninguém ainda
     porque ele é o único usuário real do painel hoje -- mas era uma
     bomba-relógio assim que outra pessoa (ex: administrador vinculado
     a mais de uma propriedade) começar a usar o painel.

Este patch:
  a) Reescreve frontend/components/ImovelSelector.tsx inteiro --
     GET /produtores/me/imoveis (fonte real, Bearer token) em vez de
     /propriedades?cpf=...; DELETE /imoveis-rurais/{id} em vez de
     /propriedades/{id}; usa apiFetch (@/lib/api) em vez de fetch cru;
     dá reload() após trocar/excluir o imóvel ativo (as demais páginas
     só leem getImovelId() na montagem, não reagem a mudança de
     contexto em tempo real).
  b) frontend/app/layout.tsx -- envolve <DashboardLayout> com
     <ImovelProvider>.
  c) frontend/components/DashboardLayout.tsx -- monta <ImovelSelector/>
     de fato no sidebar (antes só existia um comentário placeholder).
  d) app/main.py -- remove os dois imports mortos.

NÃO resolvido aqui (fica pra depois, escopo maior):
  - insumo_cron: gap real, alertas de estoque de insumo não têm cron
    nem endpoint /insumos/processar-alertas (comparar com os outros
    módulos, que têm /{modulo}/processar-alertas). Construir isso é
    escopo de feature nova, não conserto de fiação quebrada.
  - Pendência #3 original (relatorios/rebanhos ainda não trocam de
    imóvel usando imoveis_acessiveis) -- relacionado, mas é mudança
    página por página, maior que essa.
  - Botão "+ Cadastrar nova propriedade" no dropdown continua sem
    onClick (já estava assim antes deste patch).

Validado: python3 -m py_compile (app/main.py) e npx tsc --noEmit
(frontend/) limpos antes deste patch ser gerado.

USO:
    python3 patch_imovel_selector_e_limpeza_v1.py            # dry-run
    python3 patch_imovel_selector_e_limpeza_v1.py --aplicar  # grava
"""

import sys
import shutil
from pathlib import Path

# ── Arquivo 1: app/main.py (remover imports mortos) ─────────────────────────

ARQ_MAIN = Path("app/main.py")
BAK_MAIN = Path("app/main.py.bak_imovel_selector_v1")

MAIN_PROPRIEDADES_ANTIGO = """try:
    from app.routers.propriedades_rural import router as propriedades_rural_router
    app.include_router(propriedades_rural_router)
    print('PROPRIEDADES_RURAL ROUTER LOADED OK')
except Exception as _e:
    print(f'PROPRIEDADES_RURAL ROUTER FAILED: {_e}')

try:"""

MAIN_PROPRIEDADES_NOVO = """try:"""

MAIN_INSUMO_CRON_ANTIGO = """# Cron alertas insumos
try:
    from app.services.insumo_cron import verificar_alertas_insumo
    print('INSUMO CRON LOADED OK')
except Exception as _e:
    verificar_alertas_insumo = None
    print(f'INSUMO CRON FAILED: {_e}')

# Cron alertas ovinos"""

MAIN_INSUMO_CRON_NOVO = """# NOTA (02/08): existia aqui um import de app.services.insumo_cron que
# nunca existiu no repo (mesma classe de problema do propriedades_rural
# acima) -- removido. Alertas de estoque baixo de insumo continuam sem
# cron real; não há nem endpoint /insumos/processar-alertas (comparar
# com os outros módulos, que têm /{modulo}/processar-alertas). Fica como
# pendência separada, maior escopo que essa limpeza.

# Cron alertas ovinos"""

# ── Arquivo 2: frontend/app/layout.tsx ──────────────────────────────────────

ARQ_LAYOUT = Path("frontend/app/layout.tsx")
BAK_LAYOUT = Path("frontend/app/layout.tsx.bak_imovel_selector_v1")

LAYOUT_IMPORT_ANTIGO = """import GlobalErrorHandler from "@/components/GlobalErrorHandler";
import DashboardLayout from "@/components/DashboardLayout";"""

LAYOUT_IMPORT_NOVO = """import GlobalErrorHandler from "@/components/GlobalErrorHandler";
import DashboardLayout from "@/components/DashboardLayout";
import { ImovelProvider } from "@/contexts/ImovelContext";"""

LAYOUT_WRAP_ANTIGO = """        <DashboardLayout>
          {children}
        </DashboardLayout>"""

LAYOUT_WRAP_NOVO = """        <ImovelProvider>
          <DashboardLayout>
            {children}
          </DashboardLayout>
        </ImovelProvider>"""

# ── Arquivo 3: frontend/components/DashboardLayout.tsx ──────────────────────

ARQ_DASHBOARD = Path("frontend/components/DashboardLayout.tsx")
BAK_DASHBOARD = Path("frontend/components/DashboardLayout.tsx.bak_imovel_selector_v1")

DASHBOARD_IMPORT_ANTIGO = """import { LogOut, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";"""

DASHBOARD_IMPORT_NOVO = """import { LogOut, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";
import ImovelSelector from "@/components/ImovelSelector";"""

DASHBOARD_CONTENT_ANTIGO = """        {/* Content */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {/* Menu items will go here */}
        </div>"""

DASHBOARD_CONTENT_NOVO = """        {/* Seletor de propriedade ativa */}
        {!isCollapsed && <ImovelSelector />}

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {/* Menu items will go here */}
        </div>"""

# ── Arquivo 4: frontend/components/ImovelSelector.tsx (reescrita completa) ──

ARQ_SELECTOR = Path("frontend/components/ImovelSelector.tsx")
BAK_SELECTOR = Path("frontend/components/ImovelSelector.tsx.bak_imovel_selector_v1")

SELECTOR_NOVO_CONTEUDO = '''"use client";
import { useState, useEffect } from "react";
import { useImovel } from "../contexts/ImovelContext";
import { apiFetch } from "@/lib/api";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";

export default function ImovelSelector() {
  const { imovelId, setImovelId, imoveis, setImoveis, loading } = useImovel();
  const [openDropdown, setOpenDropdown] = useState(false);
  const [loadingImoveis, setLoadingImoveis] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Carregar imóveis do backend.
  //
  // 02/08: corrigido -- este componente nunca funcionou porque chamava
  // GET /propriedades?cpf=..., endpoint que não existe em lugar nenhum
  // do backend (era o import morto app.routers.propriedades_rural,
  // referenciado em main.py mas o arquivo nunca existiu). Além disso
  // era o padrão antigo e inseguro (CPF como query param), que já foi
  // abandonado em 29-30/07 depois do bug de segurança do
  // /imoveis/buscar?cpf=... (ignorava o cpf, retornava os 10 primeiros
  // imóveis do sistema). Agora usa a fonte única de verdade real:
  // GET /produtores/me/imoveis (Bearer token, já filtra por quem está
  // autenticado -- próprios + vinculados via participacoes_imovel).
  useEffect(() => {
    const fetchImoveis = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          console.warn("[ImovelSelector] Token não encontrado");
          return;
        }

        setLoadingImoveis(true);

        const response = await apiFetch(`${API}/produtores/me/imoveis`);

        if (response.ok) {
          const data = await response.json();

          // /produtores/me/imoveis retorna {imovel_id, nome, papel, ...}[]
          const imovelList = (Array.isArray(data) ? data : []).map((prop: any) => ({
            id: prop.imovel_id,
            nome: prop.nome || `Propriedade ${prop.imovel_id}`,
          }));

          setImoveis(imovelList);
          console.log("[ImovelSelector] Imóveis carregados:", imovelList);
        } else {
          console.error("[ImovelSelector] Erro ao carregar imóveis:", response.status, await response.text());
        }
      } catch (error) {
        console.error("[ImovelSelector] Erro ao carregar imóveis:", error);
      } finally {
        setLoadingImoveis(false);
      }
    };

    fetchImoveis();
  }, [setImoveis]);

  // Deletar imóvel (02/08: corrigido de /propriedades/{id}, que não
  // existia, para o endpoint real DELETE /imoveis-rurais/{id})
  const handleDeleteImovel = async (idParaExcluir: number) => {
    if (!confirm("Tem certeza que deseja excluir esta propriedade?")) {
      return;
    }

    try {
      setDeletingId(idParaExcluir);

      const response = await apiFetch(`${API}/imoveis-rurais/${idParaExcluir}`, {
        method: "DELETE",
      });

      if (response.ok || response.status === 204) {
        const eraOAtivo = idParaExcluir === imovelId;
        const restantes = (Array.isArray(imoveis) ? imoveis : []).filter(i => i.id !== idParaExcluir);
        setImoveis(restantes);

        // Se era o selecionado, troca pra outro e recarrega -- as demais
        // páginas leem o imovel ativo via getImovelId() só na montagem,
        // não reagem a mudança de contexto em tempo real.
        if (eraOAtivo && restantes.length > 0) {
          setImovelId(restantes[0].id);
          window.location.reload();
          return;
        }

        alert("Propriedade excluída com sucesso!");
      } else {
        alert(`Erro ao excluir: ${response.status}`);
      }
    } catch (error) {
      console.error("[ImovelSelector] Erro ao deletar:", error);
      alert("Erro ao excluir propriedade");
    } finally {
      setDeletingId(null);
    }
  };

  const imovelAtual = imoveis.find(i => i.id === imovelId);

  const s = {
    container: {
      padding: "12px 16px",
      background: "rgba(255,255,255,0.05)",
      borderRadius: 8,
      margin: "8px 16px",
      border: "1px solid rgba(255,255,255,0.1)",
    },
    label: {
      fontSize: 10,
      fontWeight: 700,
      color: "#7ab090",
      letterSpacing: "0.08em",
      marginBottom: 6,
      display: "block",
    },
    selector: {
      position: "relative" as const,
    },
    button: {
      width: "100%",
      padding: "8px 12px",
      background: "rgba(255,255,255,0.08)",
      border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: 6,
      color: "#e8f5e8",
      fontSize: 13,
      fontWeight: 600,
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      transition: "all 0.2s",
    },
    dropdown: {
      position: "absolute" as const,
      top: "100%",
      left: 0,
      right: 0,
      marginTop: 4,
      background: "#1a3a1a",
      border: "1px solid rgba(255,255,255,0.15)",
      borderRadius: 6,
      zIndex: 1000,
      maxHeight: "300px",
      overflowY: "auto" as const,
      boxShadow: "0 4px 12px rgba(0,0,0,0.3)",
    },
    optionContainer: {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 12px",
      fontSize: 13,
      borderLeft: "3px solid transparent",
      transition: "all 0.15s",
    },
    option: (active: boolean) => ({
      flex: 1,
      color: active ? "#7ad870" : "#c8e8c8",
      background: active ? "rgba(255,255,255,0.08)" : "transparent",
      cursor: "pointer",
      borderLeft: active ? "3px solid #7ad870" : "3px solid transparent",
    }),
    deleteBtn: (deleting: boolean) => ({
      background: deleting ? "#d32f2f" : "rgba(255,255,255,0.1)",
      border: "none",
      color: "#ff6b6b",
      fontSize: 12,
      padding: "4px 8px",
      borderRadius: 4,
      cursor: deleting ? "not-allowed" : "pointer",
      opacity: deleting ? 0.6 : 1,
      transition: "all 0.15s",
      marginLeft: 8,
    }),
    addBtn: {
      padding: "8px 12px",
      fontSize: 12,
      color: "#7ad870",
      background: "transparent",
      border: "none",
      cursor: "pointer",
      borderTop: "1px solid rgba(255,255,255,0.1)",
      width: "100%",
      textAlign: "left" as const,
      transition: "all 0.15s",
    },
  };

  return (
    <div style={s.container}>
      <label style={s.label}>🏡 IMÓVEL ATIVO</label>
      <div style={s.selector}>
        <button
          style={s.button}
          onClick={() => setOpenDropdown(!openDropdown)}
        >
          <span>
            {loadingImoveis ? "Carregando..." : imovelAtual?.nome || "Selecione um imóvel"}
          </span>
          <span style={{ opacity: 0.6, fontSize: 11 }}>
            {openDropdown ? "▾" : "▸"}
          </span>
        </button>

        {openDropdown && (
          <div style={s.dropdown}>
            {imoveis.length > 0 ? (
              <>
                {imoveis.map(imovel => (
                  <div
                    key={imovel.id}
                    style={{
                      ...s.optionContainer,
                      background: imovel.id === imovelId ? "rgba(255,255,255,0.08)" : "transparent",
                      borderLeft: imovel.id === imovelId ? "3px solid #7ad870" : "3px solid transparent",
                    }}
                  >
                    <div
                      style={s.option(imovel.id === imovelId)}
                      onClick={() => {
                        if (imovel.id === imovelId) {
                          setOpenDropdown(false);
                          return;
                        }
                        setImovelId(imovel.id);
                        setOpenDropdown(false);
                        window.location.reload();
                      }}
                    >
                      {imovel.nome}
                    </div>
                    <button
                      style={s.deleteBtn(deletingId === imovel.id)}
                      onClick={() => handleDeleteImovel(imovel.id)}
                      disabled={deletingId === imovel.id}
                      title="Excluir propriedade"
                    >
                      {deletingId === imovel.id ? "..." : "✕"}
                    </button>
                  </div>
                ))}
                <button style={s.addBtn}>
                  + Cadastrar nova propriedade
                </button>
              </>
            ) : (
              <div style={{ padding: "12px", color: "#a0d890", fontSize: 12 }}>
                {loadingImoveis ? "Carregando..." : "Nenhuma propriedade disponível"}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
'''

BLOCOS_POR_ARQUIVO = [
    (ARQ_MAIN, BAK_MAIN, [
        ("main.py: remove import propriedades_rural", MAIN_PROPRIEDADES_ANTIGO, MAIN_PROPRIEDADES_NOVO),
        ("main.py: remove import insumo_cron", MAIN_INSUMO_CRON_ANTIGO, MAIN_INSUMO_CRON_NOVO),
    ]),
    (ARQ_LAYOUT, BAK_LAYOUT, [
        ("layout.tsx: import ImovelProvider", LAYOUT_IMPORT_ANTIGO, LAYOUT_IMPORT_NOVO),
        ("layout.tsx: envolve DashboardLayout com ImovelProvider", LAYOUT_WRAP_ANTIGO, LAYOUT_WRAP_NOVO),
    ]),
    (ARQ_DASHBOARD, BAK_DASHBOARD, [
        ("DashboardLayout.tsx: import ImovelSelector", DASHBOARD_IMPORT_ANTIGO, DASHBOARD_IMPORT_NOVO),
        ("DashboardLayout.tsx: monta ImovelSelector no sidebar", DASHBOARD_CONTENT_ANTIGO, DASHBOARD_CONTENT_NOVO),
    ]),
]


def aplicar_blocos(aplicar: bool) -> bool:
    ok = True
    for arquivo, backup, blocos in BLOCOS_POR_ARQUIVO:
        if not arquivo.exists():
            print(f"ERRO: {arquivo} não encontrado.")
            ok = False
            continue
        conteudo = arquivo.read_text(encoding="utf-8")
        for nome, antigo, novo in blocos:
            n = conteudo.count(antigo)
            print(f"[{arquivo}] [{nome}] ocorrências encontradas: {n}")
            if n != 1:
                print(f"  ABORTANDO esse arquivo: esperava 1, achei {n}.")
                ok = False
                break
            conteudo = conteudo.replace(antigo, novo)
        else:
            if aplicar:
                shutil.copy2(arquivo, backup)
                print(f"Backup: {backup}")
                arquivo.write_text(conteudo, encoding="utf-8")
                print(f"Aplicado em: {arquivo}")
    return ok


def aplicar_reescrita_selector(aplicar: bool) -> bool:
    if not ARQ_SELECTOR.exists():
        print(f"ERRO: {ARQ_SELECTOR} não encontrado.")
        return False
    atual = ARQ_SELECTOR.read_text(encoding="utf-8")
    print(f"[{ARQ_SELECTOR}] reescrita completa do arquivo: {len(atual)} -> {len(SELECTOR_NOVO_CONTEUDO)} bytes")
    if aplicar:
        shutil.copy2(ARQ_SELECTOR, BAK_SELECTOR)
        print(f"Backup: {BAK_SELECTOR}")
        ARQ_SELECTOR.write_text(SELECTOR_NOVO_CONTEUDO, encoding="utf-8")
        print(f"Aplicado em: {ARQ_SELECTOR}")
    return True


def main():
    aplicar = "--aplicar" in sys.argv
    ok1 = aplicar_blocos(aplicar)
    ok2 = aplicar_reescrita_selector(aplicar)

    if not (ok1 and ok2):
        print("\nUm ou mais arquivos falharam na validação -- nada foi gravado nesses casos.")
        sys.exit(1)

    if not aplicar:
        print("\n=== DRY RUN (nada gravado) ===")
    else:
        print("\nAplicado. Rode `npx tsc --noEmit` (frontend/) e "
              "`python3 -m py_compile app/main.py` antes de commitar.")


if __name__ == "__main__":
    main()
