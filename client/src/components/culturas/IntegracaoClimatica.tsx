import { useState, useEffect } from "react";
import { API_BASE } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
    Sun, Cloud, CloudRain, Wind, Thermometer,
    Droplets, CloudLightning, CloudSun,
} from "lucide-react";
import { toast } from "sonner";

interface PrevisaoDia {
    data: string;
    temp_min: number | null;
    temp_max: number | null;
    resumo_manha: string | null;
    resumo_tarde: string | null;
    resumo_noite: string | null;
    umidade_min: number | null;
    umidade_max: number | null;
    direcao_vento: string | null;
    intensidade_vento: string | null;
}

interface DadosClimaticosAPI {
    codigo_ibge: string;
    previsao: PrevisaoDia[];
    parse_ok: boolean;
}

// A previsão pública do INMET não expõe "condição atual" em tempo real —
// só previsão por turno/dia. Este componente mostra a previsão dos próximos
// dias; o card "Hoje" usa o primeiro dia retornado como aproximação.
export function IntegracaoClimatica({ municipioInicial, ufInicial }: { municipioInicial?: string; ufInicial?: string }) {
    const [dados, setDados] = useState<DadosClimaticosAPI | null>(null);
    const [loading, setLoading] = useState(true);
    const [erro, setErro] = useState<string | null>(null);
    const [cidade, setCidade] = useState(municipioInicial ?? '');
    const [uf, setUf] = useState(ufInicial ?? '');

    useEffect(() => {
        if (cidade && uf) carregarDados();
        else setLoading(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    async function carregarDados() {
        if (!cidade.trim() || !uf.trim()) {
            toast.error("Informe cidade e UF");
            return;
        }
        setLoading(true);
        setErro(null);
        try {
            const res = await fetch(`${API_BASE}/clima/${encodeURIComponent(cidade.trim())}/${uf.trim()}`);
            if (res.ok) {
                const data = await res.json();
                setDados(data);
                if (data.parse_ok === false) {
                    toast.error("Formato de resposta do INMET mudou — dados podem estar incompletos");
                }
            } else {
                const err = await res.json().catch(() => ({ detail: "Erro desconhecido" }));
                setErro(err.detail ?? "Erro ao consultar previsão");
                setDados(null);
            }
        } catch (error) {
            toast.error('Erro ao conectar com o servidor');
            setErro("Erro ao conectar com o servidor");
        } finally {
            setLoading(false);
        }
    }

    const getIconeClima = (resumo: string | null) => {
        const r = (resumo ?? '').toLowerCase();
        if (r.includes('sol') || r.includes('claro')) return <Sun className="w-6 h-6 text-yellow-500" />;
        if (r.includes('chuv') || r.includes('pancada')) return <CloudRain className="w-6 h-6 text-blue-500" />;
        if (r.includes('trovoada')) return <CloudLightning className="w-6 h-6 text-orange-500" />;
        if (r.includes('nublado') || r.includes('nuvens')) return <Cloud className="w-6 h-6 text-gray-500" />;
        return <CloudSun className="w-6 h-6 text-yellow-400" />;
    };

    const hoje = dados?.previsao?.[0];

    return (
        <div className="space-y-6 p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>
                        🌦️ Integração Climática
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Previsão do tempo (INMET) para a região das suas culturas
                    </p>
                </div>
                <div className="flex gap-2 items-end">
                    <div>
                        <Label className="text-xs">Cidade</Label>
                        <Input
                            placeholder="Cidade"
                            value={cidade}
                            onChange={(e) => setCidade(e.target.value)}
                            className="w-36"
                        />
                    </div>
                    <div>
                        <Label className="text-xs">UF</Label>
                        <Input
                            placeholder="UF"
                            value={uf}
                            onChange={(e) => setUf(e.target.value.toUpperCase())}
                            maxLength={2}
                            className="w-16"
                        />
                    </div>
                    <Button size="sm" onClick={carregarDados} disabled={loading}>
                        <CloudRain className="w-4 h-4 mr-2" />
                        {loading ? 'Buscando...' : 'Buscar'}
                    </Button>
                </div>
            </div>

            {loading ? (
                <div className="text-center py-8 text-muted-foreground">Carregando previsão do INMET...</div>
            ) : erro ? (
                <div className="text-center py-12 text-muted-foreground">
                    <CloudSun className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">{erro}</p>
                    <p className="text-sm mt-1">Confira o nome da cidade e a UF (ex.: São Luís / MA)</p>
                </div>
            ) : dados && hoje ? (
                <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <Card>
                            <CardContent className="pt-4">
                                <div className="flex items-center gap-2">
                                    <Thermometer className="w-5 h-5 text-orange-500" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Hoje</p>
                                        <p className="text-2xl font-bold">
                                            {hoje.temp_max ?? '—'}° / {hoje.temp_min ?? '—'}°
                                        </p>
                                        <p className="text-xs text-muted-foreground">Máx / Mín</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-4">
                                <div className="flex items-center gap-2">
                                    <Droplets className="w-5 h-5 text-blue-500" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Umidade</p>
                                        <p className="text-2xl font-bold">
                                            {hoje.umidade_min ?? '—'}–{hoje.umidade_max ?? '—'}%
                                        </p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-4">
                                <div className="flex items-center gap-2">
                                    <Wind className="w-5 h-5 text-blue-400" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Vento</p>
                                        <p className="text-lg font-bold">{hoje.intensidade_vento ?? '—'}</p>
                                        <p className="text-xs text-muted-foreground">Direção: {hoje.direcao_vento ?? '—'}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardContent className="pt-4">
                                <div className="flex items-center gap-2">
                                    {getIconeClima(hoje.resumo_tarde ?? hoje.resumo_manha)}
                                    <div>
                                        <p className="text-xs text-muted-foreground">Condição (tarde)</p>
                                        <p className="text-sm font-bold">{hoje.resumo_tarde ?? hoje.resumo_manha ?? '—'}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle className="text-sm font-medium">
                                📅 Previsão dos Próximos Dias
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                                {dados.previsao.map((dia, index) => (
                                    <Card key={index} className="bg-gray-50">
                                        <CardContent className="p-3 text-center">
                                            <div className="text-xs font-medium">
                                                {new Date(dia.data).toLocaleDateString('pt-BR', { weekday: 'short', day: '2-digit', month: '2-digit' })}
                                            </div>
                                            <div className="my-2 flex justify-center">
                                                {getIconeClima(dia.resumo_tarde ?? dia.resumo_manha)}
                                            </div>
                                            <div className="text-sm font-bold">
                                                {dia.temp_max ?? '—'}° / {dia.temp_min ?? '—'}°
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {dia.resumo_tarde ?? dia.resumo_manha ?? '—'}
                                            </div>
                                            <div className="text-xs text-muted-foreground">
                                                {dia.umidade_min ?? '—'}–{dia.umidade_max ?? '—'}% umidade
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    <Card className="bg-blue-50 border-blue-200">
                        <CardContent className="p-4">
                            <h4 className="text-sm font-semibold text-blue-700 mb-2">💡 Recomendações para o Período</h4>
                            <ul className="space-y-1 text-xs text-blue-600">
                                <li>• {(hoje.temp_max ?? 0) > 32 ? '🌡️ Temperaturas altas previstas: planeje irrigação e evite horários de pico' : '✅ Temperaturas dentro da faixa comum para tratos culturais'}</li>
                                <li>• {(hoje.resumo_tarde ?? '').toLowerCase().includes('chuv') ? '🌧️ Chuva prevista: evite aplicações de defensivos hoje' : '☀️ Sem chuva prevista: bom período para tratos culturais'}</li>
                                <li>• {(hoje.umidade_max ?? 0) > 80 ? '💨 Umidade alta: atenção redobrada a doenças fúngicas' : '✅ Umidade dentro do esperado'}</li>
                            </ul>
                            <p className="text-[11px] text-blue-500 mt-2">
                                Fonte: previsão pública do INMET (Instituto Nacional de Meteorologia). Dados de curto prazo
                                (poucos dias) — para decisões de plantio de longo prazo, consulte o zoneamento agrícola oficial.
                            </p>
                        </CardContent>
                    </Card>
                </>
            ) : (
                <div className="text-center py-12 text-muted-foreground">
                    <CloudSun className="w-12 h-12 mx-auto mb-3 opacity-30" />
                    <p className="font-medium">Informe a cidade e UF do seu imóvel para ver a previsão</p>
                </div>
            )}
        </div>
    );
}
