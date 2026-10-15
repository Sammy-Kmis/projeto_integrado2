/* Estacionamento universitário — integração de fluxo, 10/10/2026.
 * Flask/PostgreSQL persistem cadastros, capacidade, acessos e conferências.
 * As funções puras abaixo calculam a apresentação e os gráficos a partir da API.
 * Autorizações de entrada são sempre revalidadas pelo servidor.
 */
const RegrasEstacionamento = (() => {
  "use strict";
  const FUSO = "America/Sao_Paulo";
  const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const ativos = (d) => d.registros.filter((r) => r.data_hora_saida === null);
  const normalizarPlaca = (s) => String(s ?? "").trim().toUpperCase().replace(/[\s-]/g, "");
  const placaValida = (s) => /^[A-Z]{3}\d[A-Z\d]\d{2}$/.test(s);
  const exigir = (condicao, mensagem) => { if (!condicao) throw new Error(mensagem); };
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
  function resumo(d, agora = new Date().toISOString()) {
    const ocupadas = ativos(d).length, total = d.configuracao.capacidade_total, percentual = ocupadas / total * 100;
    return { total, ocupadas, livres: Math.max(0, total - ocupadas), percentual, status: ocupadas >= total ? "lotado" : percentual >= d.configuracao.limiar_alerta ? "atencao" : "disponivel", entradasHoje: d.registros.filter((r) => dataLocal(r.data_hora_entrada) === dataLocal(agora)).length };
  }
  function consultarPlaca(d, valor) {
    const placa = normalizarPlaca(valor);
    if (!placaValida(placa)) return { permitido: false, codigo: "placa_invalida", mensagem: "Informe a placa no formato ABC-1234 ou ABC1D23." };
    const registro = ativos(d).find((r) => r.placa === placa);
    const veiculo = d.veiculos.find((v) => v.placa === placa);
    const usuario = veiculo && d.usuarios.find((u) => u.id_usuario === veiculo.id_usuario && u.ativo);
    if (registro) return { permitido: false, codigo: "veiculo_presente", mensagem: "Este veículo já está no estacionamento. Registre a saída para encerrar o acesso.", registro, usuario };
    if (veiculo && (!veiculo.ativo || (veiculo.id_usuario !== null && !usuario))) return { permitido: false, mensagem: "Veículo ou pessoa inativos. Confira o cadastro." };
    if (!resumo(d).livres) return { permitido: false, codigo: "estacionamento_lotado", mensagem: "Estacionamento lotado. Aguarde uma saída para autorizar outra entrada.", usuario };
    return { permitido: true, codigo: "disponivel", mensagem: usuario ? `${usuario.nome}: há capacidade para registrar a entrada.` : "Há capacidade disponível. A placa será registrada mesmo sem cadastro prévio de condutor.", usuario };
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
  return { FUSO, DIAS, clone, ativos, normalizarPlaca, placaValida, dataLocal, somarDias, inicioDia, resumo, consultarPlaca, conferirDia, resumoDia, analisarPeriodo };
})();
if (typeof module !== "undefined" && module.exports) module.exports = RegrasEstacionamento;

if (typeof document !== "undefined") (() => {
  "use strict";
  const R = RegrasEstacionamento;
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
  // A máscara cuida da apresentação. A API continua validando CPF e placa.
  const cpfFmt = (valor) => String(valor ?? "").replace(/\D/g, "").slice(0, 11)
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3}\.\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3}\.\d{3}\.\d{3})(\d)/, "$1-$2");
  function placaDigitada(valor) {
    const placa = String(valor ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
    // A quinta posição distingue os formatos: número no antigo, letra no Mercosul.
    return /^[A-Z]{3}\d{2,4}$/.test(placa) ? `${placa.slice(0, 3)}-${placa.slice(3)}` : placa;
  }
  const campoComMascara = (campo) => campo instanceof HTMLInputElement && (campo.id === "cpfCondutor" || campo.matches(".placa-input"));
  const caracteresDoCampo = (campo, valor) => String(valor).replace(campo.id === "cpfCondutor" ? /[^0-9]/g : /[^A-Za-z0-9]/g, "");
  function aplicarMascara(campo) {
    if (!campoComMascara(campo)) return;
    const anterior = campo.value, inicio = campo.selectionStart, fim = campo.selectionEnd;
    const formatado = campo.id === "cpfCondutor" ? cpfFmt(anterior) : placaDigitada(anterior);
    if (anterior === formatado) return;
    const posicao = (indice) => {
      const quantidade = caracteresDoCampo(campo, anterior.slice(0, indice)).length;
      let vistos = 0, pos = 0;
      while (pos < formatado.length && vistos < quantidade) {
        if (caracteresDoCampo(campo, formatado[pos])) vistos++;
        pos++;
      }
      return pos;
    };
    campo.value = formatado;
    if (inicio !== null && fim !== null) campo.setSelectionRange(posicao(inicio), posicao(fim));
  }
  function instalarMascaras() {
    // Captura inclui os campos de veículos adicionados dinamicamente ao formulário.
    document.addEventListener("input", (e) => { if (!e.isComposing) aplicarMascara(e.target); }, true);
    document.addEventListener("compositionend", (e) => aplicarMascara(e.target), true);
    document.addEventListener("beforeinput", (e) => {
      const campo = e.target;
      if (!campoComMascara(campo) || e.isComposing || !e.cancelable || campo.selectionStart !== campo.selectionEnd) return;
      const voltar = e.inputType === "deleteContentBackward", avancar = e.inputType === "deleteContentForward";
      if (!voltar && !avancar) return;
      const cursor = campo.selectionStart, texto = campo.value;
      let indice = voltar ? cursor - 1 : cursor;
      if (indice < 0 || indice >= texto.length || caracteresDoCampo(campo, texto[indice])) return;
      // Apagar junto a ponto/hífen remove também o dígito adjacente, sem prender o cursor.
      while (indice >= 0 && indice < texto.length && !caracteresDoCampo(campo, texto[indice])) indice += voltar ? -1 : 1;
      if (indice < 0 || indice >= texto.length) return;
      e.preventDefault();
      const inicio = voltar ? indice : cursor, fim = voltar ? cursor : indice + 1;
      campo.value = texto.slice(0, inicio) + texto.slice(fim);
      campo.setSelectionRange(inicio, inicio);
      campo.dispatchEvent(new Event("input", { bubbles: true }));
    });
    $("cpfCondutor").placeholder = "000.000.000-00";
    $("cpfCondutor").title = "Digite ou cole os 11 números do CPF. A pontuação é automática.";
  }
  let capacidadeExibida = null;
  let dadosProntos = false, versaoPainel = 0, carregandoPainel = false, salvandoMovimento = false;
  let estado, logado = false, bloqueado = false, consultaAtual = "", pagina = 1, editando = null, acaoConfirmacao = null, timer;
  // A sessão é validada pelo servidor. Nenhuma senha ou token vai para localStorage.
  let operadorAtual = null, ocupadoAutenticacao = false, consultaSessao = null;
  function atualizarBotoesAutenticacao() {
    $("btnEntrar").disabled = ocupadoAutenticacao || bloqueado;
    $("btnEntrar").textContent = ocupadoAutenticacao ? "Aguarde…" : "Entrar no sistema →";
    $("btnSair").disabled = ocupadoAutenticacao;
  }
  async function api(caminho, dados, metodo) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const resposta = await fetch(caminho, {
        method: metodo || (dados === undefined ? "GET" : "POST"),
        credentials: "same-origin", cache: "no-store", signal: controller.signal,
        headers: { Accept: "application/json", ...(dados === undefined ? {} : { "Content-Type": "application/json" }) },
        ...(dados === undefined ? {} : { body: JSON.stringify(dados) })
      });
      let corpo;
      try { corpo = await resposta.json(); } catch { throw new Error("Resposta inválida. Abra o sistema pelo endereço do Flask: http://127.0.0.1:5000."); }
      if (!resposta.ok) {
        const erro = new Error(typeof corpo?.mensagem === "string" ? corpo.mensagem : "Não foi possível concluir a solicitação.");
        erro.status = resposta.status;
        if (resposta.status === 401 && logado) voltarLogin("Sua sessão terminou. Entre novamente.");
        throw erro;
      }
      return corpo;
    } catch (erro) {
      if (erro.name === "AbortError") throw new Error("O servidor demorou para responder. Confira o histórico antes de repetir uma gravação.");
      if (erro instanceof TypeError) throw new Error("Não foi possível acessar o servidor. Abra http://127.0.0.1:5000 com o Flask em execução.");
      throw erro;
    } finally { clearTimeout(timeout); }
  }
  function aplicarOperador(dados) {
    const op = dados?.operador;
    if (!op || !Number.isInteger(op.id_operador) || typeof op.nome !== "string" || typeof op.login !== "string") throw new Error("O servidor devolveu uma sessão inválida.");
    const novaSessao = !logado || operadorAtual?.id_operador !== op.id_operador;
    operadorAtual = op; logado = true; $("erroLogin").textContent = ""; mostrarSistema();
    if (novaSessao) { carregarCadastros(); carregarPainel(); }
  }
  function voltarLogin(mensagem = "") {
    logado = false; operadorAtual = null; versaoPainel++; dadosProntos = false; carregandoPainel = false; estado = null;
    versaoConsultaCadastros++; pessoasServidor = []; cadastrosCarregados = false; carregandoCadastros = false; erroCadastros = "";
    todos("dialog[open]").forEach((d) => d.close());
    $("senha").value = ""; $("erroLogin").textContent = mensagem; mostrarSistema();
  }
  function verificarSessao(inicial = false) {
    if (consultaSessao) return consultaSessao;
    consultaSessao = (async () => {
      try { const dados = await api("/api/sessao"); aplicarOperador(dados); return dados; }
      catch (erro) {
        voltarLogin(erro.status === 401 ? inicial ? "" : "Sua sessão terminou. Entre novamente." : erro.message);
        throw erro;
      } finally { consultaSessao = null; }
    })();
    return consultaSessao;
  }
  async function autenticar(e) {
    e.preventDefault();
    if (ocupadoAutenticacao || bloqueado) return;
    const login = $("usuario").value.trim(), senha = $("senha").value;
    if (!login || login.length > 50 || !senha || senha.length > 128) { $("erroLogin").textContent = "Informe seu login (até 50 caracteres) e sua senha (até 128)."; return; }
    ocupadoAutenticacao = true; atualizarBotoesAutenticacao(); $("erroLogin").textContent = "";
    try {
      if (consultaSessao) await consultaSessao.catch(() => {});
      aplicarOperador(await api("/api/login", { login, senha }));
      $("senha").value = ""; $("conteudo").focus();
    } catch (erro) { voltarLogin(erro.message); }
    finally { ocupadoAutenticacao = false; atualizarBotoesAutenticacao(); }
  }
  async function encerrarSessao() {
    if (ocupadoAutenticacao) return;
    ocupadoAutenticacao = true; atualizarBotoesAutenticacao();
    try {
      if (consultaSessao) await consultaSessao.catch(() => {});
      await api("/api/logout", {}); voltarLogin(); $("usuario").focus();
    } catch (erro) { notificar(`Não foi possível encerrar a sessão no servidor: ${erro.message}`, true); }
    finally { ocupadoAutenticacao = false; atualizarBotoesAutenticacao(); }
  }
  const focos = new Map();
  function indisponivel(mensagem) {
    dadosProntos = false;
    for (const id of ["total", "ocupadas", "livres", "entradasHoje", "percentualOcupacao"]) $(id).textContent = "—";
    $("tituloDisponibilidade").textContent = "Contagem indisponível";
    $("descricaoDisponibilidade").textContent = mensagem;
    $("statusLotacao").textContent = "Sem atualização";
    $("estadoCancela").textContent = "Aguarde a conexão para registrar acessos";
    $("regraAlerta").textContent = "";
    $("barraOcupacao").removeAttribute("value");
    $("graficoOcupacao").style.setProperty("--ocupacao", "0%");
    $("graficoOcupacao").setAttribute("aria-label", "Contagem indisponível");
    $("veiculosPresentes").innerHTML = '<tr><td colspan="5" class="vazio">Atualize o painel para consultar os veículos.</td></tr>';
    $("registros").innerHTML = '<tr><td colspan="6" class="vazio">Histórico indisponível. Tente atualizar.</td></tr>';
    $("resultado").hidden = true;
    $("estadoSalvamento").textContent = mensagem;
    $("erroPainel").textContent = mensagem; $("erroPainel").hidden = false;
    todos('[data-action="nova-entrada"], #confirmarEntrada, #formConfiguracao button, #formConferencia button').forEach(b => b.disabled = true);
    $("relatorios").querySelectorAll("section, .grade-graficos").forEach(e => e.hidden = true);
  }
  async function carregarPainel() {
    if (!logado) return false;
    const versao = ++versaoPainel;
    carregandoPainel = true;
    try {
      const dados = await api("/api/painel");
      if (!logado || versao !== versaoPainel) return false;
      if (!dados.configuracao || !Number.isInteger(dados.configuracao.capacidade_total) || dados.configuracao.capacidade_total < 1 || !Array.isArray(dados.registros) || !Array.isArray(dados.veiculos) || !Array.isArray(dados.usuarios) || !Array.isArray(dados.dias_conferidos)) throw new Error("Resposta do painel inválida.");
      estado = dados;
      estado.registros.forEach(r => r.id_registro = String(r.id_registro));
      dadosProntos = true; $("erroPainel").hidden = true;
      $("relatorios").querySelectorAll("section, .grade-graficos").forEach(e => e.hidden = false);
      todos('#formConfiguracao button, #formConferencia button').forEach(b => b.disabled = false);
      $("estadoSalvamento").textContent = "Dados consultados no PostgreSQL";
      renderizar(); return true;
    } catch (erro) {
      if (logado && versao === versaoPainel) indisponivel(erro.message);
      return false;
    } finally { if (versao === versaoPainel) carregandoPainel = false; }
  }
  async function gravarMovimento(caminho, dados, metodo) {
    if (!logado || !dadosProntos) throw new Error("Atualize o painel antes de continuar.");
    if (salvandoMovimento) throw new Error("Aguarde a operação em andamento.");
    salvandoMovimento = true; versaoPainel++;
    let resposta;
    try {
      resposta = await api(caminho, dados, metodo);
    } catch (erro) {
      // Falhas de rede podem ocorrer depois da gravação: nunca reenvie automaticamente.
      await carregarPainel();
      throw new Error(`${erro.message} Confira o histórico antes de repetir a operação.`);
    } finally {
      salvandoMovimento = false;
    }
    // A operação já foi confirmada. Falhar ao atualizar não significa falhar ao salvar.
    const atualizado = await carregarPainel();
    if (!atualizado && logado) notificar("Operação salva, mas não foi possível atualizar o painel. Atualize manualmente.", true);
    carregarCadastros();
    if ($("entradaDialog").open) atualizarEntrada();
    return resposta;
  }
  function notificar(msg, erro = false) { clearTimeout(timer); $("notificacao").textContent = msg; $("notificacao").classList.toggle("erro", erro); $("notificacao").hidden = false; timer = setTimeout(() => { $("notificacao").hidden = true; }, 6500); }
  function abrir(id) { focos.set(id, document.activeElement); $(id).showModal(); }
  function confirmar(titulo, mensagem, acao) { $("tituloConfirmar").textContent = titulo; $("textoConfirmar").textContent = mensagem; $("erroConfirmar").textContent = ""; acaoConfirmacao = acao; abrir("confirmarDialog"); }
  function permanencia(r) { const min = Math.max(0, Math.floor(((r.data_hora_saida ? Date.parse(r.data_hora_saida) : Date.now()) - Date.parse(r.data_hora_entrada)) / 60000)); return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`; }
  function botaoSaida(r) { return `<button type="button" class="botao secundario pequeno" data-saida="${escapar(r.id_registro)}">Registrar saída</button>`; }
  function mudarPagina(id) { if (!logado) return; todos(".pagina").forEach((p) => { p.hidden = p.id !== id; }); todos("[data-view]").forEach((b) => { b.classList.toggle("ativo", b.dataset.view === id); if (b.dataset.view === id) b.setAttribute("aria-current", "page"); else b.removeAttribute("aria-current"); }); $("conteudo").focus(); if (id === "cadastros") carregarCadastros(); else if (!salvandoMovimento) carregarPainel(); }
  function renderizarPainel() {
    const s = R.resumo(estado);
    for (const k of ["total", "ocupadas", "livres", "entradasHoje"]) $(k).textContent = s[k];
    const cor = s.status === "lotado" ? "#bc364b" : s.status === "atencao" ? "#b77917" : "#2367cd";
    $("graficoOcupacao").style.setProperty("--ocupacao", `${s.percentual}%`); $("graficoOcupacao").style.setProperty("--cor-ocupacao", cor);
    $("graficoOcupacao").setAttribute("aria-label", `${s.livres} vagas livres de ${s.total}`);
    $("percentualOcupacao").textContent = s.livres;
    $("statusLotacao").textContent = { disponivel: "Disponível", atencao: "Quase cheio", lotado: "Lotado" }[s.status];
    $("statusLotacao").className = `etiqueta ${s.status === "lotado" ? "vermelha" : s.status === "atencao" ? "ambar" : "verde"}`;
    $("tituloDisponibilidade").textContent = s.livres === 0 ? "Nenhuma vaga livre — lotado" : `${s.livres} ${s.livres === 1 ? "vaga livre" : "vagas livres"} de ${s.total}`;
    $("descricaoDisponibilidade").textContent = s.livres ? `${s.ocupadas} de ${s.total} lugares ocupados. ${s.livres === 1 ? "Resta 1 lugar disponível." : `Restam ${s.livres} lugares disponíveis.`}` : `Todos os ${s.total} lugares estão ocupados. Aguarde a saída de um veículo.`;
    $("barraOcupacao").max = s.total; $("barraOcupacao").value = s.ocupadas; $("barraOcupacao").style.accentColor = cor;
    $("regraAlerta").textContent = `Aviso de quase cheio quando restarem ${s.total - Math.ceil(s.total * estado.configuracao.limiar_alerta / 100)} vagas ou menos.`;
    $("estadoCancela").textContent = s.livres ? "✓ Há capacidade para registrar uma entrada" : "⛔ Nova entrada bloqueada por lotação";
    $("estadoCancela").classList.toggle("lotado", !s.livres);
    todos('[data-action="nova-entrada"]').forEach((b) => { b.disabled = !s.livres; });
    const abertos = R.ativos(estado).sort((a, b) => b.data_hora_entrada.localeCompare(a.data_hora_entrada));
    $("veiculosPresentes").innerHTML = abertos.length ? abertos.map((r) => `<tr><td><span class="placa">${escapar(placaFmt(r.placa))}</span></td><td>${escapar(r.nome_condutor || "Não informada")}</td><td>${escapar(dataHora(r.data_hora_entrada))}</td><td>${permanencia(r)}</td><td>${botaoSaida(r)}</td></tr>`).join("") : '<tr><td colspan="5" class="vazio">Nenhum veículo no estacionamento.</td></tr>';
    if (consultaAtual) renderizarConsulta();
  }
  function renderizarConsulta() {
    if (!dadosProntos) return notificar("Atualize o painel para consultar a placa.", true);
    const c = R.consultarPlaca(estado, consultaAtual); $("resultado").hidden = false;
    $("resultado").innerHTML = `<div><strong>${escapar(placaFmt(consultaAtual))}</strong><p>${escapar(c.mensagem)}</p></div>${c.registro ? botaoSaida(c.registro) : c.permitido ? `<button type="button" class="botao primario pequeno" data-entrada="${escapar(consultaAtual)}">Registrar entrada</button>` : ""}`;
  }
  function renderizarHistorico() {
    if (!dadosProntos) return;
    const busca = textoBusca($("filtroHistorico").value), status = $("statusHistorico").value, data = $("dataHistorico").value;
    const lista = estado.registros.filter((r) => textoBusca(`${r.placa} ${placaFmt(r.placa)} ${r.nome_condutor}`).includes(busca) && (status === "todos" || (status === "abertos") === (r.data_hora_saida === null)) && (!data || R.dataLocal(r.data_hora_entrada) === data)).sort((a, b) => b.data_hora_entrada.localeCompare(a.data_hora_entrada));
    const paginas = Math.max(1, Math.ceil(lista.length / 10)); pagina = Math.min(pagina, paginas);
    $("registros").innerHTML = lista.slice((pagina - 1) * 10, pagina * 10).map((r) => `<tr><td><strong class="placa">${escapar(placaFmt(r.placa))}</strong><small class="celula-subtexto">${escapar(r.nome_condutor || "Não informado")}</small></td><td>${escapar(dataHora(r.data_hora_entrada))}</td><td>${escapar(dataHora(r.data_hora_saida))}</td><td>${permanencia(r)}</td><td>${escapar(r.operador_entrada)}<small class="celula-subtexto">Saída: ${escapar(r.operador_saida || "—")}</small></td><td>${r.data_hora_saida ? '<span class="etiqueta">Encerrado</span>' : botaoSaida(r)}</td></tr>`).join("") || '<tr><td colspan="6" class="vazio">Nenhum registro encontrado.</td></tr>';
    $("resumoRegistros").textContent = `${lista.length} registro(s) · Página ${pagina} de ${paginas}`; $("paginaAnterior").disabled = pagina <= 1; $("proximaPagina").disabled = pagina >= paginas; $("btnLiberar").disabled = !R.ativos(estado).length;
  }
  function renderizarGrafico(id, dias, chave, referencia = null) {
    const maior = Math.max(1, referencia || 0, ...dias.map((d) => d[chave] || 0));
    $(id).innerHTML = dias.map((d) => `<div class="barra-item"><span class="barra-dia">${d.nome.slice(0, 3)}</span><div class="barra-trilho"><span style="width:${d[chave] === null ? 0 : d[chave] / maior * 100}%"></span></div><strong>${d[chave] === null ? "—" : decimal(d[chave])}</strong></div>`).join("") + (referencia ? `<p class="texto-ajuda">Escala até ${decimal(maior)} veículos; capacidade atual: ${referencia}.</p>` : "");
    $(id).setAttribute("aria-label", dias.map((d) => `${d.nome}: ${decimal(d[chave])}`).join("; "));
  }
  function renderizarRelatorios() {
    if (!dadosProntos) return;
    const a = R.analisarPeriodo(estado, Number($("janelaRelatorio").value));
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
    $("resumoConferencia").textContent = `Monitoramento iniciado em ${dataHora(estado.configuracao.inicio_monitoramento)}. ${estado.dias_conferidos.length} dia(s) conferido(s) no seu histórico. Conferências salvas no PostgreSQL.`;
  }
  let pessoasServidor = [], cadastrosCarregados = false, carregandoCadastros = false;
  let erroCadastros = "", versaoConsultaCadastros = 0, versaoCadastroEditado = null, salvandoCadastro = false;
  async function carregarCadastros() {
    if (!logado || carregandoCadastros || salvandoCadastro) return;
    const consulta = ++versaoConsultaCadastros;
    carregandoCadastros = true; erroCadastros = ""; renderizarCadastros();
    try {
      const dados = await api("/api/pessoas");
      if (consulta !== versaoConsultaCadastros || !logado) return;
      if (!Array.isArray(dados.pessoas)) throw new Error("A API devolveu uma lista de pessoas inválida.");
      pessoasServidor = dados.pessoas; cadastrosCarregados = true;
    } catch (erro) {
      if (consulta !== versaoConsultaCadastros || !logado) return;
      erroCadastros = erro.message; cadastrosCarregados = false; pessoasServidor = [];
    } finally {
      if (consulta === versaoConsultaCadastros) { carregandoCadastros = false; renderizarCadastros(); }
    }
  }
  function receberPessoa(pessoa) {
    carregarPainel();
    if (!pessoa || !Number.isInteger(pessoa.id_usuario) || !Array.isArray(pessoa.veiculos)) throw new Error("Resposta inesperada. Atualize a lista para verificar se o cadastro foi salvo antes de tentar novamente.");
    pessoasServidor = pessoasServidor.filter((p) => p.id_usuario !== pessoa.id_usuario);
    pessoasServidor.push(pessoa);
    pessoasServidor.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
    cadastrosCarregados = true; erroCadastros = ""; renderizarCadastros();
  }
  function renderizarCadastros() {
    const indisponivel = !cadastrosCarregados || carregandoCadastros;
    $("btnNovoCadastro").disabled = indisponivel || salvandoCadastro;
    $("btnAtualizarCadastros").disabled = carregandoCadastros || salvandoCadastro;
    $("erroCadastros").textContent = erroCadastros;
    $("erroCadastros").hidden = !erroCadastros;
    for (const id of ["pessoasAtivas", "pessoasInativas", "veiculosCadastrados"]) $(id).textContent = "—";
    if (indisponivel) {
      $("contagemCadastros").textContent = carregandoCadastros ? "Consultando o PostgreSQL…" : "Clique em Atualizar lista para consultar o banco.";
      $("usuarios").innerHTML = '<tr><td colspan="4" class="vazio">' + (carregandoCadastros ? 'Carregando cadastros…' : 'Cadastros indisponíveis.') + '</td></tr>';
      return;
    }
    const busca = textoBusca($("filtroCadastros").value), status = $("statusCadastros").value;
    const ativos = pessoasServidor.filter((u) => u.ativo);
    $("pessoasAtivas").textContent = ativos.length;
    $("pessoasInativas").textContent = pessoasServidor.length - ativos.length;
    $("veiculosCadastrados").textContent = ativos.reduce((soma, u) => soma + u.veiculos.filter((v) => v.ativo).length, 0);
    const lista = pessoasServidor.filter((u) => (status === "todos" || u.ativo === (status === "ativos")) && textoBusca(`${u.nome} ${u.veiculos.map((v) => `${v.placa} ${placaFmt(v.placa)}`).join(" ")}`).includes(busca));
    $("contagemCadastros").textContent = `${lista.length} pessoa(s) nesta consulta · Dados do PostgreSQL.`;
    $("usuarios").innerHTML = lista.map((u) => {
      const placas = u.veiculos.map((v) => `<div class="veiculo-cadastrado"><span class="placa">${escapar(placaFmt(v.placa))}</span><span class="etiqueta ${v.ativo && u.ativo ? "verde" : "neutra"}">${v.ativo && u.ativo ? "Ativo" : "Inativo"}</span>${v.modelo ? `<small>${escapar(v.modelo)}</small>` : ""}</div>`).join("") || '<span class="texto-ajuda">Sem veículos vinculados</span>';
      const acoes = u.ativo ? `<div class="acoes"><button type="button" class="botao secundario pequeno" data-editar="${u.id_usuario}" ${salvandoCadastro ? "disabled" : ""}>Editar</button><button type="button" class="botao perigo-suave pequeno" data-arquivar="${u.id_usuario}" ${salvandoCadastro ? "disabled" : ""}>Inativar cadastro</button></div>` : '<span class="texto-ajuda">Histórico preservado</span>';
      return `<tr><td><strong>${escapar(u.nome)}</strong><small class="celula-subtexto">${escapar(u.cargo)}</small></td><td>${placas}</td><td><span class="etiqueta ${u.ativo ? "verde" : "neutra"}">${u.ativo ? "Ativo" : "Inativo"}</span></td><td>${acoes}</td></tr>`;
    }).join("") || '<tr><td colspan="4" class="vazio">Nenhuma pessoa corresponde aos filtros.</td></tr>';
  }
  function renderizar() {
    if (!dadosProntos) { renderizarCadastros(); indisponivel("Carregue os dados do estacionamento pelo botão Atualizar painel."); return; }
    $("dataAtual").textContent = new Intl.DateTimeFormat("pt-BR", { timeZone: R.FUSO, weekday: "long", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date());
    renderizarPainel(); renderizarHistorico(); renderizarRelatorios(); renderizarCadastros();
    if (!$("formConfiguracao").contains(document.activeElement)) { $("capacidadeTotal").value = estado.configuracao.capacidade_total; capacidadeExibida = estado.configuracao.capacidade_total; $("limiarAlerta").textContent = `${estado.configuracao.capacidade_total - Math.ceil(estado.configuracao.capacidade_total * estado.configuracao.limiar_alerta / 100)} vagas livres ou menos`; }
    if ($("entradaDialog").open) atualizarEntrada();
  }
  function atualizarEntrada() {
    if (!dadosProntos) { $("confirmarEntrada").disabled = true; $("autorizacaoEntrada").textContent = "Atualize o painel antes de registrar."; return; }
    const c = R.consultarPlaca(estado, $("placaEntrada").value); $("autorizacaoEntrada").textContent = c.mensagem; $("autorizacaoEntrada").classList.toggle("erro", !c.permitido); $("confirmarEntrada").disabled = !c.permitido || salvandoMovimento;
    if (!c.usuario && $("nomeEntrada").readOnly) $("nomeEntrada").value = "";
    $("nomeEntrada").readOnly = Boolean(c.usuario); if (c.usuario) $("nomeEntrada").value = c.usuario.nome;
  }
  function abrirEntrada(placa = "") { if (!dadosProntos) return notificar("Atualize o painel.", true); $("formEntrada").reset(); $("placaEntrada").value = placaDigitada(placa); $("erroEntrada").textContent = ""; atualizarEntrada(); abrir("entradaDialog"); }
  function saida(id) {
    const r = estado.registros.find((r) => r.id_registro === id && !r.data_hora_saida); if (!r) return notificar("Este acesso já foi encerrado.", true);
    confirmar("Registrar saída", `Confirmar a saída de ${placaFmt(r.placa)}? O acesso será encerrado e uma unidade de capacidade ficará disponível.`, () => gravarMovimento(`/api/saidas/${id}`, {}));
  }
  function atualizarQuantidadeVeiculos() {
    const quantidade = $("veiculosFormulario").children.length;
    $("quantidadeVeiculosFormulario").textContent = `${quantidade} veículo(s) neste cadastro. Até 10 veículos por cadastro nesta versão.`;
    $("btnAdicionarVeiculo").disabled = quantidade >= 10;
  }
  function adicionarVeiculo(v = {}) {
    if ($("veiculosFormulario").children.length >= 10) return notificar("Limite de dez veículos por cadastro nesta versão.", true);
    const linha = document.createElement("div"); linha.className = "veiculo-linha"; const id = idNovo();
    linha.innerHTML = `<div><label for="placa-${escapar(id)}">Placa *</label><input id="placa-${escapar(id)}" class="placa-input" data-campo="placa" maxlength="9" required placeholder="ABC-1234 ou ABC1D23" value="${escapar(placaDigitada(v.placa || ""))}"></div><div><label for="modelo-${escapar(id)}">Modelo (opcional)</label><input id="modelo-${escapar(id)}" data-campo="modelo" maxlength="100" value="${escapar(v.modelo || "")}"></div><button type="button" class="botao perigo-suave remover-veiculo" aria-label="Remover este veículo">×</button>`;
    $("veiculosFormulario").appendChild(linha);
    atualizarQuantidadeVeiculos();
  }
  function abrirCadastro(id = null) {
    if (!logado || !cadastrosCarregados || salvandoCadastro) return;
    const u = id === null ? null : pessoasServidor.find((p) => p.id_usuario === Number(id) && p.ativo);
    if (id !== null && !u) return notificar("Cadastro indisponível. Atualize a lista.", true);
    editando = u?.id_usuario ?? null; versaoCadastroEditado = u?.versao ?? null;
    $("formCadastro").reset(); $("veiculosFormulario").replaceChildren(); $("erroCadastro").textContent = "";
    $("tituloCadastro").textContent = u ? "Editar pessoa e veículos" : "Cadastrar pessoa";
    if (u) { $("nomeCondutor").value = u.nome; $("cargoCondutor").value = u.cargo; $("cpfCondutor").value = cpfFmt(u.cpf); u.veiculos.filter((v) => v.ativo).forEach(adicionarVeiculo); }
    if (!$("veiculosFormulario").children.length) adicionarVeiculo();
    abrir("cadastroDialog");
  }
  async function salvarCadastroServidor(e) {
    e.preventDefault();
    if (salvandoCadastro || !logado) return;
    if (!$("formCadastro").reportValidity()) return;
    const dados = { nome: $("nomeCondutor").value, cargo: $("cargoCondutor").value, cpf: $("cpfCondutor").value,
      veiculos: todos(".veiculo-linha", $("veiculosFormulario")).map((l) => ({ placa: l.querySelector('[data-campo="placa"]').value, modelo: l.querySelector('[data-campo="modelo"]').value })) };
    if (editando !== null) dados.versao = versaoCadastroEditado;
    salvandoCadastro = true; $("salvarCadastro").disabled = true; $("erroCadastro").textContent = ""; renderizarCadastros();
    const consulta = ++versaoConsultaCadastros;
    carregandoCadastros = false;
    try {
      const resposta = await api(editando === null ? "/api/pessoas" : `/api/pessoas/${editando}`, dados, editando === null ? "POST" : "PUT");
      if (!logado || consulta !== versaoConsultaCadastros) return;
      receberPessoa(resposta.pessoa); $("cadastroDialog").close(); notificar(resposta.mensagem);
    } catch (erro) { $("erroCadastro").textContent = erro.message + (!erro.status ? " Atualize a lista antes de reenviar para conferir se a gravação foi concluída." : ""); }
    finally { salvandoCadastro = false; $("salvarCadastro").disabled = false; renderizarCadastros(); }
  }
  function confirmarInativacao(id) {
    const u = pessoasServidor.find((p) => p.id_usuario === Number(id) && p.ativo);
    if (!u || salvandoCadastro) return;
    confirmar("Inativar pessoa e veículos", `Inativar ${u.nome} e todos os veículos vinculados? O cadastro e o histórico serão preservados no PostgreSQL.`, async () => {
      if (salvandoCadastro) throw new Error("Aguarde a operação em andamento.");
      salvandoCadastro = true; renderizarCadastros();
      const consulta = ++versaoConsultaCadastros; carregandoCadastros = false;
      try {
        const resposta = await api(`/api/pessoas/${u.id_usuario}/inativar`, { versao: u.versao });
        if (logado && consulta === versaoConsultaCadastros) receberPessoa(resposta.pessoa);
      } finally { salvandoCadastro = false; renderizarCadastros(); }
    });
  }
  function mostrarSistema() { $("nomeOperador").textContent = operadorAtual?.nome || "Operador"; $("loginOperador").textContent = operadorAtual?.login || ""; $("loginTela").hidden = logado; $("sistema").hidden = !logado; if (logado) renderizar(); }
  function iniciar() {
    instalarMascaras();
    estado = null; mostrarSistema();
    $("formLogin").addEventListener("submit", autenticar);
    $("mostrarSenha").addEventListener("click", () => { const visivel = $("senha").type === "password"; $("senha").type = visivel ? "text" : "password"; $("mostrarSenha").textContent = visivel ? "Ocultar" : "Mostrar"; $("mostrarSenha").setAttribute("aria-label", `${visivel ? "Ocultar" : "Mostrar"} senha`); $("mostrarSenha").setAttribute("aria-pressed", String(visivel)); });
    $("btnSair").addEventListener("click", encerrarSessao);
    todos("[data-view]").forEach((b) => b.addEventListener("click", () => mudarPagina(b.dataset.view))); $("marcaPainel").addEventListener("click", (e) => { e.preventDefault(); mudarPagina("painel"); });
    todos("dialog").forEach((d) => d.addEventListener("close", () => { const f = focos.get(d.id); if (f?.isConnected && !f.disabled) f.focus(); }));
    document.addEventListener("click", (e) => {
      const b = e.target.closest("button"); if (!b) return;
      if (b.dataset.close) $(b.dataset.close).close();
      if (b.dataset.action === "nova-entrada") abrirEntrada();
      if (b.dataset.entrada) abrirEntrada(b.dataset.entrada);
      if (b.dataset.saida) saida(b.dataset.saida);
      if (b.dataset.editar) abrirCadastro(b.dataset.editar);
      if (b.dataset.arquivar) confirmarInativacao(b.dataset.arquivar);
      if (b.classList.contains("remover-veiculo")) { if ($("veiculosFormulario").children.length === 1) notificar("Mantenha pelo menos um veículo.", true); else { b.closest(".veiculo-linha").remove(); atualizarQuantidadeVeiculos(); } }
    });
    $("formPesquisa").addEventListener("submit", (e) => { e.preventDefault(); consultaAtual = R.normalizarPlaca($("campoPesquisa").value); if (!consultaAtual) $("resultado").hidden = true; else renderizarConsulta(); });
    $("placaEntrada").addEventListener("input", () => { if ($("nomeEntrada").readOnly) $("nomeEntrada").value = ""; atualizarEntrada(); $("erroEntrada").textContent = ""; });
    $("formEntrada").addEventListener("submit", async (e) => { e.preventDefault(); if (salvandoMovimento) return; $("erroEntrada").textContent = ""; try { await gravarMovimento("/api/entradas", {placa: $("placaEntrada").value, nome_condutor: $("nomeEntrada").value}); $("entradaDialog").close(); notificar("Entrada registrada no PostgreSQL."); } catch (err) { $("erroEntrada").textContent = err.message; } finally { atualizarEntrada(); } });
    $("formConfirmar").addEventListener("submit", async (e) => { e.preventDefault(); if (!acaoConfirmacao || $("aceitarConfirmacao").disabled) return; $("aceitarConfirmacao").disabled = true; try { await acaoConfirmacao(); acaoConfirmacao = null; $("confirmarDialog").close(); notificar("Operação concluída."); } catch (err) { $("erroConfirmar").textContent = err.message; } finally { $("aceitarConfirmacao").disabled = false; } });
    $("cancelarConfirmacao").addEventListener("click", () => $("confirmarDialog").close());

    ["filtroHistorico", "statusHistorico", "dataHistorico"].forEach((id) => $(id).addEventListener("input", () => { pagina = 1; renderizarHistorico(); }));
    $("paginaAnterior").addEventListener("click", () => { pagina--; renderizarHistorico(); }); $("proximaPagina").addEventListener("click", () => { pagina++; renderizarHistorico(); });
    $("janelaRelatorio").addEventListener("change", renderizarRelatorios);
    $("formConferencia").addEventListener("submit", (e) => { e.preventDefault(); const data = $("dataConferencia").value; try { R.conferirDia(R.clone(estado), data, agora()); confirmar("Conferir dia completo", `Você conferiu todas as movimentações de ${dataCurta(data)}? Dias sem movimento confirmado contam como zero. Esta ação inclui a data nas médias.`, () => gravarMovimento("/api/dias-conferidos", {data})); } catch (err) { notificar(err.message, true); } });
    $("btnNovoCadastro").addEventListener("click", () => abrirCadastro()); $("btnAdicionarVeiculo").addEventListener("click", () => adicionarVeiculo()); $("filtroCadastros").addEventListener("input", renderizarCadastros);
    $("statusCadastros").addEventListener("change", renderizarCadastros);
    $("formCadastro").addEventListener("submit", salvarCadastroServidor);
    $("btnAtualizarCadastros").addEventListener("click", carregarCadastros);
    $("formConfiguracao").addEventListener("submit", async (e) => { e.preventDefault(); $("erroConfiguracao").textContent = ""; try { await gravarMovimento("/api/configuracao", {capacidade_total: Number($("capacidadeTotal").value), capacidade_anterior: capacidadeExibida}, "PUT"); notificar("Capacidade salva no PostgreSQL."); } catch (err) { $("erroConfiguracao").textContent = err.message; } });



    $("btnAtualizarPainel").addEventListener("click", () => { if (!salvandoMovimento) carregarPainel(); });
    setInterval(() => { if (logado && !document.hidden && !salvandoMovimento && !carregandoPainel && !document.querySelector("dialog[open]")) carregarPainel(); }, 15000);
    const conferir = () => { if (logado && !ocupadoAutenticacao && !document.hidden) verificarSessao().catch(() => {}); };
    setInterval(conferir, 60000);
    window.addEventListener("focus", conferir);
    document.addEventListener("visibilitychange", conferir);
    ocupadoAutenticacao = true;
    atualizarBotoesAutenticacao();
    verificarSessao(true).catch(() => {}).finally(() => { ocupadoAutenticacao = false; atualizarBotoesAutenticacao(); });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", iniciar); else iniciar();
})();