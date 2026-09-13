/* ===================================================================
   Cifra SH — Offline (cliente legado iPad mini 1 / iOS 9)
   app-sync.js

   Busca dados no Supabase (via REST/PostgREST, com XMLHttpRequest) e
   grava no WebSQL através de app-db.js. Tudo por callback.

   DECISÃO IMPORTANTE DE ARQUITETURA, documentada aqui porque não é
   óbvia olhando só o código:

   - A tabela `chords` tem coluna `updated_at`, então sincronizamos
     ela de forma INCREMENTAL (só pede o que mudou desde a última
     vez) — é a tabela mais pesada (conteúdo de texto longo), então
     vale a pena economizar tráfego aqui.

   - As tabelas `repertoires` e `repertoire_items` NÃO têm coluna
     `updated_at` no schema atual (só `created_at`, que não muda
     quando alguém edita um repertório existente). Por isso, pra não
     correr o risco de "nunca perceber" uma edição, sincronizamos
     elas por COMPLETO a cada ciclo — o que é aceitável porque são
     tabelas pequenas (só metadados e vínculos, não o texto da
     cifra em si).

   Expõe um único objeto global: APP_SYNC.
   =================================================================== */

var APP_SYNC = (function () {

  var TAMANHO_PAGINA = 1000;

  // -------------------------------------------------------------
  // Helper de GET autenticado no PostgREST do Supabase, com
  // paginação simples via limit/offset. Acumula tudo antes de
  // chamar onSucesso(listaCompleta).
  // -------------------------------------------------------------
  function buscarTudo(caminho, token, onSucesso, onErro) {
    var acumulado = [];

    function buscarPagina(offset) {
      var url =
        APP_CONFIG.SUPABASE_URL + '/rest/v1/' + caminho +
        (caminho.indexOf('?') >= 0 ? '&' : '?') +
        'limit=' + TAMANHO_PAGINA + '&offset=' + offset;

      var xhr = new XMLHttpRequest();

      xhr.onreadystatechange = function () {
        if (xhr.readyState !== 4) {
          return;
        }

        if (xhr.status < 200 || xhr.status >= 300) {
          onErro('Erro HTTP ' + xhr.status + ' ao buscar ' + caminho);
          return;
        }

        var pagina;
        try {
          pagina = JSON.parse(xhr.responseText);
        } catch (erroParse) {
          onErro('Resposta inválida do servidor ao buscar ' + caminho);
          return;
        }

        if (!pagina || !pagina.length) {
          onSucesso(acumulado);
          return;
        }

        acumulado = acumulado.concat(pagina);

        if (pagina.length < TAMANHO_PAGINA) {
          // Última página (veio menos que o tamanho pedido).
          onSucesso(acumulado);
        } else {
          buscarPagina(offset + TAMANHO_PAGINA);
        }
      };

      xhr.onerror = function () {
        onErro('Falha de rede ao buscar ' + caminho);
      };

      xhr.open('GET', url, true);
      xhr.setRequestHeader('apikey', APP_CONFIG.SUPABASE_ANON_KEY);
      xhr.setRequestHeader('Authorization', 'Bearer ' + token);
      xhr.send();
    }

    buscarPagina(0);
  }

  // -------------------------------------------------------------
  // Cifras: incremental por updated_at.
  // -------------------------------------------------------------
  function sincronizarCifras(token, onStatus, onFim) {
    onStatus('Sincronizando cifras…');

    APP_DB.getMeta('ultima_sync_chords', function (ultimaSync) {

      var filtroData = ultimaSync
        ? '&updated_at=gt.' + encodeURIComponent(ultimaSync)
        : '';

      var caminho =
        'chords?select=id,title,artist,category,content,original_key,youtube_url,updated_at' +
        '&order=updated_at.asc' + filtroData;

      buscarTudo(
        caminho,
        token,
        function (lista) {
          APP_DB.upsertCifras(lista, function (erroDb) {
            if (erroDb) {
              onFim('Falha ao salvar cifras localmente.');
              return;
            }

            if (lista.length > 0) {
              var maisRecente = lista[lista.length - 1].updated_at;
              APP_DB.setMeta('ultima_sync_chords', maisRecente, function () {
                onFim(null);
              });
            } else {
              onFim(null);
            }
          });
        },
        function (mensagemErro) {
          onFim(mensagemErro);
        }
      );
    });
  }

  // -------------------------------------------------------------
  // Repertórios: completo a cada ciclo (ver nota no topo do arquivo).
  // Só traz repertórios visíveis pra esta conta de sincronização —
  // a política de RLS do banco já filtra isso automaticamente do
  // lado do servidor, então aqui só recebemos o que já é permitido.
  // -------------------------------------------------------------
  function sincronizarRepertorios(token, onStatus, onFim) {
    onStatus('Sincronizando repertórios…');

    var caminho =
      'repertoires?select=id,name,type,date,color&order=date.asc';

    buscarTudo(
      caminho,
      token,
      function (lista) {
        APP_DB.upsertRepertorios(lista, function (erroDb) {
          if (erroDb) {
            onFim('Falha ao salvar repertórios localmente.');
            return;
          }
          onFim(null);
        });
      },
      function (mensagemErro) {
        onFim(mensagemErro);
      }
    );
  }

  // -------------------------------------------------------------
  // Itens de repertório: também completo a cada ciclo, pelo mesmo
  // motivo (tabela sem updated_at).
  // -------------------------------------------------------------
  function sincronizarItensDeRepertorio(token, onStatus, onFim) {
    onStatus('Sincronizando músicas dos repertórios…');

    var caminho =
      'repertoire_items?select=id,repertoire_id,chord_id,section,order_index' +
      '&order=order_index.asc';

    buscarTudo(
      caminho,
      token,
      function (lista) {
        APP_DB.upsertRepertorioItens(lista, function (erroDb) {
          if (erroDb) {
            onFim('Falha ao salvar itens de repertório localmente.');
            return;
          }
          onFim(null);
        });
      },
      function (mensagemErro) {
        onFim(mensagemErro);
      }
    );
  }

  // -------------------------------------------------------------
  // Ponto de entrada único, chamado por app-main.js no arranque e
  // periodicamente enquanto o app está aberto.
  //
  // onStatus(textoCurto) — pra barra de status ir mostrando o que
  //                        está acontecendo.
  // onFim(erroOuNull)     — erro é uma string legível, ou null se
  //                        deu tudo certo.
  // -------------------------------------------------------------
  function sincronizar(onStatus, onFim) {
    if (navigator.onLine === false) {
      // navigator.onLine === false é confiável ("com certeza sem
      // rede"); só não confiamos quando ele diz true, por isso as
      // chamadas reais de rede abaixo têm tratamento de erro próprio
      // mesmo quando começamos achando que estamos online.
      onFim('offline');
      return;
    }

    onStatus('Conectando…');

    APP_AUTH.obterTokenValido(function (erroAuth, token) {
      if (erroAuth) {
        onFim('Falha ao autenticar: ' + erroAuth);
        return;
      }

      sincronizarCifras(token, onStatus, function (erroCifras) {
        if (erroCifras) {
          onFim(erroCifras);
          return;
        }

        sincronizarRepertorios(token, onStatus, function (erroRepertorios) {
          if (erroRepertorios) {
            onFim(erroRepertorios);
            return;
          }

          sincronizarItensDeRepertorio(token, onStatus, function (erroItens) {
            if (erroItens) {
              onFim(erroItens);
              return;
            }

            APP_DB.setMeta(
              'ultima_sincronizacao_geral',
              new Date().toISOString(),
              function () {
                onFim(null);
              }
            );
          });
        });
      });
    });
  }

  // -------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------
  return {
    sincronizar: sincronizar
  };

})();
