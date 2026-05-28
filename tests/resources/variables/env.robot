*** Variables ***
# --- Ambiente (sobrescrever via -v ou variáveis de ambiente no runner) ---
${BASE_URL}              %{QA_WEB_BASE=http://localhost:3001}
${API_URL}               %{QA_API_BASE=http://localhost:3000}
${TENANT_ID}             00000000-0000-0000-0000-000000000001

# --- Browser ---
${BROWSER_HEADLESS}      %{QA_HEADLESS=False}
${BROWSER_WIDTH}         1440
${BROWSER_HEIGHT}        900
${BROWSER_TIMEOUT}       20s
${RETRY_COUNT}           3
${RETRY_INTERVAL}        2 sec

# --- Evidências (EXECDIR = pasta tests/ ao rodar robot) ---
${TESTS_ROOT}            ${EXECDIR}
${EVIDENCE_DIR}          ${TESTS_ROOT}${/}evidence
${SCREENSHOT_DIR}        ${EVIDENCE_DIR}${/}screenshots
${TRACE_DIR}             ${EVIDENCE_DIR}${/}traces
${VIDEO_DIR}             ${EVIDENCE_DIR}${/}videos
${DEFECTS_DIR}           ${TESTS_ROOT}${/}defects
${REPORTS_DIR}           ${TESTS_ROOT}${/}reports
${STORAGE_OWNER}         ${EVIDENCE_DIR}${/}storage_owner.json
${STORAGE_ATTENDANT}     ${EVIDENCE_DIR}${/}storage_attendant.json
${STORAGE_VIEWER}        ${EVIDENCE_DIR}${/}storage_viewer.json

# --- Massa QA ---
${QA_PATIO_DATE}         2026-06-16
${SEED_PLATE}            PSQ8A16
${SEED_CUSTOMER_360_ID}  00000000-0000-4000-8000-000000004032
