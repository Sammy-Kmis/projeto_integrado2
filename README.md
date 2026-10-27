
# Sistema de Gerenciamento de Estacionamento Universitário

**Projeto Integrador II — Análise e Desenvolvimento de Sistemas (2026)**

Sistema acadêmico para controlar a capacidade e as movimentações de veículos em um estacionamento universitário.

O operador pode cadastrar pessoas e veículos, registrar entradas e saídas, consultar o histórico e acompanhar a ocupação e os relatórios.

O sistema **não utiliza vagas individuais nem escalas de estacionamento**. Também não realiza cobranças e não controla uma cancela física.

## Tecnologias utilizadas

- **HTML e CSS:** estrutura e aparência das telas.
- **JavaScript:** formulários, interações e comunicação com o servidor.
- **Python e Flask:** autenticação e regras do sistema.
- **PostgreSQL:** armazenamento dos cadastros e das movimentações.
- **pg8000:** conexão entre Python e PostgreSQL.
- **Git e GitHub:** versionamento e compartilhamento do código.

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
| `backend/criar_operador.py` | Criação de contas de operadores. |
| `backend/requirements.txt` | Bibliotecas Python utilizadas. |
| `backend/.env.example` | Exemplo de configuração do ambiente. |
| `database/tabelas.sql` | Criação das tabelas do banco de dados. |
| `testes/teste_concorrencia.py` | Teste de entradas simultâneas. |

Os documentos acadêmicos, como o relatório e o cronograma, são mantidos separadamente do código publicado no GitHub.

## Como executar

As instruções abaixo consideram um computador Windows com PowerShell.

### 1. Preparar o ambiente

É necessário ter Python e PostgreSQL instalados.

Para obter o projeto em outro computador, clone o repositório pelo Git:

```powershell
git clone https://github.com/Sammy-Kmis/projeto_integrado2.git
```

Entre na pasta do projeto:

```powershell
cd projeto_integrado2
```

Se o projeto já estiver no computador, basta abrir sua pasta no VS Code.

No terminal, na raiz do projeto, crie um ambiente virtual:

```powershell
python -m venv .venv
```

Ative o ambiente virtual no PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

Instale as bibliotecas necessárias:

```powershell
pip install -r backend/requirements.txt
```

### 2. Preparar o banco de dados

No pgAdmin, crie um banco de dados PostgreSQL para o projeto.

**Somente em um banco novo e vazio**, abra a ferramenta de consultas e execute o conteúdo de:

`database/tabelas.sql`

Esse arquivo cria as tabelas utilizadas pelo sistema:

- `operador`
- `usuario`
- `veiculo`
- `estacionamento`
- `registro_acesso`
- `dia_conferido`

Depois, no mesmo banco novo, registre a capacidade inicial:

```sql
INSERT INTO estacionamento (id_estacionamento, capacidade_total)
VALUES (1, 50)
ON CONFLICT (id_estacionamento) DO NOTHING;
```

A capacidade inicial será de 50 veículos simultâneos e poderá ser modificada posteriormente pelo sistema.

**Atenção:** não execute o script de criação das tabelas sobre um banco já utilizado. Ele não é um procedimento de atualização de bancos existentes.

### 3. Configurar a conexão

Na raiz do projeto, copie o arquivo de exemplo para criar a configuração local:

```powershell
Copy-Item backend/.env.example backend/.env
```

**Execute esse comando somente se o arquivo `backend/.env` ainda não existir.**

Depois, abra `backend/.env` e configure as seguintes variáveis:

- `DB_HOST`: endereço do servidor PostgreSQL.
- `DB_PORT`: porta utilizada pelo PostgreSQL.
- `DB_NAME`: nome do banco de dados do projeto.
- `DB_USER`: usuário de acesso ao PostgreSQL.
- `DB_PASSWORD`: senha do usuário PostgreSQL.
- `SECRET_KEY`: chave secreta aleatória do Flask, com pelo menos 32 caracteres.

As informações devem corresponder às configurações do PostgreSQL instalado no computador.

Para gerar uma chave secreta aleatória, execute no terminal:

```powershell
python -c "import secrets; print(secrets.token_hex(32))"
```

Copie o valor gerado para a variável `SECRET_KEY` do arquivo `.env`.

**Importante:**

- Cada computador deve possuir sua própria configuração local.
- Não compartilhe senhas ou chaves secretas.
- Nunca envie o arquivo `backend/.env` ao GitHub.
- O arquivo `.env.example` contém apenas valores de exemplo.

### 4. Criar o primeiro operador

Depois de criar as tabelas e configurar o arquivo `backend/.env`, abra o terminal na raiz do projeto, com o ambiente virtual ativado.

Execute:

```powershell
python backend/criar_operador.py
```

O programa solicitará:

- Nome do operador.
- Login de acesso.
- Turno (opcional).
- Senha entre 12 e 128 caracteres.
- Confirmação da senha.

A senha será armazenada como hash no PostgreSQL.

O operador será criado no banco configurado em `DB_NAME`.

**Verifique o nome do banco antes de executar o script.**

Se o login informado já existir, o programa não substituirá o cadastro existente.

### 5. Iniciar o sistema

