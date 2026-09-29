/* Estacionamento universitário — revisão de fluxo de 29/09/2026.
 * Demonstração local: não autentica operadores reais nem aciona equipamentos.
 * RegrasEstacionamento contém regras puras, também executáveis em testes Node.
 * RepositorioLocal será substituído por chamadas fetch à API Flask.
 */
const RegrasEstacionamento = (() => {
  "use strict";
  const FUSO = "America/Sao_Paulo";
  const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const CARGOS = ["Professor(a)", "Funcionário(a)", "Aluno(a)", "Visitante"];
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const ativos = (d) => d.registros.filter((r) => r.data_hora_saida === null);
  const normalizarPlaca = (s) => String(s ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
  const placaValida = (s) => /^[A-Z]{3}\d[A-Z\d]\d{2}$/.test(s);
  const exigir = (condicao, mensagem) => { if (!condicao) throw new Error(mensagem); };
  const iso = (v) => typeof v === "string" && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(v) && Number.isFinite(Date.parse(v));
  const texto = (v, min, max) => typeof v === "string" && v.length >= min && v.length <= max;
  const unico = (a) => new Set(a).size === a.length;
  const formatador = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" });
  function dataLocal(instante = new Date()) {
    const p = Object.fromEntries(formatador.formatToParts(new Date(instante)).map((v) => [v.type, v.value]));
    return `${p.year}-${p.month}-${p.day}`;
  }
  function somarDias(data, qtd) { return new Date(Date.parse(`${data}T12:00:00Z`) + qtd * 86400000).toISOString().slice(0, 10); }
  function dataValida(data) { return /^\d{4}-\d\d-\d\d$/.test(data) && Number.isFinite(Date.parse(`${data}T12:00:00Z`)) && somarDias(data, 0) === data; }
  function inicioDia(data) {
    const alvo = Date.parse(`${data}T00:00:00Z`);
    const f = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
    let t = alvo;
    for (let i = 0; i < 4; i++) {
      const p = Object.fromEntries(f.formatToParts(new Date(t)).map((v) => [v.type, v.value]));
      const visto = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}Z`);
      if (visto === alvo) break;
      t += alvo - visto;
    }
    return t;
  }
  function cpfValido(cpf) {
    if (!/^\d{11}$/.test(cpf) || /^(\d)\1{10}$/.test(cpf)) return false;
    for (let n = 9; n <= 10; n++) {
      let soma = 0;
      for (let i = 0; i < n; i++) soma += Number(cpf[i]) * (n + 1 - i);
      if ((soma * 10) % 11 % 10 !== Number(cpf[n])) return false;
    }
    return true;
  }
  function novoEstado(agora = new Date().toISOString()) {
    const exemplos = [["PM", "PMA1234"], ["Victor", "VIC1234"], ["Samara", "SAM1234"], ["Angola", "ANG1234"], ["Luiz", "LUI1234"]];
    return { versao: 2, revisao: 0, configuracao: { capacidade_total: 12, limiar_alerta: 80, inicio_monitoramento: agora },
      operadores: [{ id_operador: 1, nome: "Operador de demonstração", login: "admin", turno: "Demonstração" }],
      usuarios: exemplos.map(([nome], i) => ({ id_usuario: `u${i + 1}`, nome, cargo: "Visitante", cpf: "", ativo: true })),
      veiculos: exemplos.map(([, placa], i) => ({ placa, id_usuario: `u${i + 1}`, modelo: "", ativo: true })),
      registros: [], dias_conferidos: [] };
  }
  function validarEstado(d) {
    const check = (c) => exigir(c, "Os dados locais estão inválidos ou são de outra versão. Faça uma cópia antes de restaurar.");
    check(d && d.versao === 2 && Number.isSafeInteger(d.revisao) && d.revisao >= 0);
    for (const k of ["usuarios", "veiculos", "operadores", "registros", "dias_conferidos"]) check(Array.isArray(d[k]));
    const c = d.configuracao;
    check(c && Number.isInteger(c.capacidade_total) && c.capacidade_total >= 1 && c.capacidade_total <= 10000 && Number.isInteger(c.limiar_alerta) && c.limiar_alerta >= 1 && c.limiar_alerta <= 99 && iso(c.inicio_monitoramento));
    check(d.operadores.length === 1 && d.operadores[0].id_operador === 1);
    check(d.usuarios.every((u) => texto(u.id_usuario, 1, 100) && texto(u.nome, 2, 80) && CARGOS.includes(u.cargo) && typeof u.ativo === "boolean" && (u.cpf === "" || cpfValido(u.cpf))));
    check(unico(d.usuarios.map((u) => u.id_usuario)) && unico(d.usuarios.filter((u) => u.ativo && u.cpf).map((u) => u.cpf)));
    const ids = new Set(d.usuarios.map((u) => u.id_usuario));
    check(d.veiculos.every((v) => placaValida(v.placa) && (v.id_usuario === null || ids.has(v.id_usuario)) && texto(v.modelo, 0, 60) && typeof v.ativo === "boolean"));
    check(unico(d.veiculos.map((v) => v.placa)));
    const placas = new Set(d.veiculos.map((v) => v.placa));
    check(d.registros.every((r) => texto(r.id_registro, 1, 100) && placas.has(r.placa) && (r.id_usuario === null || ids.has(r.id_usuario)) && texto(r.nome_condutor, 0, 80) && r.id_operador === 1 && iso(r.data_hora_entrada) && (r.data_hora_saida === null ? r.id_operador_saida === null : r.id_operador_saida === 1 && iso(r.data_hora_saida) && Date.parse(r.data_hora_saida) >= Date.parse(r.data_hora_entrada))));
    check(unico(d.registros.map((r) => r.id_registro)) && unico(ativos(d).map((r) => r.placa)) && ativos(d).length <= c.capacidade_total);
    check(d.dias_conferidos.every((v) => dataValida(v.data) && v.data > dataLocal(c.inicio_monitoramento) && v.data < dataLocal(v.conferido_em) && v.id_operador === 1 && iso(v.conferido_em)) && unico(d.dias_conferidos.map((v) => v.data)));
    return d;
  }
  function migrarV1(v1, agora = new Date().toISOString()) {
    exigir(v1 && v1.versao === 1 && ["usuarios", "veiculos", "registros", "vagas"].every((k) => Array.isArray(v1[k])), "Não foi possível reconhecer a versão anterior. Seus dados foram preservados.");
    const d = novoEstado(agora);
    d.usuarios = clone(v1.usuarios); d.veiculos = clone(v1.veiculos);
    d.registros = v1.registros.map((r) => ({ id_registro: r.id_registro, placa: r.placa, id_usuario: r.id_usuario, nome_condutor: r.nome_condutor, id_operador: r.id_operador, id_operador_saida: r.data_hora_saida === null ? null : r.id_operador, data_hora_entrada: r.data_hora_entrada, data_hora_saida: r.data_hora_saida }));
    d.configuracao.capacidade_total = Math.max(v1.vagas.length || 12, ativos(d).length);
    if (d.registros.length) d.configuracao.inicio_monitoramento = d.registros.reduce((a, r) => Date.parse(r.data_hora_entrada) < Date.parse(a) ? r.data_hora_entrada : a, agora);
    return validarEstado(d);
  }
  function resumo(d, agora = new Date().toISOString()) {
    const ocupadas = ativos(d).length, total = d.configuracao.capacidade_total, percentual = ocupadas / total * 100;
    return { total, ocupadas, livres: Math.max(0, total - ocupadas), percentual, status: ocupadas >= total ? "lotado" : percentual >= d.configuracao.limiar_alerta ? "atencao" : "disponivel", entradasHoje: d.registros.filter((r) => dataLocal(r.data_hora_entrada) === dataLocal(agora)).length };
  }
  function consultarPlaca(d, valor) {
    const placa = normalizarPlaca(valor);
    if (!placaValida(placa)) return { permitido: false, codigo: "placa_invalida", mensagem: "Informe a placa no formato ABC-1234 ou ABC1D23." };
    const registro = ativos(d).find((r) => r.placa === placa);
    const veiculo = d.veiculos.find((v) => v.placa === placa && v.ativo);
    const usuario = veiculo && d.usuarios.find((u) => u.id_usuario === veiculo.id_usuario && u.ativo);
    if (registro) return { permitido: false, codigo: "veiculo_presente", mensagem: "Este veículo já está no estacionamento. Registre a saída para encerrar o acesso.", registro, usuario };
    if (!resumo(d).livres) return { permitido: false, codigo: "estacionamento_lotado", mensagem: "Estacionamento lotado. Aguarde uma saída para autorizar outra entrada.", usuario };
    return { permitido: true, codigo: "disponivel", mensagem: usuario ? `${usuario.nome}: há capacidade para registrar a entrada.` : "Há capacidade disponível. A placa será registrada mesmo sem cadastro prévio de condutor.", usuario };
  }
  function registrarEntrada(d, placaOriginal, nome, agora, id) {
    const placa = normalizarPlaca(placaOriginal), consulta = consultarPlaca(d, placa);
    exigir(consulta.permitido, consulta.mensagem);
    exigir(iso(agora) && texto(id, 1, 100) && !d.registros.some((r) => r.id_registro === id), "Dados da entrada inválidos.");
    exigir(texto(String(nome ?? "").trim(), 0, 80), "A identificação deve ter até 80 caracteres.");
    const nomeFinal = consulta.usuario?.nome || String(nome ?? "").trim();
    let veiculo = d.veiculos.find((v) => v.placa === placa);
    if (!veiculo) { veiculo = { placa, id_usuario: null, modelo: "", ativo: true }; d.veiculos.push(veiculo); }
    if (!consulta.usuario) veiculo.id_usuario = null;
    veiculo.ativo = true;
    const registro = { id_registro: id, placa, id_usuario: consulta.usuario?.id_usuario ?? null, nome_condutor: nomeFinal, id_operador: 1, id_operador_saida: null, data_hora_entrada: agora, data_hora_saida: null };
    d.registros.push(registro); return registro;
  }
  function registrarSaida(d, id, agora) {
    const r = d.registros.find((r) => r.id_registro === id);
    exigir(r && r.data_hora_saida === null, "A saída deste acesso já foi registrada ou o acesso não existe.");
    exigir(iso(agora) && Date.parse(agora) >= Date.parse(r.data_hora_entrada), "A saída não pode ocorrer antes da entrada. Verifique o relógio.");
    r.data_hora_saida = agora; r.id_operador_saida = 1; return r;
  }
  function configurar(d, capacidade, alerta) {
    exigir(Number.isInteger(capacidade) && capacidade >= 1 && capacidade <= 10000, "Informe uma capacidade inteira entre 1 e 10.000.");
    exigir(Number.isInteger(alerta) && alerta >= 1 && alerta <= 99, "O alerta deve ser um percentual inteiro entre 1 e 99.");
    exigir(capacidade >= ativos(d).length, "A capacidade não pode ser menor que a quantidade de veículos presentes.");
    d.configuracao.capacidade_total = capacidade; d.configuracao.limiar_alerta = alerta;
  }
  function conferirDia(d, data, agora) {
    exigir(dataValida(data) && data < dataLocal(agora), "Escolha um dia já concluído.");
    exigir(data > dataLocal(d.configuracao.inicio_monitoramento), "A conferência começa no primeiro dia completo após o início do monitoramento.");
    exigir(!d.dias_conferidos.some((v) => v.data === data), "Este dia já foi conferido.");
    d.dias_conferidos.push({ data, id_operador: 1, conferido_em: agora });
  }
  function resumoDia(registros, data) {
    const inicio = inicioDia(data), fim = inicioDia(somarDias(data, 1));
    let presentes = 0, entradas = 0;
    const eventos = new Map();
    const evento = (t, delta) => eventos.set(t, (eventos.get(t) || 0) + delta);
    for (const r of registros) {
      const e = Date.parse(r.data_hora_entrada), s = r.data_hora_saida === null ? Infinity : Date.parse(r.data_hora_saida);
      if (e >= inicio && e < fim) entradas++;
      if (s <= e || e >= fim || s <= inicio) continue;
      if (e < inicio) presentes++; else evento(e, 1);
      if (s < fim) evento(s, -1);
    }
    let pico = presentes;
    for (const [, delta] of [...eventos].sort((a, b) => a[0] - b[0])) { presentes += delta; pico = Math.max(pico, presentes); }
    return { data, entradas, pico };
  }
  function analisarPeriodo(d, janela = 28, agora = new Date().toISOString()) {
    exigir([28, 56, 84].includes(janela), "Período inválido.");
    const hoje = dataLocal(agora), inicio = somarDias(hoje, -janela), fim = somarDias(hoje, -1);
    const dias = [1, 2, 3, 4, 5, 6, 0].map((dia) => ({ dia, nome: DIAS[dia], amostras: 0, totalEntradas: 0, somaPicos: 0, maiorPico: 0, mediaEntradas: null, picoMedio: null }));
    const datas = d.dias_conferidos.map((c) => c.data).filter((data) => data >= inicio && data <= fim);
    for (const data of datas) {
      const info = resumoDia(d.registros, data), dia = new Date(`${data}T12:00:00Z`).getUTCDay(), item = dias.find((i) => i.dia === dia);
      item.amostras++; item.totalEntradas += info.entradas; item.somaPicos += info.pico; item.maiorPico = Math.max(item.maiorPico, info.pico);
    }
    for (const i of dias) if (i.amostras) { i.mediaEntradas = i.totalEntradas / i.amostras; i.picoMedio = i.somaPicos / i.amostras; }
    return { inicio, fim, dias, amostras: datas.length };
  }
  function dadosExemplo(agora = new Date().toISOString()) {
    const hoje = dataLocal(agora), d = novoEstado(new Date(inicioDia(somarDias(hoje, -29))).toISOString());
    let seq = 0;
    for (let k = 28; k >= 1; k--) {
      const data = somarDias(hoje, -k), dia = new Date(`${data}T12:00:00Z`).getUTCDay();
      const qtd = [0, 6, 9, 11, 8, 5, 2][dia] - (k % 3 === 0 && dia !== 0 ? 1 : 0);
      for (let i = 0; i < qtd; i++) d.registros.push({ id_registro: `ex-${seq++}`, placa: `EXE${String(i).padStart(4, "0")}`, nome_condutor: "Exemplo fictício", data_hora_entrada: new Date(inicioDia(data) + (8 * 60 + i * 7) * 60000).toISOString(), data_hora_saida: new Date(inicioDia(data) + (12 * 60 + i * 9) * 60000).toISOString() });
      d.dias_conferidos.push({ data, id_operador: 1, conferido_em: agora });
    }
    return d; // Exclusivo para analisarPeriodo; nunca persistido ou misturado à operação.
  }
  function salvarCadastro(d, id, dados, veiculos) {
    const nome = String(dados.nome).trim(), cpf = String(dados.cpf || "").replace(/\D/g, "");
    exigir(nome.length >= 2 && nome.length <= 80 && CARGOS.includes(dados.cargo), "Informe nome e vínculo válidos.");
    exigir(!cpf || cpfValido(cpf), "CPF inválido. Corrija ou deixe o campo opcional vazio.");
    exigir(!cpf || !d.usuarios.some((u) => u.ativo && u.cpf === cpf && u.id_usuario !== id), "Este CPF já possui cadastro.");
    exigir(veiculos.length >= 1 && veiculos.length <= 10, "Informe de 1 a 10 veículos.");
    const lista = veiculos.map((v) => ({ placa: normalizarPlaca(v.placa), modelo: String(v.modelo || "").trim() }));
    exigir(lista.every((v) => placaValida(v.placa) && v.modelo.length <= 60) && unico(lista.map((v) => v.placa)), "Confira as placas: use formatos válidos e não repita veículos.");
    const antigos = d.veiculos.filter((v) => v.id_usuario === id && v.ativo);
    for (const v of antigos) exigir(lista.some((n) => n.placa === v.placa) || !ativos(d).some((r) => r.placa === v.placa), "Registre a saída antes de remover um veículo presente.");
    for (const v of lista) {
      const anterior = d.veiculos.find((a) => a.placa === v.placa);
      exigir(!anterior?.ativo || anterior.id_usuario === null || anterior.id_usuario === id, `A placa ${v.placa} pertence a outro cadastro.`);
      exigir(!ativos(d).some((r) => r.placa === v.placa && r.id_usuario !== id), "Registre a saída antes de alterar o condutor de um veículo presente.");
    }
    let u = d.usuarios.find((u) => u.id_usuario === id);
    if (!u) { u = { id_usuario: id }; d.usuarios.push(u); }
    Object.assign(u, { nome, cargo: dados.cargo, cpf, ativo: true });
    antigos.forEach((v) => { v.ativo = false; });
    for (const v of lista) {
      let registro = d.veiculos.find((a) => a.placa === v.placa);
      if (!registro) { registro = {}; d.veiculos.push(registro); }
      Object.assign(registro, v, { id_usuario: id, ativo: true });
    }
  }
  function arquivarCadastro(d, id) {
    const u = d.usuarios.find((u) => u.id_usuario === id && u.ativo); exigir(u, "Cadastro não encontrado.");
    const vinculados = d.veiculos.filter((v) => v.id_usuario === id);
    const placas = new Set(vinculados.map((v) => v.placa));
    exigir(!ativos(d).some((r) => r.id_usuario === id || placas.has(r.placa)), "Registre a saída de todos os veículos vinculados antes de remover a pessoa dos cadastros ativos.");
    u.ativo = false; vinculados.forEach((v) => { v.ativo = false; });
  }
  return { FUSO, DIAS, CARGOS, clone, ativos, normalizarPlaca, placaValida, cpfValido, dataLocal, somarDias, inicioDia, novoEstado, validarEstado, migrarV1, resumo, consultarPlaca, registrarEntrada, registrarSaida, configurar, conferirDia, resumoDia, analisarPeriodo, dadosExemplo, salvarCadastro, arquivarCadastro };
})();
if (typeof module !== "undefined" && module.exports) module.exports = RegrasEstacionamento;

if (typeof document !== "undefined") (() => {
  "use strict";
  const R = RegrasEstacionamento;
  const CHAVE = "estacionamento.universitario.v2", ANTIGA = "estacionamento.universitario.v1", SESSAO = "estacionamento.operador.demo";
  const $ = (id) => document.getElementById(id), todos = (s, raiz = document) => [...raiz.querySelectorAll(s)];
  const escapar = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const textoBusca = (v) => String(v).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const idNovo = () => globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const agora = () => new Date().toISOString();
  const fData = new Intl.DateTimeFormat("pt-BR", { timeZone: R.FUSO, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
  const dataHora = (v) => v ? fData.format(new Date(v)) : "—";
  const dataCurta = (v) => v.split("-").reverse().join("/");
  const decimal = (v) => v === null ? "Sem dados" : v.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const placaFmt = (v) => /^[A-Z]{3}\d{4}$/.test(v) ? `${v.slice(0, 3)}-${v.slice(3)}` : v;
  let estado, logado = false, bloqueado = false, consultaAtual = "", pagina = 1, editando = null, revisaoEdicao = 0, exemplo = false, acaoConfirmacao = null, timer;
  const focos = new Map();
  const RepositorioLocal = {
    ler() { const raw = localStorage.getItem(CHAVE); return raw === null ? null : R.validarEstado(JSON.parse(raw)); },
    salvar(d) { R.validarEstado(d); try { localStorage.setItem(CHAVE, JSON.stringify(d)); } catch { throw new Error("Não foi possível salvar. Verifique a permissão ou o espaço de armazenamento do navegador. A alteração não foi aplicada."); } },
    async alterar(mutacao, esperada = null) {
      if (!logado || bloqueado) throw new Error("Entre no sistema e verifique os dados antes de continuar.");
      const executar = () => {
        const d = this.ler();
        if (!d) throw new Error("Os dados foram removidos em outra aba. Recarregue a página.");
        if (esperada !== null && d.revisao !== esperada) { estado = d; renderizar(); throw new Error("Os dados mudaram. Feche e reabra o formulário para atualizar antes de salvar."); }
        const proximo = R.clone(d); mutacao(proximo); proximo.revisao++;
        this.salvar(proximo); estado = proximo; renderizar(); $("estadoSalvamento").textContent = "Alterações salvas";
      };
      if (navigator.locks?.request) await navigator.locks.request(CHAVE, executar); else executar();
    }
  };
  function notificar(msg, erro = false) { clearTimeout(timer); $("notificacao").textContent = msg; $("notificacao").classList.toggle("erro", erro); $("notificacao").hidden = false; timer = setTimeout(() => { $("notificacao").hidden = true; }, 6500); }
  function abrir(id) { focos.set(id, document.activeElement); $(id).showModal(); }
  function confirmar(titulo, mensagem, acao) { $("tituloConfirmar").textContent = titulo; $("textoConfirmar").textContent = mensagem; $("erroConfirmar").textContent = ""; acaoConfirmacao = acao; abrir("confirmarDialog"); }
  function permanencia(r) { const min = Math.max(0, Math.floor(((r.data_hora_saida ? Date.parse(r.data_hora_saida) : Date.now()) - Date.parse(r.data_hora_entrada)) / 60000)); return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`; }
  function botaoSaida(r) { return `<button type="button" class="botao secundario pequeno" data-saida="${escapar(r.id_registro)}">Registrar saída</button>`; }
  function mudarPagina(id) { if (!logado) return; todos(".pagina").forEach((p) => { p.hidden = p.id !== id; }); todos("[data-view]").forEach((b) => { b.classList.toggle("ativo", b.dataset.view === id); if (b.dataset.view === id) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); }); $("conteudo").focus(); }
  function renderizarPainel() {
    const s = R.resumo(estado);
    for (const k of ["total", "ocupadas", "livres", "entradasHoje"]) $(k).textContent = s[k];
    const cor = s.status === "lotado" ? "#bc364b" : s.status === "atencao" ? "#b77917" : "#2367cd";
    $("graficoOcupacao").style.setProperty("--ocupacao", `${s.percentual}%`); $("graficoOcupacao").style.setProperty("--cor-ocupacao", cor);
    $("graficoOcupacao").setAttribute("aria-label", `${decimal(s.percentual)}% de ocupação: ${s.ocupadas} de ${s.total} veículos.`);
    $("percentualOcupacao").textContent = `${decimal(s.percentual)}%`;
    $("statusLotacao").textContent = { disponivel: "Disponível", atencao: "Quase cheio", lotado: "Lotado" }[s.status];
    $("statusLotacao").className = `etiqueta ${s.status === "lotado" ? "vermelha" : s.status === "atencao" ? "ambar" : "verde"}`;
    $("tituloDisponibilidade").textContent = s.status === "lotado" ? "Capacidade máxima atingida" : s.status === "atencao" ? "Atenção: estacionamento quase cheio" : "Há vagas disponíveis";
    $("descricaoDisponibilidade").textContent = s.livres ? `${s.ocupadas} de ${s.total} lugares ocupados. ${s.livres === 1 ? "Resta 1 lugar disponível." : `Restam ${s.livres} lugares disponíveis.`}` : `Todos os ${s.total} lugares estão ocupados. Aguarde a saída de um veículo.`;
    $("barraOcupacao").max = s.total; $("barraOcupacao").value = s.ocupadas; $("barraOcupacao").style.accentColor = cor;
    $("regraAlerta").textContent = `Alerta a partir de ${estado.configuracao.limiar_alerta}% de ocupação. A lotação bloqueia novas entradas.`;
    $("estadoCancela").textContent = s.livres ? "✓ Há capacidade para registrar uma entrada" : "⛔ Nova entrada bloqueada por lotação";
    $("estadoCancela").classList.toggle("lotado", !s.livres);
    todos('[data-action="nova-entrada"]').forEach((b) => { b.disabled = !s.livres; });
    const abertos = R.ativos(estado).sort((a, b) => b.data_hora_entrada.localeCompare(a.data_hora_entrada));
    $("veiculosPresentes").innerHTML = abertos.length ? abertos.map((r) => `<tr><td><span class="placa">${escapar(placaFmt(r.placa))}</span></td><td>${escapar(r.nome_condutor || "Não informada")}</td><td>${escapar(dataHora(r.data_hora_entrada))}</td><td>${permanencia(r)}</td><td>${botaoSaida(r)}</td></tr>`).join("") : '<tr><td colspan="5" class="vazio">Nenhum veículo no estacionamento.</td></tr>';
    if (consultaAtual) renderizarConsulta();
  }
  function renderizarConsulta() {
    const c = R.consultarPlaca(estado, consultaAtual); $("resultado").hidden = false;
    $("resultado").innerHTML = `<div><strong>${escapar(placaFmt(consultaAtual))}</strong><p>${escapar(c.mensagem)}</p></div>${c.registro ? botaoSaida(c.registro) : c.permitido ? `<button type="button" class="botao primario pequeno" data-entrada="${escapar(consultaAtual)}">Registrar entrada</button>` : ""}`;
  }
  function renderizarHistorico() {
    const busca = textoBusca($("filtroHistorico").value), status = $("statusHistorico").value, data = $("dataHistorico").value;
    const lista = estado.registros.filter((r) => textoBusca(`${r.placa} ${placaFmt(r.placa)} ${r.nome_condutor}`).includes(busca) && (status === "todos" || (status === "abertos") === (r.data_hora_saida === null)) && (!data || R.dataLocal(r.data_hora_entrada) === data)).sort((a, b) => b.data_hora_entrada.localeCompare(a.data_hora_entrada));
    const paginas = Math.max(1, Math.ceil(lista.length / 10)); pagina = Math.min(pagina, paginas);
    $("registros").innerHTML = lista.slice((pagina - 1) * 10, pagina * 10).map((r) => `<tr><td><strong class="placa">${escapar(placaFmt(r.placa))}</strong><small class="celula-subtexto">${escapar(r.nome_condutor || "Não informado")}</small></td><td>${escapar(dataHora(r.data_hora_entrada))}</td><td>${escapar(dataHora(r.data_hora_saida))}</td><td>${permanencia(r)}</td><td>Operador demo</td><td>${r.data_hora_saida ? '<span class="etiqueta">Encerrado</span>' : botaoSaida(r)}</td></tr>`).join("") || '<tr><td colspan="6" class="vazio">Nenhum registro encontrado.</td></tr>';
    $("resumoRegistros").textContent = `${lista.length} registro(s) · Página ${pagina} de ${paginas}`; $("paginaAnterior").disabled = pagina <= 1; $("proximaPagina").disabled = pagina >= paginas; $("btnLiberar").disabled = !R.ativos(estado).length;
  }
  function renderizarGrafico(id, dias, chave, referencia = null) {
    const maior = Math.max(1, referencia || 0, ...dias.map((d) => d[chave] || 0));
    $(id).innerHTML = dias.map((d) => `<div class="barra-item"><span class="barra-dia">${d.nome.slice(0, 3)}</span><div class="barra-trilho"><span style="width:${d[chave] === null ? 0 : d[chave] / maior * 100}%"></span></div><strong>${d[chave] === null ? "—" : decimal(d[chave])}</strong></div>`).join("") + (referencia ? `<p class="texto-ajuda">Escala até ${decimal(maior)} veículos; capacidade atual: ${referencia}.</p>` : "");
    $(id).setAttribute("aria-label", dias.map((d) => `${d.nome}: ${decimal(d[chave])}`).join("; "));
  }
  function renderizarRelatorios() {
    const base = exemplo ? R.dadosExemplo() : estado, a = R.analisarPeriodo(base, Number($("janelaRelatorio").value));
    $("avisoExemplo").hidden = !exemplo; $("btnExemplo").textContent = exemplo ? "Voltar ao meu histórico" : "Ver exemplo fictício"; $("btnExemplo").setAttribute("aria-pressed", String(exemplo));
    $("periodoRelatorio").textContent = `${dataCurta(a.inicio)} a ${dataCurta(a.fim)} · Horário de Brasília`;
    $("amostraRelatorio").textContent = a.amostras;
    const amostrados = a.dias.filter((d) => d.amostras);
    for (const [chave, titulo, detalhe, unidade] of [["mediaEntradas", "diaMaiorFluxo", "detalheMaiorFluxo", "entradas por dia"], ["picoMedio", "diaMaiorPico", "detalheMaiorPico", "veículos simultâneos"]]) {
      const max = Math.max(0, ...amostrados.map((d) => d[chave])); const lideres = amostrados.filter((d) => d[chave] === max);
      $(titulo).textContent = lideres.length ? lideres.length > 2 ? "Empate entre dias" : lideres.map((d) => d.nome).join(" / ") : "Sem dados";
      $(detalhe).textContent = lideres.length ? `${decimal(max)} ${unidade}. Consulte as amostras abaixo.` : "Confira dias completos para iniciar a comparação.";
    }
    renderizarGrafico("graficoFluxo", a.dias, "mediaEntradas"); renderizarGrafico("graficoPico", a.dias, "picoMedio", estado.configuracao.capacidade_total);
    $("tabelaFluxo").innerHTML = a.dias.map((d) => `<tr><th scope="row">${d.nome}</th><td>${d.amostras}</td><td>${d.amostras ? d.totalEntradas : "—"}</td><td>${decimal(d.mediaEntradas)}</td><td>${decimal(d.picoMedio)}</td><td>${d.amostras ? d.maiorPico : "—"}</td></tr>`).join("");
    $("avisoAmostra").textContent = !a.amostras ? "Ainda não há dias completos conferidos neste período." : a.dias.some((d) => d.amostras < 4) ? "Amostra inicial: há dias da semana com menos de quatro observações. A comparação ainda é limitada." : "Compare as médias junto com o número de dias observados. Os picos se referem a veículos simultâneos.";
    $("dataConferencia").min = R.somarDias(R.dataLocal(estado.configuracao.inicio_monitoramento), 1); $("dataConferencia").max = R.somarDias(R.dataLocal(), -1);
    $("resumoConferencia").textContent = `Monitoramento iniciado em ${dataHora(estado.configuracao.inicio_monitoramento)}. ${estado.dias_conferidos.length} dia(s) conferido(s) no seu histórico. A conferência sempre se aplica aos seus dados, mesmo ao visualizar o exemplo.`;
  }
  function renderizarCadastros() {
    const busca = textoBusca($("filtroCadastros").value), status = $("statusCadastros").value;
    const pessoasAtivas = new Set(estado.usuarios.filter((u) => u.ativo).map((u) => u.id_usuario));
    $("pessoasAtivas").textContent = pessoasAtivas.size;
    $("pessoasInativas").textContent = estado.usuarios.length - pessoasAtivas.size;
    $("veiculosCadastrados").textContent = estado.veiculos.filter((v) => v.ativo && pessoasAtivas.has(v.id_usuario)).length;
    const placasDaPessoa = (u) => estado.veiculos.filter((v) => v.id_usuario === u.id_usuario && (!u.ativo || v.ativo));
    const lista = estado.usuarios.filter((u) => (status === "todos" || u.ativo === (status === "ativos")) && textoBusca(`${u.nome} ${placasDaPessoa(u).map((v) => `${v.placa} ${placaFmt(v.placa)}`).join(" ")}`).includes(busca));
    $("contagemCadastros").textContent = `${lista.length} pessoa(s) nesta consulta · Cadastros iniciais fictícios.`;
    $("usuarios").innerHTML = lista.map((u) => {
      const presentes = R.ativos(estado).filter((r) => r.id_usuario === u.id_usuario).length;
      const placas = placasDaPessoa(u).map((v) => {
        const consulta = R.consultarPlaca(estado, v.placa);
        return `<div class="veiculo-cadastrado"><span class="placa">${escapar(placaFmt(v.placa))}</span>${u.ativo && v.ativo ? consulta.registro ? '<span class="etiqueta verde">Presente</span>' : `<button type="button" class="botao secundario pequeno" data-entrada="${escapar(v.placa)}" aria-label="Registrar entrada de ${escapar(placaFmt(v.placa))}" ${consulta.permitido ? "" : 'disabled title="Estacionamento lotado"'}>Entrada</button>` : '<span class="etiqueta neutra">Inativo</span>'}</div>`;
      }).join("") || '<span class="texto-ajuda">Sem placas vinculadas atualmente</span>';
      const acoes = u.ativo ? `<div class="acoes"><button type="button" class="botao secundario pequeno" data-editar="${escapar(u.id_usuario)}">Editar</button><button type="button" class="botao perigo-suave pequeno" data-arquivar="${escapar(u.id_usuario)}">Remover cadastro</button></div>` : '<span class="texto-ajuda">Histórico preservado</span>';
      return `<tr><td><strong>${escapar(u.nome)}</strong><small class="celula-subtexto">${escapar(u.cargo)}</small></td><td>${placas}</td><td><span class="etiqueta ${u.ativo ? "verde" : "neutra"}">${u.ativo ? "Ativo" : "Inativo"}</span><small>${presentes ? `${presentes} veículo(s) no pátio` : "Nenhum veículo presente"}</small></td><td>${acoes}</td></tr>`;
    }).join("") || '<tr><td colspan="4" class="vazio">Nenhuma pessoa corresponde aos filtros.</td></tr>';
  }
  function renderizar() {
    if (!estado) return;
    $("dataAtual").textContent = new Intl.DateTimeFormat("pt-BR", { timeZone: R.FUSO, weekday: "long", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date());
    renderizarPainel(); renderizarHistorico(); renderizarRelatorios(); renderizarCadastros();
    if (!$("formConfiguracao").contains(document.activeElement)) { $("capacidadeTotal").value = estado.configuracao.capacidade_total; $("limiarAlerta").value = estado.configuracao.limiar_alerta; }
    if ($("entradaDialog").open) atualizarEntrada();
  }
  function atualizarEntrada() {
    const c = R.consultarPlaca(estado, $("placaEntrada").value); $("autorizacaoEntrada").textContent = c.mensagem; $("autorizacaoEntrada").classList.toggle("erro", !c.permitido); $("confirmarEntrada").disabled = !c.permitido;
    if (!c.usuario && $("nomeEntrada").readOnly) $("nomeEntrada").value = "";
    $("nomeEntrada").readOnly = Boolean(c.usuario); if (c.usuario) $("nomeEntrada").value = c.usuario.nome;
  }
  function abrirEntrada(placa = "") { $("formEntrada").reset(); $("placaEntrada").value = placa; $("erroEntrada").textContent = ""; atualizarEntrada(); abrir("entradaDialog"); }
  function saida(id) {
    const r = estado.registros.find((r) => r.id_registro === id && !r.data_hora_saida); if (!r) return notificar("Este acesso já foi encerrado.", true);
    confirmar("Registrar saída", `Confirmar a saída de ${placaFmt(r.placa)}? O acesso será encerrado e uma unidade de capacidade ficará disponível.`, () => RepositorioLocal.alterar((d) => R.registrarSaida(d, id, agora())));
  }
  function atualizarQuantidadeVeiculos() {
    const quantidade = $("veiculosFormulario").children.length;
    $("quantidadeVeiculosFormulario").textContent = `${quantidade} veículo(s) neste cadastro. Limite demonstrativo: 10.`;
    $("btnAdicionarVeiculo").disabled = quantidade >= 10;
  }
  function adicionarVeiculo(v = {}) {
    if ($("veiculosFormulario").children.length >= 10) return notificar("Limite de dez veículos por cadastro nesta demonstração.", true);
    const linha = document.createElement("div"); linha.className = "veiculo-linha"; const id = idNovo();
    linha.innerHTML = `<div><label for="placa-${escapar(id)}">Placa *</label><input id="placa-${escapar(id)}" class="placa-input" data-campo="placa" maxlength="9" required value="${escapar(v.placa || "")}"></div><div><label for="modelo-${escapar(id)}">Modelo (opcional)</label><input id="modelo-${escapar(id)}" data-campo="modelo" maxlength="60" value="${escapar(v.modelo || "")}"></div><button type="button" class="botao perigo-suave remover-veiculo" aria-label="Remover este veículo">×</button>`;
    $("veiculosFormulario").appendChild(linha);
    atualizarQuantidadeVeiculos();
  }
  function abrirCadastro(id = null) {
    editando = id; revisaoEdicao = estado.revisao; $("formCadastro").reset(); $("veiculosFormulario").replaceChildren(); $("erroCadastro").textContent = "";
    const u = estado.usuarios.find((u) => u.id_usuario === id); $("tituloCadastro").textContent = u ? "Editar pessoa e veículos" : "Cadastrar pessoa";
    if (u) { $("nomeCondutor").value = u.nome; $("cargoCondutor").value = u.cargo; $("cpfCondutor").value = u.cpf; estado.veiculos.filter((v) => v.ativo && v.id_usuario === id).forEach(adicionarVeiculo); } else adicionarVeiculo();
    abrir("cadastroDialog");
  }
  function mostrarSistema() { $("loginTela").hidden = logado; $("sistema").hidden = !logado; if (logado) renderizar(); }
  function problema(erro) { bloqueado = true; $("problemaDados").hidden = false; $("mensagemDados").textContent = erro.message; $("btnEntrar").disabled = true; }
  function iniciar() {
    try {
      estado = RepositorioLocal.ler();
      if (!estado) {
        const antiga = localStorage.getItem(ANTIGA); estado = antiga ? R.migrarV1(JSON.parse(antiga)) : R.novoEstado(); RepositorioLocal.salvar(estado);
        if (antiga) { $("avisoMigracao").hidden = false; $("avisoMigracao").textContent = "Cadastros e histórico da versão anterior foram preservados. As escalas e as vagas individuais deixaram de participar da operação. A cópia antiga continua no navegador."; }
      }
      try { logado = sessionStorage.getItem(SESSAO) === "ativa"; } catch { /* Sessão válida só nesta página. */ }
      mostrarSistema();
    } catch (e) { problema(e); }
    $("formLogin").addEventListener("submit", (e) => { e.preventDefault(); $("erroLogin").textContent = ""; if (bloqueado) return; if ($("usuario").value.trim() !== "admin" || $("senha").value !== "1234") { $("erroLogin").textContent = "Usuário ou senha incorretos."; return; } logado = true; try { sessionStorage.setItem(SESSAO, "ativa"); } catch { /* Sem persistência de sessão. */ } $("senha").value = ""; mostrarSistema(); $("conteudo").focus(); });
    $("mostrarSenha").addEventListener("click", () => { const visivel = $("senha").type === "password"; $("senha").type = visivel ? "text" : "password"; $("mostrarSenha").textContent = visivel ? "Ocultar" : "Mostrar"; $("mostrarSenha").setAttribute("aria-label", `${visivel ? "Ocultar" : "Mostrar"} senha`); $("mostrarSenha").setAttribute("aria-pressed", String(visivel)); });
    $("btnSair").addEventListener("click", () => { logado = false; try { sessionStorage.removeItem(SESSAO); } catch { /* A tela de login permanece disponível. */ } todos("dialog[open]").forEach((d) => d.close()); mostrarSistema(); $("usuario").focus(); });
    todos("[data-view]").forEach((b) => b.addEventListener("click", () => mudarPagina(b.dataset.view))); $("marcaPainel").addEventListener("click", (e) => { e.preventDefault(); mudarPagina("painel"); });
    todos("dialog").forEach((d) => d.addEventListener("close", () => { const f = focos.get(d.id); if (f?.isConnected && !f.disabled) f.focus(); }));
    document.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.close) $(b.dataset.close).close();
      if (b.dataset.action === "nova-entrada") abrirEntrada();
      if (b.dataset.entrada) abrirEntrada(b.dataset.entrada);
      if (b.dataset.saida) saida(b.dataset.saida);
      if (b.dataset.editar) abrirCadastro(b.dataset.editar);
      if (b.dataset.arquivar) {
        const u = estado.usuarios.find((u) => u.id_usuario === b.dataset.arquivar && u.ativo);
        if (!u) return notificar("O cadastro mudou. Atualize a consulta.", true);
        try { R.arquivarCadastro(R.clone(estado), u.id_usuario); } catch (err) { return notificar(err.message, true); }
        const placas = estado.veiculos.filter((v) => v.id_usuario === u.id_usuario && v.ativo).map((v) => placaFmt(v.placa)), revisao = estado.revisao;
        confirmar("Remover pessoa e veículos dos cadastros ativos", `Remover ${u.nome} e inativar ${placas.length} veículo(s) ativo(s) vinculado(s)${placas.length ? ` (${placas.join(", ")})` : ""}? Os acessos anteriores permanecerão no histórico. O cadastro poderá ser consultado pelo filtro Inativos.`, () => RepositorioLocal.alterar((d) => R.arquivarCadastro(d, u.id_usuario), revisao));
      }
      if (b.classList.contains("remover-veiculo")) { if ($("veiculosFormulario").children.length === 1) notificar("Mantenha pelo menos um veículo.", true); else { b.closest(".veiculo-linha").remove(); atualizarQuantidadeVeiculos(); } }
    });
    $("formPesquisa").addEventListener("submit", (e) => { e.preventDefault(); consultaAtual = R.normalizarPlaca($("campoPesquisa").value); if (!consultaAtual) $("resultado").hidden = true; else renderizarConsulta(); });
    $("placaEntrada").addEventListener("input", () => { if ($("nomeEntrada").readOnly) $("nomeEntrada").value = ""; atualizarEntrada(); $("erroEntrada").textContent = ""; });
    $("formEntrada").addEventListener("submit", async (e) => { e.preventDefault(); const placa = $("placaEntrada").value, nome = $("nomeEntrada").value; $("confirmarEntrada").disabled = true; try { await RepositorioLocal.alterar((d) => R.registrarEntrada(d, placa, nome, agora(), idNovo())); $("entradaDialog").close(); notificar("Entrada registrada. A ocupação foi atualizada."); } catch (err) { $("erroEntrada").textContent = err.message; } finally { atualizarEntrada(); } });
    $("formConfirmar").addEventListener("submit", async (e) => { e.preventDefault(); if (!acaoConfirmacao) return; $("aceitarConfirmacao").disabled = true; try { await acaoConfirmacao(); acaoConfirmacao = null; $("confirmarDialog").close(); notificar("Operação registrada."); } catch (err) { $("erroConfirmar").textContent = err.message; } finally { $("aceitarConfirmacao").disabled = false; } });
    $("cancelarConfirmacao").addEventListener("click", () => $("confirmarDialog").close());
    $("btnLiberar").addEventListener("click", () => { const ids = R.ativos(estado).map((r) => r.id_registro); confirmar("Registrar saída de todos", `Confirme somente se os ${ids.length} veículos listados realmente saíram. Os registros serão encerrados com o horário atual e continuarão no histórico.`, () => RepositorioLocal.alterar((d) => { const hora = agora(); ids.forEach((id) => { if (R.ativos(d).some((r) => r.id_registro === id)) R.registrarSaida(d, id, hora); }); })); });
    ["filtroHistorico", "statusHistorico", "dataHistorico"].forEach((id) => $(id).addEventListener("input", () => { pagina = 1; renderizarHistorico(); }));
    $("paginaAnterior").addEventListener("click", () => { pagina--; renderizarHistorico(); }); $("proximaPagina").addEventListener("click", () => { pagina++; renderizarHistorico(); });
    $("btnExemplo").addEventListener("click", () => { exemplo = !exemplo; renderizarRelatorios(); }); $("janelaRelatorio").addEventListener("change", renderizarRelatorios);
    $("formConferencia").addEventListener("submit", (e) => { e.preventDefault(); const data = $("dataConferencia").value; try { R.conferirDia(R.clone(estado), data, agora()); confirmar("Conferir dia completo", `Você conferiu todas as movimentações de ${dataCurta(data)}? Dias sem movimento confirmado contam como zero. Esta ação inclui a data nas médias.`, () => RepositorioLocal.alterar((d) => R.conferirDia(d, data, agora()))); } catch (err) { notificar(err.message, true); } });
    $("btnNovoCadastro").addEventListener("click", () => abrirCadastro()); $("btnAdicionarVeiculo").addEventListener("click", () => adicionarVeiculo()); $("filtroCadastros").addEventListener("input", renderizarCadastros);
    $("statusCadastros").addEventListener("change", renderizarCadastros);
    $("formCadastro").addEventListener("submit", async (e) => { e.preventDefault(); const dados = { nome: $("nomeCondutor").value, cargo: $("cargoCondutor").value, cpf: $("cpfCondutor").value }, veiculos = todos(".veiculo-linha", $("veiculosFormulario")).map((l) => ({ placa: l.querySelector('[data-campo="placa"]').value, modelo: l.querySelector('[data-campo="modelo"]').value })); $("salvarCadastro").disabled = true; try { await RepositorioLocal.alterar((d) => R.salvarCadastro(d, editando || idNovo(), dados, veiculos), revisaoEdicao); $("cadastroDialog").close(); notificar("Cadastro salvo."); } catch (err) { $("erroCadastro").textContent = err.message; } finally { $("salvarCadastro").disabled = false; } });
    $("formConfiguracao").addEventListener("submit", async (e) => { e.preventDefault(); $("erroConfiguracao").textContent = ""; const capacidade = Number($("capacidadeTotal").value), alerta = Number($("limiarAlerta").value); try { await RepositorioLocal.alterar((d) => R.configurar(d, capacidade, alerta)); notificar("Capacidade e alerta atualizados."); } catch (err) { $("erroConfiguracao").textContent = err.message; } });
    $("btnBackup").addEventListener("click", () => { try { const blob = new Blob([JSON.stringify({ versao2: localStorage.getItem(CHAVE), versao1: localStorage.getItem(ANTIGA) }, null, 2)], { type: "application/json" }); const url = URL.createObjectURL(blob), a = document.createElement("a"); a.href = url; a.download = "copia_estacionamento.json"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); } catch (err) { notificar(err.message, true); } });
    $("btnRestaurar").addEventListener("click", () => { confirmar("Restaurar demonstração", "A versão 2 será reiniciada sem acessos. Baixe uma cópia primeiro se precisar recuperar os dados. A versão 1 não será apagada.", async () => { const d = R.novoEstado(); RepositorioLocal.salvar(d); estado = d; bloqueado = false; $("problemaDados").hidden = true; $("btnEntrar").disabled = false; mostrarSistema(); }); });
    window.addEventListener("storage", (e) => { if (e.key === CHAVE || e.key === null) { try { const d = RepositorioLocal.ler(); if (!d) throw new Error("Os dados foram removidos em outra aba. Recarregue para iniciar novamente."); estado = d; if (logado) renderizar(); } catch (err) { problema(err); } } });
    setInterval(() => { if (logado && !bloqueado) renderizar(); }, 60000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();
