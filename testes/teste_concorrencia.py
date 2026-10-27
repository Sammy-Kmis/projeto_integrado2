import os
import sys
from pathlib import Path
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier

# Proteção: somente o banco de testes.
if os.environ.get("DB_NAME") != "estacionamento_teste":
    raise SystemExit("ERRO: selecione estacionamento_teste.")

# Permite importar os arquivos da pasta backend.
PASTA_BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(PASTA_BACKEND))

from app import app
from db import conectar

PLACAS = ["QWE1A27", "QWE1B27"]

# Confere as condições antes de começar.
with closing(conectar()) as conexao:
    with closing(conexao.cursor()) as cursor:
        cursor.execute("SELECT current_database()")
        banco = cursor.fetchone()[0]

        cursor.execute("""
            SELECT capacidade_total
            FROM estacionamento
            WHERE id_estacionamento = 1
        """)
        capacidade = cursor.fetchone()[0]

        cursor.execute("""
            SELECT COUNT(*)
            FROM registro_acesso
            WHERE data_hora_saida IS NULL
              AND id_estacionamento = 1
        """)
        presentes = cursor.fetchone()[0]

        cursor.execute("""
            SELECT COUNT(*)
            FROM registro_acesso
            WHERE placa IN (%s, %s)
              AND data_hora_saida IS NULL
        """, tuple(PLACAS))
        entradas_teste_abertas = cursor.fetchone()[0]

if (
    banco != "estacionamento_teste"
    or capacidade != 2
    or presentes != 1
    or entradas_teste_abertas != 0
):
    raise SystemExit("Cenario inesperado. Nenhuma entrada enviada.")

print("Banco:", banco)
print("Capacidade:", capacidade)
print("Veiculos presentes:", presentes)

# Faz as duas solicitações começarem juntas.
barreira = Barrier(2)

def registrar_entrada(placa):
    with app.test_client() as cliente:
        # Simula um operador autenticado apenas no teste.
        with cliente.session_transaction() as sessao:
            sessao["id_operador"] = 1

        barreira.wait(timeout=10)

        resposta = cliente.post(
            "/api/entradas",
            json={
                "placa": placa,
                "nome_condutor": "Teste Concorrencia"
            }
        )

        dados = resposta.get_json() or {}

        return placa, resposta.status_code, dados.get("mensagem")

# Executa duas requisições em paralelo.
with ThreadPoolExecutor(max_workers=2) as executor:
    resultados = list(executor.map(registrar_entrada, PLACAS))

print("\nRESULTADOS:")
for placa, status, mensagem in resultados:
    print(f"{placa} | HTTP {status} | {mensagem}")

# Confere a ocupação final no PostgreSQL.
with closing(conectar()) as conexao:
    with closing(conexao.cursor()) as cursor:
        cursor.execute("""
            SELECT COUNT(*)
            FROM registro_acesso
            WHERE data_hora_saida IS NULL
              AND id_estacionamento = 1
        """)
        ocupacao_final = cursor.fetchone()[0]

print("\nOcupacao final:", ocupacao_final, "de 2")

codigos = sorted(resultado[1] for resultado in resultados)

lotacao_confirmada = any(
    status == 409
    and mensagem == "Estacionamento lotado. Aguarde a saída de um veículo."
    for placa, status, mensagem in resultados
)

if (
    codigos == [201, 409]
    and ocupacao_final == 2
    and lotacao_confirmada
):
    print("TESTE APROVADO!")
else:
    raise SystemExit("TESTE REPROVADO: resultado inesperado.")