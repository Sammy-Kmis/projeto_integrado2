"""Pessoas e seus veículos: persistência transacional no PostgreSQL."""
import hashlib
import json
import re
from contextlib import closing, contextmanager

from flask import Blueprint, jsonify, request, session
from pg8000.dbapi import IntegrityError
from db import conectar

cadastros_bp = Blueprint("cadastros", __name__)
CARGOS = {"Professor(a)", "Funcionário(a)", "Aluno(a)", "Visitante"}


class ErroCadastro(Exception):
    def __init__(self, mensagem, status=400):
        super().__init__(mensagem)
        self.status = status


@cadastros_bp.errorhandler(ErroCadastro)
def responder_erro(erro):
    return jsonify({"mensagem": str(erro)}), erro.status


@cadastros_bp.errorhandler(IntegrityError)
def responder_conflito(erro):
    # A transação já foi desfeita: não devolvemos SQL ou dados internos.
    return jsonify({"mensagem": "Não foi possível salvar. CPF ou placa já cadastrados, ou vínculo inválido. Atualize a lista e confira os dados."}), 409


@contextmanager
def transacao():
    id_operador = session.get("id_operador")
    if not isinstance(id_operador, int):
        raise ErroCadastro("Faça login para continuar.", 401)
    with closing(conectar()) as conexao:
        try:
            with closing(conexao.cursor()) as cursor:
                cursor.execute("SELECT id_operador FROM operador WHERE id_operador = %s AND ativo = TRUE", (id_operador,))
                if cursor.fetchone() is None:
                    session.clear()
                    raise ErroCadastro("Sessão inválida. Entre novamente.", 401)
                yield cursor
            conexao.commit()
        except Exception:
            conexao.rollback()
            raise


def validar_cpf(valor):
    if valor is None or (isinstance(valor, str) and not valor.strip()):
        return None
    if not isinstance(valor, str) or not re.fullmatch(r"[0-9.\-\s]+", valor):
        raise ErroCadastro("CPF inválido.")
    cpf = re.sub(r"[.\-\s]", "", valor)
    if not re.fullmatch(r"[0-9]{11}", cpf) or len(set(cpf)) == 1:
        raise ErroCadastro("CPF inválido.")
    for tamanho in (9, 10):
        soma = sum(int(cpf[i]) * (tamanho + 1 - i) for i in range(tamanho))
        if (soma * 10) % 11 % 10 != int(cpf[tamanho]):
            raise ErroCadastro("CPF inválido.")
    return cpf


def validar_dados(dados):
    if not isinstance(dados, dict):
        raise ErroCadastro("Envie um objeto JSON válido.")
    nome, cargo = dados.get("nome"), dados.get("cargo")
    if not isinstance(nome, str) or not 2 <= len(nome.strip()) <= 100:
        raise ErroCadastro("Informe um nome entre 2 e 100 caracteres.")
    if not isinstance(cargo, str) or cargo not in CARGOS:
        raise ErroCadastro("Selecione um vínculo válido.")
    cpf = validar_cpf(dados.get("cpf"))
    veiculos = dados.get("veiculos")
    if not isinstance(veiculos, list) or not 1 <= len(veiculos) <= 10:
        raise ErroCadastro("Informe de 1 a 10 veículos por cadastro.")
    lista = []
    for veiculo in veiculos:
        if not isinstance(veiculo, dict) or not isinstance(veiculo.get("placa"), str):
            raise ErroCadastro("Informe uma placa válida.")
        placa = re.sub(r"[\s-]", "", veiculo["placa"].upper())
        if not re.fullmatch(r"[A-Z]{3}[0-9][A-Z0-9][0-9]{2}", placa):
            raise ErroCadastro("Placa inválida. Use ABC-1234 ou ABC1D23.")
        modelo = veiculo.get("modelo", "")
        if modelo is None:
            modelo = ""
        if not isinstance(modelo, str) or len(modelo.strip()) > 100:
            raise ErroCadastro("O modelo deve ter até 100 caracteres.")
        lista.append({"placa": placa, "modelo": modelo.strip()})
    if len({v["placa"] for v in lista}) != len(lista):
        raise ErroCadastro("Não repita a mesma placa no cadastro.")
    return nome.strip(), cpf, cargo, sorted(lista, key=lambda v: v["placa"])


