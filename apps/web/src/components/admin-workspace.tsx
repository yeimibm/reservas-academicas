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

function buildFacultyPrefix(name: string) {
  const normalized = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase();

  return (normalized.slice(0, 3) || 'FAC').padEnd(3, 'X');
}

function nextFacultyPreview(name: string, faculties: Faculty[]) {
  const prefix = buildFacultyPrefix(name);
  const count = faculties.filter((faculty) => faculty.code.startsWith(`${prefix}-`)).length + 1;
  return `${prefix}-${String(count).padStart(3, '0')}`;
}

function nextSpacePreview(spaces: Space[]) {
  return `salon-${String(spaces.length + 1).padStart(3, '0')}`;
}

export function AdminWorkspace() {
  const session = typeof window !== 'undefined' ? getSession() : null;
  const token = session?.accessToken ?? '';
  const [search, setSearch] = useState('');
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [spaces, setSpaces] = useState<Space[]>([]);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [savingFacultyId, setSavingFacultyId] = useState<string | null>(null);
  const [savingSpaceId, setSavingSpaceId] = useState<string | null>(null);
  const [editingFacultyId, setEditingFacultyId] = useState<string | null>(null);
  const [editingFacultyName, setEditingFacultyName] = useState('');
  const [editingSpaceId, setEditingSpaceId] = useState<string | null>(null);
  const [editingSpaceName, setEditingSpaceName] = useState('');
  const [facultyForm, setFacultyForm] = useState({ name: '' });
  const [spaceForm, setSpaceForm] = useState({ name: '', building: '', floor: '', capacity: '30' });
  const [userForm, setUserForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    userType: 'STUDENT',
    facultyId: '',
    studentCode: '',
    teacherCode: ''
  });

  async function loadAdminData() {
    if (!token) {
      return;
    }

    try {
      const [facultyData, spaceData] = await Promise.all([
        apiRequest<{ items: Faculty[] }>('/faculties', { token }),
        apiRequest<{ items: Space[] }>('/spaces', { token })
      ]);

      setFaculties(facultyData.items);
      setSpaces(spaceData.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar datos administrativos');
    }
  }

  useEffect(() => {
    loadAdminData().catch(() => undefined);
  }, []);

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
  }, [search, spaces]);

  async function handleCreateFaculty(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await apiRequest('/faculties', {
        method: 'POST',
        token,
        body: facultyForm
      });
      setFacultyForm({ name: '' });
      setMessage('Facultad creada correctamente con codigo automatico.');
      await loadAdminData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No fue posible crear la facultad');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateSpace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await apiRequest('/spaces', {
        method: 'POST',
        token,
        body: {
          ...spaceForm,
          capacity: Number(spaceForm.capacity)
        }
      });
      setSpaceForm({ name: '', building: '', floor: '', capacity: '30' });
      setMessage('Salon o espacio creado correctamente con codigo automatico.');
      await loadAdminData();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No fue posible crear el espacio');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateUser(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      await apiRequest('/users', {
        method: 'POST',
        token,
        body: {
          ...userForm,
          facultyId: userForm.facultyId || undefined,
          studentCode: userForm.userType === 'STUDENT' ? userForm.studentCode : undefined,
          teacherCode: userForm.userType === 'TEACHER' ? userForm.teacherCode : undefined
        }
      });
      setUserForm({
        firstName: '',
        lastName: '',
        email: '',
        password: '',
        userType: 'STUDENT',
        facultyId: '',
        studentCode: '',
        teacherCode: ''
      });
      setMessage('Usuario creado correctamente.');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No fue posible crear el usuario');
    } finally {
      setLoading(false);
    }
  }

  function startFacultyEdit(faculty: Faculty) {
    setEditingFacultyId(faculty.id);
    setEditingFacultyName(faculty.name);
    setMessage('');
    setError('');
  }

  function startSpaceEdit(space: Space) {
    setEditingSpaceId(space.id);
    setEditingSpaceName(space.name);
    setMessage('');
    setError('');
  }

  async function handleFacultyRename(facultyId: string) {
    setSavingFacultyId(facultyId);
    setError('');
    setMessage('');

    try {
      await apiRequest(`/faculties/${facultyId}`, {
        method: 'PATCH',
        token,
        body: {
          name: editingFacultyName
        }
      });
      setEditingFacultyId(null);
      setEditingFacultyName('');
      setMessage('Nombre de facultad actualizado correctamente.');
      await loadAdminData();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'No fue posible actualizar la facultad');
    } finally {
      setSavingFacultyId(null);
    }
  }

  async function handleSpaceRename(spaceId: string) {
    setSavingSpaceId(spaceId);
    setError('');
    setMessage('');

    try {
      await apiRequest(`/spaces/${spaceId}`, {
        method: 'PATCH',
        token,
        body: {
          name: editingSpaceName
        }
      });
      setEditingSpaceId(null);
      setEditingSpaceName('');
      setMessage('Nombre del salon actualizado correctamente.');
      await loadAdminData();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'No fue posible actualizar el salon');
    } finally {
      setSavingSpaceId(null);
    }
  }

  return (
    <div className="workspace">
      <div className="toolbar">
        <div>
          <h2 style={{ margin: 0 }}>Centro de administracion</h2>
          <p className="section__text" style={{ marginTop: 8 }}>
            Direccion prepara facultades, usuarios y salones para que estudiantes y maestros puedan operar desde el
            panel de reservas.
          </p>
        </div>

        <div className="toolbar-actions">
          <div className="searchbar searchbar--wide">
            <span>Buscar</span>
            <input
              placeholder="Facultades, salones, codigos, edificio..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>
          <Link href="/dashboard/receipts" className="button button--secondary">
            Comprobantes
          </Link>
        </div>
      </div>

      {message ? <div className="alert alert--success">{message}</div> : null}
      {error ? <div className="alert alert--error">{error}</div> : null}

      <div className="split-grid">
        <form className="card form-grid" onSubmit={handleCreateFaculty}>
          <h3 style={{ margin: 0 }}>Crear facultad</h3>
          <div className="field">
            <label>Nombre</label>
            <input
              value={facultyForm.name}
              onChange={(event) => setFacultyForm({ name: event.target.value })}
              required
            />
          </div>
          <div className="field">
            <label>Codigo generado</label>
            <input value={nextFacultyPreview(facultyForm.name, faculties)} readOnly />
          </div>
          <p className="hint">Formato automatico: tres letras en mayuscula mas correlativo por prefijo.</p>
          <button className="button button--primary" type="submit" disabled={loading}>
            Guardar facultad
          </button>
        </form>

        <form className="card form-grid" onSubmit={handleCreateSpace}>
          <h3 style={{ margin: 0 }}>Crear salon o espacio</h3>
          <div className="split-grid split-grid--equal">
            <div className="field">
              <label>Nombre</label>
              <input
                value={spaceForm.name}
                onChange={(event) => setSpaceForm((current) => ({ ...current, name: event.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label>Codigo generado</label>
              <input value={nextSpacePreview(spaces)} readOnly />
            </div>
          </div>
          <div className="split-grid split-grid--equal">
            <div className="field">
              <label>Edificio</label>
              <input
                value={spaceForm.building}
                onChange={(event) => setSpaceForm((current) => ({ ...current, building: event.target.value }))}
                required
              />
            </div>
            <div className="field">
              <label>Nivel</label>
              <input
                value={spaceForm.floor}
                onChange={(event) => setSpaceForm((current) => ({ ...current, floor: event.target.value }))}
                required
              />
            </div>
          </div>
          <div className="field">
            <label>Capacidad</label>
            <input
              type="number"
              min="1"
              value={spaceForm.capacity}
              onChange={(event) => setSpaceForm((current) => ({ ...current, capacity: event.target.value }))}
              required
            />
          </div>
          <button className="button button--secondary" type="submit" disabled={loading}>
            Guardar espacio
          </button>
        </form>
      </div>

      <form className="card form-grid" onSubmit={handleCreateUser}>
        <div className="toolbar">
          <h3 style={{ margin: 0 }}>Crear estudiante o maestro</h3>
          <span className="pill">Direccion administra altas</span>
        </div>
        <div className="split-grid split-grid--equal">
          <div className="field">
            <label>Nombres</label>
            <input
              value={userForm.firstName}
              onChange={(event) => setUserForm((current) => ({ ...current, firstName: event.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>Apellidos</label>
            <input
              value={userForm.lastName}
              onChange={(event) => setUserForm((current) => ({ ...current, lastName: event.target.value }))}
              required
            />
          </div>
        </div>

        <div className="split-grid split-grid--equal">
          <div className="field">
            <label>Correo</label>
            <input
              type="email"
              value={userForm.email}
              onChange={(event) => setUserForm((current) => ({ ...current, email: event.target.value }))}
              required
            />
          </div>
          <div className="field">
            <label>Contrasena temporal</label>
            <input
              type="password"
              value={userForm.password}
              onChange={(event) => setUserForm((current) => ({ ...current, password: event.target.value }))}
              required
            />
          </div>
        </div>

        <div className="split-grid split-grid--equal">
          <div className="field">
            <label>Tipo de usuario</label>
            <select
              value={userForm.userType}
              onChange={(event) =>
                setUserForm((current) => ({
                  ...current,
                  userType: event.target.value,
                  studentCode: '',
                  teacherCode: ''
                }))
              }
            >
              <option value="STUDENT">Estudiante</option>
              <option value="TEACHER">Maestro</option>
            </select>
          </div>
          <div className="field">
            <label>Facultad</label>
            <select
              value={userForm.facultyId}
              onChange={(event) => setUserForm((current) => ({ ...current, facultyId: event.target.value }))}
            >
              <option value="">Selecciona una facultad</option>
              {faculties.map((faculty) => (
                <option key={faculty.id} value={faculty.id}>
                  {faculty.code} - {faculty.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {userForm.userType === 'STUDENT' ? (
          <div className="field">
            <label>Carnet o codigo estudiantil</label>
            <input
              value={userForm.studentCode}
              onChange={(event) => setUserForm((current) => ({ ...current, studentCode: event.target.value }))}
              required
            />
          </div>
        ) : (
          <div className="field">
            <label>Codigo docente</label>
            <input
              value={userForm.teacherCode}
              onChange={(event) => setUserForm((current) => ({ ...current, teacherCode: event.target.value }))}
              required
            />
          </div>
        )}

        <button className="button button--primary" type="submit" disabled={loading}>
          Crear usuario
        </button>
      </form>

      <div className="split-grid split-grid--equal">
        <div className="card">
          <div className="toolbar">
            <h3 style={{ margin: 0 }}>Facultades</h3>
            <span className="pill">{filteredFaculties.length} visibles</span>
          </div>
          <div className="list">
            {filteredFaculties.length === 0 ? (
              <div className="empty">Todavia no hay facultades que coincidan con la busqueda.</div>
            ) : (
              filteredFaculties.map((faculty) => (
                <div className="list-item" key={faculty.id}>
                  <strong>{faculty.code}</strong>
                  {editingFacultyId === faculty.id ? (
                    <div className="inline-editor">
                      <input
                        value={editingFacultyName}
                        onChange={(event) => setEditingFacultyName(event.target.value)}
                      />
                      <div className="receipt-review-buttons">
                        <button
                          className="button button--primary"
                          type="button"
                          disabled={savingFacultyId === faculty.id}
                          onClick={() => handleFacultyRename(faculty.id)}
                        >
                          Guardar nombre
                        </button>
                        <button
                          className="button button--ghost"
                          type="button"
                          onClick={() => {
                            setEditingFacultyId(null);
                            setEditingFacultyName('');
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span className="inline-display">{faculty.name}</span>
                  )}
                  <span>Estado {faculty.status}</span>
                  {editingFacultyId !== faculty.id ? (
                    <button className="button button--ghost" type="button" onClick={() => startFacultyEdit(faculty)}>
                      Editar nombre
                    </button>
                  ) : null}
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
              <div className="empty">No hay espacios que coincidan con la busqueda.</div>
            ) : (
              filteredSpaces.map((space) => (
                <div className="list-item" key={space.id}>
                  <strong>{space.code}</strong>
                  {editingSpaceId === space.id ? (
                    <div className="inline-editor">
                      <input value={editingSpaceName} onChange={(event) => setEditingSpaceName(event.target.value)} />
                      <div className="receipt-review-buttons">
                        <button
                          className="button button--primary"
                          type="button"
                          disabled={savingSpaceId === space.id}
                          onClick={() => handleSpaceRename(space.id)}
                        >
                          Guardar nombre
                        </button>
                        <button
                          className="button button--ghost"
                          type="button"
                          onClick={() => {
                            setEditingSpaceId(null);
                            setEditingSpaceName('');
                          }}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <span className="inline-display">{space.name}</span>
                  )}
                  <span>
                    {space.building} · Nivel {space.floor} · Capacidad {space.capacity}
                  </span>
                  {editingSpaceId !== space.id ? (
                    <button className="button button--ghost" type="button" onClick={() => startSpaceEdit(space)}>
                      Editar nombre
                    </button>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
