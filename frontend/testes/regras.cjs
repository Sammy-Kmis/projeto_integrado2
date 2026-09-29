const assert = require('node:assert/strict');
const R = require('../script.js');
let testes = 0;
const test = (nome, fn) => { fn(); testes++; console.log(`OK ${testes}: ${nome}`); };
const agora = '2026-09-25T18:00:00Z';
const novo = () => R.novoEstado('2026-08-20T18:00:00Z');
const entrada = (d, placa='ABC1234', hora=agora, id='r1') => R.registrarEntrada(d, placa, '', hora, id);
const registro = (e,s) => ({data_hora_entrada:e,data_hora_saida:s});
test('estado inicial válido, sem ocupação artificial', () => {const d=R.validarEstado(novo()); assert.equal(R.resumo(d).ocupadas,0); assert.equal(R.resumo(d).livres,12);});
test('placa desconhecida pode entrar sem escala', () => {const d=novo(); entrada(d); assert.equal(d.registros[0].id_usuario,null); R.validarEstado(d);});
test('normaliza a placa e rejeita formato inválido', () => {assert.equal(R.normalizarPlaca(' abc-1234 '),'ABC1234'); assert.equal(R.consultarPlaca(novo(),'PM12345').permitido,false);});
test('última capacidade permite uma entrada e bloqueia a próxima', () => {const d=novo();R.configurar(d,1,80);entrada(d);assert.equal(R.resumo(d).status,'lotado');assert.throws(()=>entrada(d,'DEF1234',agora,'r2'),/lotado/);assert.equal(d.registros.length,1);});
test('mesma placa não entra duas vezes', () => {const d=novo();entrada(d);assert.throws(()=>entrada(d,'ABC1234',agora,'r2'),/já está/);});
test('saída preserva histórico e devolve capacidade', () => {const d=novo();entrada(d);R.registrarSaida(d,'r1','2026-09-25T19:00:00Z');assert.equal(R.resumo(d).ocupadas,0);assert.equal(d.registros.length,1);assert.equal(d.registros[0].id_operador_saida,1);R.validarEstado(d);});
test('saída não pode ser repetida ou anterior à entrada', () => {const d=novo();entrada(d);assert.throws(()=>R.registrarSaida(d,'r1','2026-09-24T18:00:00Z'),/antes/);R.registrarSaida(d,'r1',agora);assert.throws(()=>R.registrarSaida(d,'r1',agora),/já foi/);});
test('não reduz capacidade abaixo da ocupação', () => {const d=novo();entrada(d);entrada(d,'DEF1234',agora,'r2');assert.throws(()=>R.configurar(d,1,80),/menor/);});
test('limiar usa percentual exato: 9 de 12 livre, 10 atenção, 12 lotado', () => {const d=novo();for(let i=0;i<12;i++){entrada(d,`ABC${String(i).padStart(4,'0')}`,agora,`r${i}`);if(i===8)assert.equal(R.resumo(d).status,'disponivel');if(i===9)assert.equal(R.resumo(d).status,'atencao');}assert.equal(R.resumo(d).status,'lotado');});
test('pessoa pode ter dois veículos presentes', () => {const d=novo();R.salvarCadastro(d,'u2',{nome:'Victor',cargo:'Aluno(a)',cpf:''},[{placa:'VIC1234'},{placa:'VIC5678'}]);entrada(d,'VIC1234',agora,'r1');entrada(d,'VIC5678',agora,'r2');R.validarEstado(d);assert.equal(R.resumo(d).ocupadas,2);});
test('fuso de Brasília aplicado no limite da data', () => {assert.equal(R.dataLocal('2026-09-25T02:59:59Z'),'2026-09-24');assert.equal(new Date(R.inicioDia('2026-09-25')).toISOString(),'2026-09-25T03:00:00.000Z');});
test('dia sem conferência é ausente; dia conferido sem movimento é zero', () => {const d=novo();let a=R.analisarPeriodo(d,28,agora);assert.equal(a.dias[0].mediaEntradas,null);R.conferirDia(d,'2026-09-21',agora);a=R.analisarPeriodo(d,28,agora);assert.equal(a.dias[0].mediaEntradas,0);assert.equal(a.dias[0].amostras,1);});
test('conferência não aceita hoje, dia parcial inicial ou duplicação', () => {const d=novo();assert.throws(()=>R.conferirDia(d,'2026-09-25',agora),/concluído/);assert.throws(()=>R.conferirDia(d,'2026-08-20',agora),/primeiro/);R.conferirDia(d,'2026-09-21',agora);assert.throws(()=>R.conferirDia(d,'2026-09-21',agora),/já/);R.validarEstado(d);});
test('ocupação atravessa meia-noite sem virar nova entrada', () => {const registros=[registro('2026-09-24T23:00:00-03:00','2026-09-25T08:00:00-03:00')];assert.deepEqual(R.resumoDia(registros,'2026-09-25'),{data:'2026-09-25',entradas:0,pico:1});});
test('entradas totais e pico simultâneo são métricas diferentes', () => {const registros=[registro('2026-09-25T08:00:00-03:00','2026-09-25T09:00:00-03:00'),registro('2026-09-25T10:00:00-03:00','2026-09-25T11:00:00-03:00')];const s=R.resumoDia(registros,'2026-09-25');assert.equal(s.entradas,2);assert.equal(s.pico,1);});
test('saída e entrada no mesmo instante não criam pico falso', () => {const registros=[registro('2026-09-25T08:00:00-03:00','2026-09-25T09:00:00-03:00'),registro('2026-09-25T09:00:00-03:00',null)];assert.equal(R.resumoDia(registros,'2026-09-25').pico,1);});
test('média inclui dias conferidos sem movimento no denominador', () => {const d=novo();entrada(d,'ABC1234','2026-09-14T15:00:00Z','r1');R.registrarSaida(d,'r1','2026-09-14T16:00:00Z');R.conferirDia(d,'2026-09-14',agora);R.conferirDia(d,'2026-09-21',agora);assert.equal(R.analisarPeriodo(d,28,agora).dias[0].mediaEntradas,0.5);});
test('exemplo fictício mantém o histórico operacional intacto', () => {const d=novo(),antes=JSON.stringify(d),ex=R.dadosExemplo(agora);assert.equal(R.analisarPeriodo(ex,28,agora).amostras,28);assert.equal(JSON.stringify(d),antes);});
test('migração mantém acessos e retira escalas do modelo novo', () => {const d=novo();entrada(d,'VIC1234');const v1={versao:1,usuarios:d.usuarios,veiculos:d.veiculos,vagas:Array(12).fill({}),escalas:[{}],registros:d.registros.map(r=>({...r,id_vaga:2,tipo_alocacao:'reserva'}))};const m=R.migrarV1(v1,agora);assert.equal(m.registros.length,1);assert.equal(R.resumo(m).ocupadas,1);assert.equal(m.escalas,undefined);assert.equal(v1.escalas.length,1);});
test('arquivamento preserva histórico e bloqueia condutor presente', () => {const d=novo();entrada(d,'VIC1234');assert.throws(()=>R.arquivarCadastro(d,'u2'),/saída/);R.registrarSaida(d,'r1',agora);R.arquivarCadastro(d,'u2');assert.equal(d.registros.length,1);R.validarEstado(d);});
test('validação detecta duplicação de placas ativas nos dados salvos', () => {const d=novo();entrada(d);d.registros.push({...d.registros[0],id_registro:'r2'});assert.throws(()=>R.validarEstado(d));});
test('cadastro 1:N não ocupa capacidade e rejeita placa de outra pessoa', () => {
  const d=novo();R.salvarCadastro(d,'u2',{nome:'Victor',cargo:'Funcionário(a)',cpf:''},[{placa:'VIC1234'},{placa:'VIC5678'}]);
  assert.equal(d.usuarios.filter(u=>u.id_usuario==='u2').length,1);assert.equal(d.veiculos.filter(v=>v.id_usuario==='u2'&&v.ativo).length,2);assert.equal(R.resumo(d).ocupadas,0);
  assert.throws(()=>R.salvarCadastro(d,'nova',{nome:'Outra pessoa',cargo:'Aluno(a)',cpf:''},[{placa:'VIC5678'}]),/outro cadastro/);
});
test('remoção conjunta inativa todas as placas e mantém os acessos completos', () => {
  const d=novo();R.salvarCadastro(d,'u2',{nome:'Victor',cargo:'Funcionário(a)',cpf:''},[{placa:'VIC1234'},{placa:'VIC5678'}]);
  entrada(d,'VIC1234',agora,'r1');R.registrarSaida(d,'r1',agora);entrada(d,'VIC5678',agora,'r2');R.registrarSaida(d,'r2',agora);
  const historico=JSON.stringify(d.registros);R.arquivarCadastro(d,'u2');
  assert.equal(d.usuarios.find(u=>u.id_usuario==='u2').ativo,false);assert.ok(d.veiculos.filter(v=>v.id_usuario==='u2').every(v=>!v.ativo));assert.equal(JSON.stringify(d.registros),historico);R.validarEstado(d);
});
test('um segundo veículo presente bloqueia toda a remoção sem alterações parciais', () => {
  const d=novo();R.salvarCadastro(d,'u2',{nome:'Victor',cargo:'Funcionário(a)',cpf:''},[{placa:'VIC1234'},{placa:'VIC5678'}]);entrada(d,'VIC5678');
  const antes=JSON.stringify(d);assert.throws(()=>R.arquivarCadastro(d,'u2'),/saída/);assert.equal(JSON.stringify(d),antes);
});
test('vínculo atual da placa também bloqueia remoção mesmo sem pessoa no acesso', () => {
  const d=novo();entrada(d,'VIC1234');d.registros[0].id_usuario=null;R.validarEstado(d);
  assert.throws(()=>R.arquivarCadastro(d,'u2'),/saída/);assert.equal(d.usuarios.find(u=>u.id_usuario==='u2').ativo,true);
});
test('editar nome e retirar uma placa não reescreve o histórico encerrado', () => {
  const d=novo();entrada(d,'VIC1234');R.registrarSaida(d,'r1',agora);const anterior=JSON.stringify(d.registros);
  R.salvarCadastro(d,'u2',{nome:'Victor Atualizado',cargo:'Funcionário(a)',cpf:''},[{placa:'NOV1234'}]);assert.equal(JSON.stringify(d.registros),anterior);assert.equal(d.veiculos.find(v=>v.placa==='VIC1234').ativo,false);R.validarEstado(d);
});
test('cadastro inativo não autoriza identidade antiga em nova entrada de visitante', () => {
  const d=novo();entrada(d,'VIC1234');R.registrarSaida(d,'r1',agora);R.arquivarCadastro(d,'u2');
  entrada(d,'VIC1234',agora,'r2');assert.equal(d.registros[1].id_usuario,null);assert.equal(d.registros[1].nome_condutor,'');assert.equal(d.registros[0].nome_condutor,'Victor');R.validarEstado(d);
});
console.log(`${testes} testes de regras aprovados.`);
