*** Variables ***
# Partições inválidas — login (LoginPage Zod)
${INVALID_EMAIL}            not-an-email
${INVALID_PASSWORD_SHORT}   abc123
${INVALID_TENANT_ID}        not-a-uuid

# Boundary placa (exemplos)
${PLATE_EMPTY}              ${EMPTY}
${PLATE_DUPLICATE_SEED}     PSQ8A16
