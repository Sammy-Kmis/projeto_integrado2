BEGIN;

CREATE TABLE operador (
    id_operador INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    login VARCHAR(50) NOT NULL UNIQUE,
    senha_hash TEXT NOT NULL,
    turno VARCHAR(20),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT operador_nome_preenchido
        CHECK (TRIM(nome) <> ''),

    CONSTRAINT operador_login_preenchido
        CHECK (TRIM(login) <> '')
);

CREATE TABLE usuario (
    id_usuario INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    cpf VARCHAR(11) UNIQUE,
    cargo VARCHAR(50),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT usuario_nome_preenchido
        CHECK (TRIM(nome) <> ''),

    CONSTRAINT usuario_cpf_formato
        CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$')
);

CREATE TABLE veiculo (
    placa VARCHAR(7) PRIMARY KEY,
    id_usuario INTEGER,
    modelo VARCHAR(100),
    ativo BOOLEAN NOT NULL DEFAULT TRUE,

    CONSTRAINT veiculo_usuario_fk
        FOREIGN KEY (id_usuario)
        REFERENCES usuario (id_usuario)
        ON DELETE RESTRICT,

    CONSTRAINT veiculo_placa_formato
        CHECK (placa ~ '^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$')
);

CREATE TABLE estacionamento (
    id_estacionamento INTEGER PRIMARY KEY DEFAULT 1,
    capacidade_total INTEGER NOT NULL,
    limiar_alerta INTEGER NOT NULL DEFAULT 80,
    inicio_monitoramento TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT estacionamento_unico
        CHECK (id_estacionamento = 1),

    CONSTRAINT estacionamento_capacidade_valida
        CHECK (capacidade_total > 0),

    CONSTRAINT estacionamento_alerta_valido
        CHECK (limiar_alerta BETWEEN 1 AND 100)
);

CREATE TABLE registro_acesso (
    id_registro INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    id_estacionamento INTEGER NOT NULL DEFAULT 1,
    placa VARCHAR(7) NOT NULL,
    id_usuario INTEGER,
    nome_condutor VARCHAR(100) NOT NULL,
    id_operador INTEGER NOT NULL,
    id_operador_saida INTEGER,
    data_hora_entrada TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT CURRENT_TIMESTAMP,
    data_hora_saida TIMESTAMP WITH TIME ZONE,

    CONSTRAINT registro_estacionamento_fk
        FOREIGN KEY (id_estacionamento)
        REFERENCES estacionamento (id_estacionamento)
        ON DELETE RESTRICT,

    CONSTRAINT registro_veiculo_fk
        FOREIGN KEY (placa)
        REFERENCES veiculo (placa)
        ON DELETE RESTRICT,

    CONSTRAINT registro_usuario_fk
        FOREIGN KEY (id_usuario)
        REFERENCES usuario (id_usuario)
        ON DELETE RESTRICT,

    CONSTRAINT registro_operador_entrada_fk
        FOREIGN KEY (id_operador)
        REFERENCES operador (id_operador)
        ON DELETE RESTRICT,

    CONSTRAINT registro_operador_saida_fk
        FOREIGN KEY (id_operador_saida)
        REFERENCES operador (id_operador)
        ON DELETE RESTRICT,

    CONSTRAINT registro_condutor_preenchido
        CHECK (TRIM(nome_condutor) <> ''),

    CONSTRAINT registro_horarios_validos
        CHECK (
            data_hora_saida IS NULL
            OR data_hora_saida >= data_hora_entrada
        ),

    CONSTRAINT registro_saida_com_operador
        CHECK (
            (
                data_hora_saida IS NULL
                AND id_operador_saida IS NULL
            )
            OR
            (
                data_hora_saida IS NOT NULL
                AND id_operador_saida IS NOT NULL
            )
        )
);

CREATE UNIQUE INDEX registro_uma_entrada_aberta_por_placa
    ON registro_acesso (placa)
    WHERE data_hora_saida IS NULL;

    CREATE TABLE dia_conferido (
    data DATE PRIMARY KEY,
    id_operador INTEGER NOT NULL,
    conferido_em TIMESTAMP WITH TIME ZONE
        NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT dia_conferido_operador_fk
        FOREIGN KEY (id_operador)
        REFERENCES operador (id_operador)
        ON DELETE RESTRICT
);

COMMIT;