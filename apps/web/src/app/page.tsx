import Link from 'next/link';
import { SiteHeader } from '../components/site-header';

async function getHealth() {
  try {
    const apiBaseUrl =
      process.env.INTERNAL_API_BASE_URL ??
      process.env.NEXT_PUBLIC_API_BASE_URL ??
      'http://localhost:3001';

    const response = await fetch(`${apiBaseUrl}/health`, {
      cache: 'no-store'
    });

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

export default async function HomePage() {
  const health = await getHealth();

  return (
    <div className="app-shell">
      <SiteHeader />

      <main>
        <section className="hero">
          <div className="container hero__grid">
            <div className="hero__panel">
              <span className="hero__eyebrow">Escalable, auditable y lista para operar</span>
              <h1 className="hero__title">Reservas academicas con reglas reales de negocio.</h1>
              <p className="hero__text">
                Gestiona aulas, disponibilidad, extensiones, series repetitivas y solicitudes especiales desde una interfaz
                clara para estudiantes, maestros y direccion.
              </p>

              <div className="hero__actions">
                <Link href="/login" className="button button--primary">
                  Entrar al sistema
                </Link>
                <Link href="/dashboard/reservations" className="button button--secondary">
                  Explorar modulo de reservas
                </Link>
              </div>

              <div className="stats">
                <div className="stat">
                  <strong>08:00 - 22:00</strong>
                  <span>Horario institucional configurable</span>
                </div>
                <div className="stat">
                  <strong>+15 min</strong>
                  <span>Buffer automatico de limpieza</span>
                </div>
                <div className="stat">
                  <strong>RabbitMQ</strong>
                  <span>Eventos asincronos y patron outbox</span>
                </div>
              </div>
            </div>

            <aside className="hero__aside hero__panel">
              <div>
                <span className="badge">API {health?.ok ? 'operativa' : 'sin respuesta'}</span>
                <h2 style={{ marginBottom: 10 }}>Base funcional lista para evolucionar</h2>
                <p className="hero__text">
                  Este frontend ya incluye login, panel inicial, consulta de disponibilidad y creacion de reservas.
                </p>
              </div>

              <pre style={{ whiteSpace: 'pre-wrap', margin: 0 }}>
                {JSON.stringify(health ?? { ok: false, message: 'API no disponible aun' }, null, 2)}
              </pre>
            </aside>
          </div>
        </section>

        <section className="section">
          <div className="container">
            <div className="section__header">
              <div>
                <h2 className="section__title">Lo que ya puedes probar</h2>
                <p className="section__text">
                  
                </p>
              </div>
            </div>

            <div className="cards-grid">
              <div className="card">
                <h3>Acceso por cuenta</h3>
                <p>Inicia sesion  y navega un panel con sesion local en navegador.</p>
              </div>

              <div className="card">
                <h3>Disponibilidad operativa</h3>
                <p>Consulta espacios disponibles por fecha y rango horario antes de crear una reserva.</p>
              </div>

              <div className="card">
                <h3>Historial inmediato</h3>
                <p>Visualiza reservas propias y confirma rapidamente si el flujo base del API esta funcionando.</p>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
