import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useRuralAuth } from "@/hooks/useRuralAuth";
import { trpc } from "@/lib/trpc";
import {
  LayoutDashboard,
  Building2,
  FileSignature,
  Calculator,
  Receipt,
  PawPrint,
  Sprout,
  HeartPulse,
  Baby,
  DollarSign,
  BarChart3,
  FileText,
  Users,
  ShoppingCart,
  Palmtree,
  Package,
  ClipboardList,
  Globe,
  TrendingDown,
  LogOut,
  Leaf,
  ChevronRight,
  Menu,
  Home,
  Settings,
  HelpCircle,
  Bell,
} from "lucide-react";
import { getImovelId } from "@/lib/api";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

function useInsumosAlertaCount() {
  const imovelId = getImovelId();
  const { data } = trpc.railway.insumosAlertas.useQuery(
    { imovelId: imovelId! },
    {
      enabled: !!imovelId,
      retry: false, // backend de insumos ainda não deployado — suprimir erros 404
      refetchInterval: 5 * 60 * 1000,
      staleTime: 4 * 60 * 1000,
    }
  );
  return Array.isArray(data) ? data.length : 0;
}

const NAV_SECTIONS = [
  {
    label: "Rural",
    items: [
      { icon: LayoutDashboard, label: "Painel Principal", path: "/dashboard" },
      { icon: Building2, label: "Propriedades", path: "/propriedades" },
      { icon: FileSignature, label: "Contratos Rurais", path: "/contratos-rurais" },
      { icon: Calculator, label: "Acerto de Contrato", path: "/acerto-contrato" },
      { icon: Receipt, label: "Lançamentos", path: "/lancamentos" },
    ],
  },
  {
    label: "Rebanho",
    items: [
      { icon: PawPrint, label: "Rebanhos", path: "/rebanhos" },
      { icon: Sprout, label: "Agricultura", path: "/agricultura" },
      { icon: HeartPulse, label: "Saúde Animal", path: "/saude" },
      { icon: Baby, label: "Reprodução", path: "/reproducao" },
    ],
  },
  {
    label: "Gestão",
    items: [
      { icon: DollarSign, label: "Financeiro", path: "/financeiro" },
      { icon: BarChart3, label: "Relatórios", path: "/relatorios" },
      { icon: Package, label: "Insumos", path: "/insumos" },
      { icon: ShoppingCart, label: "Compra e Venda", path: "/compra-venda" },
      { icon: Palmtree, label: "Cultivo de Açaí", path: "/cultivo-acai" },
    ],
  },
  {
    label: "Fiscal",
    items: [
      { icon: FileText, label: "NF-e Produtor", path: "/nfe-produtor" },
      { icon: Users, label: "eSocial Rural", path: "/esocial-rural" },
      { icon: ClipboardList, label: "EFD-Reinf / DARF", path: "/efd-reinf" },
      { icon: Globe, label: "DCTFWeb", path: "/dctfweb" },
      { icon: TrendingDown, label: "Simulador Tributário", path: "/simulador-tributario" },
    ],
  },
];

const BOTTOM_ITEMS = [
  { icon: Bell, label: "Notificações", path: "/notificacoes", placeholder: true },
  { icon: Settings, label: "Perfil & Notificações", path: "/perfil" },
  { icon: HelpCircle, label: "Ajuda", path: "/ajuda", placeholder: true },
];

