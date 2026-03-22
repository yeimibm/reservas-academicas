import Link from 'next/link';

export function SiteHeader() {
  return (
    <header className="topbar">
      <div className="container topbar__inner">
        <Link href="/" className="brand">
          <span className="brand__eyebrow">Reserva Academica</span>
          <span className="brand__title">Campus UMG</span>
        </Link>

        <nav className="nav-links">
          <Link href="/" className="nav-link">
            Inicio
          </Link>
          <Link href="/login" className="nav-link">
            Iniciar sesion
          </Link>
          <Link href="/dashboard" className="button button--primary">
            Ir al panel
          </Link>
        </nav>
      </div>
    </header>
  );
}