def versao_pessoa(pessoa):
    dados = {k: pessoa[k] for k in ("id_usuario", "nome", "cpf", "cargo", "ativo")}
    dados["veiculos"] = [{k: v[k] for k in ("placa", "modelo", "ativo")} for v in sorted(pessoa["veiculos"], key=lambda v: v["placa"])]
    return hashlib.sha256(json.dumps(dados, sort_keys=True, ensure_ascii=False).encode()).hexdigest()


def ler_pessoas(cursor, id_usuario=None):
    sql = """
        SELECT u.id_usuario, u.nome, u.cpf, u.cargo, u.ativo,
               v.placa, v.modelo, v.ativo,
               EXISTS (SELECT 1 FROM registro_acesso r
                       WHERE r.placa = v.placa AND r.data_hora_saida IS NULL)
        FROM usuario u LEFT JOIN veiculo v ON v.id_usuario = u.id_usuario
    """
    parametros = ()
    if id_usuario is not None:
        sql += " WHERE u.id_usuario = %s"
        parametros = (id_usuario,)
    sql += " ORDER BY u.nome, u.id_usuario, v.placa"
    cursor.execute(sql, parametros)
    pessoas = {}
    for linha in cursor.fetchall():
        identificador, nome, cpf, cargo, ativo, placa, modelo, ativo_veiculo, presente = linha
        if identificador not in pessoas:
            pessoas[identificador] = {"id_usuario": identificador, "nome": nome,
                "cpf": cpf or "", "cargo": cargo or "", "ativo": ativo, "veiculos": []}
        if placa is not None:
            pessoas[identificador]["veiculos"].append({"placa": placa, "modelo": modelo or "", "ativo": ativo_veiculo, "presente": presente})
    for pessoa in pessoas.values():
        pessoa["versao"] = versao_pessoa(pessoa)
    return list(pessoas.values())


def bloquear_pessoa(cursor, id_usuario):
    cursor.execute("SELECT ativo FROM usuario WHERE id_usuario = %s FOR UPDATE", (id_usuario,))
    linha = cursor.fetchone()
    if linha is None:
        raise ErroCadastro("Pessoa não encontrada.", 404)
    if not linha[0]:
        raise ErroCadastro("Este cadastro está inativo.", 409)
    # Mantém uma ordem estável ao bloquear os veículos desta pessoa.
    cursor.execute("SELECT placa FROM veiculo WHERE id_usuario = %s ORDER BY placa FOR UPDATE", (id_usuario,))
    cursor.fetchall()


def conferir_versao(cursor, id_usuario, dados):
    atual = ler_pessoas(cursor, id_usuario)[0]
    if not isinstance(dados, dict) or dados.get("versao") != atual["versao"]:
        raise ErroCadastro("O cadastro mudou. Atualize a lista e reabra o formulário antes de salvar.", 409)
    return atual


