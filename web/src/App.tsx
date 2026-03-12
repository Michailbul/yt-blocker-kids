import { Authenticated, Unauthenticated, AuthLoading } from 'convex/react';
import { Login } from './Login';
import { Dashboard } from './Dashboard';
import './styles.css';

export function App() {
  return (
    <div className="app">
      <AuthLoading>
        <div className="loading">Loading...</div>
      </AuthLoading>
      <Unauthenticated>
        <Login />
      </Unauthenticated>
      <Authenticated>
        <Dashboard />
      </Authenticated>
    </div>
  );
}
