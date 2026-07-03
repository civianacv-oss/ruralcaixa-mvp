import { useState } from "react";
import { ValidadorEmbrapa, dadosEmbrapa, formatarJanelaMMDD } from "@/lib/embrapa-validator";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
    Thermometer, Mountain, FlaskConical, Award, Lightbulb,
    TrendingUp, Sun, CloudRain,
} from "lucide-react";
import { toast } from "sonner";

interface DadosClimaticos {
    temperatura: number;
    precipitacao: number;
    altitude: number;
    ph_solo: number;
    materia_organica: number;
}

interface Recomendacao {
    cultura: string;
    score: number;
    produtividade_esperada: number;
    recomendacao: string;
    detalhes: {
        temperatura: string;
        precipitacao: string;
        altitude: string;
        ph: string;
        epoca: string;
    };
}

export function RecomendadorCulturas() {
    const [dadosClimaticos, setDadosClimaticos] = useState<DadosClimaticos>({
        temperatura: 26,
        precipitacao: 1200,
        altitude: 600,
        ph_solo: 6.0,
        materia_organica: 3.0,
    });
    const [regiao, setRegiao] = useState('Centro-Oeste');
    const [recomendacoes, setRecomendacoes] = useState<Recomendacao[]>([]);
    const [loading, setLoading] = useState(false);
    const validator = new ValidadorEmbrapa();

    const regioes = ['Norte', 'Nordeste', 'Centro-Oeste', 'Sudeste', 'Sul'];

    const handleRecomendar = () => {
        setLoading(true);
        try {
            const resultados = validator.recomendarCulturas(regiao, dadosClimaticos);
            const comDetalhes = resultados.map(r => {
                const ref = Object.values(dadosEmbrapa).find(d => d.cultura === r.cultura)!;
                return {
                    ...r,
                    detalhes: {
                        temperatura: `${ref.temperatura.min}°C - ${ref.temperatura.max}°C (ideal: ${ref.temperatura.ideal}°C)`,
                        precipitacao: `${ref.precipitacao.min}mm - ${ref.precipitacao.max}mm (ideal: ${ref.precipitacao.ideal}mm)`,
                        altitude: `${ref.altitude.min}m - ${ref.altitude.max}m (ideal: ${ref.altitude.ideal}m)`,
                        ph: `${ref.solo.ph.min} - ${ref.solo.ph.max} (ideal: ${ref.solo.ph.ideal})`,
                        epoca: `${formatarJanelaMMDD(ref.epoca_plantio.inicio)} a ${formatarJanelaMMDD(ref.epoca_plantio.fim)}`,
                    }
                };
            });
            setRecomendacoes(comDetalhes);
        } catch (error) {
            toast.error('Erro ao gerar recomendações');
        } finally {
            setLoading(false);
        }
    };

    const getScoreColor = (score: number) => {
        if (score >= 80) return 'text-green-600';
        if (score >= 65) return 'text-blue-600';
        if (score >= 50) return 'text-yellow-600';
        return 'text-red-600';
    };

    const getScoreLabel = (score: number) => {
        if (score >= 80) return '⭐ Excelente';
        if (score >= 65) return '👍 Bom';
        if (score >= 50) return '📊 Médio';
        return '⚠️ Limitado';
    };

    return (
        <div className="space-y-6 p-4">
            <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                    <h2 className="text-2xl font-bold" style={{ color: "oklch(0.22 0.06 145)" }}>
                        🤖 Recomendador de Culturas
                    </h2>
                    <p className="text-sm text-muted-foreground">
                        Baseado em dados de referência da Embrapa e condições da sua região
                    </p>
                </div>
                <Badge className="bg-green-100 text-green-700 border-none">
                    <Award className="w-3 h-3 mr-1" />
                    Referência Embrapa
                </Badge>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="text-sm font-medium">
                        📍 Configuração da Região
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        <div>
                            <Label>Região</Label>
                            <select
                                value={regiao}
                                onChange={(e) => setRegiao(e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                            >
                                {regioes.map(r => (
                                    <option key={r} value={r}>{r}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <Label>Temperatura Média (°C)</Label>
                            <Input
                                type="number"
                                value={dadosClimaticos.temperatura}
                                onChange={(e) => setDadosClimaticos({
                                    ...dadosClimaticos,
                                    temperatura: parseFloat(e.target.value)
                                })}
                            />
                        </div>
                        <div>
                            <Label>Precipitação (mm/ano)</Label>
                            <Input
                                type="number"
                                value={dadosClimaticos.precipitacao}
                                onChange={(e) => setDadosClimaticos({
                                    ...dadosClimaticos,
                                    precipitacao: parseFloat(e.target.value)
                                })}
                            />
                        </div>
                        <div>
                            <Label>Altitude (m)</Label>
                            <Input
                                type="number"
                                value={dadosClimaticos.altitude}
                                onChange={(e) => setDadosClimaticos({
                                    ...dadosClimaticos,
                                    altitude: parseFloat(e.target.value)
                                })}
                            />
                        </div>
                        <div>
                            <Label>pH do Solo</Label>
                            <Input
                                type="number"
                                step="0.1"
                                value={dadosClimaticos.ph_solo}
                                onChange={(e) => setDadosClimaticos({
                                    ...dadosClimaticos,
                                    ph_solo: parseFloat(e.target.value)
                                })}
                            />
                        </div>
                        <div>
                            <Label>Matéria Orgânica (%)</Label>
                            <Input
                                type="number"
                                step="0.1"
                                value={dadosClimaticos.materia_organica}
                                onChange={(e) => setDadosClimaticos({
                                    ...dadosClimaticos,
                                    materia_organica: parseFloat(e.target.value)
                                })}
                            />
                        </div>
                    </div>
                    <Button
                        onClick={handleRecomendar}
                        disabled={loading}
                        className="mt-4 w-full"
                        style={{ background: "oklch(0.42 0.14 145)" }}
                    >
                        {loading ? 'Analisando...' : '🔍 Gerar Recomendações'}
                    </Button>
                </CardContent>
            </Card>

            {recomendacoes.length > 0 && (
                <div className="space-y-4">
                    <h3 className="text-sm font-semibold text-muted-foreground">
                        🌱 Culturas Recomendadas para sua Região
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {recomendacoes.map((rec, index) => (
                            <Card key={index} className="hover:shadow-lg transition-shadow">
                                <CardContent className="p-4">
                                    <div className="flex items-start justify-between">
                                        <div>
                                            <h4 className="font-bold text-lg">{rec.cultura}</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <span className={`font-semibold ${getScoreColor(rec.score)}`}>
                                                    {getScoreLabel(rec.score)}
                                                </span>
                                                <Badge variant="outline" className="text-xs">
                                                    Score: {rec.score}%
                                                </Badge>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-xs text-muted-foreground">Produtividade</div>
                                            <div className="font-bold text-green-700">
                                                {rec.produtividade_esperada} kg/ha
                                            </div>
                                        </div>
                                    </div>

                                    <div className="mt-3">
                                        <Progress value={rec.score} className="h-2" />
                                    </div>

                                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                                        <div className="flex items-center gap-1">
                                            <Thermometer className="w-3 h-3 text-orange-500" />
                                            <span className="text-muted-foreground">{rec.detalhes.temperatura}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <CloudRain className="w-3 h-3 text-blue-500" />
                                            <span className="text-muted-foreground">{rec.detalhes.precipitacao}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <Mountain className="w-3 h-3 text-purple-500" />
                                            <span className="text-muted-foreground">{rec.detalhes.altitude}</span>
                                        </div>
                                        <div className="flex items-center gap-1">
                                            <FlaskConical className="w-3 h-3 text-amber-500" />
                                            <span className="text-muted-foreground">pH {rec.detalhes.ph}</span>
                                        </div>
                                    </div>

                                    <div className="mt-2 p-2 bg-blue-50 rounded-lg border border-blue-100">
                                        <div className="flex items-center gap-1 text-xs text-blue-700">
                                            <Sun className="w-3 h-3" />
                                            <span>Época: {rec.detalhes.epoca}</span>
                                        </div>
                                    </div>

                                    <div className="mt-3 flex gap-2">
                                        <Button size="sm" variant="outline" className="flex-1 text-xs">
                                            <Lightbulb className="w-3 h-3 mr-1" />
                                            Ver Protocolos
                                        </Button>
                                        <Button size="sm" variant="outline" className="flex-1 text-xs">
                                            <TrendingUp className="w-3 h-3 mr-1" />
                                            Detalhes
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                </div>
            )}

            <Card className="bg-gray-50">
                <CardContent className="p-4">
                    <p className="text-xs text-muted-foreground">
                        📚 Dados de referência inspirados em pesquisas da Embrapa e instituições parceiras
                        (não é uma extração oficial). As recomendações consideram zoneamento agrícola geral —
                        consulte um engenheiro agrônomo para validação final antes de investir.
                    </p>
                </CardContent>
            </Card>
        </div>
    );
}