def salvar_veiculos(cursor, id_usuario, lista):
    # Bloqueia veículos existentes antes de conferir vínculos e acessos.
    placas = [v["placa"] for v in lista]
    placeholders = ", ".join(["%s"] * len(placas))
    cursor.execute(f"SELECT placa, id_usuario FROM veiculo WHERE placa IN ({placeholders}) ORDER BY placa FOR UPDATE", tuple(placas))
    existentes = dict(cursor.fetchall())
    for placa, dono in existentes.items():
        if dono is not None and dono != id_usuario:
            raise ErroCadastro(f"A placa {placa} já pertence a outra pessoa, inclusive se o cadastro estiver inativo.", 409)
        if dono is None:
            cursor.execute("SELECT 1 FROM registro_acesso WHERE placa = %s AND data_hora_saida IS NULL", (placa,))
            if cursor.fetchone():
                raise ErroCadastro("Registre a saída antes de vincular um veículo que está no estacionamento.", 409)
    cursor.execute(f"""
        SELECT 1 FROM registro_acesso r JOIN veiculo v ON v.placa = r.placa
        WHERE v.id_usuario = %s AND r.data_hora_saida IS NULL
          AND v.placa NOT IN ({placeholders}) LIMIT 1
    """, (id_usuario, *placas))
    if cursor.fetchone():
        raise ErroCadastro("Registre a saída antes de remover a placa de um veículo presente.", 409)
    cursor.execute("UPDATE veiculo SET ativo = FALSE WHERE id_usuario = %s", (id_usuario,))
    for veiculo in lista:
        placa, modelo = veiculo["placa"], veiculo["modelo"]
        if placa in existentes:
            cursor.execute("UPDATE veiculo SET id_usuario = %s, modelo = %s, ativo = TRUE WHERE placa = %s", (id_usuario, modelo, placa))
        else:
            cursor.execute("INSERT INTO veiculo (placa, id_usuario, modelo) VALUES (%s, %s, %s)", (placa, id_usuario, modelo))


@cadastros_bp.get("/api/pessoas")
def listar_pessoas():
    with transacao() as cursor:
        pessoas = ler_pessoas(cursor)
    return jsonify({"pessoas": pessoas})


@cadastros_bp.post("/api/pessoas")
def criar_pessoa():
    with transacao() as cursor:
        nome, cpf, cargo, veiculos = validar_dados(request.get_json(silent=True))
        cursor.execute("INSERT INTO usuario (nome, cpf, cargo) VALUES (%s, %s, %s) RETURNING id_usuario", (nome, cpf, cargo))
        id_usuario = cursor.fetchone()[0]
        salvar_veiculos(cursor, id_usuario, veiculos)
        pessoa = ler_pessoas(cursor, id_usuario)[0]
    return jsonify({"mensagem": "Pessoa e veículos salvos no PostgreSQL.", "pessoa": pessoa}), 201


@cadastros_bp.put("/api/pessoas/<int:id_usuario>")
def editar_pessoa(id_usuario):
    with transacao() as cursor:
        dados = request.get_json(silent=True)
        nome, cpf, cargo, veiculos = validar_dados(dados)
        bloquear_pessoa(cursor, id_usuario)
        conferir_versao(cursor, id_usuario, dados)
        cursor.execute("UPDATE usuario SET nome = %s, cpf = %s, cargo = %s WHERE id_usuario = %s", (nome, cpf, cargo, id_usuario))
        salvar_veiculos(cursor, id_usuario, veiculos)
        pessoa = ler_pessoas(cursor, id_usuario)[0]
    return jsonify({"mensagem": "Cadastro atualizado no PostgreSQL.", "pessoa": pessoa})


@cadastros_bp.post("/api/pessoas/<int:id_usuario>/inativar")
def inativar_pessoa(id_usuario):
    with transacao() as cursor:
        bloquear_pessoa(cursor, id_usuario)
        conferir_versao(cursor, id_usuario, request.get_json(silent=True))
        cursor.execute("""
            SELECT 1 FROM registro_acesso r
            WHERE r.data_hora_saida IS NULL AND
              (r.id_usuario = %s OR r.placa IN (SELECT placa FROM veiculo WHERE id_usuario = %s))
            LIMIT 1
        """, (id_usuario, id_usuario))
        if cursor.fetchone():
            raise ErroCadastro("Registre a saída de todos os veículos vinculados antes de inativar a pessoa.", 409)
        cursor.execute("UPDATE veiculo SET ativo = FALSE WHERE id_usuario = %s", (id_usuario,))
        cursor.execute("UPDATE usuario SET ativo = FALSE WHERE id_usuario = %s", (id_usuario,))
        pessoa = ler_pessoas(cursor, id_usuario)[0]
    return jsonify({"mensagem": "Pessoa e veículos inativados. Histórico preservado.", "pessoa": pessoa})