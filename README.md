# Cifra SH — Offline (cliente legado iPad mini 1ª geração)

Cliente separado do app principal (React + Vite), feito em HTML/CSS/JS
puro (ES5) para rodar em iPad mini 1ª geração travado em **iOS
9.3.5 / Safari 9**, 100% offline via WebSQL + AppCache.

Não é um app nativo — é um site "instalável" via **Adicionar à Tela
de Início**. Não precisa de Xcode nem de Mac.

---

## 1. Como servir os arquivos

Precisa ser **HTTPS** (ou `localhost` em teste local). AppCache e
WebSQL, em navegadores modernos, só funcionam em contexto seguro —
no Safari 9 especificamente isso não é 100% documentado, mas sirva
sempre por HTTPS para não correr risco.

### Cloudflare Pages (recomendado) vs Cloudflare Workers

O `_headers` deste projeto (que define
`Content-Type: text/cache-manifest` para o `manifest.appcache`) só é
lido automaticamente pelo **Cloudflare Pages**. Se o projeto foi
criado como um **Worker puro** (é o que o domínio `*.workers.dev`
sugere, em vez de `*.pages.dev`), o `_headers` pode ser ignorado —
e, sem o Content-Type correto, o **Safari ignora o AppCache
silenciosamente**, sem erro nenhum na tela.

**Como conferir:**
1. Abra o site em qualquer navegador, DevTools → aba **Network**.
2. Recarregue a página e clique na requisição de `manifest.appcache`.
3. Veja o header de resposta `Content-Type`. Tem que ser exatamente
   `text/cache-manifest`.

**Se não estiver correto:**
- O jeito mais simples é recriar o deploy como um projeto
  **Cloudflare Pages** (não Worker) — daí o `_headers` funciona sem
  configuração extra.
- Se precisar continuar como Worker, adicione no próprio script do
  Worker uma regra que force esse Content-Type na resposta de
  `/manifest.appcache` antes de servir o arquivo.

### Certificado / TLS

O iOS 9.3.5 é de 2015-2016. Cloudflare pode, dependendo da
configuração da zona, exigir TLS 1.2/1.3 com conjuntos de cifra que
esse Safari não suporta. Se o app não conseguir nem carregar o
`index.html` no iPad (erro de conexão insegura), verifique em
**SSL/TLS → Edge Certificates** no painel Cloudflare se o "Minimum
TLS Version" está baixo o suficiente (isso é uma troca com
segurança — deixe o mais alto possível que ainda funcione no
aparelho).

---

## 2. Configurando a conta de sincronização

O arquivo `app-config.js` é o único que precisa de dados reais do
seu projeto:

```js
SUPABASE_URL: '...',
SUPABASE_ANON_KEY: '...',   // painel Supabase > Project Settings > API
SYNC_EMAIL: '...',
SYNC_SENHA: '...',
```

**Importante sobre a conta de sincronização (`SYNC_EMAIL`/`SYNC_SENHA`):**

- Esse e-mail/senha ficam em texto puro dentro de um arquivo `.js`
  **servido publicamente** — qualquer pessoa que abrir a URL do
  app e olhar "Exibir código-fonte" consegue ler essa senha. Isso
  é uma limitação inerente a um cliente 100% estático sem backend
  próprio, não tem como esconder de verdade.
- Por isso, **use uma conta dedicada** só para isso (ex.
  `ipad.capela@suacomunidade.org`), nunca uma conta pessoal.
- Dê a essa conta o **mínimo de acesso necessário**: adicione-a como
  membro (`mission_members`) só das missões cujo repertório o iPad
  precisa enxergar. Ela não precisa de nenhum privilégio de
  administrador.
- Troque a senha periodicamente, e imediatamente se o arquivo
  `app-config.js` for compartilhado, versionado num repositório
  público, ou exposto por qualquer outro meio.

---

## 3. Limitação conhecida: AppCache é instável

O `manifest.appcache` (Application Cache) é uma tecnologia
**deprecated** desde ~2015, removida de todos os navegadores
modernos — só sobrevive no Safari 9 do iOS 9, que é exatamente o
alvo deste cliente. Mesmo lá, o comportamento tem excentricidades
conhecidas:

- Ele só percebe que precisa atualizar o cache quando o **conteúdo
  do próprio `manifest.appcache`** muda (nem que seja 1 caractere) —
  não compara os arquivos listados. **Toda vez que editar qualquer
  arquivo do app**, é obrigatório subir o número no comentário
  `# versao: N` do manifesto e publicar de novo, senão os iPads que
  já instalaram continuam presos na versão antiga para sempre,
  mesmo com internet.
- Se o download da atualização falhar no meio (rede instável), o
  Safari pode ficar com um cache "meio atualizado" de forma
  imprevisível. Trate o AppCache como conveniência (evita
  recarregar tudo pela rede toda vez), nunca como única fonte —
  os **dados** (cifras, repertórios) vivem no WebSQL, não no
  AppCache, exatamente por causa dessa instabilidade.
- Não existe "forçar atualização" pelo usuário de forma confiável
  no Safari 9. Se um iPad ficar preso numa versão antiga, a solução
  mais garantida é remover o atalho da Tela de Início e adicionar
  de novo.

---

## 4. Testando

- **Chrome/Android ou navegadores modernos não são um teste
  válido** deste app — WebSQL foi removido deles, então você vai
  ver a tela de erro "não conseguiu abrir o armazenamento local"
  mesmo com tudo certo no código. Isso é o fallback funcionando,
  não um bug.
- O único teste que vale é no **iPad mini 1ª geração real, com
  iOS 9.3.5 / Safari 9**.
- Sequência de teste sugerida no iPad:
  1. Abrir a URL no Safari, confirmar que carrega e sincroniza.
  2. Adicionar à Tela de Início, abrir pelo atalho, confirmar modo
     tela cheia (sem barra do Safari).
  3. Ativar modo avião, fechar e reabrir o app pelo atalho —
     repertórios e cifras já baixados devem continuar aparecendo,
     com a barra de status indicando "Sem internet".
  4. Editar qualquer arquivo, subir a versão no
     `manifest.appcache`, publicar, reabrir o app com internet, e
     confirmar que a mudança chegou no iPad.

---

## Fora de escopo (por design)

Este cliente é só leitura: sem criar/editar/excluir cifra ou
repertório, sem upload de anexos, sem IA, sem notificações push.
Qualquer uma dessas ações continua sendo feita no app principal.
