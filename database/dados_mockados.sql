INSERT INTO Operador (nome, login, senha, turno) VALUES
('Carlos Silva', 'carlos.portaria', '1234', 'Manhã'),
('Roberto Alves', 'roberto.noite', '1234', 'Noite');

INSERT INTO Usuario (cpf, cargo, nome) VALUES
('11122233344', 'Professor', 'Ana Paula Souza'),
('99988877766', 'Funcionário', 'Marcos Dias');

INSERT INTO Vaga (codigo_vaga, tipo) VALUES
('A-01', 'Carro'),
('A-02', 'Moto');

INSERT INTO Veiculo (placa, id_usuario, modelo) VALUES
('ABC1234', 1, 'Honda Civic'),
('XYZ9876', 2, 'Yamaha Fazer');

INSERT INTO Escala_Dia (id_usuario, id_vaga, dia_semana) VALUES
(1, 1, 'Segunda-feira'),
(2, 2, 'Terça-feira');

INSERT INTO Registro_Acesso (placa, id_vaga, id_operador, data_hora_entrada, data_hora_saida) VALUES
('ABC1234', 1, 1, '2026-09-12 07:30:00', '2026-09-12 12:15:00');