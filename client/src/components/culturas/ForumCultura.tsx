import { useState, useEffect } from "react";
import { API_BASE, getImovelId } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
    MessageCircle, ThumbsUp, Reply, Share2,
    Pin, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";

interface TopicoForum {
    id: number;
    cultura_id: number;
    titulo: string;
    conteudo: string;
    autor: string;
    autor_id: number;
    data_criacao: string;
    respostas: number;
    visualizacoes: number;
    curtidas: number;
    fixado: boolean;
    resolvido: boolean;
    tags: string[];
    ultima_atividade: string;
}

interface RespostaForum {
    id: number;
    topico_id: number;
    conteudo: string;
    autor: string;
    autor_id: number;
    data_criacao: string;
    curtidas: number;
    resolucao: boolean;
}

export function ForumCultura({ culturaId, culturaNome }: { culturaId: number; culturaNome: string }) {
    const [topicos, setTopicos] = useState<TopicoForum[]>([]);
    const [respostas, setRespostas] = useState<RespostaForum[]>([]);
    const [loading, setLoading] = useState(true);
    const [topicoSelecionado, setTopicoSelecionado] = useState<number | null>(null);
    const [novoTopico, setNovoTopico] = useState({
        titulo: "",
        conteudo: "",
        tags: "",
    });
    const [novaResposta, setNovaResposta] = useState("");
    const [showNovoTopico, setShowNovoTopico] = useState(false);
    const imovelId = getImovelId();

    useEffect(() => {
        carregarTopicos();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [culturaId]);

    async function carregarTopicos() {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/forum/topicos?cultura_id=${culturaId}`);
            if (res.ok) {
                const data = await res.json();
                setTopicos(data);
            }
        } catch (error) {
            toast.error("Erro ao carregar tópicos");
        } finally {
            setLoading(false);
        }
    }

    async function carregarRespostas(topicoId: number) {
        try {
            const res = await fetch(`${API_BASE}/forum/respostas?topico_id=${topicoId}`);
            if (res.ok) {
                const data = await res.json();
                setRespostas(data);
            }
        } catch (error) {
            toast.error("Erro ao carregar respostas");
        }
    }

    async function criarTopico() {
        if (!novoTopico.titulo || !novoTopico.conteudo) {
            toast.error("Preencha todos os campos");
            return;
        }
        if (!imovelId) {
            toast.error("Selecione um imóvel antes de publicar");
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/forum/topicos`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    cultura_id: culturaId,
                    imovel_id: imovelId,
                    titulo: novoTopico.titulo,
                    conteudo: novoTopico.conteudo,
                    tags: novoTopico.tags.split(",").map(t => t.trim()).filter(Boolean),
                }),
            });

            if (res.ok) {
                toast.success("Tópico criado com sucesso!");
                setNovoTopico({ titulo: "", conteudo: "", tags: "" });
                setShowNovoTopico(false);
                carregarTopicos();
            } else {
                toast.error("Erro ao criar tópico");
            }
        } catch (error) {
            toast.error("Erro ao criar tópico");
        }
    }

    async function criarResposta(topicoId: number) {
        if (!novaResposta.trim()) {
            toast.error("Digite uma resposta");
            return;
        }
        if (!imovelId) {
            toast.error("Selecione um imóvel antes de responder");
            return;
        }

        try {
            const res = await fetch(`${API_BASE}/forum/respostas`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    topico_id: topicoId,
                    imovel_id: imovelId,
                    conteudo: novaResposta,
                }),
            });

            if (res.ok) {
                toast.success("Resposta adicionada!");
                setNovaResposta("");
                carregarRespostas(topicoId);
                carregarTopicos();
            }
        } catch (error) {
            toast.error("Erro ao adicionar resposta");
        }
    }

    async function curtirTopico(topicoId: number) {
        if (!imovelId) { toast.error("Selecione um imóvel"); return; }
        try {
            await fetch(`${API_BASE}/forum/topicos/${topicoId}/curtir`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ imovel_id: imovelId }),
            });
            carregarTopicos();
        } catch (error) {
            toast.error("Erro ao curtir");
        }
    }

    async function marcarResolvido(topicoId: number, respostaId: number) {
        try {
            await fetch(`${API_BASE}/forum/topicos/${topicoId}/resolver`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ resposta_id: respostaId }),
            });
            carregarRespostas(topicoId);
            carregarTopicos();
            toast.success("Resposta marcada como solução!");
        } catch (error) {
            toast.error("Erro ao marcar como resolvido");
        }
    }

    const topicoAtual = topicos.find(t => t.id === topicoSelecionado);

    return (
        <div className="space-y-4 p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h3 className="text-lg font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>
                        💬 Fórum: {culturaNome}
                    </h3>
                    <p className="text-sm text-muted-foreground">
                        {topicos.length} tópicos · {topicos.reduce((acc, t) => acc + t.respostas, 0)} respostas
                    </p>
                </div>
                <Button
                    size="sm"
                    onClick={() => setShowNovoTopico(!showNovoTopico)}
                    style={{ background: "oklch(0.42 0.14 145)" }}
                >
                    {showNovoTopico ? 'Cancelar' : '📝 Novo Tópico'}
                </Button>
            </div>

            {showNovoTopico && (
                <Card>
                    <CardContent className="p-4 space-y-3">
                        <div>
                            <Label>Título *</Label>
                            <Input
                                placeholder="Digite o título do tópico"
                                value={novoTopico.titulo}
                                onChange={(e) => setNovoTopico({ ...novoTopico, titulo: e.target.value })}
                            />
                        </div>
                        <div>
                            <Label>Conteúdo *</Label>
                            <Textarea
                                placeholder="Descreva sua dúvida ou experiência"
                                value={novoTopico.conteudo}
                                onChange={(e) => setNovoTopico({ ...novoTopico, conteudo: e.target.value })}
                                rows={4}
                            />
                        </div>
                        <div>
                            <Label>Tags (separadas por vírgula)</Label>
                            <Input
                                placeholder="Ex: plantio, adubacao, colheita"
                                value={novoTopico.tags}
                                onChange={(e) => setNovoTopico({ ...novoTopico, tags: e.target.value })}
                            />
                        </div>
                        <Button onClick={criarTopico} className="w-full" style={{ background: "oklch(0.42 0.14 145)" }}>
                            Publicar Tópico
                        </Button>
                    </CardContent>
                </Card>
            )}

            {topicoSelecionado && topicoAtual ? (
                <>
                    <Button variant="outline" size="sm" onClick={() => setTopicoSelecionado(null)}>
                        ← Voltar para tópicos
                    </Button>

                    <Card>
                        <CardContent className="p-4">
                            <div className="flex items-start justify-between">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2">
                                        <h4 className="font-bold text-lg">{topicoAtual.titulo}</h4>
                                        {topicoAtual.fixado && <Pin className="w-4 h-4 text-yellow-500" />}
                                        {topicoAtual.resolvido && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                                    </div>
                                    <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                                        <span>👤 {topicoAtual.autor}</span>
                                        <span>📅 {new Date(topicoAtual.data_criacao).toLocaleDateString('pt-BR')}</span>
                                        <span>👁️ {topicoAtual.visualizacoes} visualizações</span>
                                    </div>
                                    <div className="mt-3 text-sm whitespace-pre-wrap">
                                        {topicoAtual.conteudo}
                                    </div>
                                    <div className="flex flex-wrap gap-1 mt-2">
                                        {(topicoAtual.tags ?? []).map(tag => (
                                            <Badge key={tag} variant="secondary" className="text-xs">
                                                #{tag}
                                            </Badge>
                                        ))}
                                    </div>
                                    <div className="flex items-center gap-4 mt-3">
                                        <Button variant="ghost" size="sm" onClick={() => curtirTopico(topicoAtual.id)}>
                                            <ThumbsUp className="w-4 h-4 mr-1" />
                                            {topicoAtual.curtidas}
                                        </Button>
                                        <Button variant="ghost" size="sm">
                                            <Share2 className="w-4 h-4 mr-1" />
                                            Compartilhar
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="space-y-3">
                        <h4 className="text-sm font-semibold">
                            Respostas ({topicoAtual.respostas})
                        </h4>

                        {respostas.map((resposta) => (
                            <Card key={resposta.id} className={resposta.resolucao ? 'border-green-400 bg-green-50' : ''}>
                                <CardContent className="p-4">
                                    <div className="flex items-start gap-3">
                                        <Avatar className="w-8 h-8">
                                            <AvatarFallback>
                                                {resposta.autor?.charAt(0).toUpperCase() ?? '?'}
                                            </AvatarFallback>
                                        </Avatar>
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <span className="font-semibold text-sm">{resposta.autor}</span>
                                                <span className="text-xs text-muted-foreground">
                                                    {new Date(resposta.data_criacao).toLocaleDateString('pt-BR')}
                                                </span>
                                                {resposta.resolucao && (
                                                    <Badge className="bg-green-500 text-white border-none text-xs">
                                                        ✅ Solução
                                                    </Badge>
                                                )}
                                            </div>
                                            <p className="text-sm mt-1 whitespace-pre-wrap">{resposta.conteudo}</p>
                                            <div className="flex items-center gap-4 mt-2">
                                                <Button variant="ghost" size="sm" className="text-xs">
                                                    <ThumbsUp className="w-3 h-3 mr-1" />
                                                    {resposta.curtidas}
                                                </Button>
                                                {!topicoAtual.resolvido && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        className="text-xs text-green-600"
                                                        onClick={() => marcarResolvido(topicoAtual.id, resposta.id)}
                                                    >
                                                        <CheckCircle2 className="w-3 h-3 mr-1" />
                                                        Marcar como solução
                                                    </Button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}

                        <Card>
                            <CardContent className="p-4">
                                <Textarea
                                    placeholder="Escreva sua resposta..."
                                    value={novaResposta}
                                    onChange={(e) => setNovaResposta(e.target.value)}
                                    rows={3}
                                />
                                <Button
                                    onClick={() => criarResposta(topicoAtual.id)}
                                    className="mt-2"
                                    style={{ background: "oklch(0.42 0.14 145)" }}
                                >
                                    <Reply className="w-4 h-4 mr-2" />
                                    Responder
                                </Button>
                            </CardContent>
                        </Card>
                    </div>
                </>
            ) : (
                <div className="space-y-3">
                    {loading ? (
                        <div className="text-center py-8 text-muted-foreground">Carregando tópicos...</div>
                    ) : topicos.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="font-medium">Nenhum tópico ainda</p>
                            <p className="text-sm mt-1">Seja o primeiro a iniciar uma discussão sobre {culturaNome}</p>
                        </div>
                    ) : (
                        topicos.map((topico) => (
                            <Card
                                key={topico.id}
                                className="hover:shadow-md transition-shadow cursor-pointer"
                                onClick={() => {
                                    setTopicoSelecionado(topico.id);
                                    carregarRespostas(topico.id);
                                }}
                            >
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div className="flex-1">
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-semibold">{topico.titulo}</h4>
                                                {topico.fixado && <Pin className="w-3 h-3 text-yellow-500" />}
                                                {topico.resolvido && <CheckCircle2 className="w-3 h-3 text-green-500" />}
                                            </div>
                                            <p className="text-sm text-muted-foreground line-clamp-2">
                                                {topico.conteudo}
                                            </p>
                                            <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                                                <span>👤 {topico.autor}</span>
                                                <span>📅 {new Date(topico.data_criacao).toLocaleDateString('pt-BR')}</span>
                                                <span>💬 {topico.respostas} respostas</span>
                                                <span>❤️ {topico.curtidas}</span>
                                            </div>
                                            <div className="flex flex-wrap gap-1 mt-1">
                                                {(topico.tags ?? []).slice(0, 3).map(tag => (
                                                    <Badge key={tag} variant="secondary" className="text-xs">
                                                        #{tag}
                                                    </Badge>
                                                ))}
                                                {(topico.tags ?? []).length > 3 && (
                                                    <Badge variant="secondary" className="text-xs">
                                                        +{topico.tags.length - 3}
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                        <div className="text-right text-xs text-muted-foreground ml-4">
                                            <div>{topico.respostas} respostas</div>
                                            <div className="mt-1 text-green-600">
                                                {topico.ultima_atividade && new Date(topico.ultima_atividade).toLocaleDateString('pt-BR')}
                                            </div>
                                        </div>
                                    </div>
                                </CardContent>
                            </Card>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
