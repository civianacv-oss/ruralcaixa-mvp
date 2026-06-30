"use client";
import { useState, useEffect } from "react";
import { useImovel } from "../contexts/ImovelContext";

const API = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";

export default function ImovelSelector() {
  const { imovelId, setImovelId, imoveis, setImoveis, loading } = useImovel();
  const [openDropdown, setOpenDropdown] = useState(false);
  const [loadingImoveis, setLoadingImoveis] = useState(false);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  // Carregar imóveis do backend
  useEffect(() => {
    const fetchImoveis = async () => {
      try {
        const token = localStorage.getItem("token");
        if (!token) {
          console.warn("[ImovelSelector] Token não encontrado");
          return;
        }

        // Obter CPF do produtor local
        const produtorStr = localStorage.getItem("rc_produtor");
        if (!produtorStr) {
          console.warn("[ImovelSelector] Produtor não encontrado");
          return;
        }

        let cpf = "";
        try {
          const produtor = JSON.parse(produtorStr);
          cpf = produtor.cpf || "";
        } catch (e) {
          console.error("[ImovelSelector] Erro ao parsear produtor:", e);
          return;
        }

        if (!cpf) {
          console.warn("[ImovelSelector] CPF não encontrado no produtor");
          return;
        }

        setLoadingImoveis(true);

        // Chamar endpoint correto: /propriedades?cpf=...
        const response = await fetch(`${API}/propriedades?cpf=${cpf}&limit=100`, {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.ok) {
          const data = await response.json();
          
          // Converter propriedades para formato de imóvel
          const imovelList = (Array.isArray(data.itens) ? data.itens : []).map((prop: any) => ({
            id: prop.id,
            nome: prop.nome || `Propriedade ${prop.id}`,
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

  // Deletar imóvel
  const handleDeleteImovel = async (imovelId: string | number) => {
    if (!confirm("Tem certeza que deseja excluir esta propriedade?")) {
      return;
    }

    try {
      const token = localStorage.getItem("token");
      if (!token) {
        alert("Token não encontrado");
        return;
      }

      setDeletingId(imovelId as number);

      const response = await fetch(`${API}/propriedades/${imovelId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.ok || response.status === 204) {
        // Remover da lista local
        setImoveis((Array.isArray(imoveis) ? imoveis : []).filter(i => i.id !== imovelId));
        
        // Se era o selecionado, selecionar outro
        if (imovelId === imovelId) {
          const outroImovel = imoveis.find(i => i.id !== imovelId);
          if (outroImovel) {
            setImovelId(outroImovel.id);
          }
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
                        setImovelId(imovel.id);
                        setOpenDropdown(false);
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
