import { useAuthActions } from '@convex-dev/auth/react';
import { useState } from 'react';

export function Login() {
  const { signIn } = useAuthActions();
  const [flow, setFlow] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn('password', { email, password, flow });
      // On success, ConvexAuthProvider updates auth state automatically.
      // Do NOT setLoading(false) here — component unmounts as we transition to Authenticated.
    } catch (err: any) {
      const message = err?.message || '';
      if (flow === 'signUp' && message.includes('already exists')) {
        setError('Account already exists. Try signing in instead.');
      } else if (flow === 'signIn') {
        setError('Invalid email or password');
      } else {
        setError(message || 'Could not create account');
      }
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-icon">
          <svg viewBox="0 0 24 24" fill="none" width="40" height="40">
            <path d="M12 3L5 6.5V10.5C5 14.64 8.01 18.47 12 19.5C15.99 18.47 19 14.64 19 10.5V6.5L12 3Z"
              fill="#B5A67A" opacity="0.3" stroke="#B5A67A" strokeWidth="1.5" strokeLinejoin="round"/>
            <path d="M9 11L11 13L15.5 8.5" stroke="#B5A67A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
        <h1>YT Kids Guard</h1>
        <p className="login-subtitle">
          {flow === 'signIn' ? 'Sign in to manage your family' : 'Create a parent account'}
        </p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoComplete="email"
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={flow === 'signIn' ? 'current-password' : 'new-password'}
          />
          {error && <p className="error">{error}</p>}
          <button type="submit" className="btn-primary" disabled={loading}>
            {loading ? '...' : flow === 'signIn' ? 'Sign In' : 'Create Account'}
          </button>
        </form>

        <button
          className="btn-link"
          onClick={() => { setFlow(f => f === 'signIn' ? 'signUp' : 'signIn'); setError(''); }}
        >
          {flow === 'signIn' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
        </button>
      </div>
    </div>
  );
}
