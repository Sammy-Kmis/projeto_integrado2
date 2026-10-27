# Sistema de Gerenciamento de Estacionamento Universitário

**Projeto Integrador II — Análise e Desenvolvimento de Sistemas (2026)**

Sistema acadêmico para controlar a capacidade e as movimentações de veículos em um estacionamento universitário. O operador pode cadastrar pessoas e veículos, registrar entradas e saídas, consultar o histórico e acompanhar a ocupação e os relatórios.

O sistema **não utiliza vagas individuais nem escalas de estacionamento**. Também não realiza cobranças e não controla uma cancela física.

## Tecnologias utilizadas

- **HTML e CSS:** estrutura e aparência das telas.
- **JavaScript:** formulários, interações e comunicação com o servidor.
- **Python e Flask:** autenticação e regras do sistema.
- **PostgreSQL:** armazenamento dos cadastros e das movimentações.
- **pg8000:** conexão entre Python e PostgreSQL.

## Estrutura do projeto

| Caminho | Finalidade |
| --- | --- |
| `frontend/index.html` | Telas do sistema. |
| `frontend/style.css` | Estilos da interface. |
| `frontend/script.js` | Interações e comunicação com a API. |
| `backend/app.py` | Inicialização do Flask, login e sessões. |
| `backend/cadastros.py` | Cadastro de pessoas e veículos. |
| `backend/movimentacoes.py` | Entradas, saídas, capacidade e dias conferidos. |
| `backend/db.py` | Conexão com o PostgreSQL. |
| `backend/requirements.txt` | Bibliotecas Python utilizadas. |
| `database/tabelas.sql` | Criação das tabelas do banco de dados. |

Os documentos acadêmicos, como o relatório e o cronograma, são mantidos separadamente do código publicado no GitHub.

## Como executar

### 1. Preparar o ambiente

É necessário ter Python e PostgreSQL instalados.

Abra um terminal na pasta principal do projeto e crie o ambiente virtual, caso ele ainda não exista:

```powershell
python -m venv .venv
```

No PowerShell, ative o ambiente:

```powershell
.\.venv\Scripts\Activate.ps1
```

Instale as bibliotecas:

```powershell
pip install -r backend/requirements.txt
```

### 2. Preparar o banco de dados

No pgAdmin, crie um banco de dados para o projeto. **Somente em um banco novo e vazio**, abra a ferramenta de consultas e execute o conteúdo de `database/tabelas.sql` para criar as tabelas.

Depois, no mesmo banco novo, registre a capacidade inicial:

```sql
INSERT INTO estacionamento (id_estacionamento, capacidade_total)
VALUES (1, 50)
ON CONFLICT (id_estacionamento) DO NOTHING;
```

É necessário também criar pelo menos um operador ativo, com senha armazenada como hash, para acessar o sistema. O projeto possui um arquivo de apoio para criação de operadores na pasta `backend`; confira suas instruções antes de executá-lo.

**Não execute o script de criação das tabelas sobre um banco já utilizado**, pois ele não é um procedimento de atualização de bancos existentes.

### 3. Configurar a conexão

Crie o arquivo `backend/.env` com as configurações locais. Ele deve conter as variáveis:

- `DB_HOST`
- `DB_PORT`
- `DB_NAME`
- `DB_USER`
- `DB_PASSWORD`
- `SECRET_KEY` (chave secreta aleatória de pelo menos 32 caracteres)

As informações devem corresponder ao seu PostgreSQL. Não compartilhe o conteúdo desse arquivo e não o envie ao GitHub.

### 4. Iniciar o sistema

Com o ambiente virtual ativado, execute:

```powershell
python backend/app.py
```

Abra `http://127.0.0.1:5000/` no navegador e entre com um operador ativo.

## Funcionalidades

- Login e verificação da sessão do operador.
- Cadastro e consulta de pessoas e veículos.
- Associação de vários veículos à mesma pessoa.
- Inativação de cadastros sem apagar o histórico.
- Registro de entrada e saída de veículos.
- Controle de capacidade, com recusa de entradas quando o estacionamento está lotado.
- Histórico de movimentações com filtros.
- Consulta do fluxo por dia da semana a partir de dias completos conferidos.

## Regras de ocupação

- **Veículos presentes:** quantidade de entradas sem horário de saída.
- **Vagas disponíveis:** capacidade total menos veículos presentes.
- O sistema impede uma segunda entrada aberta para a mesma placa.
- A saída encerra a movimentação, sem excluir seu histórico.
- Os relatórios distinguem dias sem dados de dias conferidos sem movimento.

## Testes realizados

Nos testes locais, foram verificados o funcionamento da conexão com o PostgreSQL, as movimentações, a atualização do painel e os cálculos dos relatórios.

Também foi realizado um teste com **duas solicitações de entrada iniciadas em paralelo**, usando o cliente de testes do Flask e o banco `estacionamento_teste`. Com apenas uma vaga livre, uma solicitação foi aceita (HTTP 201), a outra foi recusada (HTTP 409) e a ocupação final permaneceu dentro da capacidade. O resultado foi conferido diretamente no PostgreSQL.

Esse é o resultado do cenário testado; ele não substitui testes adicionais em um servidor utilizado por vários operadores.

## Segurança e cuidados

- O arquivo `backend/.env` e a pasta `.venv/` não devem ser publicados no GitHub.
- Documentos acadêmicos e dados pessoais devem ser compartilhados apenas pelos canais definidos pela equipe e pelo professor.
- Utilize o banco de testes para experimentos e preserve o banco principal.
- Os scripts antigos da pasta `database/legado/` não representam a estrutura atual do sistema e não devem ser executados no banco em uso.
