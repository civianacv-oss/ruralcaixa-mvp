import { useState, useEffect } from "react";
import { API_BASE, getImovelId } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Plus, Lightbulb, CheckCircle, XCircle, Clock, TrendingUp, Award, BookOpen, Users, Star } from "lucide-react";
import { toast } from "sonner";

interface Cultura {
    id: number;
    nome: string;
    nome_cientifico: string;
    tipo: string;
    ciclo_dias: number;
    produtividade_media: number;
    unidade_produtividade: string;
    status: string;
}

interface SugestaoCultura {
    id: number;
    produtor_id: number;
    nome: string;
    descricao: string;
    motivo: string;
    experiencia: string;
    status: 'pendente' | 'aprovado' | 'rejeitado' | 'em_analise';
    data_sugestao: string;
    parecer?: string;
}

interface ProtocoloCultivo {
    id: number;
    cultura_id: number;
    titulo: string;
    descricao: string;
    tipo: string;
    dificuldade: string;
    passos: string[];
    dicas: string;
    nivel_confianca: number;
    status: string;
    tags: string[];
}

interface PraticaSucesso {
    id: number;
    titulo: string;
    descricao: string;
    desafio: string;
    solucao: string;
    resultados: string;
    produtividade: number;
    lucro: number;
    destaque: boolean;
}

