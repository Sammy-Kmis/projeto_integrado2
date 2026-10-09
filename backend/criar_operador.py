from contextlib import closing
from getpass import getpass

from werkzeug.security import generate_password_hash

from db import conectar


def criar_operador():
    nome = input("Nome do operador: ").strip()
    login = input("Login: ").strip().lower()
    turno = input("Turno (opcional): ").strip()

    if not nome or len(nome) > 100:
        print("Informe um nome com até 100 caracteres.")
        return

    if not login or len(login) > 50:
        print("Informe um login com até 50 caracteres.")
        return

    if any(caractere.isspace() for caractere in login):
        print("O login não pode conter espaços.")
        return

    if len(turno) > 20:
        print("O turno deve ter até 20 caracteres.")
        return

    senha = getpass("Senha do operador: ")
    confirmacao = getpass("Confirme a senha: ")

    if not 12 <= len(senha) <= 128:
        print("Escolha uma senha entre 12 e 128 caracteres.")
        return

    if senha != confirmacao:
        print("As senhas não coincidem.")
        return

    senha_hash = generate_password_hash(senha)

    with closing(conectar()) as conexao:
        try:
            with closing(conexao.cursor()) as cursor:
                cursor.execute(
                    """
                    INSERT INTO operador (
                        nome, login, senha_hash, turno
                    )
                    VALUES (%s, %s, %s, %s)
                    ON CONFLICT (login) DO NOTHING
                    RETURNING id_operador;
                    """,
                    (nome, login, senha_hash, turno or None),
                )

                resultado = cursor.fetchone()

            conexao.commit()

        except Exception:
            conexao.rollback()
            raise

    if resultado is None:
        print("Esse login já existe. Nenhum cadastro foi alterado.")
    else:
        print(f"Operador cadastrado! ID: {resultado[0]}")


if __name__ == "__main__":
    criar_operador()