"""Capacidade, acessos e dias conferidos. Usa as tabelas existentes, sem seeds."""
import re
from datetime import date
from flask import Blueprint, jsonify, request, session
from pg8000.dbapi import IntegrityError
from cadastros import transacao, ErroCadastro

movimentacoes_bp = Blueprint("movimentacoes", __name__)


@movimentacoes_bp.errorhandler(ErroCadastro)
def erro_validacao(erro):
    return jsonify(mensagem=str(erro)), erro.status


@movimentacoes_bp.errorhandler(IntegrityError)
def erro_conflito(erro):
    return jsonify(mensagem="Os dados mudaram ou a placa já tem uma entrada aberta. Atualize o painel e confira o histórico."), 409


def objeto_json():
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        raise ErroCadastro("Envie um objeto JSON válido.")
    return dados


def configuracao(cursor, escrita=False):
    # Todas as entradas, saídas e alterações de capacidade bloqueiam esta linha.
    # O bloqueio dura até o commit/rollback de transacao().
    cursor.execute("""SELECT capacidade_total, limiar_alerta, inicio_monitoramento
                      FROM estacionamento WHERE id_estacionamento = 1 """
                   + ("FOR UPDATE" if escrita else "FOR SHARE"))
    linha = cursor.fetchone()
    if linha is None:
        raise ErroCadastro("Cadastre a capacidade do estacionamento no banco antes de continuar.", 409)
    return dict(zip(("capacidade_total", "limiar_alerta", "inicio_monitoramento"), linha))


def iso(valor):
    return valor.isoformat() if hasattr(valor, "isoformat") else valor


@movimentacoes_bp.get("/api/painel")
def painel():
    with transacao() as cursor:
        config = configuracao(cursor)
        config["inicio_monitoramento"] = iso(config["inicio_monitoramento"])
        cursor.execute("""SELECT r.id_registro, r.placa, r.id_usuario, r.nome_condutor,
                          r.id_operador, r.id_operador_saida, r.data_hora_entrada,
                          r.data_hora_saida, e.nome, s.nome
                          FROM registro_acesso r
                          JOIN operador e ON e.id_operador = r.id_operador
                          LEFT JOIN operador s ON s.id_operador = r.id_operador_saida
                          WHERE r.id_estacionamento = 1 ORDER BY r.id_registro""")
        chaves = ("id_registro", "placa", "id_usuario", "nome_condutor", "id_operador",
                  "id_operador_saida", "data_hora_entrada", "data_hora_saida",
                  "operador_entrada", "operador_saida")
        registros = [dict(zip(chaves, (iso(v) for v in linha))) for linha in cursor.fetchall()]
        cursor.execute("SELECT id_usuario, nome, ativo FROM usuario ORDER BY id_usuario")
        usuarios = [dict(zip(("id_usuario", "nome", "ativo"), linha)) for linha in cursor.fetchall()]
        cursor.execute("SELECT placa, id_usuario, ativo FROM veiculo ORDER BY placa")
        veiculos = [dict(zip(("placa", "id_usuario", "ativo"), linha)) for linha in cursor.fetchall()]
        cursor.execute("SELECT data, id_operador, conferido_em FROM dia_conferido ORDER BY data")
        dias = [dict(zip(("data", "id_operador", "conferido_em"), (iso(v) for v in linha))) for linha in cursor.fetchall()]
    return jsonify(configuracao=config, registros=registros, usuarios=usuarios,
                   veiculos=veiculos, dias_conferidos=dias)


