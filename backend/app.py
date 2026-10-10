"""API de autenticação e frontend. Execute: python backend/app.py."""
import os
from contextlib import closing
from datetime import timedelta
from pathlib import Path

from flask import Flask, abort, jsonify, request, send_from_directory, session
from pg8000.dbapi import Error
from werkzeug.security import check_password_hash

from db import conectar  # db.py também carrega o arquivo backend/.env.
from cadastros import cadastros_bp
from movimentacoes import movimentacoes_bp

PASTA_FRONTEND = Path(__file__).resolve().parent.parent / "frontend"
app = Flask(__name__, static_folder=None)
app.json.ensure_ascii = False
app.register_blueprint(cadastros_bp)
app.register_blueprint(movimentacoes_bp)
chave = os.environ.get("SECRET_KEY")
if not chave or len(chave) < 32:
    raise RuntimeError("Configure SECRET_KEY no arquivo backend/.env (mínimo de 32 caracteres).")
app.config.update(
    SECRET_KEY=chave,
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Strict",
    PERMANENT_SESSION_LIFETIME=timedelta(hours=8),
    SESSION_REFRESH_EACH_REQUEST=False,
    MAX_CONTENT_LENGTH=8192,
)


@app.before_request
def verificar_origem():
    if request.method in {"POST", "PUT", "PATCH", "DELETE"}:
        origem = request.headers.get("Origin")
        if origem and origem != request.host_url.rstrip("/"):
            return jsonify({"mensagem": "Origem da requisição não permitida."}), 403
        if request.path.startswith("/api/") and not request.is_json:
            return jsonify({"mensagem": "Envie os dados como application/json."}), 415


@app.after_request
def configurar_resposta(resposta):
    if request.path.startswith("/api/"):
        resposta.headers["Cache-Control"] = "no-store"
    resposta.headers["X-Content-Type-Options"] = "nosniff"
    return resposta


@app.errorhandler(Error)
def tratar_erro_banco(erro):
    app.logger.exception("Falha na operação com o PostgreSQL.")
    return jsonify({"status": "erro", "mensagem": "Não foi possível concluir a operação no banco."}), 503


@app.get("/")
@app.get("/index.html")
def pagina_inicial():
    return send_from_directory(PASTA_FRONTEND, "index.html", max_age=0)


@app.get("/<arquivo>")
def arquivo_frontend(arquivo):
    # Lista explícita: não disponibiliza .env, código Python ou outros arquivos.
    if arquivo not in {"style.css", "script.js"}:
        abort(404)
    return send_from_directory(PASTA_FRONTEND, arquivo, max_age=0)


@app.get("/api/status")
def verificar_status():
    with closing(conectar()) as conexao:
        with closing(conexao.cursor()) as cursor:
            cursor.execute("SELECT 1;")
            cursor.fetchone()
    return jsonify({"status": "ok", "mensagem": "API funcionando e PostgreSQL conectado."})


def dados_operador(operador):
    return {"id_operador": operador[0], "nome": operador[1], "login": operador[2]}


@app.post("/api/login")
def entrar():
    dados = request.get_json(silent=True)
    if not isinstance(dados, dict):
        return jsonify({"mensagem": "Envie um objeto JSON válido."}), 400
    login, senha = dados.get("login"), dados.get("senha")
    if not isinstance(login, str) or not isinstance(senha, str):
        return jsonify({"mensagem": "Informe login e senha."}), 400
    login = login.strip().lower()
    if not login or len(login) > 50 or not 1 <= len(senha) <= 128:
        return jsonify({"mensagem": "Login ou senha inválidos."}), 400
    session.clear()
    with closing(conectar()) as conexao:
        with closing(conexao.cursor()) as cursor:
            cursor.execute("""
                SELECT id_operador, nome, login, senha_hash, ativo
                FROM operador WHERE login = %s;
            """, (login,))
            operador = cursor.fetchone()
    if operador is None or not operador[4] or not check_password_hash(operador[3], senha):
        return jsonify({"mensagem": "Login ou senha incorretos."}), 401
    session["id_operador"] = operador[0]
    session.permanent = True
    return jsonify({"mensagem": "Login realizado com sucesso.", "operador": dados_operador(operador)})


@app.get("/api/sessao")
def consultar_sessao():
    id_operador = session.get("id_operador")
    if id_operador is None:
        return jsonify({"mensagem": "Faça login para continuar."}), 401
    with closing(conectar()) as conexao:
        with closing(conexao.cursor()) as cursor:
            cursor.execute("""
                SELECT id_operador, nome, login FROM operador
                WHERE id_operador = %s AND ativo = TRUE;
            """, (id_operador,))
            operador = cursor.fetchone()
    if operador is None:
        session.clear()
        return jsonify({"mensagem": "Sessão inválida."}), 401
    return jsonify({"operador": dados_operador(operador)})


@app.post("/api/logout")
def sair():
    session.clear()
    return jsonify({"mensagem": "Sessão encerrada."})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000)