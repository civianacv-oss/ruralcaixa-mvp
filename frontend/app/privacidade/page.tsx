export default function Privacidade() {
  return (
    <div className="min-h-screen bg-gray-50">
      <div className="bg-green-800 text-white px-4 py-4">
        <div className="max-w-3xl mx-auto">
          <a href="/" className="text-xs opacity-70 block mb-1">← Inicio</a>
          <div className="text-lg font-medium">RuralCaixa</div>
          <div className="text-sm opacity-70">Política de Privacidade</div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6 text-sm text-gray-700">
        <div>
          <h1 className="text-2xl font-bold text-green-800 mb-2">Política de Privacidade</h1>
          <p className="text-gray-500">Última atualização: 15 de maio de 2026</p>
        </div>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">1. Sobre o RuralCaixa</h2>
          <p>
            O RuralCaixa é um sistema de gestão financeira rural que permite ao produtor rural
            registrar receitas e despesas via WhatsApp, gerando relatórios LCDPR (Livro Caixa
            Digital do Produtor Rural) automaticamente.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">2. Dados Coletados</h2>
          <p>Coletamos os seguintes dados dos usuários:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Nome completo</li>
            <li>CPF</li>
            <li>Número de telefone (WhatsApp)</li>
            <li>NIRF (número do imóvel rural, opcional)</li>
            <li>Dados do imóvel rural (nome, área, município, UF)</li>
            <li>Lançamentos financeiros (receitas e despesas)</li>
            <li>Documentos fiscais enviados via WhatsApp (notas fiscais, recibos)</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">3. Como Usamos os Dados</h2>
          <p>Os dados coletados são utilizados exclusivamente para:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Registrar e organizar os lançamentos financeiros do produtor rural</li>
            <li>Gerar relatórios LCDPR para fins fiscais</li>
            <li>Permitir que o contador do produtor acesse e gerencie os dados</li>
            <li>Armazenar documentos fiscais vinculados aos lançamentos</li>
          </ul>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">4. Compartilhamento de Dados</h2>
          <p>
            Os dados do produtor rural podem ser acessados pelo contador responsável cadastrado
            no sistema. Não compartilhamos dados com terceiros para fins comerciais ou
            publicitários.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">5. Armazenamento</h2>
          <p>
            Os dados são armazenados em servidores seguros (Railway PostgreSQL) e os documentos
            fiscais são armazenados no Google Drive com acesso restrito. Adotamos medidas de
            segurança para proteger as informações contra acesso não autorizado.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">6. Uso do WhatsApp</h2>
          <p>
            O RuralCaixa utiliza a API do WhatsApp Business (Meta) para receber e enviar
            mensagens. As mensagens trocadas são processadas para identificar lançamentos
            financeiros e são armazenadas apenas os dados estruturados resultantes.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">7. Direitos do Usuário</h2>
          <p>O usuário tem direito a:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Acessar seus dados cadastrados</li>
            <li>Solicitar correção de dados incorretos</li>
            <li>Solicitar exclusão de seus dados</li>
            <li>Revogar o acesso do contador aos seus dados</li>
          </ul>
          <p>Para exercer esses direitos, entre em contato pelo WhatsApp: (98) 3022-3992</p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">8. Exclusão de Dados</h2>
          <p>
            Para solicitar a exclusão completa dos seus dados, envie uma mensagem para o
            WhatsApp (98) 3022-3992 com o texto "EXCLUIR MEUS DADOS". Processaremos a
            solicitação em até 30 dias.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-lg font-semibold text-gray-800">9. Contato</h2>
          <p>
            Em caso de dúvidas sobre esta política de privacidade, entre em contato:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>WhatsApp: (98) 3022-3992</li>
            <li>Email: civiana.cv@gmail.com</li>
          </ul>
        </section>

        <div className="border-t pt-4 text-gray-400 text-xs">
          © 2026 RuralCaixa. Todos os direitos reservados.
        </div>
      </div>
    </div>
  );
}