function NavButton({
  icon: Icon,
  label,
  isActive,
  collapsed,
  onClick,
  placeholder,
  badge,
}: {
  icon: React.ElementType;
  label: string;
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
  placeholder?: boolean;
  badge?: number;
}) {
  const btn = (
    <button
      onClick={onClick}
      className={`
        w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium
        transition-all duration-150 group relative
        ${isActive
          ? "text-white"
          : placeholder
          ? "text-white/30 hover:text-white/50 cursor-not-allowed"
          : "text-white/60 hover:text-white/90"
        }
      `}
      style={
        isActive
          ? { background: "oklch(0.30 0.08 145)", boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.08)" }
          : undefined
      }
    >
      <Icon
        className={`w-[18px] h-[18px] shrink-0 transition-colors ${
          isActive ? "text-emerald-400" : placeholder ? "text-white/25" : "text-white/45 group-hover:text-white/75"
        }`}
      />
      {/* Badge no modo collapsed */}
      {collapsed && badge != null && badge > 0 && (
        <span className="absolute top-1 right-1 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1">
          {badge > 99 ? "99+" : badge}
        </span>
      )}
      {!collapsed && (
        <>
          <span className="truncate">{label}</span>
          {badge != null && badge > 0 && (
            <span className="ml-auto min-w-[18px] h-[18px] flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold px-1 shrink-0">
              {badge > 99 ? "99+" : badge}
            </span>
          )}
          {!badge && isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />}
          {placeholder && !isActive && (
            <span className="ml-auto text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full" style={{ background: "oklch(0.30 0.04 145)", color: "oklch(0.55 0.06 145)" }}>
              Em breve
            </span>
          )}
        </>
      )}
    </button>
  );

  if (collapsed) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>{btn}</TooltipTrigger>
        <TooltipContent side="right" className="text-xs">
          {label}{placeholder ? " (em breve)" : ""}
        </TooltipContent>
      </Tooltip>
    );
  }
  return btn;
}

