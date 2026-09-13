/* ===================================================================
   Cifra SH — Offline (cliente legado iPad mini 1 / iOS 9)
   app-main.js

   Amarra tudo: abre o banco local, renderiza a tela inicial com o
   que já estiver salvo, dispara a primeira sincronização e agenda
   as seguintes. É o único arquivo que "roda sozinho" ao carregar a
   página — os outros só definem funções.
   =================================================================== */

(function () {

  // -------------------------------------------------------------
  // Mostra o status offline com a data/hora da última sincronização
  // bem-sucedida (se houver alguma salva) — usado tanto se o app
  // abre já sem internet quanto se uma tentativa de sync falha.
  // -------------------------------------------------------------
  function mostrarStatusOffline(prefixo) {
    APP_DB.getMeta('ultima_sincronizacao_geral', function (ultimaSync) {
      var quando = ultimaSync
        ? ' (última atualização em ' + APP_UI.formatarDataHora(ultimaSync) + ')'
        : ' (ainda não foi possível baixar nenhum conteúdo)';
      APP_UI.atualizarStatusBar('offline', prefixo + quando);
    });
  }

  // -------------------------------------------------------------
  // Executa um ciclo de sincronização.
  //
  // ehInicial: só na sincronização de arranque (a primeira, ao abrir
  // o app) é que atualizamos as listas na tela automaticamente depois
  // de terminar. Nas sincronizações periódicas seguintes (a cada
  // INTERVALO_SYNC_MS, em segundo plano) só atualizamos a barra de
  // status — de propósito: se o usuário estiver no meio de olhar as
  // músicas de um repertório quando o sync de fundo terminar, não
  // queremos "puxar o tapete" e voltar ele pra lista do zero.
  // -------------------------------------------------------------
  function executarSincronizacao(ehInicial) {
    APP_SYNC.sincronizar(
      function onStatus(texto) {
        APP_UI.atualizarStatusBar('online', texto);
      },
      function onFim(erro) {
        if (erro === 'offline') {
          mostrarStatusOffline('Sem internet — mostrando última versão salva');
          return;
        }

        if (erro) {
          mostrarStatusOffline('Não foi possível sincronizar agora');
          return;
        }

        var agora = APP_UI.formatarDataHora(new Date().toISOString());
        APP_UI.atualizarStatusBar('online', 'Atualizado agora (' + agora + ')');

        if (ehInicial) {
          APP_UI.atualizarOpcoesDeCategoria();
          APP_UI.renderizarListaRepertorios();
          APP_UI.renderizarListaCifras();
        }
      }
    );
  }

  // -------------------------------------------------------------
  // Arranque
  // -------------------------------------------------------------
  function iniciar() {
    APP_UI.init();

    APP_DB.init(
      function onBancoPronto() {
        // Mostra logo o que já existir localmente, sem esperar a
        // rede — o app nunca fica com tela em branco enquanto tenta
        // sincronizar.
        APP_UI.atualizarOpcoesDeCategoria();
        APP_UI.renderizarListaRepertorios();
        APP_UI.renderizarListaCifras();

        executarSincronizacao(true);

        // Sincronizações periódicas em segundo plano.
        setInterval(function () {
          executarSincronizacao(false);
        }, APP_CONFIG.INTERVALO_SYNC_MS);

        // Assim que a conexão voltar, tenta sincronizar na hora, em
        // vez de esperar o próximo intervalo agendado.
        window.addEventListener('online', function () {
          executarSincronizacao(false);
        }, false);

        window.addEventListener('offline', function () {
          mostrarStatusOffline('Conexão perdida — mostrando última versão salva');
        }, false);
      },
      function onErroBanco(erro) {
        APP_UI.atualizarStatusBar(
          'erro',
          'Este aparelho não conseguiu abrir o armazenamento local. ' +
          'O app não pode funcionar offline aqui.'
        );
      }
    );
  }

  // DOMContentLoaded existe desde muito antes do iOS 9 — seguro usar
  // diretamente, sem precisar de fallback pra window.onload.
  document.addEventListener('DOMContentLoaded', iniciar, false);

})();
