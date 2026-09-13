/* ===================================================================
   Cifra SH — Offline (cliente legado iPad mini 1 / iOS 9)
   app-ui.js

   Renderiza as 3 telas definidas no index.html e liga os cliques.
   ES5 puro, sem framework — innerHTML montado por concatenação de
   string e busca de elementos por getElementById/querySelectorAll.

   Dentro da tela "screen-repertorios" existem, na prática, 2 modos:
   lista de repertórios, e (ao clicar num repertório) a lista das
   músicas daquele repertório. Não criamos uma 4ª <section> pra isso
   de propósito — é conteúdo trocado dentro da mesma tela, com um
   link "← Repertórios" pra voltar ao modo lista.

   Expõe um único objeto global: APP_UI.
   =================================================================== */

var APP_UI = (function () {

  // Em qual repertório o usuário "entrou" (drill-down), ou null se
  // está vendo a lista de repertórios. Usado tanto pra saber o que
  // re-renderizar quanto pra saber pra onde voltar depois de ver uma
  // cifra que veio de dentro de um repertório.
  var repertorioAberto = null;

  // De qual tela (repertorios ou cifras) o usuário abriu a cifra
  // atual — o botão "Voltar" do detalhe usa isso.
  var telaDeOrigemDaCifra = 'repertorios';

  var TIMEOUT_BUSCA_MS = 300;
  var timerBusca = null;

  // -------------------------------------------------------------
  // Utilitários
  // -------------------------------------------------------------

  function escaparHtml(texto) {
    if (!texto) {
      return '';
    }
    return String(texto)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatarDataCurta(isoOuNulo) {
    if (!isoOuNulo) {
      return '';
    }
    var d = new Date(isoOuNulo);
    if (isNaN(d.getTime())) {
      return '';
    }
    var dia = ('0' + d.getDate()).slice(-2);
    var mes = ('0' + (d.getMonth() + 1)).slice(-2);
    return dia + '/' + mes + '/' + d.getFullYear();
  }

  function formatarDataHora(isoOuNulo) {
    if (!isoOuNulo) {
      return '';
    }
    var d = new Date(isoOuNulo);
    if (isNaN(d.getTime())) {
      return '';
    }
    var horas = ('0' + d.getHours()).slice(-2);
    var minutos = ('0' + d.getMinutes()).slice(-2);
    return formatarDataCurta(isoOuNulo) + ' ' + horas + ':' + minutos;
  }

  // -------------------------------------------------------------
  // Barra de status (online / offline / erro)
  // -------------------------------------------------------------
  function atualizarStatusBar(estado, texto) {
    var barra = document.getElementById('status-bar');
    var span = document.getElementById('status-texto');

    barra.className = 'status-bar status-' + estado;
    span.textContent = texto;
  }

  // -------------------------------------------------------------
  // Troca de tela (das 3 <section class="screen">)
  // -------------------------------------------------------------
  function mostrarTela(nomeTela) {
    var telas = document.querySelectorAll('.screen');
    for (var i = 0; i < telas.length; i++) {
      telas[i].className = 'screen';
    }
    document.getElementById('screen-' + nomeTela).className = 'screen screen-ativa';

    // Os botões de navegação só existem pra repertorios/cifras — na
    // tela de detalhe da cifra eles ficam sem destaque nenhum.
    var btnRepertorios = document.getElementById('nav-btn-repertorios');
    var btnCifras = document.getElementById('nav-btn-cifras');
    btnRepertorios.className = 'nav-btn';
    btnCifras.className = 'nav-btn';

    if (nomeTela === 'repertorios') {
      btnRepertorios.className = 'nav-btn nav-btn-ativo';
    } else if (nomeTela === 'cifras') {
      btnCifras.className = 'nav-btn nav-btn-ativo';
    }
  }

  // -------------------------------------------------------------
  // Tela 1a — Lista de repertórios
  // -------------------------------------------------------------
  function renderizarListaRepertorios() {
    repertorioAberto = null;

    APP_DB.getRepertorios(function (lista) {
      var container = document.getElementById('lista-repertorios');

      if (lista.length === 0) {
        container.innerHTML = '<p class="lista-vazia">' +
          'Nenhum repertório disponível ainda. Conecte à internet ' +
          'pelo menos uma vez para baixar o conteúdo.</p>';
        return;
      }

      var html = '';
      for (var i = 0; i < lista.length; i++) {
        var r = lista[i];
        html +=
          '<button type="button" class="lista-item" data-repertorio-id="' +
          escaparHtml(r.id) + '">' +
          '<span class="lista-item-titulo">' + escaparHtml(r.name) + '</span>' +
          '<span class="lista-item-sub">' +
          formatarDataCurta(r.date) +
          (r.type ? ' · ' + escaparHtml(r.type) : '') +
          '</span>' +
          '</button>';
      }
      container.innerHTML = html;

      var botoes = container.querySelectorAll('[data-repertorio-id]');
      for (var j = 0; j < botoes.length; j++) {
        botoes[j].addEventListener('click', onCliqueRepertorio, false);
      }
    });
  }

  function onCliqueRepertorio(evento) {
    var id = evento.currentTarget.getAttribute('data-repertorio-id');
    renderizarItensDeRepertorio(id);
  }

  // -------------------------------------------------------------
  // Tela 1b — Itens (músicas) de um repertório específico
  // -------------------------------------------------------------
  function renderizarItensDeRepertorio(repertorioId) {
    repertorioAberto = repertorioId;

    APP_DB.getItensDoRepertorio(repertorioId, function (itens) {
      var container = document.getElementById('lista-repertorios');

      var html =
        '<button type="button" id="btn-voltar-repertorios" class="btn-voltar">' +
        '&larr; Repertórios</button>';

      if (itens.length === 0) {
        html += '<p class="lista-vazia">Nenhuma música neste repertório.</p>';
        container.innerHTML = html;
        document.getElementById('btn-voltar-repertorios')
          .addEventListener('click', renderizarListaRepertorios, false);
        return;
      }

      var secaoAtual = null;
      for (var i = 0; i < itens.length; i++) {
        var it = itens[i];

        if (it.section !== secaoAtual) {
          secaoAtual = it.section;
          html += '<h2 class="screen-titulo" style="font-size:16px;margin-top:16px;">' +
            escaparHtml(secaoAtual || 'Sem seção') + '</h2>';
        }

        html +=
          '<button type="button" class="lista-item" data-cifra-id="' +
          escaparHtml(it.chord_id) + '">' +
          '<span class="lista-item-titulo">' +
          escaparHtml(it.title || '(cifra não encontrada no cache local)') +
          '</span>' +
          (it.category
            ? '<span class="lista-item-sub">' + escaparHtml(it.category) + '</span>'
            : '') +
          '</button>';
      }

      container.innerHTML = html;

      document.getElementById('btn-voltar-repertorios')
        .addEventListener('click', renderizarListaRepertorios, false);

      var botoesCifra = container.querySelectorAll('[data-cifra-id]');
      for (var j = 0; j < botoesCifra.length; j++) {
        botoesCifra[j].addEventListener('click', function (evento) {
          var id = evento.currentTarget.getAttribute('data-cifra-id');
          abrirCifra(id, 'repertorios');
        }, false);
      }
    });
  }

  // -------------------------------------------------------------
  // Tela 2 — Lista de cifras (busca + filtro de categoria)
  // -------------------------------------------------------------
  function renderizarListaCifras() {
    var busca = document.getElementById('busca-cifras').value.trim();
    var categoria = document.getElementById('filtro-categoria').value;

    APP_DB.getCifras({ busca: busca, categoria: categoria }, function (lista) {
      var container = document.getElementById('lista-cifras');

      if (lista.length === 0) {
        container.innerHTML = '<p class="lista-vazia">Nenhuma cifra encontrada.</p>';
        return;
      }

      var html = '';
      for (var i = 0; i < lista.length; i++) {
        var c = lista[i];
        html +=
          '<button type="button" class="lista-item" data-cifra-id="' +
          escaparHtml(c.id) + '">' +
          '<span class="lista-item-titulo">' + escaparHtml(c.title) + '</span>' +
          '<span class="lista-item-sub">' +
          escaparHtml(c.category || '') +
          (c.original_key ? ' · Tom ' + escaparHtml(c.original_key) : '') +
          '</span>' +
          '</button>';
      }
      container.innerHTML = html;

      var botoes = container.querySelectorAll('[data-cifra-id]');
      for (var j = 0; j < botoes.length; j++) {
        botoes[j].addEventListener('click', function (evento) {
          var id = evento.currentTarget.getAttribute('data-cifra-id');
          abrirCifra(id, 'cifras');
        }, false);
      }
    });
  }

  function atualizarOpcoesDeCategoria() {
    APP_DB.getCategorias(function (categorias) {
      var select = document.getElementById('filtro-categoria');
      var valorAtual = select.value;

      var html = '<option value="">Todas as categorias</option>';
      for (var i = 0; i < categorias.length; i++) {
        html += '<option value="' + escaparHtml(categorias[i]) + '">' +
          escaparHtml(categorias[i]) + '</option>';
      }
      select.innerHTML = html;
      select.value = valorAtual;
    });
  }

  // -------------------------------------------------------------
  // Tela 3 — Detalhe da cifra
  // -------------------------------------------------------------
  function abrirCifra(id, origem) {
    telaDeOrigemDaCifra = origem;

    APP_DB.getCifraPorId(id, function (cifra) {
      if (!cifra) {
        document.getElementById('cifra-titulo').textContent = 'Cifra não encontrada';
        document.getElementById('cifra-subinfo').textContent = '';
        document.getElementById('cifra-conteudo').textContent =
          'Esta cifra ainda não foi baixada para este aparelho. ' +
          'Conecte à internet para sincronizar.';
        mostrarTela('cifra-detalhe');
        return;
      }

      document.getElementById('cifra-titulo').textContent = cifra.title || '';

      var partesSubinfo = [];
      if (cifra.artist) { partesSubinfo.push(cifra.artist); }
      if (cifra.category) { partesSubinfo.push(cifra.category); }
      if (cifra.original_key) { partesSubinfo.push('Tom ' + cifra.original_key); }
      document.getElementById('cifra-subinfo').textContent = partesSubinfo.join(' · ');

      document.getElementById('cifra-conteudo').textContent = cifra.content || '';

      mostrarTela('cifra-detalhe');
    });
  }

  function voltarDaCifra() {
    // Se a cifra veio de dentro de um repertório aberto, o conteúdo
    // daquele drill-down já está montado no DOM (não precisamos
    // renderizar de novo) — só trocar a tela de volta.
    mostrarTela(telaDeOrigemDaCifra);
  }

  // -------------------------------------------------------------
  // Ligação inicial de eventos (chamado uma vez por app-main.js)
  // -------------------------------------------------------------
  function init() {
    document.getElementById('nav-btn-repertorios').addEventListener(
      'click',
      function () {
        renderizarListaRepertorios();
        mostrarTela('repertorios');
      },
      false
    );

    document.getElementById('nav-btn-cifras').addEventListener(
      'click',
      function () {
        mostrarTela('cifras');
      },
      false
    );

    document.getElementById('btn-voltar-cifra').addEventListener(
      'click',
      voltarDaCifra,
      false
    );

    document.getElementById('busca-cifras').addEventListener(
      'input',
      function () {
        if (timerBusca) {
          clearTimeout(timerBusca);
        }
        timerBusca = setTimeout(renderizarListaCifras, TIMEOUT_BUSCA_MS);
      },
      false
    );

    document.getElementById('filtro-categoria').addEventListener(
      'change',
      renderizarListaCifras,
      false
    );
  }

  // -------------------------------------------------------------
  // API pública
  // -------------------------------------------------------------
  return {
    init: init,
    atualizarStatusBar: atualizarStatusBar,
    renderizarListaRepertorios: renderizarListaRepertorios,
    renderizarListaCifras: renderizarListaCifras,
    atualizarOpcoesDeCategoria: atualizarOpcoesDeCategoria,
    formatarDataHora: formatarDataHora
  };

})();
