# Análise UX/UI — Agenda operacional (`/agenda`)

**Solicitante:** PO  
**Data:** 2026-05-26  
**Status:** Ajuste implementado na web

---

## Diagnóstico (print em anexo)

| Problema | Impacto |
|----------|---------|
| Grade do calendário em **branco puro** (CSS padrão `react-big-calendar`) | Contraste agressivo com shell escuro; fadiga visual |
| Toolbar **duplicada** (Hoje / Anterior / Próximo) vs filtros da página | Confusão e poluição visual |
| Linhas de horário pouco visíveis no fundo claro | Dificuldade para posicionar agendamentos |
| Sem **legenda** de cores de status | Operador não decodifica eventos rapidamente |

---

## Princípios aplicados

1. **Coerência com design system** — navy `#0B1F3B` / card, bordas `border`, texto `muted-foreground`, acento teal `#2DD4BF`
2. **Hierarquia** — gutter de horas mais escuro; faixas alternadas a cada hora; coluna “hoje” com tint teal suave
3. **Usabilidade** — uma única barra de navegação de data (topo da página); legenda compacta acima da grade
4. **Acessibilidade** — eventos com borda/sombra; foco visível; indicador “agora” em teal

---

## Alterações técnicas

| Artefato | Mudança |
|----------|---------|
| `apps/web/src/features/agenda/agenda-calendar.css` | Tema escuro scoped `.agenda-calendar` |
| `apps/web/src/features/agenda/AgendaCalendar.tsx` | `toolbar={false}`, legenda, cores de status revisadas |
| Altura | `min-h` responsivo + scroll interno |

---

## Validação PO

1. Abrir http://localhost:3001/agenda (rebuild web se Docker: `docker compose up -d --build web`)
2. Confirmar grade **escura**, legenda visível, **sem** segunda toolbar branca
3. Criar agendamento de teste e verificar cor por status

---

## Filtros (2ª entrega)

| Artefato | Mudança |
|----------|---------|
| `AgendaFiltersBar.tsx` | Barra unificada em card, labels Período / Profissional / Status |
| `agenda-filters.css` | `color-scheme: dark` no date picker; fundos `input` navy |
| Toggle Dia/Semana | Destaque teal no item ativo |
| Alertas | Banner âmbar só em tons escuros |

---

## Pendências opcionais (backlog)

- Modo claro futuro (`.light` + variáveis duplas)
- Densidade de slot configurável (30/15 min) para salões com muitos profissionais
- `data-testid` na grade para E2E
