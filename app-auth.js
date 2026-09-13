/* ===================================================================
   Cifra SH — Offline (cliente legado iPad mini 1 / iOS 9)
   app-auth.js

   Login e renovação de sessão junto ao Supabase Auth (GoTrue), usando
   XMLHttpRequest puro (o Safari 9 não tem `fetch`) e por callback
   (sem depender de Promise nativa).

   Expõe um único objeto global: APP_AUTH.
   =================================================================== */

var APP_AUTH = (function () {

  // Margem de segurança: renovamos o token um pouco ANTES dele
  // expirar de fato, pra nunca correr o risco de uma sincronização
  // começar com um token que expira no meio do caminho.
  var MARGEM_EXPIRACAO_MS = 60 * 1000;

  // -------------------------------------------------------------
  // Helper genérico de requisição HTTP em JSON via XMLHttpRequest.
  // onSucesso(status, corpoJson) / onErro(mensagem)
  // -------------------------------------------------------------
  function requisicaoJson(metodo, url, headers, corpo, onSucesso, onErro) {
    var xhr = new XMLHttpRequest();

    xhr.onreadystatechange = function () {
      if (xhr.readyState !== 4) {
        return;
      }

      var corpoResposta = null;
      try {
        corpoResposta = xhr.responseText
          ? JSON.parse(xhr.responseText)
          : null;
      } catch (erroParse) {
        corpoResposta = null;
      }

      if (xhr.status >= 200 && xhr.status < 300) {
        onSucesso(xhr.status, corpoResposta);
      } else {
        var mensagem =
          (corpoResposta && (corpoResposta.error_description || corpoResposta.msg || corpoResposta.message)) ||
          ('Erro HTTP ' + xhr.status);
        onErro(mensagem, xhr.status, corpoResposta);
      }
    };

    // Sem esse tratamento, uma falha de rede (sem internet mesmo)
    // deixaria a requisição "presa" sem nunca chamar onErro.
    xhr.onerror = function () {
      onErro('Falha de rede ao contatar o servidor.');
    };

    xhr.open(metodo, url, true);
    xhr.setRequestHeader('Content-Type', 'application/json');
    for (var chave in headers) {
      if (headers.hasOwnProperty(chave)) {
        xhr.setRequestHeader(chave, headers[chave]);
      }
    }

    xhr.send(corpo ? JSON.stringify(corpo) : null);
  }

  // -------------------------------------------------------------
  // Login com e-mail/senha (grant_type=password). Guarda os tokens
  // resultantes no WebSQL via APP_DB.
  // -------------------------------------------------------------
  function login(onSucesso, onErro) {
    var url = APP_CONFIG.SUPABASE_URL + '/auth/v1/token?grant_type=password';

    requisicaoJson(
      'POST',
      url,
      { apikey: APP_CONFIG.SUPABASE_ANON_KEY },
      {
        email: APP_CONFIG.SYNC_EMAIL,
        password: APP_CONFIG.SYNC_SENHA
      },
      function (status, corpo) {
        if (!corpo || !corpo.access_token) {
          onErro('Resposta de login inesperada do servidor.');
          return;
        }

        var expiraEm = Date.now() + (corpo.expires_in * 1000);

        APP_DB.salvarSessao(
          corpo.access_token,
          corpo.refresh_token,
          expiraEm,
          function (erroSalvar) {
            if (erroSalvar) {
              onErro('Não foi possível salvar a sessão localmente.');
              return;
            }
            onSucesso(corpo.access_token);
          }
        );
      },
      function (mensagemErro) {
        onErro(mensagemErro);
      }
    );
  }

  // -------------------------------------------------------------
  // Renovação de sessão (grant_type=refresh_token), evitando pedir
  // e-mail/senha de novo a cada expiração.
  // -------------------------------------------------------------
  function renovar(refreshToken, onSucesso, onErro) {
    var url = APP_CONFIG.SUPABASE_URL + '/auth/v1/token?grant_type=refresh_token';

    requisicaoJson(
      'POST',
      url,
      { apikey: APP_CONFIG.SUPABASE_ANON_KEY },
      { refresh_token: refreshToken },
      function (status, corpo) {
        if (!corpo || !corpo.access_token) {
          onErro('Resposta de renovação inesperada do servidor.');
          return;
        }

        var expiraEm = Date.now() + (corpo.expires_in * 1000);

        APP_DB.salvarSessao(
          corpo.access_token,
          corpo.refresh_token || refreshToken,
          expiraEm,
          function (erroSalvar) {
            if (erroSalvar) {
              onErro('Não foi possível salvar a sessão renovada localmente.');
              return;
            }
            onSucesso(corpo.access_token);
          }
        );
      },
      function (mensagemErro) {
        // Refresh token também pode ter expirado/sido revogado — quem
        // chamou obterTokenValido() vai cair pra login() nesse caso.
        onErro(mensagemErro);
      }
    );
  }

  // -------------------------------------------------------------
  // Função principal que o app-sync.js deve usar antes de qualquer
  // chamada à API: devolve um access_token pronto pra uso,
  // decidindo sozinho se precisa logar do zero, renovar, ou só
  // reaproveitar o token que já está salvo.
  //
  // callback(erro, accessToken)
  // -------------------------------------------------------------
  function obterTokenValido(callback) {
    APP_DB.obterSessao(function (sessao) {

      var semSessaoAinda = !sessao || !sessao.access_token;
      if (semSessaoAinda) {
        login(
          function (token) { callback(null, token); },
          function (erro) { callback(erro, null); }
        );
        return;
      }

      var expiraLogoLogo = (sessao.expires_at - MARGEM_EXPIRACAO_MS) <= Date.now();
      if (!expiraLogoLogo) {
        callback(null, sessao.access_token);
        return;
      }

      renovar(
        sessao.refresh_token,
        function (token) { callback(null, token); },
        function () {
          // Se renovar falhou (ex.: refresh_token expirado depois de
          // muito tempo offline), tenta um login completo do zero
          // antes de desistir de vez.
          login(
            function (token) { callback(null, token); },
            function (erroLogin) { callback(erroLogin, null); }
          );
        }
      );
    });
  }

  // -------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------
  return {
    obterTokenValido: obterTokenValido
  };

})();
