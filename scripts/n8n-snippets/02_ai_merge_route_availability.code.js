/** Une rota (intent/UUIDs) com resposta de /availability para os nos seguintes. */
const route = $('Rotear fluxo').first().json ?? {};
const avail = $input.first().json ?? {};
const raw =
  avail.slots ??
  avail.data?.slots ??
  avail.body?.slots ??
  [];
const slots = (Array.isArray(raw) ? raw : [])
  .map((s) => ({
    starts_at: s?.starts_at ?? s?.startsAt ?? null,
    ends_at: s?.ends_at ?? s?.endsAt ?? null,
  }))
  .filter((s) => s.starts_at && s.ends_at);

return [
  {
    json: {
      ...route,
      slots,
      availability: avail,
    },
  },
];
