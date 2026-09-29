# Integração futura do frontend com Flask

Este documento propõe o contrato a alinhar entre Victor e os responsáveis pelo frontend. As rotas abaixo ainda não estão implementadas nem são chamadas por esta demonstração.

## Situação atual

- HTML, CSS e JavaScript puro, sem instalação de bibliotecas para abrir a interface.
- RegrasEstacionamento reúne as regras demonstrativas de capacidade, cadastros, histórico e relatórios.
- RepositorioLocal lê e grava no localStorage. A chave v2 foi mantida para preservar os dados compatíveis da versão anterior.
- Login admin / 1234 é apenas demonstrativo; não protege dados reais.
- Os nomes dos condutores iniciais são exemplos. Não use dados pessoais reais nesse protótipo.

## Contrato proposto

| Operação | Rota proposta | Dados relevantes / resultado |
| --- | --- | --- |
| Entrar | POST /api/login | login e senha; servidor abre sessão ou retorna 401 |
| Sair | POST /api/logout | encerra a sessão no servidor |
| Ocupação | GET /api/painel | capacidade_total, ocupadas, livres, percentual, status, entradas_hoje |
| Consulta de placa | GET /api/veiculos/consulta?placa=ABC1234 | cadastro, acesso aberto e disponibilidade atual |
| Registrar entrada | POST /api/acessos | placa e identificação opcional; 201 após gravação; 409 se lotado ou já presente |
| Registrar saída | POST /api/acessos/{id}/saida | servidor fecha o acesso aberto uma vez |
| Histórico | GET /api/acessos | filtros por placa/nome, data, situação e paginação |
| Pessoas | GET /api/usuarios | busca e situação ativo/inativo/todos |
| Criar pessoa | POST /api/usuarios | nome, cargo, cpf opcional e lista veiculos, cada item com placa e modelo |
| Editar pessoa | PUT /api/usuarios/{id} | dados da pessoa e lista de veículos, com controle de versão |
| Inativar pessoa | POST /api/usuarios/{id}/inativacao | inativa pessoa e veículos vinculados; 409 se houver acesso aberto |
| Configuração | PUT /api/configuracao | capacidade_total e limiar_alerta; não reduzir abaixo da ocupação |
| Relatórios | GET /api/relatorios/semana?dias=28 | médias, picos e amostras por dia da semana |
| Conferir data | POST /api/dias-conferidos | data concluída com cobertura confirmada |

Os nomes das rotas são propostas, não exigências do Flask. A equipe deve confirmar o contrato antes de trocar o repositório local por fetch. O servidor também deve proteger as consultas, não apenas as alterações.

## Alterações necessárias ao integrar

1. Tornar o carregamento dos dados assíncrono e tratar estados de carregamento/erro na tela.
2. Substituir o login fixo pela autenticação de Operador. A identidade do operador e os horários vêm do servidor, não de campos confiados ao navegador.
3. Trocar cada alteração local pela chamada correspondente. RepositorioLocal.alterar recebe uma função JavaScript; essa função não deve ser enviada pela rede. O frontend envia os campos JSON da operação.
4. Atualizar a tela somente após confirmação do servidor. Em erro 409, apresentar o motivo e atualizar o painel.
5. Em falha de rede, não registrar localmente como alternativa. Conferir o estado no servidor antes de repetir uma operação cujo resultado ficou incerto. Definir identificadores de operação para evitar duplicação em reenvios.
6. Revalidar formato, vínculos, lotação e duplicidade no backend. A verificação de capacidade e o registro devem ocorrer na mesma transação.
7. Manter os dados operacionais do PostgreSQL separados dos exemplos locais. Não enviar automaticamente o localStorage antigo ao banco real.

## Regras que precisam continuar verdadeiras

- Pessoa e veículo são entidades diferentes. Uma pessoa pode ter várias placas.
- A ocupação vem dos acessos sem saída, sem distribuição de vagas ou escalas.
- Remover cadastro ativo não apaga o histórico; acesso aberto bloqueia a operação.
- Mudanças no cadastro não reescrevem a identificação histórica de acessos encerrados.
- Média de entradas e pico de ocupação são medidas diferentes. Dias sem cobertura não contam como zero.
- Operar uma cancela física exigirá autorização, comando e confirmação de passagem. Esta interface apenas demonstra a decisão de capacidade.

## Decisões ainda abertas

Confirmar capacidade real, início do alerta, entrada de visitantes sem cadastro e eventual limite de veículos simultâneos por pessoa. A exclusão lógica é a proposta adotada nesta interface; se a faculdade exigir remoção física, revisar os vínculos históricos antes de implementar a mudança no banco.
