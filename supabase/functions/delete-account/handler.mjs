// Verified identity, never a browser-supplied user ID. No provider is silently revoked.
export function deleteAccountHandler(createClient, env) {
  const origin = 'https://home-base-drivers.github.io';
  return async request => {
    const cors = { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Vary': 'Origin' };
    const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });
    if (request.headers.get('Origin') && request.headers.get('Origin') !== origin) return reply(403, { error: 'Origin not allowed' });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    if (request.method !== 'POST') return reply(405, { error: 'POST required' });
    const token = request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return reply(401, { error: 'Sign in first' });
    try {
      const body = await request.json();
      if (body.confirmation !== 'DELETE') return reply(400, { error: 'Explicit deletion confirmation required' });
      const admin = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false } });
      const { data, error } = await admin.auth.getUser(token);
      if (error || !data?.user?.id || data.user.is_anonymous) return reply(401, { error: 'Sign in again' });
      const userId = data.user.id;
      const connections = await admin.from('account_connections').select('status').eq('user_id', userId);
      if (connections.error) return reply(503, { error: 'Could not verify account connections' });
      if (connections.data.some(c => ['connected','connecting','reauth_required','error'].includes(c.status))) {
        return reply(409, { error: 'Disconnect linked providers before deleting your account' });
      }
      const revoked = await admin.auth.admin.signOut(token, 'global');
      if (revoked.error) return reply(503, { error: 'Could not revoke sessions; no account was deleted' });
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error) return reply(503, { error: 'Account deletion failed; sign in again to retry' });
      return reply(200, { deleted: true });
    } catch { return reply(400, { error: 'Could not process account deletion' }); }
  };
}
