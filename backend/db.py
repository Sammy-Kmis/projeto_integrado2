import os
from contextlib import closing
from pathlib import Path

import pg8000.dbapi
from dotenv import load_dotenv


# Localiza o .env dentro da mesma pasta deste arquivo.
PASTA_BACKEND = Path(__file__).resolve().parent
load_dotenv(PASTA_BACKEND / ".env")


def conectar():
    """Abre uma conexão com o PostgreSQL."""
    return pg8000.dbapi.connect(
        host=os.environ["DB_HOST"],
        port=int(os.environ["DB_PORT"]),
        database=os.environ["DB_NAME"],
        user=os.environ["DB_USER"],
        password=os.environ["DB_PASSWORD"],
        timeout=10,
    )


def testar_conexao():
    """Consulta o banco e suas tabelas, sem alterar dados."""
    with closing(conectar()) as conexao:
        with closing(conexao.cursor()) as cursor:
            cursor.execute("SELECT current_database();")
            nome_banco = cursor.fetchone()[0]

            cursor.execute("""
                SELECT table_name
                FROM information_schema.tables
                WHERE table_schema = 'public'
                  AND table_type = 'BASE TABLE'
                ORDER BY table_name;
            """)
            tabelas = cursor.fetchall()

            print(f"Conexão realizada com o banco: {nome_banco}")
            print("Tabelas encontradas:")

            for tabela in tabelas:
                print(f"- {tabela[0]}")


if __name__ == "__main__":
    testar_conexao()