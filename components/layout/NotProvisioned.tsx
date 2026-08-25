// Server component (plain markup + a sign-out form). Shown when a user is
// authenticated but has no profiles row yet — e.g. the DB migration hasn't
// been run, or their account predates it. Avoids the silent redirect-to-login loop.
export default function NotProvisioned({ email }: { email?: string | null }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #001529 0%, #1677ff 100%)',
        padding: 24,
      }}
    >
      <div
        style={{
          width: 480,
          maxWidth: '100%',
          background: '#fff',
          borderRadius: 10,
          padding: 32,
          boxShadow: '0 10px 40px rgba(0,0,0,0.25)',
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>🛒 Almost there</h2>
        <p style={{ color: '#555', marginTop: 0 }}>
          You&rsquo;re signed in{email ? ` as ${email}` : ''}, but your account isn&rsquo;t provisioned yet.
        </p>
        <p style={{ color: '#555' }}>
          This usually means the database hasn&rsquo;t been set up. An admin needs to run the Carrito
          migration in Supabase (creates the tables and a profile for your account), then reload this page.
        </p>
        <ol style={{ color: '#555', paddingLeft: 20 }}>
          <li>Run <code>supabase/migrations/0001_init.sql</code> in the Supabase SQL Editor.</li>
          <li>Reload this page.</li>
        </ol>
        <form action="/auth/signout" method="post" style={{ marginTop: 20 }}>
          <button
            type="submit"
            style={{
              background: '#1677ff',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '8px 16px',
              cursor: 'pointer',
              fontSize: 14,
            }}
          >
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
