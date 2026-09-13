/* ===================================================================
   Cifra SH — Offline (cliente legado iPad mini 1 / iOS 9)
   app-db.js

   Camada de persistência local via WebSQL. Tudo em ES5 puro (var,
   function, sem arrow function/let/const/template literal), e tudo
   por CALLBACK (sem depender de Promise nativa, pra não precisar de
   polyfill nenhum neste arquivo).

   Expõe um único objeto global: APP_DB.
   =================================================================== */

var APP_DB = (function () {

  var db = null;

  // -------------------------------------------------------------
  // init: abre (ou cria, se não existir) o banco local e garante que
  // todas as tabelas existam. Chamar uma vez, no arranque do app,
  // antes de qualquer outra função deste objeto.
  //
  // Passamos '' como versão de propósito: se a gente fixar uma versão
  // (ex. "1.0") e o banco já existir com outra internamente, o
  // openDatabase lança erro de versão incompatível. Passando '' o
  // WebSQL simplesmente abre o que já existe, sem checar versão —
  // evita essa classe inteira de erro. Controle de "o que mudou de
  // versão pra versão" fica por nossa conta, manualmente, na tabela
  // sync_meta, se algum dia for necessário.
  // -------------------------------------------------------------
  function init(onSucesso, onErro) {
    if (!window.openDatabase) {
      onErro(new Error(
        'Este navegador não suporta WebSQL. ' +
        'Este cliente é feito especificamente pro Safari do iOS 9.'
      ));
      return;
    }

    try {
      db = window.openDatabase(
        APP_CONFIG.WEBSQL_NOME,
        '',
        APP_CONFIG.WEBSQL_DESCRICAO,
        APP_CONFIG.WEBSQL_TAMANHO_BYTES
      );
    } catch (erroAbertura) {
      onErro(erroAbertura);
      return;
    }

    db.transaction(
      function (tx) {
        tx.executeSql(
          'CREATE TABLE IF NOT EXISTS cifras_cache (' +
          '  id TEXT PRIMARY KEY,' +
          '  title TEXT,' +
          '  artist TEXT,' +
          '  category TEXT,' +
          '  content TEXT,' +
          '  original_key TEXT,' +
          '  youtube_url TEXT,' +
          '  updated_at TEXT' +
          ')'
        );

        tx.executeSql(
          'CREATE TABLE IF NOT EXISTS repertorios_cache (' +
          '  id TEXT PRIMARY KEY,' +
          '  name TEXT,' +
          '  type TEXT,' +
          '  date TEXT,' +
          '  color TEXT,' +
          '  updated_at TEXT' +
          ')'
        );

        tx.executeSql(
          'CREATE TABLE IF NOT EXISTS repertorio_itens_cache (' +
          '  id TEXT PRIMARY KEY,' +
          '  repertoire_id TEXT,' +
          '  chord_id TEXT,' +
          '  section TEXT,' +
          '  order_index INTEGER' +
          ')'
        );

        tx.executeSql(
          'CREATE TABLE IF NOT EXISTS sync_meta (' +
          '  chave TEXT PRIMARY KEY,' +
          '  valor TEXT' +
          ')'
        );

        tx.executeSql(
          'CREATE TABLE IF NOT EXISTS auth_session (' +
          '  id INTEGER PRIMARY KEY,' +
          '  access_token TEXT,' +
          '  refresh_token TEXT,' +
          '  expires_at INTEGER' +
          ')'
        );
      },
      function (erroTransacao) {
        onErro(erroTransacao);
      },
      function () {
        onSucesso();
      }
    );
  }

  // -------------------------------------------------------------
  // sync_meta: guarda pares chave/valor simples (ex.: data da última
  // sincronização de cada tabela).
  // -------------------------------------------------------------
  function getMeta(chave, callback) {
    db.readTransaction(function (tx) {
      tx.executeSql(
        'SELECT valor FROM sync_meta WHERE chave = ?',
        [chave],
        function (tx2, resultado) {
          if (resultado.rows.length > 0) {
            callback(resultado.rows.item(0).valor);
          } else {
            callback(null);
          }
        },
        function (tx2, erro) {
          callback(null);
          return false;
        }
      );
    });
  }

  function setMeta(chave, valor, callback) {
    db.transaction(
      function (tx) {
        tx.executeSql(
          'INSERT OR REPLACE INTO sync_meta (chave, valor) VALUES (?, ?)',
          [chave, valor]
        );
      },
      function (erro) {
        if (callback) { callback(erro); }
      },
      function () {
        if (callback) { callback(null); }
      }
    );
  }

  // -------------------------------------------------------------
  // Sessão de autenticação (tokens do Supabase Auth)
  // -------------------------------------------------------------
  function salvarSessao(accessToken, refreshToken, expiresAt, callback) {
    db.transaction(
      function (tx) {
        tx.executeSql(
          'INSERT OR REPLACE INTO auth_session (id, access_token, refresh_token, expires_at) ' +
          'VALUES (1, ?, ?, ?)',
          [accessToken, refreshToken, expiresAt]
        );
      },
      function (erro) {
        if (callback) { callback(erro); }
      },
      function () {
        if (callback) { callback(null); }
      }
    );
  }

  function obterSessao(callback) {
    db.readTransaction(function (tx) {
      tx.executeSql(
        'SELECT access_token, refresh_token, expires_at FROM auth_session WHERE id = 1',
        [],
        function (tx2, resultado) {
          if (resultado.rows.length > 0) {
            callback(resultado.rows.item(0));
          } else {
            callback(null);
          }
        },
        function (tx2, erro) {
          callback(null);
          return false;
        }
      );
    });
  }

  // -------------------------------------------------------------
  // Cifras
  // -------------------------------------------------------------

  // Insere/atualiza uma lista de cifras vindas do Supabase.
  // Cada item: { id, title, artist, category, content, original_key,
  //              youtube_url, updated_at }
  function upsertCifras(lista, callback) {
    if (!lista || lista.length === 0) {
      if (callback) { callback(null); }
      return;
    }

    db.transaction(
      function (tx) {
        for (var i = 0; i < lista.length; i++) {
          var c = lista[i];
          tx.executeSql(
            'INSERT OR REPLACE INTO cifras_cache ' +
            '(id, title, artist, category, content, original_key, youtube_url, updated_at) ' +
            'VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [
              c.id,
              c.title || '',
              c.artist || '',
              c.category || '',
              c.content || '',
              c.original_key || '',
              c.youtube_url || '',
              c.updated_at || ''
            ]
          );
        }
      },
      function (erro) {
        if (callback) { callback(erro); }
      },
      function () {
        if (callback) { callback(null); }
      }
    );
  }

  // Lista cifras do cache local, com filtro opcional de busca por
  // título e/ou categoria exata.
  function getCifras(filtro, callback) {
    filtro = filtro || {};
    var sql = 'SELECT * FROM cifras_cache WHERE 1=1';
    var params = [];

    if (filtro.busca) {
      sql += ' AND title LIKE ?';
      params.push('%' + filtro.busca + '%');
    }
    if (filtro.categoria) {
      sql += ' AND category = ?';
      params.push(filtro.categoria);
    }
    sql += ' ORDER BY title COLLATE NOCASE ASC';

    db.readTransaction(function (tx) {
      tx.executeSql(
        sql,
        params,
        function (tx2, resultado) {
          var lista = [];
          for (var i = 0; i < resultado.rows.length; i++) {
            lista.push(resultado.rows.item(i));
          }
          callback(lista);
        },
        function (tx2, erro) {
          callback([]);
          return false;
        }
      );
    });
  }

  function getCifraPorId(id, callback) {
    db.readTransaction(function (tx) {
      tx.executeSql(
        'SELECT * FROM cifras_cache WHERE id = ?',
        [id],
        function (tx2, resultado) {
          if (resultado.rows.length > 0) {
            callback(resultado.rows.item(0));
          } else {
            callback(null);
          }
        },
        function (tx2, erro) {
          callback(null);
          return false;
        }
      );
    });
  }

  // Categorias distintas presentes no cache, pra popular o <select>
  // de filtro sem depender de uma lista fixa hardcoded.
  function getCategorias(callback) {
    db.readTransaction(function (tx) {
      tx.executeSql(
        'SELECT DISTINCT category FROM cifras_cache ' +
        'WHERE category IS NOT NULL AND category <> \'\' ' +
        'ORDER BY category COLLATE NOCASE ASC',
        [],
        function (tx2, resultado) {
          var lista = [];
          for (var i = 0; i < resultado.rows.length; i++) {
            lista.push(resultado.rows.item(i).category);
          }
          callback(lista);
        },
        function (tx2, erro) {
          callback([]);
          return false;
        }
      );
    });
  }

  // -------------------------------------------------------------
  // Repertórios
  // -------------------------------------------------------------

  function upsertRepertorios(lista, callback) {
    if (!lista || lista.length === 0) {
      if (callback) { callback(null); }
      return;
    }

    db.transaction(
      function (tx) {
        for (var i = 0; i < lista.length; i++) {
          var r = lista[i];
          tx.executeSql(
            'INSERT OR REPLACE INTO repertorios_cache ' +
            '(id, name, type, date, color, updated_at) ' +
            'VALUES (?, ?, ?, ?, ?, ?)',
            [
              r.id,
              r.name || '',
              r.type || '',
              r.date || '',
              r.color || '',
              r.updated_at || ''
            ]
          );
        }
      },
      function (erro) {
        if (callback) { callback(erro); }
      },
      function () {
        if (callback) { callback(null); }
      }
    );
  }

  // Repertórios ordenados por data, mais próximos/futuros primeiro —
  // é o que a Tela 1 (screen-repertorios) quer mostrar no topo.
  function getRepertorios(callback) {
    db.readTransaction(function (tx) {
      tx.executeSql(
        'SELECT * FROM repertorios_cache ORDER BY date ASC',
        [],
        function (tx2, resultado) {
          var lista = [];
          for (var i = 0; i < resultado.rows.length; i++) {
            lista.push(resultado.rows.item(i));
          }
          callback(lista);
        },
        function (tx2, erro) {
          callback([]);
          return false;
        }
      );
    });
  }

  function upsertRepertorioItens(lista, callback) {
    if (!lista || lista.length === 0) {
      if (callback) { callback(null); }
      return;
    }

    db.transaction(
      function (tx) {
        for (var i = 0; i < lista.length; i++) {
          var it = lista[i];
          tx.executeSql(
            'INSERT OR REPLACE INTO repertorio_itens_cache ' +
            '(id, repertoire_id, chord_id, section, order_index) ' +
            'VALUES (?, ?, ?, ?, ?)',
            [
              it.id,
              it.repertoire_id,
              it.chord_id,
              it.section || '',
              it.order_index || 0
            ]
          );
        }
      },
      function (erro) {
        if (callback) { callback(erro); }
      },
      function () {
        if (callback) { callback(null); }
      }
    );
  }

  // Itens de um repertório específico, já com o título da cifra
  // (join manual — WebSQL é SQLite por baixo, então JOIN normal
  // funciona) ordenados por seção e ordem definida no repertório.
  function getItensDoRepertorio(repertorioId, callback) {
    db.readTransaction(function (tx) {
      tx.executeSql(
        'SELECT ri.id, ri.section, ri.order_index, ' +
        '       ri.chord_id AS chord_id, c.title, c.category ' +
        'FROM repertorio_itens_cache ri ' +
        'LEFT JOIN cifras_cache c ON c.id = ri.chord_id ' +
        'WHERE ri.repertoire_id = ? ' +
        'ORDER BY ri.section ASC, ri.order_index ASC',
        [repertorioId],
        function (tx2, resultado) {
          var lista = [];
          for (var i = 0; i < resultado.rows.length; i++) {
            lista.push(resultado.rows.item(i));
          }
          callback(lista);
        },
        function (tx2, erro) {
          callback([]);
          return false;
        }
      );
    });
  }

  // -------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------
  return {
    init: init,
    getMeta: getMeta,
    setMeta: setMeta,
    salvarSessao: salvarSessao,
    obterSessao: obterSessao,
    upsertCifras: upsertCifras,
    getCifras: getCifras,
    getCifraPorId: getCifraPorId,
    getCategorias: getCategorias,
    upsertRepertorios: upsertRepertorios,
    getRepertorios: getRepertorios,
    upsertRepertorioItens: upsertRepertorioItens,
    getItensDoRepertorio: getItensDoRepertorio
  };

})();
