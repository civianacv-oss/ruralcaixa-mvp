"use client";
import { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Legend,
} from "recharts";

// URL do seu Backend Local
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "https://ruralcaixa-mvp-production.up.railway.app";

const fmt = (v: number ) =>
  v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function AnalyticsContent() {
  const searchParams = useSearchParams();
  const produtorId = searchParams.get("produtor_id") || "1";
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/produtores/${produtorId}/analytics`)
      .then(res => res.json())
      .then(json => {
        setData(json);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [produtorId]);

  if (loading) return <div className="p-8 text-center">Carregando dados do Campo Digital...</div>;
  if (!data) return <div className="p-8 text-center text-red-500">Erro ao conectar no Backend. Verifique se o Uvicorn está rodando.</div>;

  return (
    <div className="p-4 max-w-md mx-auto space-y-4">
      <h1 className="text-xl font-bold text-green-800">Dashboard João Batista</h1>
      <div className="bg-white p-4 rounded-xl shadow-sm border-l-4 border-green-500">
        <p className="text-xs text-gray-500">Receita Total (Jan/Fev)</p>
        <p className="text-lg font-bold text-green-700">{fmt(42100)}</p>
      </div>
      <div className="h-64 bg-white p-2 rounded-xl shadow-sm">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.evolucao_mensal}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="mes" fontSize={10} />
            <YAxis fontSize={10} />
            <Tooltip />
            <Bar dataKey="total" fill="#15803d" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="text-[10px] text-center text-gray-400">Sincronizado com Backend Local: {API_BASE}</p>
    </div>
  );
}

export default function Page() {
  return <Suspense><AnalyticsContent /></Suspense>;
}
