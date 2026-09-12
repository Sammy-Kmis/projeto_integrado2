CREATE TABLE Operador (
    id_operador SERIAL PRIMARY KEY,
    nome VARCHAR(100),
    login VARCHAR(50),
    senha VARCHAR(50),
    turno VARCHAR(20)
);

CREATE TABLE Usuario (
    id_usuario SERIAL PRIMARY KEY,
    cpf VARCHAR(14),
    cargo VARCHAR(50),
    nome VARCHAR(100)
);

CREATE TABLE Veiculo (
    placa VARCHAR(10) PRIMARY KEY,
    id_usuario INTEGER REFERENCES Usuario(id_usuario),
    modelo VARCHAR(50)
);

CREATE TABLE Vaga (
    id_vaga SERIAL PRIMARY KEY,
    codigo_vaga VARCHAR(10),
    tipo VARCHAR(50)
);

CREATE TABLE Escala_Dia (
    id_escala SERIAL PRIMARY KEY,
    id_usuario INTEGER REFERENCES Usuario(id_usuario),
    id_vaga INTEGER REFERENCES Vaga(id_vaga),
    dia_semana VARCHAR(20)
);

CREATE TABLE Registro_Acesso (
    id_registro SERIAL PRIMARY KEY,
    placa VARCHAR(10) REFERENCES Veiculo(placa),
    id_vaga INTEGER REFERENCES Vaga(id_vaga),
    id_operador INTEGER REFERENCES Operador(id_operador),
    data_hora_entrada TIMESTAMP,
    data_hora_saida TIMESTAMP
);