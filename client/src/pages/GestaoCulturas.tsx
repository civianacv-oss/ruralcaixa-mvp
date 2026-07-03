import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { API_BASE, getImovelId } from "@/lib/api";
import { useEffect } from "react";
import { SistemaCulturas } from "@/components/culturas/SistemaCulturas";
import { ForumCultura } from "@/components/culturas/ForumCultura";
import { IntegracaoClimatica } from "@/components/culturas/IntegracaoClimatica";
import { RecomendadorCulturas } from "@/components/culturas/RecomendadorCulturas";

interface CulturaOpcao {
  id: number;
  nome: string;
}

export default function GestaoCulturas() {
  const [aba, setAba] = useState<"sistema" | "forum" | "recomendador" | "clima">("sistema");
  const [culturas, setCulturas] = useState<CulturaOpcao[]>([]);
  const [culturaForumId, setCulturaForumId] = useState<number | null>(null);
  const imovelId = getImovelId();

  useEffect(() => {
    if (!imovelId) return;
    fetch(`${API_BASE}/culturas/${imovelId}`)
      .then((r) => r.json())
      .then((data) => setCulturas(data ?? []))
      .catch(() => setCulturas([]));
  }, [imovelId]);

  const abrirForumParaCultura = (id: number, _nome: string) => {
    setCulturaForumId(id);
    setAba("forum");
  };

  const culturaSelecionada = culturas.find((c) => c.id === culturaForumId);

  return (
    <div className="max-w-6xl mx-auto">
      <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)}>
        <TabsList className="grid grid-cols-4 w-full max-w-2xl mx-auto mt-4">
          <TabsTrigger value="sistema">📚 Sistema</TabsTrigger>
          <TabsTrigger value="forum">💬 Fórum</TabsTrigger>
          <TabsTrigger value="recomendador">🤖 Recomendador</TabsTrigger>
          <TabsTrigger value="clima">🌦️ Clima</TabsTrigger>
        </TabsList>

        <TabsContent value="sistema">
          <SistemaCulturas onAbrirForum={abrirForumParaCultura} />
        </TabsContent>

        <TabsContent value="forum">
          <div className="p-4 max-w-md">
            <Label className="text-xs">Cultura</Label>
            <Select
              value={culturaForumId ? String(culturaForumId) : undefined}
              onValueChange={(v) => setCulturaForumId(Number(v))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Selecione uma cultura para ver o fórum" />
              </SelectTrigger>
              <SelectContent>
                {culturas.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>{c.nome}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {culturaForumId && culturaSelecionada ? (
            <ForumCultura culturaId={culturaForumId} culturaNome={culturaSelecionada.nome} />
          ) : (
            <Card className="m-4">
              <CardContent className="p-8 text-center text-muted-foreground">
                Escolha uma cultura acima para ver ou participar do fórum de discussão.
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="recomendador">
          <RecomendadorCulturas />
        </TabsContent>

        <TabsContent value="clima">
          <IntegracaoClimatica />
        </TabsContent>
      </Tabs>
    </div>
  );
}
