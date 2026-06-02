  const ctx = $('Montar contexto agente').first().json || {};
  const inb = ctx.inbound || {};
  const cat = ctx.catalog || {};
  const mem = ctx.customer_memory || {};
  const def = ctx.defaults || {};

  const now = new Date();
  const today = now.toISOString().slice(0, 10);
  const tomorrow = new Date(now.getTime() + 86400000).toISOString().slice(0, 10);
  const displayName =
    String(mem.registered_name || inb.push_name || inb.customer_name || '')
      .trim() || null;
  const firstName = displayName ? displayName.split(/\s+/)[0] : null;

  const servicesList = (cat.services || [])
    .map((s) => `${s.name} (id: ${s.id})`)
    .join('; ');
  const prosList = (cat.professionals || [])
    .map((p) => `${p.name} (id: ${p.id})`)
    .join('; ');

  const lastAppt = mem.last_appointment;
  const lastApptLine = lastAppt
    ? `${lastAppt.service_name || 'servico'} com ${lastAppt.professional_name || 'profissional'} em ${lastAppt.starts_at || '?'} (status: ${lastAppt.status || '?'})`
    : '(sem historico de agendamento no cadastro)';

  const nextAppt = mem.next_appointment;
  const nextApptLine = nextAppt
    ? `${nextAppt.service_name || 'servico'} em ${nextAppt.starts_at || '?'}`
    : '(nenhum agendamento futuro)';

  const recentSvc = (mem.recent_services || [])
    .map((r) => `${r.name} (ultima vez: ${r.last_at || '?'})`)
    .join('; ');

  const draft = inb.scheduling_draft || {};
  const draftLine =
    draft && Object.keys(draft).length
      ? JSON.stringify(draft)
      : '(vazio — colete na conversa)';

  return [
    '=== CONTEXTO ===',
    'Data referencia hoje: ' + today,
    'Data referencia amanha: ' + tomorrow,
    'Nome cadastrado: ' + String(mem.registered_name || 'nao informado'),
    'Nome WhatsApp (push_name): ' + String(inb.push_name || 'desconhecido'),
    'Primeiro nome para tratamento: ' + String(firstName || 'pergunte com gentileza'),
    'Cliente VIP: ' + (mem.is_vip ? 'sim' : 'nao'),
    'Telefone: ' + String(inb.phone || ''),
    'customer_id: ' + String(inb.customer_id || def.customer_id || ''),
    '',
    '=== MEMORIA DO CLIENTE (relembre com naturalidade — nao seja invasiva) ===',
    'Ultimo agendamento relevante: ' + lastApptLine,
    'Proximo agendamento: ' + nextApptLine,
    'Servicos ja realizados (historico): ' + (recentSvc || '(nenhum concluido)'),
    'Rascunho parcial desta conversa (nao repita perguntas): ' + draftLine,
    '',
    '=== CONVERSA (multi-turn — leia TUDO; aprenda tom e preferencias) ===',
    'Ultima mensagem do cliente: ' + String(inb.message || ''),
    'Historico completo:',
    String(inb.session_text || inb.message || ''),
    '',
    '=== CATALOGO (ofereca opcoes — NAO escolha sozinho) ===',
    'Servicos: ' + (servicesList || '(catalogo indisponivel)'),
    'Profissionais: ' + (prosList || '(catalogo indisponivel)'),
    '',
    '=== ATENDIMENTO HUMANIZADO ===',
    '1) Saudacao ou "quero agendar" sem detalhes: cumprimente pelo nome, opcionalmente cite o ultimo atendimento, pergunte servico + profissional + dia/horario. intent=coletar_agendamento, ready_to_book=false.',
    '2) Uma pergunta por vez. Tom gentil; espelhe a educacao do cliente.',
    '3) Com servico+profissional+data+horario: resuma e peca confirmacao. ready_to_book=false.',
    '4) Apos sim/confirmo: intent=criar_agendamento, ready_to_book=true.',
    '5) Sugestao extra (max 1 frase): ex. outro servico do catalogo ou "quer manter o mesmo profissional da ultima vez?" — so se couber; nunca empurre venda.',
    '',
    'Retorne JSON: intent, ready_to_book, professional_id, service_id, appointment_date, appointment_time, customer_id, response_text.',
  ].join('\n');