@movimentacoes_bp.post("/api/entradas")
def entrada():
    dados = objeto_json()
    placa = dados.get("placa")
    if not isinstance(placa, str):
        raise ErroCadastro("Informe a placa.")
    placa = re.sub(r"[\s-]", "", placa.upper())
    if not re.fullmatch(r"[A-Z]{3}[0-9][A-Z0-9][0-9]{2}", placa):
        raise ErroCadastro("Placa inválida. Use ABC-1234 ou ABC1D23.")
    nome = dados.get("nome_condutor", "")
    if not isinstance(nome, str) or len(nome.strip()) > 100:
        raise ErroCadastro("A identificação deve ter até 100 caracteres.")
    nome = nome.strip()
    with transacao() as cursor:
        config = configuracao(cursor, escrita=True)
        cursor.execute("SELECT 1 FROM registro_acesso WHERE placa = %s AND data_hora_saida IS NULL", (placa,))
        if cursor.fetchone():
            raise ErroCadastro("Este veículo já está no estacionamento.", 409)
        cursor.execute("SELECT COUNT(*) FROM registro_acesso WHERE id_estacionamento = 1 AND data_hora_saida IS NULL")
        if cursor.fetchone()[0] >= config["capacidade_total"]:
            raise ErroCadastro("Estacionamento lotado. Aguarde a saída de um veículo.", 409)
        # Mesmo ordenamento do cadastro: pessoa antes do veículo.
        cursor.execute("SELECT id_usuario FROM veiculo WHERE placa = %s", (placa,))
        anterior = cursor.fetchone()
        dono = anterior[0] if anterior else None
        pessoa = None
        if dono is not None:
            cursor.execute("SELECT nome, ativo FROM usuario WHERE id_usuario = %s FOR UPDATE", (dono,))
            pessoa = cursor.fetchone()
        cursor.execute("SELECT id_usuario, ativo FROM veiculo WHERE placa = %s FOR UPDATE", (placa,))
        veiculo = cursor.fetchone()
        if veiculo and veiculo[0] != dono:
            raise ErroCadastro("O vínculo da placa mudou. Atualize e tente novamente.", 409)
        if veiculo and not veiculo[1]:
            raise ErroCadastro("O veículo está inativo.", 409)
        if dono is not None and (not pessoa or not pessoa[1]):
            raise ErroCadastro("A pessoa vinculada está inativa.", 409)
        if pessoa:
            nome = nome or pessoa[0]
        if not nome:
            raise ErroCadastro("Informe o nome do condutor para uma placa sem cadastro.")
        if not veiculo:
            cursor.execute("INSERT INTO veiculo (placa) VALUES (%s)", (placa,))
        cursor.execute("""INSERT INTO registro_acesso
                          (placa, id_usuario, nome_condutor, id_operador, data_hora_entrada)
                          VALUES (%s, %s, %s, %s, clock_timestamp()) RETURNING id_registro""",
                       (placa, dono, nome, session["id_operador"]))
        identificador = cursor.fetchone()[0]
    return jsonify(mensagem="Entrada registrada no PostgreSQL.", id_registro=identificador), 201


@movimentacoes_bp.post("/api/saidas/<int:id_registro>")
def saida(id_registro):
    objeto_json()
    with transacao() as cursor:
        configuracao(cursor, escrita=True)
        cursor.execute("SELECT data_hora_saida FROM registro_acesso WHERE id_registro = %s AND id_estacionamento = 1 FOR UPDATE", (id_registro,))
        registro = cursor.fetchone()
        if registro is None:
            raise ErroCadastro("Acesso não encontrado.", 404)
        if registro[0] is not None:
            return jsonify(mensagem="Este acesso já foi encerrado.", ja_encerrado=True)
        cursor.execute("""UPDATE registro_acesso SET data_hora_saida = clock_timestamp(),
                          id_operador_saida = %s WHERE id_registro = %s""",
                       (session["id_operador"], id_registro))
    return jsonify(mensagem="Saída registrada. Histórico preservado.")


@movimentacoes_bp.put("/api/configuracao")
def salvar_capacidade():
    dados = objeto_json()
    capacidade = dados.get("capacidade_total")
    if type(capacidade) is not int or not 1 <= capacidade <= 10000:
        raise ErroCadastro("Informe uma capacidade inteira de 1 a 10.000.")
    with transacao() as cursor:
        config = configuracao(cursor, escrita=True)
        if dados.get("capacidade_anterior") != config["capacidade_total"]:
            raise ErroCadastro("A capacidade mudou. Atualize o painel antes de salvar.", 409)
        cursor.execute("SELECT COUNT(*) FROM registro_acesso WHERE id_estacionamento = 1 AND data_hora_saida IS NULL")
        if capacidade < cursor.fetchone()[0]:
            raise ErroCadastro("A capacidade não pode ser menor que o número de veículos presentes.", 409)
        cursor.execute("UPDATE estacionamento SET capacidade_total = %s WHERE id_estacionamento = 1", (capacidade,))
    return jsonify(mensagem="Capacidade salva no PostgreSQL.")


@movimentacoes_bp.post("/api/dias-conferidos")
def conferir_dia():
    valor = objeto_json().get("data")
    try:
        if not isinstance(valor, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", valor):
            raise ValueError()
        date.fromisoformat(valor)
    except ValueError:
        raise ErroCadastro("Informe uma data válida.") from None
    with transacao() as cursor:
        configuracao(cursor, escrita=True)
        cursor.execute("""SELECT %s::date > (inicio_monitoramento AT TIME ZONE 'America/Sao_Paulo')::date
                          AND %s::date < (clock_timestamp() AT TIME ZONE 'America/Sao_Paulo')::date
                          FROM estacionamento WHERE id_estacionamento = 1""", (valor, valor))
        if not cursor.fetchone()[0]:
            raise ErroCadastro("Escolha um dia completo após o início do monitoramento e anterior a hoje.")
        cursor.execute("""INSERT INTO dia_conferido(data, id_operador)
                          VALUES (%s, %s) ON CONFLICT (data) DO NOTHING
                          RETURNING data""", (valor, session["id_operador"]))
        if cursor.fetchone() is None:
            raise ErroCadastro("Este dia já foi conferido. Atualize o painel.", 409)
    return jsonify(mensagem="Dia conferido e salvo no PostgreSQL.")