import { trpc } from "@/lib/trpc";
import { COOKIE_NAME, UNAUTHED_ERR_MSG } from '@shared/const';
import { getRcToken } from "@/lib/api";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import "./index.css";

const queryClient = new QueryClient();

const RURAL_SESSION_ERR_MSG = "Sessão inválida ou expirada. Faça login novamente.";

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized =
    error.message === UNAUTHED_ERR_MSG ||
    error.message === RURAL_SESSION_ERR_MSG ||
    (error.data as { code?: string } | undefined)?.code === "UNAUTHORIZED";

  if (!isUnauthorized) return;

  // Clear rural session data from localStorage so the login page starts fresh
  try {
    ["rc_produtor_id", "rc_produtor_nome", "rc_imovel_id", "rc_imovel_nome", "rc_produtor_cpf"].forEach(
      k => localStorage.removeItem(k)
    );
  } catch { /* ignore */ }

  window.location.href = "/login";
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      headers() {
        const headers: Record<string, string> = {};

        // 1. Manus OAuth session fallback (iframe / cookie-blocked environments)
        try {
          const raw = sessionStorage.getItem("manus-cookie");
          if (raw) {
            const prefix = `${COOKIE_NAME}=`;
            const pair = raw.split(";").find(s => s.trim().startsWith(prefix));
            const token = pair?.trim().slice(prefix.length);
            if (token) headers["Authorization"] = `Bearer ${token}`;
          }
        } catch {
          // sessionStorage unavailable
        }

        // 2. Rural session token — sent when cookies are blocked cross-site
        // Uses a separate header scheme (RcClaims) so it doesn't conflict with Bearer
        try {
          const rcToken = getRcToken();
          if (rcToken) headers["X-Rc-Claims"] = rcToken;
        } catch {
          // localStorage unavailable
        }

        return headers;
      },
      fetch(input, init) {
        return globalThis.fetch(input, {
          ...(init ?? {}),
          credentials: "include",
        });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
