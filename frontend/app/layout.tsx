import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "GestaoAgro Tech â€” Gestao de LCDPR e NF-e para Produtor Rural",
  description: "Solucoes tecnologicas para gestao de LCDPR, NF-e e analise de dados do agronegocio rural. GestaoAgro Tech simplifica a vida do produtor rural pessoa fisica.",
  keywords: "LCDPR, NF-e produtor rural, gestao rural, agronegocio, GestaoAgro Tech",
  manifest: "/manifest.json",
  themeColor: "#166534",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "GestaoAgro Tech",
  },
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 1,
  },
  openGraph: {
    title: "GestaoAgro Tech",
    description: "Solucoes tecnologicas para gestao de LCDPR, NF-e e analise de dados do agronegocio rural.",
    url: "https://ruralcaixa-mvp.vercel.app",
    siteName: "GestaoAgro Tech",
    locale: "pt_BR",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} h-full antialiased`}>
      <head>
        <meta charSet="utf-8" /><link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#166534" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        <meta name="apple-mobile-web-app-title" content="GestaoAgro Tech" />
        <meta name="author" content="GestaoAgro Tech" />
        <meta property="og:site_name" content="GestaoAgro Tech" />
      </head>
      <body className="min-h-full flex flex-col">
        <script dangerouslySetInnerHTML={{ __html: `
          if ('serviceWorker' in navigator) {
            window.addEventListener('load', function() {
              navigator.serviceWorker.register('/sw.js')
                .then(function(reg) { console.log('SW registrado:', reg.scope); })
                .catch(function(e) { console.warn('SW falhou:', e); });
            });
          }
        ` }} />
        {children}
        {/* Rodape â€” visivel para validacao Meta WhatsApp Business */}
        <footer className="bg-green-900 text-white text-center py-3 text-xs opacity-70 mt-auto">
          <p>
            <strong>GestaoAgro Tech</strong> â€” Solucoes tecnologicas para gestao rural
          </p>
          <p className="mt-0.5">
            LCDPR Â· NF-e Produtor Rural Â· DRE Gerencial Â· WhatsApp Bot
          </p>
          <p className="mt-0.5">
            contato: civiana.cv@gmail.com Â· ruralcaixa-mvp.vercel.app
          </p>
        </footer>
      </body>
    </html>
  );
}

