# 🛡️ AD Monitor & Cleaner Dashboard

> **Painel Administrativo para Monitoramento, Auditoria e Limpeza do Active Directory.**

Este projeto é uma solução completa para administradores de sistemas (SysAdmin) que precisam monitorar o Active Directory, identificar contas obsoletas, gerenciar inventário de TI e auditar ações de segurança, tudo através de uma interface web moderna e responsiva.

---

## 📋 Funcionalidades Principais

### 1. 🖥️ Inventário de TI (Computadores & Servidores)
* **Monitoramento em Tempo Real:** Listagem completa de Workstations e Servidores.
* **Status Online/Offline:** Identificação visual de máquinas ativas.
* **Limpeza Segura:** Funcionalidade de exclusão que remove a máquina do Active Directory e do Banco de Dados local simultaneamente.
* **Filtros Inteligentes:** Buscas por Hostname, Sistema Operacional ou máquinas inativas há mais de 6 meses ("Zumbis").

### 2. 👥 Gestão de Usuários
* **KPIs Dinâmicos:** Métricas de usuários Ativos vs. Inativos.
* **Risk Score (Pontuação de Risco):** Algoritmo personalizado que calcula o risco de segurança de cada usuário baseado em permissões e comportamento.
* **Monitoramento de Desativados:** Acompanhamento de ex-funcionários, com alertas para contas desligadas há mais de 5 anos ou desligamentos recentes (últimos 30 dias).

### 3. 🛡️ Auditoria & Segurança
* **Logs Imutáveis:** Registro automático de todas as ações administrativas (Ex: "Quem excluiu o computador X e quando?").
* **Histórico Visual:** Tabela de auditoria colorida por tipo de ação (Sucesso/Erro).

### 4. ⚙️ Automação
* **Sincronização Agendada:** Script `.bat` integrado para coleta automática de dados do AD via Agendador de Tarefas do Windows.

---

## 🛠️ Tecnologias Utilizadas

* **Backend:** Node.js, Express
* **Conectividade AD:** LDAPjs (Protocolo LDAP nativo)
* **Banco de Dados:** MySQL (com Pool de Conexões)
* **Frontend:** HTML5, JavaScript (Vanilla ES6+), TailwindCSS
* **Segurança:** Autenticação de Sessão, Proteção contra Força Bruta (Rate Limit), Sanitização de Inputs.

---

## 🚀 Instalação e Configuração

### Pré-requisitos
* Node.js instalado (v14+)
* MySQL Server rodando
* Acesso a um Domain Controller (Active Directory)

### Passo 1: Clonar e Instalar

```bash
# Clone o repositório
git clone https://github.com/CauaBarrosGh/system_ad_monitor

# Entre na pasta
cd system_ad_monitor

# Instale as dependências
npm install
```

### Passo 2: Configurar o Ambiente (.env)

Crie um arquivo chamado `.env` na raiz do projeto e configure suas credenciais:

```env
# Configurações do Servidor
PORT=3000
SESSION_SECRET=sua_chave_secreta_aqui

# Configurações do Banco de Dados (MySQL)
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=sua_senha_mysql
DB_NAME=ad_monitor_db

# Configurações do Active Directory (LDAP)
AD_URL=ldap://192.168.1.100
AD_BASE=dc=suaempresa,dc=com,dc=br
AD_USER=seu_usuario_admin@suaempresa.com.br
AD_PASSWORD=sua_senha_ad
```

### Passo 3: Configurar o Banco de Dados

1. Abra seu gerenciador MySQL (Workbench, DBeaver, etc).
2. Crie o banco de dados `ad_monitor_db`.
3. Execute o script `database/schema.sql` para criar as tabelas.

### Passo 4: Executar

Para iniciar o servidor web:

```bash
npm start
```
O painel estará acessível em: `http://localhost:3000`

---

## 🤖 Automação (Coleta de Dados)

Para manter os dados atualizados sem intervenção manual:

1. Localize o arquivo `executar_coleta.bat` na raiz.
2. Configure o **Agendador de Tarefas do Windows** (Task Scheduler) para executar este arquivo a cada 1 hora (ou conforme necessidade).

Isso garantirá que o banco de dados esteja sempre sincronizado com o AD.

---

## 🔒 Segurança

Este projeto segue boas práticas de segurança:

* **Tree Delete Control:** Utiliza OID específico para permitir exclusão segura de objetos complexos no AD.
* **Fail-Safe Database:** Se o AD estiver inacessível, o banco de dados não é corrompido.
* **GitIgnore:** Arquivos sensíveis (`.env`, `node_modules`) são ignorados pelo Git.

---

**Desenvolvido por Cauã 🚀**