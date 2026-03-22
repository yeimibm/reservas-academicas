'use client';

import { useEffect, useState } from 'react';
import { apiRequest } from '../lib/api';
import { formatFriendlyDateTime } from '../lib/date-format';
import { getSession } from '../lib/session';

type ExtensionReview = {
  id: string;
  status: string;
  requested_at: string;
  requested_new_end_at: string;
  amount_to_pay: string;
  event_name: string;
  requested_by_first_name: string;
  requested_by_last_name: string;
  receipt_id: string | null;
  receipt_status: string | null;
};

type SpecialReview = {
  id: string;
  status: string;
  requested_at: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  amount_to_pay: string;
  event_name: string;
  requested_by_first_name: string;
  requested_by_last_name: string;
  space_code: string;
  space_name: string;
  receipt_id: string | null;
  receipt_status: string | null;
};

export function ReviewWorkspace() {
  const session = typeof window !== 'undefined' ? getSession() : null;
  const token = session?.accessToken ?? '';
  const [extensions, setExtensions] = useState<ExtensionReview[]>([]);
  const [specialRequests, setSpecialRequests] = useState<SpecialReview[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loadingId, setLoadingId] = useState<string | null>(null);

  async function loadItems() {
    if (!token) {
      return;
    }

    try {
      const [extensionData, specialData] = await Promise.all([
        apiRequest<{ items: ExtensionReview[] }>('/extensions', { token }),
        apiRequest<{ items: SpecialReview[] }>('/special-reservations', { token })
      ]);

      setExtensions(
        extensionData.items.filter((item) => ['PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'PENDING_REVIEW'].includes(item.status))
      );
      setSpecialRequests(
        specialData.items.filter((item) =>
          ['PENDING_PAYMENT', 'PAYMENT_UNDER_REVIEW', 'PENDING_REVIEW'].includes(item.status)
        )
      );
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar las solicitudes');
    }
  }

  useEffect(() => {
    loadItems().catch(() => undefined);
  }, []);

  async function reviewExtension(id: string, action: 'approve' | 'reject') {
    setLoadingId(id);
    setError('');
    setMessage('');

    try {
      await apiRequest(`/extensions/${id}/${action}`, {
        method: 'PATCH',
        token,
        body: {
          comments: comments[id] || undefined
        }
      });
      setMessage(action === 'approve' ? 'Extension revisada correctamente.' : 'Extension rechazada correctamente.');
      await loadItems();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'No fue posible revisar la extension');
    } finally {
      setLoadingId(null);
    }
  }

  async function reviewSpecialRequest(id: string, action: 'approve' | 'reject') {
    setLoadingId(id);
    setError('');
    setMessage('');

    try {
      await apiRequest(`/special-reservations/${id}/${action}`, {
        method: 'PATCH',
        token,
        body: {
          comments: comments[id] || undefined
        }
      });
      setMessage(
        action === 'approve'
          ? 'Solicitud especial revisada correctamente.'
          : 'Solicitud especial rechazada correctamente.'
      );
      await loadItems();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'No fue posible revisar la solicitud especial');
    } finally {
      setLoadingId(null);
    }
  }

  function goToReceipts() {
    window.location.href = '/dashboard/receipts';
  }

  function renderReceiptState(receiptStatus: string | null) {
    if (!receiptStatus) {
      return <div className="alert alert--warning">Esperando que el usuario cargue su comprobante de pago.</div>;
    }

    if (receiptStatus === 'APROBADO') {
      return <div className="alert alert--success">Comprobante aprobado y listo para decision final.</div>;
    }

    if (receiptStatus === 'ERROR_PROCESAMIENTO') {
      return (
        <div className="alert alert--warning">
          El comprobante fue recibido, pero la IA no pudo procesarlo automaticamente. Revísalo desde Comprobantes.
        </div>
      );
    }

    if (receiptStatus === 'RECHAZADO') {
      return <div className="alert alert--warning">El comprobante fue rechazado. El usuario debe volver a cargarlo.</div>;
    }

    return <div className="alert alert--warning">Comprobante recibido. Pendiente de revision en Direccion.</div>;
  }

  return (
    <div className="workspace">
      <div className="dashboard-header">
        <span className="hero__eyebrow">Solicitudes</span>
        <h1>Revisiones pendientes de Direccion</h1>
        <p>
          Estudiantes y maestros solo envian solicitudes. La ampliacion de horas o reservas especiales multi-dia
          siempre quedan sujetas a tu revision final.
        </p>
      </div>

      {message ? <div className="alert alert--success">{message}</div> : null}
      {error ? <div className="alert alert--error">{error}</div> : null}

      <div className="split-grid split-grid--equal">
        <div className="card">
          <div className="toolbar">
            <h3 style={{ margin: 0 }}>Extensiones pendientes</h3>
            <span className="pill">{extensions.length} visibles</span>
          </div>
          <div className="list">
            {extensions.length === 0 ? (
              <div className="empty">No hay extensiones pendientes por el momento.</div>
            ) : (
              extensions.map((extension) => (
                <div className="list-item" key={extension.id}>
                  <strong>{extension.event_name}</strong>
                  <span>Estado actual: {extension.status}</span>
                  <span>
                    {extension.requested_by_first_name} {extension.requested_by_last_name} · Nuevo fin{' '}
                    {formatFriendlyDateTime(extension.requested_new_end_at)}
                  </span>
                  <span>Monto: Q{extension.amount_to_pay}</span>
                  <span>Comprobante: {extension.receipt_status || 'NO_CARGADO'}</span>
                  {renderReceiptState(extension.receipt_status)}
                  <textarea
                    className="receipt-comment"
                    placeholder="Comentario administrativo opcional"
                    value={comments[extension.id] ?? ''}
                    onChange={(event) =>
                      setComments((current) => ({
                        ...current,
                        [extension.id]: event.target.value
                      }))
                    }
                  />
                  {extension.receipt_status !== 'APROBADO' ? (
                    <div className="receipt-review-buttons">
                      <button className="button button--ghost" type="button" onClick={goToReceipts}>
                        Revisar comprobantes
                      </button>
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={loadingId === extension.id}
                        onClick={() => reviewExtension(extension.id, 'reject')}
                      >
                        Rechazar
                      </button>
                    </div>
                  ) : (
                    <div className="receipt-review-buttons">
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={loadingId === extension.id}
                        onClick={() => reviewExtension(extension.id, 'reject')}
                      >
                        Rechazar
                      </button>
                      <button
                        className="button button--primary"
                        type="button"
                        disabled={loadingId === extension.id}
                        onClick={() => reviewExtension(extension.id, 'approve')}
                      >
                        Aprobar
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="toolbar">
            <h3 style={{ margin: 0 }}>Solicitudes especiales pendientes</h3>
            <span className="pill">{specialRequests.length} visibles</span>
          </div>
          <div className="list">
            {specialRequests.length === 0 ? (
              <div className="empty">No hay solicitudes especiales pendientes por el momento.</div>
            ) : (
              specialRequests.map((request) => (
                <div className="list-item" key={request.id}>
                  <strong>{request.event_name}</strong>
                  <span>Estado actual: {request.status}</span>
                  <span>
                    {request.requested_by_first_name} {request.requested_by_last_name} · {request.space_code} ·{' '}
                    {request.space_name}
                  </span>
                  <span>
                    {request.start_date} a {request.end_date} · {request.start_time} - {request.end_time}
                  </span>
                  <span>Monto: Q{request.amount_to_pay}</span>
                  <span>Comprobante: {request.receipt_status || 'NO_CARGADO'}</span>
                  {renderReceiptState(request.receipt_status)}
                  <textarea
                    className="receipt-comment"
                    placeholder="Comentario administrativo opcional"
                    value={comments[request.id] ?? ''}
                    onChange={(event) =>
                      setComments((current) => ({
                        ...current,
                        [request.id]: event.target.value
                      }))
                    }
                  />
                  {request.receipt_status !== 'APROBADO' ? (
                    <div className="receipt-review-buttons">
                      <button className="button button--ghost" type="button" onClick={goToReceipts}>
                        Revisar comprobantes
                      </button>
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={loadingId === request.id}
                        onClick={() => reviewSpecialRequest(request.id, 'reject')}
                      >
                        Rechazar
                      </button>
                    </div>
                  ) : (
                    <div className="receipt-review-buttons">
                      <button
                        className="button button--secondary"
                        type="button"
                        disabled={loadingId === request.id}
                        onClick={() => reviewSpecialRequest(request.id, 'reject')}
                      >
                        Rechazar
                      </button>
                      <button
                        className="button button--primary"
                        type="button"
                        disabled={loadingId === request.id}
                        onClick={() => reviewSpecialRequest(request.id, 'approve')}
                      >
                        Aprobar
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
