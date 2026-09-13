/* ===================================================================
   Cifra SH — Offline (cliente legado iPad mini 1 / iOS 9)
   app-config.js

   Único arquivo que você precisa editar com dados reais do projeto.
   Tudo aqui vira uma variável global simples (var no objeto window),
   porque este cliente não usa módulos ES (import/export não existem
   no Safari 9).
   =================================================================== */

var APP_CONFIG = {

  // -------------------------------------------------------------
  // Dados do seu projeto Supabase.
  // Ache em: painel do Supabase > Project Settings > API.
  // A "anon key" é pública por natureza (o app principal React já
  // expõe ela no navegador de qualquer visitante) — não é segredo,
  // mas ainda assim não é a mesma coisa que a service_role key,
  // que NUNCA deve entrar aqui.
  // -------------------------------------------------------------
  SUPABASE_URL: 'https://SEU-PROJETO.supabase.co',
  SUPABASE_ANON_KEY: 'COLE-AQUI-A-ANON-KEY',

  // -------------------------------------------------------------
  // Credencial usada pelo iPad legado para se autenticar sozinho
  // (sem tela de login) e enxergar repertórios não-públicos, que
  // exigem sessão autenticada segundo a política de RLS da tabela
  // `repertoires`. Recomendo criar uma conta própria pra isso
  // (ex.: ipad.capela@suacomunidade.org), em vez de usar uma conta
  // pessoal, e adicionar essa conta como membro (mission_members)
  // das missões cujo repertório o iPad precisa ver.
  // -------------------------------------------------------------
  SYNC_EMAIL: 'ipad.legado@example.org',
  SYNC_SENHA: 'TROCAR-ESTA-SENHA',

  // -------------------------------------------------------------
  // Intervalo (em milissegundos) entre tentativas automáticas de
  // sincronização enquanto o app está aberto em primeiro plano.
  // 15 minutos é um equilíbrio entre "conteúdo atualizado" e "não
  // fritar a bateria/rede de um aparelho de 2012 batendo toda hora".
  // -------------------------------------------------------------
  INTERVALO_SYNC_MS: 15 * 60 * 1000,

  // -------------------------------------------------------------
  // Tamanho do banco WebSQL, em bytes. 10MB é folgado pro volume de
  // texto (título+letra+cifra) de um repertório de milhares de
  // músicas — cifra é texto puro, pesa pouco.
  // -------------------------------------------------------------
  WEBSQL_TAMANHO_BYTES: 10 * 1024 * 1024,

  WEBSQL_NOME: 'cifra_sh_offline',
  WEBSQL_VERSAO: '1.0',
  WEBSQL_DESCRICAO: 'Cache local de cifras e repertórios'

};
