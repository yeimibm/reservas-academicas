'use client';

import { useEffect, useState } from 'react';
import { API_BASE_URL, apiRequest } from '../lib/api';
import { getSession } from '../lib/session';

type Receipt = {
  id: string;
  extension_id: string | null;
  special_request_id: string | null;
  reservation_id: string | null;
  related_type: 'SPECIAL_REQUEST' | 'EXTENSION' | 'RESERVATION' | 'MANUAL';
  related_label: string;
  file_url: string;
  file_type: string;
  processing_status: string;
  amount: string | null;
  bank_name: string | null;
  payer_name: string | null;
  payment_date: string | null;
  ai_extracted_json?: {
    deposit_number?: string;
    payment_time?: string;
    summary?: string;
  };
  created_at: string;
};

export function ReceiptWorkspace() {
  const session = typeof window !== 'undefined' ? getSession() : null;
  const token = session?.accessToken ?? '';
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [showManualUpload, setShowManualUpload] = useState(false);

  function formatRelatedReceipt(receipt: Receipt) {
    switch (receipt.related_type) {
      case 'SPECIAL_REQUEST':
        return `Solicitud especial: ${receipt.related_label}`;
      case 'EXTENSION':
        return `Extension: ${receipt.related_label}`;
      case 'RESERVATION':
        return `Reserva: ${receipt.related_label}`;
      default:
        return 'Carga manual sin vinculo';
    }
  }

  function formatReceiptField(value: string | null | undefined, fallback: string) {
    return value && String(value).trim() ? value : fallback;
  }

  function formatExtractionValue(value: string | null | undefined) {
    return value && String(value).trim() ? value : 'Pendiente de analisis';
  }

  function getReceiptTiming(receipt: Receipt) {
    if (receipt.processing_status === 'APROBADO' && !receipt.bank_name && !receipt.amount && !receipt.payment_date) {
      return `Aprobado el ${new Date(receipt.created_at).toLocaleString()}`;
    }

    return `${formatReceiptField(receipt.payment_date, 'Fecha no extraida')} · ${new Date(receipt.created_at).toLocaleString()}`;
  }

  function getReceiptExtractionSummary(receipt: Receipt) {
    const depositNumber = receipt.ai_extracted_json?.deposit_number;
    const paymentTime = receipt.ai_extracted_json?.payment_time;

    if (!depositNumber && !paymentTime) {
      return receipt.processing_status === 'APROBADO'
        ? 'Extraccion automatica no disponible para este comprobante'
        : 'Extraccion automatica en espera';
    }

    return `Deposito ${formatReceiptField(depositNumber, 'no disponible')} · Hora ${formatReceiptField(
      paymentTime,
      'no disponible'
    )}`;
  }

  const latestManualReceipt = receipts.find((receipt) => receipt.related_type === 'MANUAL');

  async function loadReceipts() {
    if (!token) {
      return;
    }

    try {
      const data = await apiRequest<{ items: Receipt[] }>('/payment-receipts', { token });
      setReceipts(data.items);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No fue posible cargar los comprobantes');
    }
  }

  useEffect(() => {
    loadReceipts().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!token) {
      return;
    }

    const hasPendingProcessing = receipts.some((receipt) =>
      ['SUBIDO', 'PROCESADO_IA', 'POR_REVISAR'].includes(receipt.processing_status)
    );

    if (!hasPendingProcessing) {
      return;
    }

    const intervalId = window.setInterval(() => {
      loadReceipts().catch(() => undefined);
    }, 5000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [token, receipts]);

  async function openReceipt(receiptId: string) {
    try {
      const response = await fetch(`${API_BASE_URL}/payment-receipts/${receiptId}/file`, {
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      if (!response.ok) {
        throw new Error('No fue posible abrir el archivo');
      }

      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      window.open(objectUrl, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (openError) {
      setError(openError instanceof Error ? openError.message : 'No fue posible abrir el comprobante');
    }
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage('');
    setError('');

    try {
      if (!selectedFile) {
        throw new Error('Selecciona un archivo antes de registrar el comprobante');
      }

      const formData = new FormData();
      formData.append('file', selectedFile);

      await apiRequest('/payment-receipts', {
        method: 'POST',
        token,
        body: formData
      });

      setSelectedFile(null);
      setMessage('Comprobante cargado correctamente. El worker procesara la evidencia y dejara el registro por revisar.');
      await loadReceipts();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No fue posible registrar el comprobante');
    } finally {
      setLoading(false);
    }
  }

  async function handleReview(receiptId: string, action: 'approve' | 'reject') {
    setReviewingId(receiptId);
    setMessage('');
    setError('');

    try {
      await apiRequest(`/payment-receipts/${receiptId}/${action}`, {
        method: 'PATCH',
        token,
        body: {
          comments: reviewComments[receiptId] || undefined
        }
      });

      setMessage(
        action === 'approve'
          ? 'Comprobante aprobado correctamente.'
          : 'Comprobante rechazado correctamente.'
      );
      await loadReceipts();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'No fue posible revisar el comprobante');
    } finally {
      setReviewingId(null);
    }
  }

  return (
    <div className="workspace">
      <div className="dashboard-header">
        <span className="hero__eyebrow">Comprobantes</span>
        <h1>Revision administrativa con IA asistida</h1>
        <p>
          Direccion puede cargar imagenes o PDF para extensiones y solicitudes especiales. Las imagenes se envian al
          flujo de extraccion con Anthropic y luego quedan listas para revision humana.
        </p>
      </div>

      {message ? <div className="alert alert--success">{message}</div> : null}
      {error ? <div className="alert alert--error">{error}</div> : null}

      <div className="split-grid split-grid--equal">
        <div className="card form-grid">
          <div className="toolbar">
            <h3 style={{ margin: 0 }}>Carga manual excepcional</h3>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => setShowManualUpload((current) => !current)}
            >
              {showManualUpload ? 'Ocultar formulario' : 'Mostrar formulario'}
            </button>
          </div>
          <p className="hint">
            En el flujo normal, el estudiante o maestro adjunta su boleta desde su propia solicitud. Este formulario
            solo se usa si Direccion necesita registrar un comprobante manualmente.
          </p>

          {showManualUpload ? (
            <form className="form-grid" onSubmit={handleSubmit}>
              <div className="field">
                <label>Archivo</label>
                <input
                  type="file"
                  accept=".png,.jpg,.jpeg,.pdf"
                  onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
                  required
                />
              </div>
              <div className="readonly-grid">
                <div className="readonly-field">
                  <span className="readonly-field__label">Banco detectado</span>
                  <strong>{formatExtractionValue(latestManualReceipt?.bank_name)}</strong>
                </div>
                <div className="readonly-field">
                  <span className="readonly-field__label">Monto detectado</span>
                  <strong>{formatExtractionValue(latestManualReceipt?.amount)}</strong>
                </div>
                <div className="readonly-field">
                  <span className="readonly-field__label">Deposito detectado</span>
                  <strong>{formatExtractionValue(latestManualReceipt?.ai_extracted_json?.deposit_number)}</strong>
                </div>
                <div className="readonly-field">
                  <span className="readonly-field__label">Hora detectada</span>
                  <strong>{formatExtractionValue(latestManualReceipt?.ai_extracted_json?.payment_time)}</strong>
                </div>
              </div>
              <p className="hint">
                Estos campos son de solo lectura. Se llenan automaticamente cuando la IA procesa el ultimo comprobante
                manual cargado.
              </p>
              <button className="button button--primary" type="submit" disabled={loading}>
                Cargar comprobante
              </button>
            </form>
          ) : null}
        </div>

        <div className="card">
          <div className="toolbar">
            <h3 style={{ margin: 0 }}>Comprobantes recientes</h3>
            <span className="pill">{receipts.length} visibles</span>
          </div>
          <div className="list">
            {receipts.length === 0 ? (
              <div className="empty">Todavia no hay comprobantes registrados.</div>
            ) : (
              receipts.map((receipt) => (
                <div className="list-item" key={receipt.id}>
                  <strong>
                    {receipt.file_type.toUpperCase()} · {receipt.processing_status}
                  </strong>
                  <span>{formatRelatedReceipt(receipt)}</span>
                  <span>
                    {receipt.processing_status === 'APROBADO' && !receipt.bank_name && !receipt.amount && !receipt.payment_date
                      ? 'Aprobado manualmente por Direccion'
                      : `${formatReceiptField(receipt.bank_name, 'Banco no extraido')} · ${formatReceiptField(
                          receipt.amount,
                          'Monto no extraido'
                        )}`}
                  </span>
                  <span>{getReceiptTiming(receipt)}</span>
                  <span>{getReceiptExtractionSummary(receipt)}</span>
                  {receipt.processing_status === 'ERROR_PROCESAMIENTO' ? (
                    <div className="alert alert--warning">
                      El archivo fue recibido, pero la extraccion automatica fallo. Puedes revisarlo manualmente y aprobarlo
                      si corresponde.
                    </div>
                  ) : null}
                  <div className="receipt-actions">
                    <button className="button button--ghost" type="button" onClick={() => openReceipt(receipt.id)}>
                      Abrir archivo
                    </button>
                    {receipt.processing_status !== 'APROBADO' ? (
                      <>
                        <textarea
                          className="receipt-comment"
                          placeholder="Comentario de revision opcional"
                          value={reviewComments[receipt.id] ?? ''}
                          onChange={(event) =>
                            setReviewComments((current) => ({
                              ...current,
                              [receipt.id]: event.target.value
                            }))
                          }
                        />
                        <div className="receipt-review-buttons">
                          <button
                            className="button button--secondary"
                            type="button"
                            disabled={reviewingId === receipt.id}
                            onClick={() => handleReview(receipt.id, 'reject')}
                          >
                            Rechazar
                          </button>
                          <button
                            className="button button--primary"
                            type="button"
                            disabled={reviewingId === receipt.id}
                            onClick={() => handleReview(receipt.id, 'approve')}
                          >
                            Aprobar
                          </button>
                        </div>
                      </>
                    ) : (
                      <span className="pill">Bloqueado por aprobacion</span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
