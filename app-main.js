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
  // Chave no localStorage usada só como "já pedi e ganhei a cota do
  // WebSQL neste navegador antes" — localStorage é síncrono e não
  // pede nenhuma permissão, então é seguro ler/gravar no
  // carregamento normal da página, ao contrário do openDatabase.
  // -------------------------------------------------------------
  var CHAVE_ARMAZENAMENTO_ATIVADO = 'cifra_sh_offline_armazenamento_ativado';

  function jaAtivouArmazenamentoAntes() {
    try {
      return window.localStorage &&
        window.localStorage.getItem(CHAVE_ARMAZENAMENTO_ATIVADO) === '1';
    } catch (e) {
      // Safari com "Navegação Privada"/cookies bloqueados pode lançar
      // ao acessar localStorage. Nesse caso, trata como "nunca
      // ativou" — o pior caso é mostrar o botão de novo, não travar.
      return false;
    }
  }

  function marcarArmazenamentoAtivado() {
    try {
      if (window.localStorage) {
        window.localStorage.setItem(CHAVE_ARMAZENAMENTO_ATIVADO, '1');
      }
    } catch (e) {
      // Sem problema se não conseguir gravar essa marca — só volta a
      // mostrar o botão de ativação na próxima abertura.
    }
  }

  // -------------------------------------------------------------
  // Arranque
  // -------------------------------------------------------------
  function iniciar() {
    APP_UI.init();

    // CORREÇÃO CRÍTICA (erro intermitente "not authorized"/permissão
    // negada no WebSQL):
    //
    // O Safari do iOS só concede de forma confiável o diálogo de
    // aumento de cota do WebSQL quando openDatabase() é chamado
    // DENTRO do handler de um toque real do usuário. Antes,
    // APP_DB.init() rodava direto no DOMContentLoaded — sem toque
    // nenhum — o que fazia o pedido de cota falhar silenciosamente
    // em algumas aberturas. Agora, na primeiríssima vez em cada
    // aparelho/navegador, represamos a abertura do banco atrás de um
    // botão explícito ("Ativar armazenamento offline"); depois que
    // isso funciona uma vez, o banco já existe no aparelho e as
    // aberturas seguintes (inclusive automáticas) voltam a ser
    // confiáveis — daí `abrirBanco()` já rodar direto quando
    // jaAtivouArmazenamentoAntes() for true.
    if (!jaAtivouArmazenamentoAntes()) {
      APP_UI.mostrarBotaoAtivarArmazenamento(function () {
        abrirBanco();
      });
      return;
    }

    abrirBanco();
  }

  function abrirBanco() {
    APP_DB.init(
      function onBancoPronto() {
        marcarArmazenamentoAtivado();

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
        var detalhe = '(sem detalhe)';
        if (erro) {
          if (erro.message) {
            detalhe = erro.message;
          }
          if (typeof erro.code !== 'undefined') {
            detalhe += ' [code=' + erro.code + ']';
          }
        }

        // Log no console também, pra quem tiver acesso a um Mac e
        // puder inspecionar remotamente (Safari > Develop > iPad).
        if (window.console && console.error) {
          console.error('Falha ao abrir/preparar o WebSQL:', erro);
        }

        APP_UI.atualizarStatusBar(
          'erro',
          'Este aparelho não conseguiu abrir o armazenamento local. ' +
          'O app não pode funcionar offline aqui. ' +
          'Detalhe técnico: ' + detalhe
        );

        // Chama abrirBanco() direto (não iniciar()): esse retry já
        // está rodando dentro do handler de clique do próprio botão
        // (ver mostrarBotaoTentarNovamente em app-ui.js), então já
        // conta como toque do usuário — não precisa passar de novo
        // pelo gate de "Ativar armazenamento offline".
        APP_UI.mostrarBotaoTentarNovamente(function () {
          abrirBanco();
        });
      }
    );
  }

  // DOMContentLoaded existe desde muito antes do iOS 9 — seguro usar
  // diretamente, sem precisar de fallback pra window.onload.
  document.addEventListener('DOMContentLoaded', iniciar, false);

})();
