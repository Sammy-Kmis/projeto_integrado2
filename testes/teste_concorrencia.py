
import os
import sys
from concurrent.futures import ThreadPoolExecutor
from contextlib import closing
from pathlib import Path
from threading import Barrier
from uuid import uuid4

# Impede a execução sem selecionar explicitamente o banco de testes.
if os.environ.get("DB_NAME") != "estacionamento_teste":
    raise SystemExit("ERRO: selecione estacionamento_teste.")

PASTA_BACKEND = Path(__file__).resolve().parent.parent / "backend"
sys.path.insert(0, str(PASTA_BACKEND))

from app import app
from db import conectar

PLACAS = ("QWE1A27", "QWE1B27")
NOME_TESTE = f"Teste Concorrencia {uuid4().hex[:12]}"


def verificar_banco(cursor):
    cursor.execute("SELECT current_database()")
    banco = cursor.fetchone()[0]

    if banco != "estacionamento_teste":
        raise RuntimeError("Banco incorreto. Operacao cancelada.")

    return banco


def preparar_cenario():
    with closing(conectar()) as conexao:
        try:
            with closing(conexao.cursor()) as cursor:
                verificar_banco(cursor)

                cursor.execute("""
                    SELECT capacidade_total
                    FROM estacionamento
                    WHERE id_estacionamento = 1
                    FOR UPDATE
                """)
                linha = cursor.fetchone()

                if linha is None:
                    raise RuntimeError("Configuracao nao encontrada.")

                capacidade_original = linha[0]

                cursor.execute("""
                    SELECT COUNT(*)
                    FROM registro_acesso
                    WHERE id_estacionamento = 1
                      AND data_hora_saida IS NULL
                """)
                presentes = cursor.fetchone()[0]

                cursor.execute("""
                    SELECT COUNT(*)
                    FROM registro_acesso
                    WHERE placa IN (%s, %s)
                      AND data_hora_saida IS NULL
                """, PLACAS)

                if cursor.fetchone()[0] != 0:
                    raise RuntimeError(
                        "Uma placa de teste ja possui entrada aberta."
                    )

                cursor.execute("""
                    SELECT placa
                    FROM veiculo
                    WHERE placa IN (%s, %s)
                      AND ativo = FALSE
                """, PLACAS)

                if cursor.fetchone():
                    raise RuntimeError("Uma placa de teste esta inativa.")

                cursor.execute("""
                    SELECT 1
                    FROM operador
                    WHERE id_operador = 1 AND ativo = TRUE
                """)

                if cursor.fetchone() is None:
                    raise RuntimeError("Operador de teste indisponivel.")

                capacidade_teste = presentes + 1

                if capacidade_teste > 10000:
                    raise RuntimeError("Capacidade fora do limite.")

                cursor.execute("""
                    UPDATE estacionamento
                    SET capacidade_total = %s
                    WHERE id_estacionamento = 1
                """, (capacidade_teste,))

            conexao.commit()
            return capacidade_original, presentes, capacidade_teste

        except Exception:
            conexao.rollback()
            raise


def restaurar_cenario(capacidade_original):
    with closing(conectar()) as conexao:
        try:
            with closing(conexao.cursor()) as cursor:
                verificar_banco(cursor)

                # Bloqueia a configuracao durante a restauracao.
                cursor.execute("""
                    SELECT capacidade_total
                    FROM estacionamento
                    WHERE id_estacionamento = 1
                    FOR UPDATE
                """)

                if cursor.fetchone() is None:
                    raise RuntimeError("Configuracao nao encontrada.")

                # Encerra somente acessos identificados por este teste.
                cursor.execute("""
                    UPDATE registro_acesso
                    SET data_hora_saida =
                            GREATEST(clock_timestamp(), data_hora_entrada),
                        id_operador_saida = id_operador
                    WHERE id_estacionamento = 1
                      AND placa IN (%s, %s)
                      AND nome_condutor = %s
                      AND data_hora_saida IS NULL
                    RETURNING id_registro
                """, (*PLACAS, NOME_TESTE))

                encerrados = [
                    linha[0] for linha in cursor.fetchall()
                ]

                cursor.execute("""
                    UPDATE estacionamento
                    SET capacidade_total = %s
                    WHERE id_estacionamento = 1
                """, (capacidade_original,))

            conexao.commit()

            print("Capacidade original restaurada:", capacidade_original)
            print("Registros de teste encerrados:", encerrados)

        except Exception:
            conexao.rollback()
            raise


def registrar_entrada(placa, barreira):
    with app.test_client() as cliente:
        with cliente.session_transaction() as sessao:
            sessao["id_operador"] = 1

        barreira.wait(timeout=10)

        resposta = cliente.post(
            "/api/entradas",
            json={
                "placa": placa,
                "nome_condutor": NOME_TESTE
            }
        )

        dados = resposta.get_json() or {}

        return placa, resposta.status_code, dados.get("mensagem")


def executar_teste():
    capacidade_original, presentes, capacidade_teste = preparar_cenario()

    print("Banco: estacionamento_teste")
    print("Capacidade original:", capacidade_original)
    print("Veiculos presentes inicialmente:", presentes)
    print("Capacidade temporaria:", capacidade_teste)

    aprovado = False

    try:
        barreira = Barrier(2)

        with ThreadPoolExecutor(max_workers=2) as executor:
            resultados = list(
                executor.map(
                    lambda placa: registrar_entrada(placa, barreira),
                    PLACAS
                )
            )

        print("\nRESULTADOS:")
        for placa, status, mensagem in resultados:
            print(f"{placa} | HTTP {status} | {mensagem}")

        with closing(conectar()) as conexao:
            with closing(conexao.cursor()) as cursor:
                verificar_banco(cursor)

                cursor.execute("""
                    SELECT COUNT(*)
                    FROM registro_acesso
                    WHERE id_estacionamento = 1
                      AND data_hora_saida IS NULL
                """)
                ocupacao_final = cursor.fetchone()[0]

        print("\nOcupacao final:", ocupacao_final,
              "de", capacidade_teste)

        codigos = sorted(resultado[1] for resultado in resultados)

        lotacao_confirmada = any(
            status == 409
            and mensagem ==
                "Estacionamento lotado. Aguarde a saída de um veículo."
            for placa, status, mensagem in resultados
        )

        aprovado = (
            codigos == [201, 409]
            and ocupacao_final == capacidade_teste
            and lotacao_confirmada
        )

    finally:
        # Executa mesmo se o teste apresentar uma excecao.
        restaurar_cenario(capacidade_original)

    if aprovado:
        print("\nTESTE APROVADO!")
    else:
        raise SystemExit("TESTE REPROVADO: resultado inesperado.")


if __name__ == "__main__":
    executar_teste()