export function SistemaCulturas({ onAbrirForum }: { onAbrirForum?: (culturaId: number, culturaNome: string) => void }) {
    const [culturas, setCulturas] = useState<Cultura[]>([]);
    const [sugestoes, setSugestoes] = useState<SugestaoCultura[]>([]);
    const [protocolos, setProtocolos] = useState<ProtocoloCultivo[]>([]);
    const [praticasSucesso, setPraticasSucesso] = useState<PraticaSucesso[]>([]);
    const [loading, setLoading] = useState(true);
    const [aba, setAba] = useState<'culturas' | 'sugestoes' | 'protocolos' | 'sucesso'>('culturas');
    const [novaSugestao, setNovaSugestao] = useState({
        nome: "",
        descricao: "",
        motivo: "",
        experiencia: "",
    });
    const [novoProtocolo, setNovoProtocolo] = useState({
        cultura_id: "",
        titulo: "",
        descricao: "",
        tipo: "plantio",
        dificuldade: "intermediario",
        passos: [""],
        dicas: "",
        tags: [] as string[],
    });
    const imovelId = getImovelId();

    useEffect(() => {
        carregarDados();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [aba]);

    async function carregarDados() {
        if (!imovelId) { setLoading(false); return; }
        setLoading(true);
        try {
            const [cult, sug, prot, prat] = await Promise.all([
                fetch(`${API_BASE}/culturas/${imovelId}`).then(r => r.json()),
                fetch(`${API_BASE}/culturas/sugestoes/${imovelId}`).then(r => r.json()),
                fetch(`${API_BASE}/culturas/protocolos/${imovelId}`).then(r => r.json()),
                fetch(`${API_BASE}/culturas/praticas-sucesso/${imovelId}`).then(r => r.json()),
            ]);
            setCulturas(cult || []);
            setSugestoes(sug || []);
            setProtocolos(prot || []);
            setPraticasSucesso(prat || []);
        } catch (error) {
            toast.error("Erro ao carregar dados");
        } finally {
            setLoading(false);
        }
    }

    async function sugerirCultura() {
        if (!novaSugestao.nome) {
            toast.error("Nome da cultura é obrigatório");
            return;
        }
        if (!imovelId) { toast.error("Selecione um imóvel"); return; }

        try {
            const res = await fetch(`${API_BASE}/culturas/sugerir`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    imovel_id: imovelId,
                    ...novaSugestao,
                }),
            });

            if (res.ok) {
                toast.success("Sugestão enviada com sucesso!");
                setNovaSugestao({ nome: "", descricao: "", motivo: "", experiencia: "" });
                carregarDados();
            } else {
                toast.error("Erro ao enviar sugestão");
            }
        } catch (error) {
            toast.error("Erro ao conectar com o servidor");
        }
    }

    async function avaliarSugestao(id: number, status: string, parecer?: string) {
        try {
            const res = await fetch(`${API_BASE}/culturas/sugestoes/${id}/avaliar`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status, parecer }),
            });

            if (res.ok) {
                toast.success(`Sugestão ${status === 'aprovado' ? 'aprovada' : 'rejeitada'}`);
                carregarDados();
            }
        } catch (error) {
            toast.error("Erro ao avaliar sugestão");
        }
    }

    async function publicarProtocolo() {
        if (!novoProtocolo.titulo || !novoProtocolo.cultura_id) {
            toast.error("Preencha todos os campos obrigatórios");
            return;
        }
        if (!imovelId) { toast.error("Selecione um imóvel"); return; }

        try {
            const res = await fetch(`${API_BASE}/culturas/protocolos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    imovel_id: imovelId,
                    ...novoProtocolo,
                    cultura_id: parseInt(novoProtocolo.cultura_id, 10),
                    passos: novoProtocolo.passos.filter(p => p.trim()),
                }),
            });

            if (res.ok) {
                toast.success("Protocolo publicado com sucesso!");
                setNovoProtocolo({
                    cultura_id: "",
                    titulo: "",
                    descricao: "",
                    tipo: "plantio",
                    dificuldade: "intermediario",
                    passos: [""],
                    dicas: "",
                    tags: [],
                });
                carregarDados();
            }
        } catch (error) {
            toast.error("Erro ao publicar protocolo");
        }
    }

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'aprovado': return 'text-green-600 bg-green-100';
            case 'rejeitado': return 'text-red-600 bg-red-100';
            case 'pendente': return 'text-yellow-600 bg-yellow-100';
            case 'em_analise': return 'text-blue-600 bg-blue-100';
            default: return 'text-gray-600 bg-gray-100';
        }
    };

    const getStatusIcon = (status: string) => {
        switch (status) {
            case 'aprovado': return <CheckCircle className="w-4 h-4" />;
            case 'rejeitado': return <XCircle className="w-4 h-4" />;
            case 'pendente': return <Clock className="w-4 h-4" />;
            case 'em_analise': return <Lightbulb className="w-4 h-4" />;
            default: return <Clock className="w-4 h-4" />;
        }
    };

    return (
        <div className="space-y-6 p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>
                        🌱 Sistema de Culturas e Protocolos
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Gerencie culturas, compartilhe protocolos e aprenda com práticas bem-sucedidas
                    </p>
                </div>
                <div className="flex gap-2">
                    <Button size="sm" variant="outline" onClick={carregarDados}>
                        🔄 Atualizar
                    </Button>
                </div>
            </div>

            <Tabs value={aba} onValueChange={(v) => setAba(v as typeof aba)}>
                <TabsList className="grid grid-cols-4 w-full">
                    <TabsTrigger value="culturas">📚 Culturas</TabsTrigger>
                    <TabsTrigger value="sugestoes">💡 Sugestões ({sugestoes.filter(s => s.status === 'pendente').length})</TabsTrigger>
                    <TabsTrigger value="protocolos">📋 Protocolos</TabsTrigger>
                    <TabsTrigger value="sucesso">🏆 Práticas de Sucesso</TabsTrigger>
                </TabsList>

                <TabsContent value="culturas">
                    <div className="space-y-4">
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button className="w-full" style={{ background: "oklch(0.42 0.14 145)" }}>
                                    <Plus className="w-4 h-4 mr-2" />
                                    Sugerir Nova Cultura
                                </Button>
                            </DialogTrigger>
                            <DialogContent>
                                <DialogHeader>
                                    <DialogTitle>💡 Sugerir Nova Cultura</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4">
                                    <div>
                                        <Label>Nome da Cultura *</Label>
                                        <Input
                                            placeholder="Ex: Quinoa, Cacau, Açaí..."
                                            value={novaSugestao.nome}
                                            onChange={(e) => setNovaSugestao({ ...novaSugestao, nome: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <Label>Descrição</Label>
                                        <Textarea
                                            placeholder="Descreva a cultura e suas características"
                                            value={novaSugestao.descricao}
                                            onChange={(e) => setNovaSugestao({ ...novaSugestao, descricao: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <Label>Motivo da Sugestão</Label>
                                        <Textarea
                                            placeholder="Por que essa cultura é relevante para sua região?"
                                            value={novaSugestao.motivo}
                                            onChange={(e) => setNovaSugestao({ ...novaSugestao, motivo: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <Label>Sua Experiência</Label>
                                        <Textarea
                                            placeholder="Compartilhe sua experiência com essa cultura"
                                            value={novaSugestao.experiencia}
                                            onChange={(e) => setNovaSugestao({ ...novaSugestao, experiencia: e.target.value })}
                                        />
                                    </div>
                                    <Button onClick={sugerirCultura} className="w-full" style={{ background: "oklch(0.42 0.14 145)" }}>
                                        Enviar Sugestão
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>

                        {loading ? (
                            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                        ) : culturas.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p className="font-medium">Nenhuma cultura cadastrada</p>
                                <p className="text-sm mt-1">Sugira uma nova cultura para começar</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {culturas.map((cultura) => (
                                    <Card key={cultura.id} className="hover:shadow-md transition-shadow">
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h3 className="font-semibold text-sm">{cultura.nome}</h3>
                                                    {cultura.nome_cientifico && (
                                                        <p className="text-xs text-muted-foreground italic">{cultura.nome_cientifico}</p>
                                                    )}
                                                </div>
                                                <Badge variant="outline" className="text-xs">
                                                    {cultura.tipo}
                                                </Badge>
                                            </div>
                                            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                                                <div>
                                                    <span className="text-muted-foreground">Ciclo:</span>
                                                    <span className="font-medium ml-1">{cultura.ciclo_dias || '—'} dias</span>
                                                </div>
                                                <div>
                                                    <span className="text-muted-foreground">Produtividade:</span>
                                                    <span className="font-medium ml-1">
                                                        {cultura.produtividade_media || '—'} {cultura.unidade_produtividade || ''}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="mt-3 flex gap-2">
                                                <Button
                                                    size="sm" variant="outline" className="flex-1 text-xs"
                                                    onClick={() => onAbrirForum?.(cultura.id, cultura.nome)}
                                                >
                                                    <BookOpen className="w-3 h-3 mr-1" />
                                                    Fórum
                                                </Button>
                                                <Button size="sm" variant="outline" className="flex-1 text-xs"
                                                    onClick={() => setAba('protocolos')}
                                                >
                                                    <TrendingUp className="w-3 h-3 mr-1" />
                                                    Protocolos
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="sugestoes">
                    <div className="space-y-4">
                        {loading ? (
                            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                        ) : sugestoes.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <Lightbulb className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p className="font-medium">Nenhuma sugestão enviada</p>
                                <p className="text-sm mt-1">Compartilhe suas ideias de novas culturas</p>
                            </div>
                        ) : (
                            sugestoes.map((sugestao) => (
                                <Card key={sugestao.id} className="hover:shadow-md transition-shadow">
                                    <CardContent className="p-4">
                                        <div className="flex items-start justify-between">
                                            <div className="flex-1">
                                                <div className="flex items-center gap-2">
                                                    <h3 className="font-semibold text-sm">{sugestao.nome}</h3>
                                                    <Badge className={`${getStatusColor(sugestao.status)} border-none`}>
                                                        {getStatusIcon(sugestao.status)}
                                                        <span className="ml-1">{sugestao.status}</span>
                                                    </Badge>
                                                </div>
                                                <p className="text-sm text-muted-foreground mt-1">{sugestao.descricao}</p>
                                                {sugestao.motivo && (
                                                    <p className="text-xs text-muted-foreground mt-2">
                                                        <strong>Motivo:</strong> {sugestao.motivo}
                                                    </p>
                                                )}
                                                <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                                    <span>📅 {new Date(sugestao.data_sugestao).toLocaleDateString("pt-BR")}</span>
                                                    {sugestao.parecer && (
                                                        <span className="text-green-700">💬 {sugestao.parecer}</span>
                                                    )}
                                                </div>
                                            </div>
                                            {sugestao.status === 'pendente' && (
                                                <div className="flex gap-2 ml-4">
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-green-600 border-green-200 hover:bg-green-50"
                                                        onClick={() => {
                                                            const parecer = prompt("Digite o parecer de aprovação:");
                                                            if (parecer) avaliarSugestao(sugestao.id, 'aprovado', parecer);
                                                        }}
                                                    >
                                                        <CheckCircle className="w-4 h-4 mr-1" />
                                                        Aprovar
                                                    </Button>
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        className="text-red-600 border-red-200 hover:bg-red-50"
                                                        onClick={() => {
                                                            const parecer = prompt("Digite o motivo da rejeição:");
                                                            if (parecer) avaliarSugestao(sugestao.id, 'rejeitado', parecer);
                                                        }}
                                                    >
                                                        <XCircle className="w-4 h-4 mr-1" />
                                                        Rejeitar
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                </Card>
                            ))
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="protocolos">
                    <div className="space-y-4">
                        <Dialog>
                            <DialogTrigger asChild>
                                <Button className="w-full" style={{ background: "oklch(0.42 0.14 145)" }}>
                                    <Plus className="w-4 h-4 mr-2" />
                                    Compartilhar Protocolo
                                </Button>
                            </DialogTrigger>
                            <DialogContent className="max-w-2xl">
                                <DialogHeader>
                                    <DialogTitle>📋 Compartilhar Protocolo de Cultivo</DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 max-h-[60vh] overflow-y-auto">
                                    <div>
                                        <Label>Cultura *</Label>
                                        <Select
                                            value={novoProtocolo.cultura_id}
                                            onValueChange={(v) => setNovoProtocolo({ ...novoProtocolo, cultura_id: v })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue placeholder="Selecione a cultura" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {culturas.map(c => (
                                                    <SelectItem key={c.id} value={String(c.id)}>
                                                        {c.nome}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div>
                                        <Label>Título *</Label>
                                        <Input
                                            placeholder="Ex: Plantio de Soja com Tecnologia de Precisão"
                                            value={novoProtocolo.titulo}
                                            onChange={(e) => setNovoProtocolo({ ...novoProtocolo, titulo: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <Label>Descrição</Label>
                                        <Textarea
                                            placeholder="Descreva o protocolo"
                                            value={novoProtocolo.descricao}
                                            onChange={(e) => setNovoProtocolo({ ...novoProtocolo, descricao: e.target.value })}
                                        />
                                    </div>
                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <Label>Tipo</Label>
                                            <Select
                                                value={novoProtocolo.tipo}
                                                onValueChange={(v) => setNovoProtocolo({ ...novoProtocolo, tipo: v })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Tipo" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="plantio">🌱 Plantio</SelectItem>
                                                    <SelectItem value="tratos_culturais">🧑‍🌾 Tratos Culturais</SelectItem>
                                                    <SelectItem value="colheita">🌾 Colheita</SelectItem>
                                                    <SelectItem value="pos_colheita">📦 Pós-Colheita</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        <div>
                                            <Label>Dificuldade</Label>
                                            <Select
                                                value={novoProtocolo.dificuldade}
                                                onValueChange={(v) => setNovoProtocolo({ ...novoProtocolo, dificuldade: v })}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue placeholder="Dificuldade" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="basico">🟢 Básico</SelectItem>
                                                    <SelectItem value="intermediario">🟡 Intermediário</SelectItem>
                                                    <SelectItem value="avancado">🔴 Avançado</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </div>
                                    <div>
                                        <Label>Passos</Label>
                                        {novoProtocolo.passos.map((passo, index) => (
                                            <div key={index} className="flex gap-2 mt-1">
                                                <Input
                                                    placeholder={`Passo ${index + 1}`}
                                                    value={passo}
                                                    onChange={(e) => {
                                                        const novosPassos = [...novoProtocolo.passos];
                                                        novosPassos[index] = e.target.value;
                                                        setNovoProtocolo({ ...novoProtocolo, passos: novosPassos });
                                                    }}
                                                />
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    onClick={() => {
                                                        const novosPassos = novoProtocolo.passos.filter((_, i) => i !== index);
                                                        setNovoProtocolo({ ...novoProtocolo, passos: novosPassos });
                                                    }}
                                                    className="text-red-600"
                                                >
                                                    ✕
                                                </Button>
                                            </div>
                                        ))}
                                        <Button
                                            size="sm"
                                            variant="outline"
                                            className="mt-2"
                                            onClick={() => {
                                                setNovoProtocolo({
                                                    ...novoProtocolo,
                                                    passos: [...novoProtocolo.passos, ""],
                                                });
                                            }}
                                        >
                                            + Adicionar Passo
                                        </Button>
                                    </div>
                                    <div>
                                        <Label>Dicas</Label>
                                        <Textarea
                                            placeholder="Dicas para melhor execução"
                                            value={novoProtocolo.dicas}
                                            onChange={(e) => setNovoProtocolo({ ...novoProtocolo, dicas: e.target.value })}
                                        />
                                    </div>
                                    <Button onClick={publicarProtocolo} className="w-full" style={{ background: "oklch(0.42 0.14 145)" }}>
                                        Publicar Protocolo
                                    </Button>
                                </div>
                            </DialogContent>
                        </Dialog>

                        {loading ? (
                            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                        ) : protocolos.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p className="font-medium">Nenhum protocolo compartilhado</p>
                                <p className="text-sm mt-1">Compartilhe seus conhecimentos</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {protocolos.map((protocolo) => (
                                    <Card key={protocolo.id} className="hover:shadow-md transition-shadow">
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h3 className="font-semibold text-sm">{protocolo.titulo}</h3>
                                                    <p className="text-xs text-muted-foreground mt-1">{protocolo.descricao}</p>
                                                </div>
                                                <div className="flex gap-1">
                                                    {Array.from({ length: 5 }).map((_, i) => (
                                                        <Star key={i} className={`w-3 h-3 ${i < (protocolo.nivel_confianca || 3) ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`} />
                                                    ))}
                                                </div>
                                            </div>
                                            <div className="flex flex-wrap gap-2 mt-2">
                                                <Badge variant="outline" className="text-xs">
                                                    {protocolo.tipo}
                                                </Badge>
                                                <Badge variant="outline" className="text-xs">
                                                    {protocolo.dificuldade}
                                                </Badge>
                                                {(protocolo.tags ?? []).slice(0, 3).map(tag => (
                                                    <Badge key={tag} variant="secondary" className="text-xs">
                                                        #{tag}
                                                    </Badge>
                                                ))}
                                            </div>
                                            {protocolo.passos && protocolo.passos.length > 0 && (
                                                <div className="mt-2 text-xs text-muted-foreground">
                                                    <strong>Passos:</strong> {protocolo.passos.length} etapas
                                                </div>
                                            )}
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>

                <TabsContent value="sucesso">
                    <div className="space-y-4">
                        {loading ? (
                            <div className="text-center py-8 text-muted-foreground">Carregando...</div>
                        ) : praticasSucesso.length === 0 ? (
                            <div className="text-center py-12 text-muted-foreground">
                                <Award className="w-12 h-12 mx-auto mb-3 opacity-30" />
                                <p className="font-medium">Nenhuma prática de sucesso registrada</p>
                                <p className="text-sm mt-1">Compartilhe suas histórias de sucesso</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {praticasSucesso.map((pratica) => (
                                    <Card key={pratica.id} className={`hover:shadow-md transition-shadow ${pratica.destaque ? 'border-yellow-400' : ''}`}>
                                        <CardContent className="p-4">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <h3 className="font-semibold text-sm">{pratica.titulo}</h3>
                                                    <p className="text-xs text-muted-foreground mt-1">{pratica.descricao}</p>
                                                </div>
                                                {pratica.destaque && (
                                                    <Badge className="bg-yellow-400 text-yellow-900 border-none">
                                                        ⭐ Destaque
                                                    </Badge>
                                                )}
                                            </div>
                                            {pratica.desafio && (
                                                <div className="mt-2 p-2 bg-orange-50 rounded-lg border border-orange-200">
                                                    <p className="text-xs font-medium text-orange-700">🎯 Desafio</p>
                                                    <p className="text-xs text-orange-600 mt-1">{pratica.desafio}</p>
                                                </div>
                                            )}
                                            {pratica.solucao && (
                                                <div className="mt-2 p-2 bg-green-50 rounded-lg border border-green-200">
                                                    <p className="text-xs font-medium text-green-700">💡 Solução</p>
                                                    <p className="text-xs text-green-600 mt-1">{pratica.solucao}</p>
                                                </div>
                                            )}
                                            {((pratica.produtividade ?? 0) > 0 || (pratica.lucro ?? 0) > 0) && (
                                                <div className="mt-2 grid grid-cols-2 gap-2">
                                                    {(pratica.produtividade ?? 0) > 0 && (
                                                        <div className="text-center p-2 bg-blue-50 rounded-lg">
                                                            <p className="text-xs text-muted-foreground">Produtividade</p>
                                                            <p className="text-sm font-bold text-blue-700">{pratica.produtividade} kg/ha</p>
                                                        </div>
                                                    )}
                                                    {(pratica.lucro ?? 0) > 0 && (
                                                        <div className="text-center p-2 bg-green-50 rounded-lg">
                                                            <p className="text-xs text-muted-foreground">Lucro</p>
                                                            <p className="text-sm font-bold text-green-700">
                                                                R$ {pratica.lucro.toLocaleString("pt-BR")}
                                                            </p>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                            {pratica.resultados && (
                                                <div className="mt-2 p-2 bg-gray-50 rounded-lg">
                                                    <p className="text-xs text-muted-foreground">{pratica.resultados}</p>
                                                </div>
                                            )}
                                            <div className="mt-3 flex gap-2">
                                                <Button size="sm" variant="outline" className="flex-1 text-xs">
                                                    <Users className="w-3 h-3 mr-1" />
                                                    Aprender
                                                </Button>
                                                <Button size="sm" variant="outline" className="flex-1 text-xs">
                                                    <Award className="w-3 h-3 mr-1" />
                                                    Compartilhar
                                                </Button>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>
                </TabsContent>
            </Tabs>
        </div>
    );
}
