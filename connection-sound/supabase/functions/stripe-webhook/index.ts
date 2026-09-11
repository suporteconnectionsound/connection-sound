// REMOVIDO: a Stripe foi substituída pelo Asaas em 2026-09.
// Esta função virou no-op para não quebrar a URL pública. Apague em produção após
// confirmar que nenhum webhook está chegando.
Deno.serve(async () => {
  return new Response('migrado para Asaas', { status: 410 })
})