export default function RuralLayout({ children }: { children: React.ReactNode }) {
  const { authenticated, produtorNome, imovelNome, logout, isAdmin, role } = useRuralAuth();
  const [location, navigate] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const insumosAlertaCount = useInsumosAlertaCount();

  useEffect(() => {
    if (!authenticated) navigate("/login");
  }, [authenticated, navigate]);

  if (!authenticated) return null;

  const initials = produtorNome
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  const imovelId = getImovelId();

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: "oklch(0.96 0.006 130)" }}>
      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 bg-black/50 z-30 lg:hidden backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:relative inset-y-0 left-0 z-40 flex flex-col
          transition-all duration-300 ease-out
          ${mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"}
          ${sidebarOpen ? "w-[240px]" : "w-[64px]"}
        `}
        style={{
          background: "linear-gradient(180deg, oklch(0.17 0.055 148) 0%, oklch(0.15 0.045 145) 100%)",
          boxShadow: "2px 0 24px oklch(0.08 0.04 145 / 0.40)",
        }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3 px-4 h-16 shrink-0" style={{ borderBottom: "1px solid oklch(0.25 0.04 145)" }}>
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: "linear-gradient(135deg, oklch(0.48 0.15 145), oklch(0.58 0.17 155))",
              boxShadow: "0 4px 14px oklch(0.38 0.14 145 / 0.45)",
            }}
          >
            <Leaf className="w-5 h-5 text-white" strokeWidth={1.5} />
          </div>
          {sidebarOpen && (
            <div className="flex-1 min-w-0">
              <span className="text-[17px] font-bold tracking-tight text-white block truncate" style={{ fontFamily: "'Playfair Display', serif" }}>
                RuralCaixa
              </span>
              <span className="text-[10px] font-medium" style={{ color: "oklch(0.52 0.08 145)" }}>
                Gestão Rural
              </span>
            </div>
          )}
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:flex items-center justify-center w-7 h-7 rounded-lg transition-colors hover:bg-white/10 shrink-0"
          >
            <ChevronRight className={`w-4 h-4 text-white/50 transition-transform duration-300 ${sidebarOpen ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* Nav sections */}
        <nav className="flex-1 px-2 py-3 overflow-y-auto space-y-1">
          {NAV_SECTIONS.map((section, si) => (
            <div key={section.label}>
              {si > 0 && (
                <div className="my-2 mx-1" style={{ borderTop: "1px solid oklch(0.25 0.04 145)" }} />
              )}
              {sidebarOpen && (
                <p className="px-3 pt-1 pb-1 text-[10px] font-bold uppercase tracking-[0.7px]" style={{ color: "oklch(0.42 0.07 145)" }}>
                  {section.label}
                </p>
              )}
              {section.items.map((item) => (
                <NavButton
                  key={item.path}
                  icon={item.icon}
                  label={item.label}
                  isActive={location.startsWith(item.path)}
                  collapsed={!sidebarOpen}
                  onClick={() => { navigate(item.path); setMobileOpen(false); }}
                  badge={item.path === "/insumos" && insumosAlertaCount > 0 ? insumosAlertaCount : undefined}
                />
              ))}
            </div>
          ))}
        </nav>

        {/* Bottom utility links */}
        <div className="px-2 pb-2 space-y-0.5" style={{ borderTop: "1px solid oklch(0.25 0.04 145)", paddingTop: "8px" }}>
          {isAdmin && (
            <NavButton
              icon={FileText}
              label="Procurações"
              isActive={location.startsWith("/admin/procuracoes")}
              collapsed={!sidebarOpen}
              onClick={() => { navigate("/admin/procuracoes"); setMobileOpen(false); }}
            />
          )}
          {BOTTOM_ITEMS.map((item) => (
            <NavButton
              key={item.path}
              icon={item.icon}
              label={item.label}
              isActive={location.startsWith(item.path)}
              collapsed={!sidebarOpen}
              placeholder={item.placeholder}
              onClick={() => { if (!item.placeholder) { navigate(item.path); setMobileOpen(false); } }}
            />
          ))}
        </div>

        {/* Active property banner */}
        {imovelId && (
          <div
            className="mx-2 mb-2 rounded-xl cursor-pointer transition-all duration-150 hover:brightness-110"
            style={{ background: "oklch(0.23 0.06 145)", border: "1px solid oklch(0.30 0.06 145)" }}
            onClick={() => { navigate("/selecionar-imovel"); setMobileOpen(false); }}
            title={!sidebarOpen ? (imovelNome || "Trocar propriedade") : undefined}
          >
            {sidebarOpen ? (
              <div className="flex items-start gap-2 px-3 py-2.5">
                <Home className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: "oklch(0.60 0.12 145)" }} />
                <div className="min-w-0 flex-1">
                  <p className="text-[9px] font-bold uppercase tracking-[0.6px] mb-0.5" style={{ color: "oklch(0.48 0.08 145)" }}>
                    Propriedade ativa
                  </p>
                  <p className="text-[12px] font-semibold text-white/90 truncate leading-tight">
                    {imovelNome || "Selecionar propriedade"}
                  </p>
                  <p className="text-[10px] mt-0.5" style={{ color: "oklch(0.48 0.08 145)" }}>
                    Clique para trocar
                  </p>
                </div>
                <ChevronRight className="w-3.5 h-3.5 shrink-0 mt-1" style={{ color: "oklch(0.48 0.08 145)" }} />
              </div>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex justify-center py-2.5">
                    <Home className="w-4 h-4" style={{ color: "oklch(0.60 0.12 145)" }} />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="right" className="text-xs">
                  {imovelNome || "Trocar propriedade"}
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

        {/* User footer */}
        <div className="px-3 py-3 shrink-0" style={{ borderTop: "1px solid oklch(0.25 0.04 145)" }}>
          <div className="flex items-center gap-3">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold text-white shrink-0"
              style={{ background: "linear-gradient(135deg, oklch(0.35 0.12 145), oklch(0.42 0.14 145))" }}
            >
              {initials || "?"}
            </div>
            {sidebarOpen && (
              <>
                <div className="flex-1 min-w-0">
                  <p className="text-[13px] font-semibold text-white truncate leading-none">
                    {produtorNome || "Produtor"}
                  </p>
                  <p className="text-[11px] mt-0.5 truncate" style={{ color: "oklch(0.48 0.07 145)" }}>
                    {role === "admin" ? "Contador" : "Produtor Rural"}
                  </p>
                </div>
                <button
                  onClick={logout}
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-white/35 hover:text-white hover:bg-white/10 transition-colors"
                  title="Sair"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </>
            )}
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Mobile topbar */}
        <div
          className="lg:hidden flex items-center gap-3 px-4 h-14 shrink-0"
          style={{ background: "oklch(1 0 0)", borderBottom: "1px solid oklch(0.90 0.015 130)" }}
        >
          <button
            onClick={() => setMobileOpen(true)}
            className="w-9 h-9 flex items-center justify-center rounded-lg hover:bg-muted transition-colors"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="text-[17px] font-bold" style={{ fontFamily: "'Playfair Display', serif", color: "oklch(0.22 0.06 145)" }}>
            RuralCaixa
          </span>
          {imovelNome && (
            <span className="ml-auto text-xs font-medium px-2 py-1 rounded-full truncate max-w-[140px]" style={{ background: "oklch(0.92 0.02 145)", color: "oklch(0.35 0.10 145)" }}>
              {imovelNome}
            </span>
          )}
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
