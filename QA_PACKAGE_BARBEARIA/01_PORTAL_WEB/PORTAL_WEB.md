# Portal Web - Acesso QA

## Links

- Homologacao/Staging (preencher): `https://<staging-url-do-portal>`
- Local — **Docker Compose** (portal NGINX): `http://localhost:3001`
- Local — **npm** (`apps/web`, Vite): `http://localhost:5173` (se ocupada, Vite pode usar `5174`, etc.)
- API base: `http://localhost:3000`
- Health API: `http://localhost:3000/health`
- Database health API: `http://localhost:3000/database/health`
- Swagger/OpenAPI (nao production): `http://localhost:3000/docs`
- n8n UI — **host com docker-compose.yml**: `http://localhost:5679` (porta publicada; dentro do container e 5678)

Ver guia completo: `docs/QA_AMBIENTE_LOCAL.md` na raiz do repositorio.

## Credenciais de teste

### Admin

- Email: `admin@demo.local`
- Senha: `admin12345`
- Tenant: `00000000-0000-0000-0000-000000000001`
- Perfil esperado: `tenant_owner`

### Atendente

- Email: `atendente@demo.local`
- Senha: `admin12345`
- Tenant: `00000000-0000-0000-0000-000000000001`
- Perfil esperado: `attendant`
- Nota: se nao existir no ambiente, criar via endpoint de usuarios antes do teste.

### Profissional

- Email: `fred.barbeiro@demo.local`
- Senha: `admin12345`
- Tenant: `00000000-0000-0000-0000-000000000001`
- Perfil esperado: `professional`

## Resultado esperado para QA

- Admin acessa todas as telas permitidas por RBAC.
- Atendente acessa fluxo operacional sem telas manager-only.
- Profissional acessa escopo restrito ao proprio perfil.

