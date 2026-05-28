"""
Validacao de documentos fiscais brasileiros
CPF, CNPJ e CAEPF
"""

def validar_cpf(cpf: str) -> dict:
    """Valida CPF e retorna status detalhado."""
    limpo = ''.join(filter(str.isdigit, cpf))
    
    if len(limpo) != 11:
        return {"valido": False, "erro": f"CPF deve ter 11 digitos (tem {len(limpo)})"}
    
    if len(set(limpo)) == 1:
        return {"valido": False, "erro": "CPF invalido (todos digitos iguais)"}
    
    # Calcular 1o DV
    soma = sum(int(limpo[i]) * (10 - i) for i in range(9))
    resto = soma % 11
    dv1 = 0 if resto < 2 else 11 - resto
    
    if int(limpo[9]) != dv1:
        return {"valido": False, "erro": "CPF invalido (1o digito verificador incorreto)"}
    
    # Calcular 2o DV
    soma = sum(int(limpo[i]) * (11 - i) for i in range(10))
    resto = soma % 11
    dv2 = 0 if resto < 2 else 11 - resto
    
    if int(limpo[10]) != dv2:
        return {"valido": False, "erro": "CPF invalido (2o digito verificador incorreto)"}
    
    formatado = f"{limpo[:3]}.{limpo[3:6]}.{limpo[6:9]}-{limpo[9:]}"
    return {"valido": True, "formatado": formatado, "limpo": limpo, "tipo": "CPF"}


def validar_cnpj(cnpj: str) -> dict:
    """Valida CNPJ e retorna status detalhado."""
    limpo = ''.join(filter(str.isdigit, cnpj))
    
    if len(limpo) != 14:
        return {"valido": False, "erro": f"CNPJ deve ter 14 digitos (tem {len(limpo)})"}
    
    if len(set(limpo)) == 1:
        return {"valido": False, "erro": "CNPJ invalido (todos digitos iguais)"}
    
    def calc_dv(s: str, pesos: list) -> int:
        soma = sum(int(s[i]) * pesos[i] for i in range(len(pesos)))
        resto = soma % 11
        return 0 if resto < 2 else 11 - resto
    
    p1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    p2 = [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
    
    if int(limpo[12]) != calc_dv(limpo[:12], p1):
        return {"valido": False, "erro": "CNPJ invalido (1o digito verificador incorreto)"}
    
    if int(limpo[13]) != calc_dv(limpo[:13], p2):
        return {"valido": False, "erro": "CNPJ invalido (2o digito verificador incorreto)"}
    
    formatado = f"{limpo[:2]}.{limpo[2:5]}.{limpo[5:8]}/{limpo[8:12]}-{limpo[12:]}"
    return {"valido": True, "formatado": formatado, "limpo": limpo, "tipo": "CNPJ"}


def calcular_caepf(cpf: str, sequencial: str = "001") -> str:
    """Calcula o numero CAEPF a partir do CPF e sequencial."""
    cpf_limpo = ''.join(filter(str.isdigit, cpf))
    seq_limpo = sequencial.zfill(3)
    
    if len(cpf_limpo) != 11:
        raise ValueError("CPF invalido para calculo do CAEPF")
    
    base = cpf_limpo[:9] + seq_limpo  # 12 digitos
    
    # 1o DV — pesos da direita para esquerda: 2,3,4,5,6,7,8,9,2,3,4,5
    pesos1 = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5]
    soma1 = sum(int(base[-(i+1)]) * pesos1[i] for i in range(12))
    resto1 = soma1 % 11
    dv1 = 0 if resto1 < 2 else 11 - resto1
    
    # 2o DV — inclui dv1, pesos: 2,3,4,5,6,7,8,9,2,3,4,5,6
    base2 = base + str(dv1)
    pesos2 = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5, 6]
    soma2 = sum(int(base2[-(i+1)]) * pesos2[i] for i in range(13))
    resto2 = soma2 % 11
    dv2 = 0 if resto2 < 2 else 11 - resto2
    
    return f"{base[:3]}.{base[3:6]}.{base[6:9]}/{base[9:12]}-{dv1}{dv2}"


