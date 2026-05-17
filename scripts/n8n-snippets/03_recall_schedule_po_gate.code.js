const mode = String($execution?.mode || '');
if (mode === 'manual' || mode === 'cli') {
  return $input.all();
}

const allow = String($env.N8N_RECALL_ALLOW_SCHEDULE || '').toLowerCase() === 'true';
if (!allow) {
  console.log('[recall] agendamento bloqueado — defina N8N_RECALL_ALLOW_SCHEDULE=true após autorização PO');
  return [];
}

return $input.all();
