"use client";
import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";

const API = "https://ruralcaixa-mvp-production.up.railway.app";

function CadastroContent() {
  const searchParams = useSearchParams();
  const produtorIdParam = searchParams.get("produtor_id");
  const modoEdicao = !!produtorIdParam;

  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [loadingDados, setLoadingDados] = useState(modoEdicao);
  const [produtor, setProdutor] = useState({ nome: "", cpf: "", telefone: "", nirf: "" });
  const [imovel, setImovel] = useState({ nome: "", nirf: "", area_ha: "", municipio: "", uf: "" });
  const [salvo, setSalvo] = useState(false);
  const [produtorId, setProdutorId] = useState<number | null>(modoEdicao ? parseInt(produtorIdParam!) : null);
  const [imoveisExistentes, setImoveisExistentes] = useState<any[]>([]);
  const [imovelSelecionado, setImovelSelecionado] = useState<number | null>(null);
  const [novoImovel, setNovoImovel] = useState(false);
  const ufs = ["AC","AL","AM","AP","BA","CE","DF","ES","GO","MA","MG","MS","MT","PA","PB","PE","PI","PR","RJ","RN","RO","RR","RS","SC","SE","SP","TO"];

  // Carregar dados se modo edição
  useEffect(() => {
    if (!modoEdicao || !produtorIdParam) return;
    const pid = parseInt(produtorIdParam);
    fetch(`${API}/produtores`)
      .then(r => r.json())
      .then(prods => {
        const p = prods.find((x: any) => x.id === pid);
        if (p) {
          const tel = p.telefone?.replace(/^55/, "").replace(/^(\d{2})(\d{5})(\d{4})$/, "($1) $2-$3") || "";
          setProdutor({ nome: p.nome, cpf: p.cpf, telefone: tel, nirf: "" });
        }
        return fetch(`${API}/produtor/imoveis?cpf=${p?.cpf?.replace(/\D/g,"") || ""}`);
      })
      .then(r => r.json())
      .then(imoveis => {
        setImoveisExistentes(imoveis);
        if (imoveis.length > 0) setImovelSelecionado(imoveis[0].id);
      })
      .catch(console.error)
      .finally(() => setLoadingDados(false));
  }, [produtorIdParam]);

  function formatCPF(v: string) {
    return v.replace(/\D/g,"").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d)/,"$1.$2").replace(/(\d{3})(\d{1,2})$/,"$1-$2").slice(0,14);
  }

  function formatTel(v: string) {
    return v.replace(/\D/g,"").replace(/^(\d{2})(\d)/,"($1) $2").replace(/(\d{5})(\d)/,"$1-$2").slice(0,15);
  }

  async function salvar() {
    setLoading(true);
    try {
      if (modoEdicao && produtorId) {
        // Atualizar produtor existente
        const res = await fetch(`${API}/produtores/${produtorId}`, {
          method: "PUT",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            nome: produtor.nome,
            telefone: "55" + produtor.telefone.replace(/\D/g,""),
            nirf: produtor.nirf || null,
          }),
        });
        if (res.ok) {
          setSalvo(true);
        } else {
          alert("Erro ao atualizar.");
        }
      } else {
        // Cadastro novo
        const res = await fetch(API + "/cadastro", {
          method: "POST",
          headers: {"Content-Type": "application/json"},
          body: JSON.stringify({
            produtor: {
              nome: produtor.nome,
              cpf: produtor.cpf,
              telefone: "55" + produtor.telefone.replace(/\D/g,""),
              nirf: produtor.nirf || null
            },
            imovel: {
              nome: imovel.nome,
              nirf: imovel.nirf || null,
              area_ha: imovel.area_ha ? parseFloat(imovel.area_ha) : null,
              municipio: imovel.municipio,
              uf: imovel.uf
            }
          })
        });
        const data = await res.json();
        if (data.produtor_id) {
          setProdutorId(data.produtor_id);
          setSalvo(true);
        } else {
          alert("Erro ao salvar.");
        }
      }
    } catch {
      alert("Erro de conexao.");
    } finally {
      setLoading(false);
    }
  }

  const inputClass = "w-full border border-gray-200 rounded-lg px-3 py-2 mt-1 text-sm bg-white text-gray-900";

  if (loadingDados) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-400">Carregando dados...</div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 max-w-md mx-auto pb-10">
      <div className="bg-green-800 text-white px-4 py-4">
        <a href="/contador" className="text-xs opacity-70">← Painel do contador</a>
        <div className="text-lg font-medium mt-1">{modoEdicao ? "Editar produtor" : "Cadastrar produtor"}</div>
      </div>

      {!modoEdicao && (
        <div className="flex px-4 pt-4 gap-2">
          {["Dados pessoais","Imovel rural","Confirmar"].map((s,i) => (
            <div key={i} className="flex-1">
              <div className={"h-1 rounded " + (step > i ? "bg-green-700" : step === i+1 ? "bg-green-500" : "bg-gray-200")}></div>
              <div className={"text-xs mt-1 text-center " + (step === i+1 ? "text-green-800 font-medium" : "text-gray-400")}>{s}</div>
            </div>
          ))}
        </div>
      )}

      <div className="p-4 space-y-4">

        {/* MODO EDIÇÃO */}
        {modoEdicao && !salvo && (
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <div className="text-sm font-medium text-gray-600">Dados do produtor</div>
            <div>
              <label className="text-xs text-gray-500">Nome completo *</label>
              <input className={inputClass} value={produtor.nome} onChange={e => setProdutor({...produtor, nome: e.target.value})} />
            </div>
            <div>
              <label className="text-xs text-gray-500">CPF (não editável)</label>
              <input className={inputClass + " bg-gray-50 text-gray-400"} value={produtor.cpf} disabled />
            </div>
            <div>
              <label className="text-xs text-gray-500">WhatsApp *</label>
              <div className="flex gap-2 mt-1">
                <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500">+55</div>
                <input
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900"
                  value={produtor.telefone}
                  inputMode="numeric"
                  type="tel"
                  onChange={e => setProdutor({...produtor, telefone: formatTel(e.target.value)})}
                />
              </div>
            </div>

            {imoveisExistentes.length > 0 && (
              <div className="border-t pt-3">
                <div className="text-sm font-medium text-gray-600 mb-2">Imóveis cadastrados</div>
                {imoveisExistentes.map(im => (
                  <div key={im.id} className="px-3 py-2 rounded-lg border border-gray-200 text-sm mb-2">
                    <div className="font-medium">{im.nome}</div>
                    <div className="text-xs text-gray-400">{im.municipio} - {im.uf}{im.area_ha ? ` · ${im.area_ha} ha` : ""}</div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex gap-3">
              <a href="/contador" className="flex-1 py-3 rounded-lg text-sm border border-gray-200 text-center">Cancelar</a>
              <button
                onClick={salvar}
                disabled={loading || !produtor.nome}
                className="flex-1 py-3 rounded-lg text-sm font-medium text-white bg-green-800 disabled:bg-gray-400"
              >
                {loading ? "Salvando..." : "Salvar alterações"}
              </button>
            </div>
          </div>
        )}

        {/* MODO CADASTRO NORMAL */}
        {!modoEdicao && step === 1 && (
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <div className="text-sm font-medium text-gray-600">Dados do produtor</div>
            <div>
              <label className="text-xs text-gray-500">Nome completo *</label>
              <input className={inputClass} placeholder="Nome completo" value={produtor.nome} autoComplete="off" autoCorrect="off" autoCapitalize="words" onChange={e => setProdutor({...produtor, nome: e.target.value})} />
            </div>
            <div>
              <label className="text-xs text-gray-500">CPF *</label>
              <input className={inputClass} placeholder="000.000.000-00" value={produtor.cpf} autoComplete="off" inputMode="numeric" onChange={e => setProdutor({...produtor, cpf: formatCPF(e.target.value)})} />
            </div>
            <div>
              <label className="text-xs text-gray-500">WhatsApp *</label>
              <div className="flex gap-2 mt-1">
                <div className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500">+55</div>
                <input className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white text-gray-900" placeholder="(00) 00000-0000" value={produtor.telefone} inputMode="numeric" type="tel" autoComplete="off" onChange={e => setProdutor({...produtor, telefone: formatTel(e.target.value)})} />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">NIRF (opcional)</label>
              <input className={inputClass} placeholder="0000000-0" value={produtor.nirf} autoComplete="off" onChange={e => setProdutor({...produtor, nirf: e.target.value})} />
            </div>
            <button
              onClick={async () => {
                if (!produtor.nome || !produtor.cpf || !produtor.telefone) return;
                const cpf = produtor.cpf.replace(/\D/g, "");
                try {
                  const res = await fetch(`${API}/produtor/imoveis?cpf=${cpf}`);
                  const data = await res.json();
                  setImoveisExistentes(data);
                } catch (e) {
                  console.log("Erro ao buscar imoveis:", e);
                  setImoveisExistentes([]);
                }
                setNovoImovel(false);
                setImovelSelecionado(null);
                setStep(2);
              }}
              className={"w-full py-3 rounded-lg text-sm font-medium text-white " + (produtor.nome && produtor.cpf && produtor.telefone ? "bg-green-800" : "bg-gray-300")}
            >
              Proximo →
            </button>
          </div>
        )}

        {!modoEdicao && step === 2 && (
          <div className="bg-white rounded-xl p-4 shadow-sm space-y-3">
            <div className="text-sm font-medium text-gray-600">Imovel rural principal</div>
            {imoveisExistentes.length > 0 && !novoImovel && (
              <div className="space-y-2">
                <div className="text-xs text-gray-500 mb-1">Imóveis já cadastrados:</div>
                {imoveisExistentes.map(im => (
                  <button key={im.id} onClick={() => setImovelSelecionado(im.id)} className={`w-full text-left px-3 py-3 rounded-lg border text-sm ${imovelSelecionado === im.id ? "border-green-600 bg-green-50" : "border-gray-200 bg-white"}`}>
                    <div className="font-medium">{im.nome}</div>
                    <div className="text-xs text-gray-400">{im.municipio} - {im.uf}{im.area_ha ? ` · ${im.area_ha} ha` : ""}</div>
                  </button>
                ))}
                <button onClick={() => { setNovoImovel(true); setImovelSelecionado(null); }} className="w-full py-2 rounded-lg border border-dashed border-gray-300 text-sm text-gray-500">+ Cadastrar novo imóvel</button>
              </div>
            )}
            {(novoImovel || imoveisExistentes.length === 0) && (
              <>
                <div><label className="text-xs text-gray-500">Nome do imovel *</label><input className={inputClass} placeholder="Fazenda Boa Esperanca" value={imovel.nome} autoComplete="off" onChange={e => setImovel({...imovel, nome: e.target.value})} /></div>
                <div><label className="text-xs text-gray-500">NIRF do imovel</label><input className={inputClass} placeholder="0000000-0" value={imovel.nirf} autoComplete="off" onChange={e => setImovel({...imovel, nirf: e.target.value})} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="text-xs text-gray-500">Area (ha)</label><input type="number" className={inputClass} placeholder="450" value={imovel.area_ha} onChange={e => setImovel({...imovel, area_ha: e.target.value})} /></div>
                  <div><label className="text-xs text-gray-500">UF *</label><select className={inputClass} value={imovel.uf} onChange={e => setImovel({...imovel, uf: e.target.value})}><option value="">Selecione</option>{ufs.map(uf => <option key={uf} value={uf}>{uf}</option>)}</select></div>
                </div>
                <div><label className="text-xs text-gray-500">Municipio *</label><input className={inputClass} placeholder="Nome do municipio" value={imovel.municipio} autoComplete="off" onChange={e => setImovel({...imovel, municipio: e.target.value})} /></div>
              </>
            )}
            <div className="flex gap-3">
              <button onClick={() => setStep(1)} className="flex-1 py-3 rounded-lg text-sm border border-gray-200">← Voltar</button>
              <button onClick={() => { if (imovelSelecionado || (imovel.nome && imovel.uf && imovel.municipio)) setStep(3); }} className={"flex-1 py-3 rounded-lg text-sm font-medium text-white " + (imovelSelecionado || (imovel.nome && imovel.uf && imovel.municipio) ? "bg-green-800" : "bg-gray-300")}>Proximo →</button>
            </div>
          </div>
        )}

        {!modoEdicao && step === 3 && !salvo && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <div className="text-sm font-medium text-gray-600 mb-3">Confirme os dados</div>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Nome</span><span className="font-medium">{produtor.nome}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">CPF</span><span>{produtor.cpf}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">WhatsApp</span><span>+55 {produtor.telefone}</span></div>
                <div className="border-t pt-2 mt-2">
                  {imovelSelecionado ? (
                    <div className="flex justify-between"><span className="text-gray-500">Imovel</span><span className="font-medium">Imóvel selecionado #{imovelSelecionado}</span></div>
                  ) : (
                    <>
                      <div className="flex justify-between"><span className="text-gray-500">Imovel</span><span className="font-medium">{imovel.nome}</span></div>
                      <div className="flex justify-between"><span className="text-gray-500">Municipio</span><span>{imovel.municipio}-{imovel.uf}</span></div>
                    </>
                  )}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setStep(2)} className="flex-1 py-3 rounded-lg text-sm border border-gray-200">← Voltar</button>
              <button onClick={salvar} disabled={loading} className="flex-1 py-3 rounded-lg text-sm font-medium text-white bg-green-800 disabled:bg-gray-400">{loading ? "Salvando..." : "Salvar cadastro"}</button>
            </div>
          </div>
        )}

        {salvo && (
          <div className="bg-white rounded-xl p-6 shadow-sm text-center space-y-4">
            <div className="text-4xl">✅</div>
            <div className="text-lg font-medium text-green-800">{modoEdicao ? "Dados atualizados!" : "Cadastro realizado!"}</div>
            <div className="text-sm text-gray-500">{produtor.nome} {modoEdicao ? "atualizado" : "cadastrado"}!</div>
            <a href="/contador" className="block w-full py-3 rounded-lg text-sm font-medium text-white bg-green-800 text-center">Voltar ao painel</a>
          </div>
        )}

      </div>
    </div>
  );
}

export default function Cadastro() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-gray-50 flex items-center justify-center"><div className="text-gray-400">Carregando...</div></div>}>
      <CadastroContent />
    </Suspense>
  );
}
