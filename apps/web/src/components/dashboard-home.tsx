'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { apiRequest } from '../lib/api';
import { getSession } from '../lib/session';

type Faculty = {
  id: string;
  name: string;
  code: string;
  status: string;
};

type Space = {
  id: string;
  name: string;
  code: string;
  building: string;
  floor: string;
  capacity: number;
  status: string;
};

export function DashboardHome() {
  const session = typeof window !== 'undefined' ? getSession() : null;
  const isDirection = session?.user.userType === 'DIRECTION';
  const token = session?.accessToken ?? '';
  const [search, setSearch] = useState('');
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isDirection || !token) {
      return;
    }

    async function load() {
      try {
        const [facultyData, spaceData] = await Promise.all([
          apiRequest<{ items: Faculty[] }>('/faculties', { token }),
          apiRequest<{ items: Space[] }>('/spaces', { token })
        ]);

        setFaculties(facultyData.items);
        setSpaces(spaceData.items);
      } catch (loadError) {
        setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar el resumen administrativo');
      }
    }

    load().catch(() => undefined);
  }, [isDirection, token]);

  const filteredFaculties = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return faculties;
    }

    return faculties.filter((faculty) =>
      [faculty.name, faculty.code].some((value) => value.toLowerCase().includes(term))
    );
  }, [faculties, search]);

  const filteredSpaces = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) {
      return spaces;
    }

    return spaces.filter((space) =>
      [space.name, space.code, space.building, String(space.floor)].some((value) =>
        value.toLowerCase().includes(term)
      )
    );
  }, [spaces, search]);

  if (!isDirection) {
    return (
      <>
        <div className="dashboard-header">
          <span className="hero__eyebrow">Panel academico</span>
          <h1>Tu espacio de reservas academicas</h1>
          <p>Consulta disponibilidad, crea reservas y revisa el historial de tus actividades academicas.</p>
        </div>

        <div className="panel-grid">
          <div className="stat-card">
            <span className="hero__eyebrow">Usuarios</span>
            <strong>Perfil activo</strong>
            <p className="hint">Tu cuenta ya esta lista para operar dentro del sistema.</p>
          </div>

          <div className="stat-card">
            <span className="hero__eyebrow">Espacios</span>
            <strong>Disponibilidad en vivo</strong>
            <p className="hint">Consulta salones libres antes de confirmar una reserva.</p>
          </div>

          <div className="stat-card">
            <span className="hero__eyebrow">Reservas</span>
            <strong>2 horas por defecto</strong>
            <p className="hint">El backend calcula fin de reserva y buffer de limpieza automaticamente.</p>
          </div>

          <div className="stat-card">
            <span className="hero__eyebrow">Ir al modulo</span>
            <strong>Reservas</strong>
            <p className="hint" style={{ marginBottom: 12 }}>
              Abre reservas para consultar disponibilidad y apartar un salon.
            </p>
            <Link href="/dashboard/reservations" className="button button--primary">
              Abrir reservas
            </Link>
          </div>
        </div>
      </>
    );
  }

  return (
    <div className="workspace">
      <div className="dashboard-header">
        <span className="hero__eyebrow">Centro de direccion</span>
        <h1>Resumen institucional y operativo</h1>
        <p>
          Administra facultades, espacios academicos y accesos del sistema. Este resumen te permite buscar por
          codigo, facultad o salon antes de entrar a cada modulo.
        </p>
      </div>

      <div className="toolbar">
        <div className="searchbar searchbar--wide">
          <span>Buscar</span>
          <input
            placeholder="Codigo, facultad, salon o edificio"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="toolbar-actions">
          <Link href="/dashboard/admin" className="button button--primary">
            Administracion
          </Link>
          <Link href="/dashboard/receipts" className="button button--secondary">
            Comprobantes
          </Link>
        </div>
      </div>

      {error ? <div className="alert alert--error">{error}</div> : null}

      <div className="panel-grid panel-grid--triple">
        <div className="stat-card stat-card--navy">
          <span className="hero__eyebrow">Facultades</span>
          <strong>{faculties.length}</strong>
          <p className="hint">Catalogo academico listo para asignar estudiantes y maestros.</p>
        </div>

        <div className="stat-card stat-card--green">
          <span className="hero__eyebrow">Espacios</span>
          <strong>{spaces.length}</strong>
          <p className="hint">Salones disponibles para futuras reservas, series y solicitudes especiales.</p>
        </div>

        <div className="stat-card stat-card--purple">
          <span className="hero__eyebrow">Comprobantes</span>
          <strong>IA asistida</strong>
          <p className="hint">La base backend ya soporta comprobantes y extraccion con Anthropic; la carga binaria total sigue como siguiente iteracion.</p>
        </div>
      </div>

      <div className="split-grid split-grid--equal">
        <div className="card">
          <div className="toolbar">
            <h3 style={{ margin: 0 }}>Facultades registradas</h3>
            <span className="pill">{filteredFaculties.length} visibles</span>
          </div>
          <div className="list">
            {filteredFaculties.length === 0 ? (
              <div className="empty">No hay facultades que coincidan con la busqueda actual.</div>
            ) : (
              filteredFaculties.map((faculty) => (
                <div className="list-item" key={faculty.id}>
                  <strong>
                    {faculty.code} · {faculty.name}
                  </strong>
                  <span>Estado {faculty.status}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="toolbar">
            <h3 style={{ margin: 0 }}>Espacios academicos</h3>
            <span className="pill">{filteredSpaces.length} visibles</span>
          </div>
          <div className="list">
            {filteredSpaces.length === 0 ? (
              <div className="empty">No hay salones o espacios que coincidan con la busqueda actual.</div>
            ) : (
              filteredSpaces.map((space) => (
                <div className="list-item" key={space.id}>
                  <strong>
                    {space.code} · {space.name}
                  </strong>
                  <span>
                    {space.building} · Nivel {space.floor} · Capacidad {space.capacity}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
