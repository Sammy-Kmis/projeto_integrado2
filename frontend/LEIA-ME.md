# Estacionamento universitário — frontend de fluxo e capacidade

Revisão de 29/09/2026, alinhada ao novo DER e à documentação do projeto.

Esta versão substitui as escalas e a distribuição de vagas individuais por capacidade total. É uma demonstração local, sem API de negócio e sem equipamento de cancela conectado.

## Abrir

Mantenha `index.html`, `style.css` e `script.js` juntos. Use o servidor de desenvolvimento do VS Code ou, na pasta `frontend`, execute `python -m http.server 8000` e acesse http://localhost:8000. Também é possível abrir o HTML diretamente; nesse modo o armazenamento e os bloqueios entre abas podem variar conforme o navegador. Para testar, use uma única aba ou um navegador com Web Locks em localhost.

Login demonstrativo: `admin` / `1234`. Use informações fictícias.

## O que mudou

- Capacidade configurável, inicialmente 12 veículos, sem números de vagas ou reservas.
- Ocupação calculada pelos acessos sem saída registrada. A contagem continua depois da meia-noite.
- Alerta inicial em 80% e bloqueio de novas entradas em 100%, revalidado no registro.
- Placa obrigatória; identificação do condutor opcional. Cadastro prévio não é exigido na proposta simplificada.
- Histórico, consulta por placa, entrada, saída, cadastros e ajuste da capacidade.
- Tela Pessoas e veículos com resumo de pessoas ativas, veículos vinculados e pessoas inativas.
- Cadastro de várias placas para a mesma pessoa, contador no formulário e entrada diretamente pela placa cadastrada.
- Filtros de cadastros ativos/inativos/todos e busca por nome ou placa.
- Remoção conjunta com confirmação das placas afetadas: pessoa e veículos ficam inativos. O histórico não é apagado.
- Dois gráficos por dia da semana: média de entradas e média dos picos diários de ocupação.
- Conferência de dias completos para separar ausência de dados de movimento realmente igual a zero.
- Exemplo fictício de 28 dias, mostrado separadamente e sem alterar o histórico operacional.

A disponibilidade de capacidade não substitui outras regras institucionais de acesso da faculdade. A proposta aceita placas sem cadastro; confirmem essa decisão de negócio com a equipe.

O contador de ocupação representa veículos, não passageiros ou pedestres. O mesmo funcionário pode ter dois veículos presentes; limitar a um por pessoa seria uma regra adicional. O limite de dez placas no formulário é demonstrativo, não uma regra confirmada pela faculdade.

## Remover uma pessoa e suas placas

Em Pessoas e veículos, use Remover cadastro. A confirmação identifica a pessoa e as placas ativas afetadas. Se houver acesso aberto associado à pessoa ou a alguma placa vinculada, a operação é bloqueada até registrar a saída. Depois da remoção, consulte o filtro Inativos. Os registros anteriores conservam o nome e o vínculo que tinham no momento da entrada.

Essa operação implementa a proposta de exclusão lógica apresentada na documentação: os dados deixam os cadastros ativos e continuam preservados no histórico. Não é exclusão física. Como a demonstração aceita visitantes, uma placa inativada pode voltar a entrar sem herdar a identidade anterior. Inativar não equivale a cadastrar uma proibição de acesso.

## Dados anteriores

A versão utiliza `estacionamento.universitario.v2` no localStorage. No mesmo endereço e navegador, se encontrar a chave v1 e ainda não existir v2, migra os cadastros e registros compatíveis. A chave antiga permanece como cópia. Escalas e vagas individuais deixam de controlar o acesso. Dados inválidos bloqueiam a operação e podem ser copiados antes de uma restauração explícita.

Trocar de endereço, porta ou navegador pode mostrar um armazenamento diferente. O navegador não é um banco compartilhado entre portarias.

## Teste manual da apresentação

1. Entre, abra Capacidade e configure limite 2 com alerta 50%.
2. Registre `ABC1234`: deve mostrar 1 presente, 1 restante e “Quase cheio”.
3. Registre `DEF1G23`: deve mostrar “Lotado” e impedir a terceira entrada.
4. Consulte `ABC1234`, registre sua saída e confira 1 lugar disponível.
5. Recarregue: o histórico deve permanecer.
6. Em Fluxo por dia, use “Ver exemplo fictício”. Compare as médias, as amostras e os picos.
7. Em Pessoas e veículos, crie uma pessoa com duas placas. Confira que a capacidade não mudou.
8. Registre a entrada de uma delas e tente remover o cadastro: a operação deve ser bloqueada.
9. Registre a saída e remova o cadastro. Confira a pessoa e ambas as placas no filtro Inativos e o acesso encerrado no histórico.
10. Confira a interface no celular, o uso de Tab/Enter/Escape e os diálogos.

## Limites desta entrega

Foram aprovados 27 testes automáticos das regras de capacidade, cadastro, remoção e cálculos. A sintaxe JavaScript e os vínculos estáticos entre HTML e script foram conferidos. A revisão visual e a interação completa em navegador ainda precisam ser feitas pela equipe. Login e autorização reais, PostgreSQL compartilhado, proteção das rotas e transações concorrentes serão implementados no backend. Nenhuma cancela física foi acionada ou integrada.

Se Node já estiver instalado, execute `node testes/regras.cjs` na pasta deste frontend. Node não é necessário para abrir a interface.

O botão de saída de todos encerra os acessos com o horário atual; ele exige confirmação e deve ser usado somente se todos os veículos realmente tiverem saído. Não apaga o histórico.

Para integrar, consulte `INTEGRACAO_API.md`. O servidor precisa repetir as regras; os dados enviados pelo navegador não são fonte de autorização. O backend permanece sob responsabilidade do Victor; as telas e a integração fetch ficam com os responsáveis pelo frontend.

## Arquivos de texto

As cópias em `txt/` têm exatamente o mesmo conteúdo dos arquivos principais. Elas permitem ler/copiar o código quando o aplicativo não abre arquivos .js ou .css. Para executar, use `index.html`, `style.css` e `script.js` da raiz juntos, ou renomeie as cópias TXT para esses nomes.