def validar_caepf(caepf: str) -> dict:
    """Valida CAEPF e retorna status detalhado."""
    limpo = ''.join(filter(str.isdigit, caepf))
    
    if len(limpo) != 14:
        return {"valido": False, "erro": f"CAEPF deve ter 14 digitos (tem {len(limpo)})"}
    
    cpf_base = limpo[:9] + "00"  # CPF sem DV para verificacao basica
    sequencial = limpo[9:12]
    dv_informado = limpo[12:]
    
    if sequencial == "000":
        return {"valido": False, "erro": "Sequencial CAEPF nao pode ser 000"}
    
    # Calcular DVs esperados
    base = limpo[:12]
    
    pesos1 = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5]
    soma1 = sum(int(base[-(i+1)]) * pesos1[i] for i in range(12))
    resto1 = soma1 % 11
    dv1_esperado = 0 if resto1 < 2 else 11 - resto1
    
    if int(dv_informado[0]) != dv1_esperado:
        return {"valido": False, "erro": f"CAEPF invalido (1o DV esperado {dv1_esperado}, informado {dv_informado[0]})"}
    
    base2 = base + str(dv1_esperado)
    pesos2 = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5, 6]
    soma2 = sum(int(base2[-(i+1)]) * pesos2[i] for i in range(13))
    resto2 = soma2 % 11
    dv2_esperado = 0 if resto2 < 2 else 11 - resto2
    
    if int(dv_informado[1]) != dv2_esperado:
        return {"valido": False, "erro": f"CAEPF invalido (2o DV esperado {dv2_esperado}, informado {dv_informado[1]})"}
    
    formatado = f"{limpo[:3]}.{limpo[3:6]}.{limpo[6:9]}/{limpo[9:12]}-{limpo[12:]}"
    cpf_formatado = f"{limpo[:3]}.{limpo[3:6]}.{limpo[6:9]}-??"  # DV CPF nao faz parte do CAEPF
    
    return {
        "valido": True,
        "formatado": formatado,
        "limpo": limpo,
        "tipo": "CAEPF",
        "cpf_base": limpo[:9],
        "sequencial": sequencial,
    }


def validar_documento(doc: str) -> dict:
    """Detecta e valida automaticamente CPF, CNPJ ou CAEPF."""
    limpo = ''.join(filter(str.isdigit, doc))
    
    if len(limpo) == 11:
        return validar_cpf(doc)
    elif len(limpo) == 14:
        # Pode ser CNPJ ou CAEPF — tenta CAEPF primeiro se sequencial for 001-999
        sequencial = limpo[9:12]
        if sequencial.isdigit() and 1 <= int(sequencial) <= 999:
            # Tenta validar como CAEPF
            r = validar_caepf(doc)
            if r["valido"]:
                return r
        # Tenta CNPJ
        return validar_cnpj(doc)
    else:
        return {"valido": False, "erro": f"Documento com {len(limpo)} digitos nao reconhecido (CPF=11, CNPJ/CAEPF=14)"}


# Testes
if __name__ == "__main__":
    print("=== Testes de Validacao ===\n")
    
    # CPF do Fernando
    r = validar_cpf("728.395.704-91")
    print(f"CPF Fernando: {r}")
    
    # CPF do Cicero
    r = validar_cpf("021.824.453-44")
    print(f"CPF Cicero: {r}")
    
    # CAEPF calculado
    caepf = calcular_caepf("728.395.704-91", "001")
    print(f"\nCAEPF calculado: {caepf}")
    
    r = validar_caepf(caepf)
    print(f"Validacao CAEPF: {r}")
    
    # CNPJ teste
    r = validar_cnpj("11.222.333/0001-81")
    print(f"\nCNPJ teste: {r}")
    
    # Auto-detectar
    print("\n=== Auto-deteccao ===")
    for doc in ["728.395.704-91", "021.824.453-44", caepf]:
        r = validar_documento(doc)
        print(f"{doc} -> tipo={r.get('tipo','?')} valido={r['valido']}")
