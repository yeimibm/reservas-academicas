'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { apiRequest } from '../lib/api';
import { saveSession } from '../lib/session';

type LoginResponse = {
  accessToken: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    userType: string;
  };
};

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const session = await apiRequest<LoginResponse>('/auth/login', {
        method: 'POST',
        body: { email, password }
      });

      saveSession(session);
      router.push('/dashboard');
      router.refresh();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No fue posible iniciar sesion');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form className="form-grid" onSubmit={handleSubmit}>
      <div className="field">
        <label htmlFor="email">Correo institucional</label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="direccion@universidad.edu"
          required
        />
      </div>

      <div className="field">
        <label htmlFor="password">Contrasena</label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          placeholder="Ingresa tu contrasena"
          required
        />
      </div>

      <button className="button button--primary" type="submit" disabled={loading}>
        {loading ? 'Ingresando...' : 'Entrar al sistema'}
      </button>

      {error ? <div className="alert alert--error">{error}</div> : null}
      <p className="hint">El panel cargara con tu rol actual.</p>
    </form>
  );
}
