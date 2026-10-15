# Sistema de Gerenciamento de Estacionamento Universitário

**Projeto Integrador II — Análise e Desenvolvimento de Sistemas (2026)**

Sistema acadêmico de controle da capacidade e do movimento de veículos em estacionamento universitário. O operador consulta quantas vagas estão disponíveis, cadastra pessoas e veículos, registra entradas e saídas e consulta históricos e relatórios.

O sistema **não define vagas individuais nem escalas de uso**. O motorista escolhe onde estacionar. A aplicação não opera uma cancela física e não oferece previsão garantida de lotação.

## Tecnologias

- Interface: HTML, CSS e JavaScript.
- Servidor: Python com Flask.
- Banco de dados: PostgreSQL, acessado pelo Python por meio do pg8000.
- Ferramentas de desenvolvimento: VS Code, pgAdmin, Git e GitHub.

## Organização

| Pasta / arquivo | Para que serve |
|---|---|
| `frontend/index.html` | Telas e formulários. |
| `frontend/style.css` | Aparência e adaptação da interface. |
| `frontend/script.js` | Interações, máscaras, comunicação com a API e indicadores. |
| `backend/app.py` | Inicialização do Flask, login e sessões. |
| `backend/cadastros.py` | Cadastros de pessoas e veículos. |
| `backend/movimentacoes.py` | Entradas, saídas e capacidade. |
| `backend/db.py` | Conexão com PostgreSQL. |
| `backend/tabelas.sql` | Estrutura das tabelas em um banco novo. |
| `documentos/` | Word e cronograma revisados. |
| `orientacoes/` | Instruções de entrega e roteiro do vídeo. |

## Como executar no computador da equipe

1. Ter Python e PostgreSQL instalados. Manter o banco de desenvolvimento existente se já funciona.
2. Manter `backend/.env` somente no computador, com as credenciais **locais**. Existe um exemplo sem senhas em `backend/.env.example`.
3. Na raiz da pasta do projeto, com um ambiente virtual ativo, instalar as bibliotecas:

   ```bash
   pip install -r backend/requirements.txt
   ```

4. Iniciar o servidor:

   ```bash
   python backend/app.py
   ```

5. Abrir `http://127.0.0.1:5000` e entrar com uma conta de operador já criada.

**Atenção ao banco:** `backend/tabelas.sql` é somente para criar tabelas em um banco **novo**. Não o execute sobre o banco que já contém suas informações. O arquivo `backend/inicializar_estacionamento.sql` só insere a capacidade de teste de 50 vagas se ainda não existir configuração, sem alterar a atual.

## Regras da ocupação

- Ocupação: acessos que ainda não têm horário de saída.
- Vagas livres: capacidade total menos ocupação.
- Entrada de placa já presente ou com estacionamento lotado é recusada.
- Saída registra horário no acesso existente, preservando o histórico.
- Uma pessoa pode possuir vários veículos, mas a inativação não exclui seu histórico.

## Testes e limites

O grupo relatou funcionamento local de login, cadastro, movimentações e teste de lotação. A revisão contém testes de regras de JavaScript:

```bash
node --test tests/regras.test.js
```

Ainda faltam evidências de testes de concorrência com dois operadores no PostgreSQL e validação dos relatórios com vários dias completos. Consulte `docs/ROTEIRO_TESTES.md`.

## Integrantes

Victor Gabriel Philemon John Marie; Luiz Fernando Silva do Amaral; José Paxe Manuel; Felipe Gabriel Silva Campos de Souza; Samara Bruna de Oliveira Souza.

## Segurança

Não suba ao GitHub o arquivo `.env`, senhas, chaves secretas ou dados pessoais. O arquivo `.gitignore` já inclui o `.env`. Consulte `LEIA_PRIMEIRO.md` antes de copiar arquivos ou fazer o commit.
