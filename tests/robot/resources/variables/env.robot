*** Variables ***
# Ambiente local Docker (ajuste se usar Vite :5173)
${BASE_URL}              http://localhost:3001
${API_URL}               http://localhost:3000
${TENANT_ID}             00000000-0000-0000-0000-000000000001

# Credenciais demo (seed)
${ADMIN_EMAIL}           admin@demo.local
${ADMIN_PASSWORD}        admin12345
${ATTENDANT_EMAIL}         atendente@demo.local
${ATTENDANT_PASSWORD}     admin12345
${VIEWER_EMAIL}            viewer@demo.local
${VIEWER_PASSWORD}         admin12345

# Massa QA PS-08
${QA_PATIO_DATE}         2026-06-16
${SEED_PLATE}            PSQ8A16

# Evidências Robot
${ROBOT_ROOT}            ${CURDIR}${/}..${/}..
${EVIDENCIAS_DIR}        ${ROBOT_ROOT}${/}results${/}evidencias
${BROWSER_HEADLESS}      ${True}
${BROWSER_TIMEOUT}       20s