Com o ambiente virtual ativado e o PostgreSQL disponível, execute:

```powershell
python backend/app.py
```

O Flask iniciará o servidor local na porta 5000.

Abra http://127.0.0.1:5000/ no navegador.

Entre utilizando o login e a senha de um operador ativo.

O servidor deve permanecer em execução enquanto o sistema estiver sendo utilizado.

Para encerrá-lo, pressione `Ctrl + C` no terminal.

## Funcionalidades

O sistema possui as seguintes funcionalidades:

- Login e verificação da sessão do operador.
- Cadastro e consulta de pessoas e veículos.
- Associação de vários veículos à mesma pessoa.
- Edição e inativação de cadastros.
- Preservação do histórico de pessoas e veículos inativados.
- Registro de entrada de veículos.
- Registro de saída de veículos.
- Controle da capacidade total do estacionamento.
- Bloqueio de entradas quando o estacionamento está lotado.
- Bloqueio de entradas duplicadas para a mesma placa.
- Consulta de veículos presentes.
- Histórico de movimentações com filtros.
- Consulta de fluxo por dia da semana.
- Análise dos picos históricos de ocupação.
- Conferência de dias completos para os relatórios.

## Regras de ocupação

### Veículos presentes

A ocupação corresponde à quantidade de registros de entrada que ainda não possuem horário de saída.

### Vagas disponíveis

O número de vagas disponíveis é calculado por:

`Vagas disponíveis = Capacidade total - Veículos presentes`

### Registro de entrada

Antes de registrar uma entrada, o sistema verifica:

- Se a placa possui uma entrada ainda aberta.
- Se o estacionamento possui capacidade disponível.
- Se o veículo cadastrado está ativo.
- Se a pessoa vinculada está ativa.

Quando uma dessas condições impede a entrada, o sistema apresenta uma mensagem ao operador.

### Registro de saída

A saída atualiza o registro existente com o horário de saída e a identificação do operador responsável.

O histórico da movimentação é preservado.

### Controle de capacidade

A capacidade pode ser alterada pelo operador.

O sistema impede que o limite seja reduzido para um valor inferior à quantidade de veículos presentes.

### Relatórios

Os relatórios utilizam o histórico disponível no PostgreSQL.

A comparação por dia da semana considera os dias completos que foram conferidos.

Dias sem conferência são apresentados como "Sem dados", e não como dias com movimento zero.

Um dia conferido sem movimentações pode ser contabilizado como zero.

As análises são históricas e não garantem a ocupação futura.

## Testes realizados

Foram realizados testes locais para verificar o funcionamento das principais funcionalidades do sistema.

Entre os recursos verificados estão:

- Conexão com o PostgreSQL.
- Login e autenticação.
- Cadastro de pessoas e veículos.
- Registro de entradas e saídas.
- Atualização da ocupação do estacionamento.
- Alteração da capacidade total.
- Consulta do histórico.
- Cálculos dos relatórios.

### Teste de concorrência

Também foi realizado um teste com duas solicitações de entrada iniciadas em paralelo.

O teste utilizou:

- Cliente de testes do Flask.
- Banco PostgreSQL `estacionamento_teste`.
- Duas placas utilizadas exclusivamente no teste.
- Capacidade temporária com apenas uma vaga disponível.

Resultado observado:

- Uma solicitação foi aceita: HTTP 201.
- A outra solicitação foi recusada: HTTP 409.
- A ocupação final permaneceu dentro do limite definido.
- A capacidade original foi restaurada.
- Os registros de teste foram encerrados.

O resultado foi conferido no PostgreSQL.

O teste demonstrou o comportamento esperado nesse cenário específico. Ele não substitui testes adicionais com vários operadores utilizando o sistema simultaneamente.

**Atenção:** o teste de concorrência utiliza um banco separado e altera temporariamente dados desse ambiente. Não execute esse teste no banco principal.

## Segurança e cuidados

- O arquivo `backend/.env` contém configurações privadas e não deve ser publicado.
- A pasta `.venv/` não deve ser enviada ao GitHub.
- As senhas dos operadores são armazenadas como hash.
- As consultas SQL utilizam parâmetros para os valores fornecidos pelo sistema.
- O sistema mantém os registros históricos das movimentações.
- Utilize dados fictícios nas demonstrações acadêmicas.
- Preserve o banco principal durante os testes.
- Não execute scripts antigos da pasta `database/legado/` no banco atual.
- Os arquivos antigos não representam a estrutura atual do projeto.
- Credenciais expostas devem ser substituídas.
- O servidor de desenvolvimento Flask é destinado a testes e demonstrações locais, não à publicação direta na internet.

## Limitações

Este projeto foi desenvolvido para fins acadêmicos.

O sistema não possui integração com cancelas físicas, sensores de presença ou câmeras de reconhecimento de placas.

As entradas e saídas são registradas manualmente pelo operador.

A aplicação não controla posições individuais de estacionamento e não oferece previsão garantida de disponibilidade futura.

## Projeto Integrador II

Desenvolvido como atividade acadêmica do curso de Análise e Desenvolvimento de Sistemas, em 2026.

O objetivo do projeto é aplicar conceitos de programação, desenvolvimento web, banco de dados relacional e integração entre frontend e backend.
