import { useCallback, useEffect, useState } from "react";
import { clearSession, getProdutorId, getProdutorNome, getImovelId, getImovelNome, isAuthenticated } from "@/lib/api";

export function useRuralAuth() {
  const [produtorId, setProdutorId] = useState<number | null>(() => getProdutorId());
  const [produtorNome, setProdutorNome] = useState<string>(() => getProdutorNome());
  const [imovelId, setImovelId] = useState<number | null>(() => getImovelId());
  const [imovelNome, setImovelNome] = useState<string>(() => getImovelNome());
  const [authenticated, setAuthenticated] = useState<boolean>(() => isAuthenticated());

  // Keep state in sync with localStorage (e.g. after login redirect)
  useEffect(() => {
    const id = getProdutorId();
    const nome = getProdutorNome();
    const imv = getImovelId();
    const imvNome = getImovelNome();
    setProdutorId(id);
    setProdutorNome(nome);
    setImovelId(imv);
    setImovelNome(imvNome);
    setAuthenticated(Boolean(id));
  }, []);

  const logout = useCallback(() => {
    clearSession();
    setProdutorId(null);
    setProdutorNome("");
    setImovelId(null);
    setImovelNome("");
    setAuthenticated(false);
    window.location.href = "/login";
  }, []);

  const refresh = useCallback(() => {
    const id = getProdutorId();
    const nome = getProdutorNome();
    const imv = getImovelId();
    const imvNome = getImovelNome();
    setProdutorId(id);
    setProdutorNome(nome);
    setImovelId(imv);
    setImovelNome(imvNome);
    setAuthenticated(Boolean(id));
  }, []);

  return { produtorId, produtorNome, imovelId, imovelNome, authenticated, logout, refresh };
}
