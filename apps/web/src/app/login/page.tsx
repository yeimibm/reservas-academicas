import { LoginForm } from '../../components/login-form';
import { SiteHeader } from '../../components/site-header';

export default function LoginPage() {
  return (
    <div className="app-shell">
      <SiteHeader />
      <main className="auth-page">
        <section className="auth-card">
          <span className="hero__eyebrow">Acceso al sistema</span>
          <h1>Inicia sesion para administrar tus reservas.</h1>
          <p>
            Una vez autenticado podras consultar disponibilidad, crear reservas y ver
            tu historial.
          </p>
          <LoginForm />
        </section>
      </main>
    </div>
  );
}
