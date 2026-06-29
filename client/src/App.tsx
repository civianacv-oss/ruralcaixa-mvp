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
      <Route path="/dashboard">
        {() => <ProtectedRoute component={Dashboard} />}
      </Route>
      <Route path="/animais">
        {() => <ProtectedRoute component={Animais} />}
      </Route>
      <Route path="/saude">
        {() => <ProtectedRoute component={Saude} />}
      </Route>
      <Route path="/reproducao">
        {() => <ProtectedRoute component={Reproducao} />}
      </Route>
      <Route path="/financeiro">
        {() => <ProtectedRoute component={Financeiro} />}
      </Route>
      <Route path="/movimentacoes">
        {() => <ProtectedRoute component={Movimentacoes} />}
      </Route>
      <Route path="/perfil">
        {() => <ProtectedRoute component={Perfil} />}
      </Route>
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
