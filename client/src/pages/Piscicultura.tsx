import { Fish, Construction } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

/**
 * Placeholder da tela de Piscicultura.
 *
 * O backend deste módulo já existe (router_piscicultura.py, tabelas
 * ciclos_piscicultura / biometrias_piscicultura / registros_diarios_piscicultura /
 * compras_insumos_piscicultura / despescas_piscicultura, cron de alertas ativo)
 * — só falta a interface. Esta página evita 404 no menu enquanto a tela
 * completa (ciclos, biometria, qualidade da água, alimentação, doenças/parasitas,
 * conforme o fluxograma de gestão econômica/sanitária da piscicultura) não é
 * construída em uma sessão dedicada.
 */
export default function Piscicultura() {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Fish className="w-5 h-5 text-emerald-600" />
            Piscicultura
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted-foreground">
          <div className="flex items-center gap-2 text-amber-600 font-medium">
            <Construction className="w-4 h-4" />
            Tela em construção
          </div>
          <p>
            O backend deste módulo já está pronto (ciclos de produção, biometrias,
            registros diários, compras de insumos, despescas e alertas automáticos).
            A interface completa — com gestão econômica e sanitária, monitoramento
            de água e controle de doenças/parasitas — será construída em uma
            próxima etapa.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
