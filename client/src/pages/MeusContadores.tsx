import { useState } from "react";
import { trpc } from "@/lib/trpc";
import RuralLayout from "@/components/RuralLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Users, Plus, Trash2, Phone, CreditCard, UserCheck } from "lucide-react";
import { toast } from "sonner";

function formatCpf(cpf: string) {
  const d = cpf.replace(/\D/g, "");
  if (d.length !== 11) return cpf;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}

function formatPhone(phone: string) {
  const d = phone.replace(/\D/g, "");
  if (d.length === 13) return `+${d.slice(0, 2)} (${d.slice(2, 4)}) ${d.slice(4, 9)}-${d.slice(9)}`;
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return phone;
}

export default function MeusContadores() {
  const utils = trpc.useUtils();
  const { data: contadores, isLoading } = trpc.contadores.listar.useQuery();
  const cadastrar = trpc.contadores.cadastrar.useMutation({
    onSuccess: () => {
      utils.contadores.listar.invalidate();
      setDialogOpen(false);
      setForm({ cpf: "", nome: "", telefone: "" });
      toast.success("Contador cadastrado com sucesso! Ele já pode fazer login com o CPF dele.");
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao cadastrar contador.");
    },
  });
  const revogar = trpc.contadores.revogar.useMutation({
    onSuccess: () => {
      utils.contadores.listar.invalidate();
      setRevogarId(null);
      toast.success("Acesso do contador revogado.");
    },
    onError: (err) => {
      toast.error(err.message || "Erro ao revogar acesso.");
    },
  });

  const [dialogOpen, setDialogOpen] = useState(false);
  const [revogarId, setRevogarId] = useState<number | null>(null);
  const [form, setForm] = useState({ cpf: "", nome: "", telefone: "" });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const cpfClean = form.cpf.replace(/\D/g, "");
    if (cpfClean.length !== 11) {
      toast.error("CPF inválido. Digite os 11 dígitos.");
      return;
    }
    const telClean = form.telefone.replace(/\D/g, "");
    if (telClean.length < 10) {
      toast.error("Telefone inválido. Inclua o DDD.");
      return;
    }
    cadastrar.mutate({
      contadorCpf: cpfClean,
      contadorNome: form.nome.trim(),
      contadorTelefone: telClean,
    });
  }

  return (
    <RuralLayout>
      <div className="p-6 max-w-3xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight" style={{ color: "oklch(0.22 0.06 145)" }}>
              Meus Contadores
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gerencie os contadores e procuradores que têm acesso aos seus imóveis.
            </p>
          </div>
          <Button
            onClick={() => setDialogOpen(true)}
            className="gap-2"
            style={{ background: "oklch(0.42 0.14 145)", color: "white" }}
          >
            <Plus className="w-4 h-4" />
            Adicionar Contador
          </Button>
        </div>

        {/* Info card */}
        <Card className="mb-6 border-0" style={{ background: "oklch(0.94 0.02 145)", borderLeft: "4px solid oklch(0.52 0.12 145)" }}>
          <CardContent className="pt-4 pb-4">
            <div className="flex gap-3">
              <UserCheck className="w-5 h-5 shrink-0 mt-0.5" style={{ color: "oklch(0.42 0.14 145)" }} />
              <div>
                <p className="text-sm font-semibold" style={{ color: "oklch(0.28 0.08 145)" }}>
                  Como funciona o acesso do contador?
                </p>
                <p className="text-sm text-muted-foreground mt-1">
                  Ao cadastrar um contador, ele poderá fazer login no RuralCaixa usando o CPF dele e receberá um código de acesso no telefone cadastrado. Ele terá acesso completo aos seus imóveis como contador.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Lista de contadores */}
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-xl animate-pulse" style={{ background: "oklch(0.92 0.01 130)" }} />
            ))}
          </div>
        ) : !contadores || contadores.length === 0 ? (
          <Card className="border-dashed border-2">
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Users className="w-12 h-12 mb-4" style={{ color: "oklch(0.70 0.04 145)" }} />
              <CardTitle className="text-lg mb-2" style={{ color: "oklch(0.35 0.06 145)" }}>
                Nenhum contador cadastrado
              </CardTitle>
              <CardDescription className="max-w-xs">
                Adicione um contador para que ele possa acessar seus imóveis e relatórios financeiros.
              </CardDescription>
              <Button
                onClick={() => setDialogOpen(true)}
                className="mt-4 gap-2"
                variant="outline"
              >
                <Plus className="w-4 h-4" />
                Adicionar primeiro contador
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {contadores.map((c) => (
              <Card key={c.id} className="border-0 shadow-sm">
                <CardContent className="flex items-center gap-4 py-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
                    style={{ background: "linear-gradient(135deg, oklch(0.35 0.12 145), oklch(0.42 0.14 145))" }}
                  >
                    {c.contadorNome.split(" ").slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold truncate" style={{ color: "oklch(0.22 0.06 145)" }}>
                        {c.contadorNome}
                      </p>
                      <Badge variant="outline" className="text-[10px] shrink-0" style={{ color: "oklch(0.42 0.14 145)", borderColor: "oklch(0.75 0.08 145)" }}>
                        Ativo
                      </Badge>
                    </div>
                    <div className="flex items-center gap-4 mt-1">
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CreditCard className="w-3 h-3" />
                        {formatCpf(c.contadorCpf)}
                      </span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" />
                        {formatPhone(c.contadorTelefone)}
                      </span>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-500 hover:text-red-700 hover:bg-red-50 shrink-0"
                    onClick={() => setRevogarId(c.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Dialog: Adicionar Contador */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Adicionar Contador</DialogTitle>
            <DialogDescription>
              Informe os dados do contador. Ele receberá um código de acesso no telefone cadastrado ao fazer login.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4 mt-2">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Nome completo *</label>
              <Input
                placeholder="Ex: João Silva Santos"
                value={form.nome}
                onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">CPF *</label>
              <Input
                placeholder="000.000.000-00"
                value={form.cpf}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 11);
                  const fmt = v.length <= 3 ? v : v.length <= 6 ? `${v.slice(0,3)}.${v.slice(3)}` : v.length <= 9 ? `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6)}` : `${v.slice(0,3)}.${v.slice(3,6)}.${v.slice(6,9)}-${v.slice(9)}`;
                  setForm((f) => ({ ...f, cpf: fmt }));
                }}
                required
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1.5 block">Telefone (WhatsApp) *</label>
              <Input
                placeholder="(99) 99999-9999"
                value={form.telefone}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 11);
                  const fmt = v.length <= 2 ? v : v.length <= 7 ? `(${v.slice(0,2)}) ${v.slice(2)}` : `(${v.slice(0,2)}) ${v.slice(2,7)}-${v.slice(7)}`;
                  setForm((f) => ({ ...f, telefone: fmt }));
                }}
                required
              />
              <p className="text-xs text-muted-foreground mt-1">
                O código de acesso será enviado para este número.
              </p>
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={cadastrar.isPending}
                style={{ background: "oklch(0.42 0.14 145)", color: "white" }}
              >
                {cadastrar.isPending ? "Cadastrando..." : "Cadastrar Contador"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* AlertDialog: Revogar acesso */}
      <AlertDialog open={revogarId !== null} onOpenChange={(open) => { if (!open) setRevogarId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Revogar acesso do contador?</AlertDialogTitle>
            <AlertDialogDescription>
              O contador não conseguirá mais fazer login no RuralCaixa. Esta ação pode ser desfeita adicionando o contador novamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={() => { if (revogarId !== null) revogar.mutate({ id: revogarId }); }}
            >
              Revogar acesso
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </RuralLayout>
  );
}
