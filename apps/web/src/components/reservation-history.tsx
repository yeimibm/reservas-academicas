'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { formatFriendlyDateTime } from '../lib/date-format';
import { getSession } from '../lib/session';

type Reservation = {
  id: string;
  event_name: string;
  status: string;
  start_at: string;
  end_at: string;
  effective_end_at: string;
};

export function ReservationHistory() {
  const [items, setItems] = useState<Reservation[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session) {
      setError('No se encontro una sesion activa');
      return;
    }

    apiRequest<{ items: Reservation[] }>('/reservations/my', {
      token: session.accessToken
    })
      .then((data) => setItems(data.items))
      .catch((historyError) => {
        setError(historyError instanceof Error ? historyError.message : 'No fue posible cargar el historial');
      });
  }, []);

  if (error) {
    return <div className="alert alert--error">{error}</div>;
  }

  return (
    <div className="card">
      <h2 style={{ marginTop: 0 }}>Historial de reservas</h2>
      <div className="list">
        {items.length === 0 ? (
          <div className="empty">No hay reservas registradas para mostrar.</div>
        ) : (
          items.map((item) => (
            <div className="list-item" key={item.id}>
              <strong>{item.event_name}</strong>
              <p>
                Estado: {item.status}
                <br />
                Inicio: {formatFriendlyDateTime(item.start_at)}
                <br />
                Fin: {formatFriendlyDateTime(item.end_at)}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
