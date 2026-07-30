"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { getImovelId, setImovelId as persistImovelId } from "@/hooks/useImovel";

interface Imovel {
  id: number;
  nome: string;
}

interface ImovelContextValue {
  imovelId: number;
  setImovelId: (id: number) => void;
  imoveis: Imovel[];
  setImoveis: (imoveis: Imovel[]) => void;
  loading: boolean;
}

const ImovelContext = createContext<ImovelContextValue | undefined>(undefined);

/**
 * Provider do imóvel ativo. Ainda não conectado ao layout.tsx —
 * quando o rewire do seletor de propriedade for feito, envolver
 * <DashboardLayout> (ou o <body>) com <ImovelProvider> em app/layout.tsx.
 */
export function ImovelProvider({ children }: { children: ReactNode }) {
  const [imovelId, setImovelIdState] = useState<number>(1);
  const [imoveis, setImoveis] = useState<Imovel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setImovelIdState(getImovelId());
    setLoading(false);
  }, []);

  const setImovelId = (id: number) => {
    setImovelIdState(id);
    persistImovelId(id);
  };

  return (
    <ImovelContext.Provider value={{ imovelId, setImovelId, imoveis, setImoveis, loading }}>
      {children}
    </ImovelContext.Provider>
  );
}

export function useImovel(): ImovelContextValue {
  const ctx = useContext(ImovelContext);
  if (!ctx) {
    throw new Error(
      "useImovel() deve ser usado dentro de <ImovelProvider>. " +
      "Componentes que usam ImovelSelector precisam estar envolvidos por ele em app/layout.tsx."
    );
  }
  return ctx;
}
