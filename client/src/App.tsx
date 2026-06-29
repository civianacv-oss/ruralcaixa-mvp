import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Animais from "./pages/Animais";
import Saude from "./pages/Saude";
import Reproducao from "./pages/Reproducao";
import Financeiro from "./pages/Financeiro";
import Movimentacoes from "./pages/Movimentacoes";
import RuralLayout from "./components/RuralLayout";
import SelecionarImovel from "./pages/SelecionarImovel";
import Perfil from "./pages/Perfil";
import AdminProcuracoes from "./pages/AdminProcuracoes";
// Novos módulos
import Propriedades from "./pages/Propriedades";
import ContratosRurais from "./pages/ContratosRurais";
import AcertoContrato from "./pages/AcertoContrato";
import Lancamentos from "./pages/Lancamentos";
import Rebanhos from "./pages/Rebanhos";
import Agricultura from "./pages/Agricultura";
import CompraVenda from "./pages/CompraVenda";
import CultivoAcai from "./pages/CultivoAcai";
import NFeProdutor from "./pages/NFeProdutor";
import Relatorios from "./pages/Relatorios";
import ESocialRural from "./pages/ESocialRural";
import EFDReinf from "./pages/EFDReinf";
import DCTFWeb from "./pages/DCTFWeb";
import Insumos from "./pages/Insumos";
import { useEffect } from "react";
import { useLocation } from "wouter";
import { isAuthenticated } from "./lib/api";

function ProtectedRoute({ component: Component }: { component: React.ComponentType }) {
  const [, navigate] = useLocation();
  useEffect(() => {
    if (!isAuthenticated()) navigate("/login");
  }, [navigate]);
  if (!isAuthenticated()) return null;
  return (
    <RuralLayout>
      <Component />
    </RuralLayout>
  );
}

function HomeRedirect() {
  const [, navigate] = useLocation();
  useEffect(() => {
    if (isAuthenticated()) {
      navigate("/dashboard");
    } else {
      navigate("/login");
    }
  }, [navigate]);
  return null;
}

function Router() {
  return (
    <Switch>
      <Route path="/" component={HomeRedirect} />
      <Route path="/login" component={Login} />
      <Route path="/selecionar-imovel">
        {() => <SelecionarImovel />}
      </Route>

      {/* Painel */}
      <Route path="/dashboard">{() => <ProtectedRoute component={Dashboard} />}</Route>

      {/* Gestão Rural */}
      <Route path="/propriedades">{() => <ProtectedRoute component={Propriedades} />}</Route>
      <Route path="/contratos-rurais">{() => <ProtectedRoute component={ContratosRurais} />}</Route>
      <Route path="/acerto-contrato">{() => <ProtectedRoute component={AcertoContrato} />}</Route>
      <Route path="/lancamentos">{() => <ProtectedRoute component={Lancamentos} />}</Route>

      {/* Rebanho */}
      <Route path="/rebanhos">{() => <ProtectedRoute component={Rebanhos} />}</Route>
      <Route path="/animais">{() => <ProtectedRoute component={Animais} />}</Route>
      <Route path="/saude">{() => <ProtectedRoute component={Saude} />}</Route>
      <Route path="/reproducao">{() => <ProtectedRoute component={Reproducao} />}</Route>
      <Route path="/movimentacoes">{() => <ProtectedRoute component={Movimentacoes} />}</Route>

      {/* Agricultura */}
      <Route path="/agricultura">{() => <ProtectedRoute component={Agricultura} />}</Route>
      <Route path="/cultivo-acai">{() => <ProtectedRoute component={CultivoAcai} />}</Route>

      {/* Financeiro */}
      <Route path="/financeiro">{() => <ProtectedRoute component={Financeiro} />}</Route>
      <Route path="/compra-venda">{() => <ProtectedRoute component={CompraVenda} />}</Route>

      {/* Fiscal */}
      <Route path="/nfe-produtor">{() => <ProtectedRoute component={NFeProdutor} />}</Route>
      <Route path="/esocial-rural">{() => <ProtectedRoute component={ESocialRural} />}</Route>
      <Route path="/efd-reinf">{() => <ProtectedRoute component={EFDReinf} />}</Route>
      <Route path="/dctfweb">{() => <ProtectedRoute component={DCTFWeb} />}</Route>

      {/* Insumos */}
      <Route path="/insumos">{() => <ProtectedRoute component={Insumos} />}</Route>

      {/* Relatórios */}
      <Route path="/relatorios">{() => <ProtectedRoute component={Relatorios} />}</Route>

      {/* Perfil e Admin */}
      <Route path="/perfil">{() => <ProtectedRoute component={Perfil} />}</Route>
      <Route path="/admin/procuracoes">{() => <ProtectedRoute component={AdminProcuracoes} />}</Route>

      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
