'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { clearSession, getSession, type SessionData } from '../lib/session';

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<SessionData | null>(null);

  useEffect(() => {
    const nextSession = getSession();
    if (!nextSession) {
      router.replace('/login');
      return;
    }

    setSession(nextSession);
  }, [router]);

  function handleLogout() {
    clearSession();
    router.replace('/login');
  }

  if (!session) {
    return (
      <div className="auth-page">
        <div className="auth-card">
          <h1>Validando sesion</h1>
          <p>Estamos verificando tus credenciales locales para entrar al panel.</p>
        </div>
      </div>
    );
  }

  const navItems =
    session.user.userType === 'DIRECTION'
      ? [
          { href: '/dashboard', label: 'Resumen' },
          { href: '/dashboard/admin', label: 'Administracion' },
          { href: '/dashboard/reviews', label: 'Solicitudes' },
          { href: '/dashboard/receipts', label: 'Comprobantes' },
          { href: '/dashboard/reservations', label: 'Reservas' },
          { href: '/dashboard/history', label: 'Historial' }
        ]
      : [
          { href: '/dashboard', label: 'Resumen' },
          { href: '/dashboard/reservations', label: 'Reservas' },
          { href: '/dashboard/history', label: 'Historial' }
        ];

  return (
    <div className="dashboard">
      <div className="container dashboard-grid">
        <aside className="dashboard-sidebar">
          <div className="brand">
            <span className="brand__eyebrow">Panel Academico</span>
            <span className="brand__title">
              {session.user.firstName} {session.user.lastName}
            </span>
          </div>

          <p className="hint" style={{ marginTop: 12 }}>
            Rol actual: <strong>{session.user.userType}</strong>
          </p>

          <nav className="nav-links" style={{ display: 'grid', marginTop: 22 }}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-link ${pathname === item.href ? 'nav-link--active' : ''}`}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <button className="button button--ghost" style={{ width: '100%', marginTop: 24 }} onClick={handleLogout}>
            Cerrar sesion
          </button>
        </aside>

        <section className="dashboard-panel">{children}</section>
      </div>
    </div>
  );
}
