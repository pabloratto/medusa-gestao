# Medusa Gestão — guia de instalação

Três partes, nesta ordem: **1. Firebase** (login e banco de dados) → **2. Netlify** (site) → **3. Instalar no computador**.
Tempo total: uns 20 minutos.

---

## Parte 1 — Firebase (login só para você)

### 1.1 Criar o projeto
1. Acesse https://console.firebase.google.com e entre com sua conta Google.
2. Clique em **Criar um projeto** → nome `medusa-gestao` → continuar.
3. Desative o **Google Analytics** (não precisa) → **Criar projeto**.

### 1.2 Ativar login por e-mail e senha
1. No menu da esquerda: **Criação (Build) → Authentication → Vamos começar**.
2. Aba **Método de login** → **E-mail/senha** → ative só a primeira chave → **Salvar**.

### 1.3 Criar o seu usuário
1. Aba **Usuários** → **Adicionar usuário**.
2. Seu e-mail e uma senha forte (12+ caracteres, com letras, números e símbolo) → **Adicionar usuário**.
3. Na tabela, copie o **UID do usuário** (código tipo `aB3dE...`). Você vai usar no passo 1.6.

### 1.4 Bloquear novos cadastros (ninguém mais cria conta)
1. Aba **Configurações** → **Ações do usuário**.
2. **Desmarque** "Ativar criação (inscrição)" e "Ativar exclusão" → **Salvar**.
3. Se essa opção não aparecer na sua tela, siga em frente: as regras do passo 1.6 já garantem que
   só o seu usuário lê e grava os dados, mesmo que alguém consiga criar uma conta.

### 1.5 Criar o banco de dados
1. Menu: **Criação → Firestore Database → Criar banco de dados**.
2. Local: **southamerica-east1 (São Paulo)** → modo **produção** → **Criar**.

### 1.6 Regras de segurança (dados só da sua conta)
1. No Firestore, aba **Regras**. Apague tudo.
2. Cole o conteúdo do arquivo `firestore.rules` deste repositório.
3. As regras já liberam só o e-mail `pablodsgnr@gmail.com` (mantenha as aspas se trocar o e-mail).
4. **Publicar**.

### 1.7 Pegar as chaves do app
1. Engrenagem ⚙ (topo do menu) → **Configurações do projeto** → aba **Geral**.
2. Em "Seus apps", clique no ícone **</>** (Web).
3. Apelido `Medusa Web`. **Não** marque Firebase Hosting → **Registrar app**.
4. Aparece um bloco `const firebaseConfig = { apiKey: ..., authDomain: ..., ... }`. Copie.

### 1.8 Colocar as chaves no app
Escolha uma opção:
- **A)** Mande o bloco para o Claude colocar.
- **B)** No GitHub: repositório `medusa-gestao` →
  abra `assets/firebase-config.js` → ícone de lápis → troque cada `"COLE_AQUI"` pelo valor
  correspondente → **Commit changes**.

> As chaves do Firebase para web não são senha: elas ficam visíveis no site de qualquer forma.
> Quem protege seus dados é o login + as regras do passo 1.6 + o bloqueio de cadastros do passo 1.4.

---

## Parte 2 — Netlify (colocar o site no ar)

1. Acesse https://app.netlify.com e entre com **GitHub** (conta `pabloratto`).
2. **Add new project → Import an existing project → GitHub** → escolha `medusa-gestao`.
3. Deixe como vier: branch **main**, base directory e build command **vazios**. O arquivo `netlify.toml` já
   configura o resto. Clique em **Deploy**.
4. **Site configuration → Change site name** → `medusa-gestao` (o endereço vira `medusa-gestao.netlify.app`;
   se o nome estiver ocupado, escolha outro).
5. **Volte ao Firebase:** Authentication → Configurações → **Domínios autorizados** → **Adicionar domínio** →
   o seu endereço do Netlify, sem `https://`. Sem isso o login não funciona.
6. Teste: abra o site e entre com seu e-mail e senha. Em **Configurações → Conta e segurança** deve aparecer
   "Conectado ao Firebase".

Daqui em diante, toda alteração enviada para o branch `main` é publicada sozinha.

---

## Parte 3 — Instalar a versão desktop

O app instala como programa pelo próprio navegador: abre em janela própria, com ícone na área de trabalho
e na barra de tarefas, e se atualiza sozinho.

**Google Chrome (Windows ou Mac)**
1. Abra o site e faça login.
2. Clique no ícone de instalar na barra de endereço (um monitor com uma seta), ou menu **⋮ →
   Transmitir, salvar e compartilhar → Instalar página como app**.
3. **Instalar**. Depois clique com o botão direito no ícone da barra de tarefas → **Fixar**.

**Microsoft Edge (Windows)**
1. Abra o site → menu **… → Aplicativos → Instalar este site como aplicativo** → **Instalar**.
2. Marque "Fixar na barra de tarefas" e "Criar atalho na área de trabalho".

**Safari (Mac com macOS Sonoma ou mais novo)**
1. Abra o site → menu **Arquivo → Adicionar ao Dock**.

Para desinstalar: no Chrome, abra o app → menu **⋮ → Desinstalar Medusa Gestão**; no Edge, `edge://apps`.

---

## Boas práticas
- Use senha forte e não salve a senha em computador de outra pessoa.
- Esqueceu a senha? Na tela de login, digite o e-mail e clique em **Esqueci minha senha**.
- Uma vez por mês: **Configurações → Conta e segurança → Baixar backup**.
- Os dados da simulação (prévia no claude.ai) não vão para o site real; comece o cadastro do zero.

---

## O que o app faz

| Página | O que faz |
|---|---|
| **Dashboard** | Saldo, entradas e saídas do mês, orçamentos em aberto, próximas entregas, atividade recente, busca geral e alertas |
| **Caixa** | Registrar, editar e excluir entradas/saídas; filtro por mês, tipo e busca |
| **Orçamento** | Cliente e itens do catálogo, desconto, PDF, WhatsApp, status e "Gerar pedido" |
| **Clientes** | Cadastro completo, ativo/inativo, histórico e atalho para WhatsApp |
| **Pedidos** | Quadro Aguardando → Em produção → Pronto → Entregue (arraste os cards) e "Gerar recibo" |
| **Catálogo** | Serviços/produtos com custo, venda e lucro calculado |
| **Gestão** | Receita, despesas, lucro, ticket médio, gráfico semanal, meta, mais vendidos e alertas |
| **Recibos** | Emitir, editar, PDF, WhatsApp e marcar pago (lança a entrada no Caixa) |
| **Configurações** | Empresa e logo, metas, numeração, pagamentos, categorias, saldo inicial, senha e backup |

**Fluxo:** Orçamento aprovado → Pedido → Recibo → recibo pago lança a entrada no Caixa.
**PDF:** o botão abre a janela de impressão; escolha "Salvar como PDF".

## Estrutura dos arquivos
- `index.html` (login) e uma página `.html` para cada tela; o código de cada uma fica em `assets/<página>.js`
- `assets/core.js` — login, banco de dados, configurações, menu, PDF e WhatsApp
- `assets/painel.js` — cálculos do Dashboard e da Gestão
- `assets/firebase-config.js` — chaves do Firebase
- `manifest.webmanifest`, `sw.js`, `icons/` — instalação como app no computador
- `firestore.rules` — regras de segurança para colar no Firebase
- `netlify.toml` — configuração do site no Netlify

Dados no Firestore: `users/{seu UID}/` → `lancamentos`, `clientes`, `catalogo`, `orcamentos`, `pedidos`,
`recibos` e `config/geral`. Valores em dinheiro ficam em centavos.
