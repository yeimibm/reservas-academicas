'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { apiRequest } from '../lib/api';
import {
  addMinutesToClock,
  getBusinessDatesBetween,
  extractUtcDate,
  extractUtcTime,
  formatFriendlyDateTime,
  formatFriendlyTimeFromClock,
  nextBusinessDate,
  toUtcWallClock
} from '../lib/date-format';
import { normalizeReceiptFile } from '../lib/receipt-upload';
import { getSession } from '../lib/session';

type AvailableSpace = {
  id: string;
  name: string;
  code: string;
  building: string;
  floor: string;
  capacity: number;
};

type Reservation = {
  id: string;
  event_name: string;
  event_description?: string | null;
  start_at: string;
  end_at: string;
  effective_end_at: string;
  status: string;
  space_id: string;
  reservation_type?: string;
};

type ExtensionRequest = {
  id: string;
  status: string;
  requested_new_end_at: string;
  amount_to_pay: string;
  event_name: string;
  receipt_status: string | null;
};

type SpecialRequest = {
  id: string;
  status: string;
  start_date: string;
  end_date: string;
  start_time: string;
  end_time: string;
  amount_to_pay: string;
  event_name: string;
  space_code: string;
  space_name: string;
  receipt_status: string | null;
};

const timeOptions = Array.from({ length: 13 }, (_, index) => {
  const hour = 8 + index;
  return `${String(hour).padStart(2, '0')}:00`;
});
const PAYMENT_AMOUNT = 900;

export function ReservationWorkspace() {
  const [date, setDate] = useState('2026-04-01');
  const [startTime, setStartTime] = useState('15:00');
  const [eventName, setEventName] = useState('Sesion academica');
  const [eventDescription, setEventDescription] = useState('Reserva creada desde el panel web');
  const [availableSpaces, setAvailableSpaces] = useState<AvailableSpace[]>([]);
  const [myReservations, setMyReservations] = useState<Reservation[]>([]);
  const [myExtensions, setMyExtensions] = useState<ExtensionRequest[]>([]);
  const [mySpecialRequests, setMySpecialRequests] = useState<SpecialRequest[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [requestModalLoading, setRequestModalLoading] = useState(false);
  const [receiptUploading, setReceiptUploading] = useState(false);
  const [extensionModalReservation, setExtensionModalReservation] = useState<Reservation | null>(null);
  const [extensionType, setExtensionType] = useState<'hours' | 'days'>('hours');
  const [extensionTime, setExtensionTime] = useState('18:00');
  const [extensionEndDate, setExtensionEndDate] = useState('2026-04-03');
  const [extensionComments, setExtensionComments] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreviewUrl, setReceiptPreviewUrl] = useState('');
  const [pendingReceiptTarget, setPendingReceiptTarget] = useState<{
    kind: 'extension' | 'special';
    requestId: string;
  } | null>(null);
  const [receiptRetryTarget, setReceiptRetryTarget] = useState<{
    kind: 'extension' | 'special';
    requestId: string;
  } | null>(null);
  const [modalMessage, setModalMessage] = useState('');
  const [modalError, setModalError] = useState('');

  const session = typeof window !== 'undefined' ? getSession() : null;
  const receiptInputRef = useRef<HTMLInputElement | null>(null);
  const reservationEndTime = useMemo(() => addMinutesToClock(startTime, 120), [startTime]);
  const reservationFreeTime = useMemo(() => addMinutesToClock(reservationEndTime, 15), [reservationEndTime]);
  const notifications = useMemo(() => {
    const items: Array<{ id: string; type: 'success' | 'warning' | 'info'; text: string }> = [];

    myExtensions.forEach((extension) => {
      if (extension.status === 'APPROVED') {
        items.push({
          id: `extension-approved-${extension.id}`,
          type: 'success',
          text: `Tu solicitud de extensión para "${extension.event_name}" fue aprobada. La reserva ya refleja el nuevo horario solicitado.`
        });
      } else if (extension.receipt_status === 'RECHAZADO') {
        items.push({
          id: `extension-receipt-rejected-${extension.id}`,
          type: 'warning',
          text: `Tu comprobante de extensión para "${extension.event_name}" fue rechazado. Debes volver a cargar una nueva boleta.`
        });
      } else if (extension.status === 'PAYMENT_UNDER_REVIEW') {
        items.push({
          id: `extension-review-${extension.id}`,
          type: 'info',
          text: `La extensión para "${extension.event_name}" está en revisión por Dirección.`
        });
      }
    });

    mySpecialRequests.forEach((request) => {
      if (request.status === 'SCHEDULED') {
        items.push({
          id: `special-approved-${request.id}`,
          type: 'success',
          text: `Tu solicitud especial "${request.event_name}" fue aprobada. Los días adicionales ya fueron creados como nuevas reservas.`
        });
      } else if (request.receipt_status === 'RECHAZADO') {
        items.push({
          id: `special-receipt-rejected-${request.id}`,
          type: 'warning',
          text: `El comprobante de tu solicitud especial "${request.event_name}" fue rechazado. Debes volver a cargar una nueva boleta.`
        });
      } else if (request.status === 'PAYMENT_UNDER_REVIEW') {
        items.push({
          id: `special-review-${request.id}`,
          type: 'info',
          text: `La solicitud especial "${request.event_name}" está en revisión por Dirección.`
        });
      }
    });

    return items.slice(0, 6);
  }, [myExtensions, mySpecialRequests]);
  const normalReservations = useMemo(
    () => myReservations.filter((reservation) => reservation.reservation_type !== 'SPECIAL_APPROVED'),
    [myReservations]
  );
  const approvedSpecialReservations = useMemo(
    () => myReservations.filter((reservation) => reservation.reservation_type === 'SPECIAL_APPROVED'),
    [myReservations]
  );

  async function loadAvailability() {
    try {
      setError('');
      const data = await apiRequest<{ items: AvailableSpace[] }>(
        `/spaces/available?date=${date}&startTime=${startTime}&endTime=${reservationEndTime}`
      );
      setAvailableSpaces(data.items);
      setSelectedSpaceId((current) => {
        if (data.items.some((item) => item.id === current)) {
          return current;
        }

        return data.items[0]?.id ?? '';
      });
    } catch (availabilityError) {
      setAvailableSpaces([]);
      setSelectedSpaceId('');
      setError(availabilityError instanceof Error ? availabilityError.message : 'No fue posible consultar disponibilidad');
    }
  }

  async function loadMyReservations() {
    if (!session) {
      return;
    }

    try {
      const data = await apiRequest<{ items: Reservation[] }>('/reservations/my', {
        token: session.accessToken
      });
      setMyReservations(data.items);
    } catch (historyError) {
      setError(historyError instanceof Error ? historyError.message : 'No fue posible cargar tus reservas');
    }
  }

  async function loadMyRequests() {
    if (!session) {
      return;
    }

    try {
      const [extensionData, specialData] = await Promise.all([
        apiRequest<{ items: ExtensionRequest[] }>('/extensions/my', {
          token: session.accessToken
        }),
        apiRequest<{ items: SpecialRequest[] }>('/special-reservations/my', {
          token: session.accessToken
        })
      ]);

      setMyExtensions(extensionData.items);
      setMySpecialRequests(specialData.items);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'No fue posible cargar tus solicitudes');
    }
  }

  useEffect(() => {
    loadAvailability().catch(() => undefined);
  }, [date, startTime]);

  useEffect(() => {
    loadMyReservations().catch(() => undefined);
    loadMyRequests().catch(() => undefined);
  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    const intervalId = window.setInterval(() => {
      loadMyReservations().catch(() => undefined);
      loadMyRequests().catch(() => undefined);
    }, 15000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [session]);

  useEffect(() => {
    if (!receiptFile || receiptFile.type === 'application/pdf') {
      setReceiptPreviewUrl('');
      return;
    }

    const nextUrl = URL.createObjectURL(receiptFile);
    setReceiptPreviewUrl(nextUrl);

    return () => {
      URL.revokeObjectURL(nextUrl);
    };
  }, [receiptFile]);

  async function handleCreateReservation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      setError('No se encontro una sesion activa');
      return;
    }

    setLoading(true);
    setError('');
    setMessage('');

    try {
      await apiRequest('/reservations', {
        method: 'POST',
        token: session.accessToken,
        body: {
          spaceId: selectedSpaceId,
          eventName,
          eventDescription,
          startAt: toUtcWallClock(date, startTime)
        }
      });

      setAvailableSpaces((current) => current.filter((space) => space.id !== selectedSpaceId));
      setSelectedSpaceId('');
      setMessage('Reserva creada correctamente.');
      await loadMyReservations();
      await loadMyRequests();
      await loadAvailability();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'No fue posible crear la reserva');
    } finally {
      setLoading(false);
    }
  }

  function openExtensionModal(reservation: Reservation) {
    const baseDate = extractUtcDate(reservation.start_at);
    const nextDay = nextBusinessDate(baseDate);
    setExtensionModalReservation(reservation);
    setExtensionType('hours');
    setExtensionTime(addMinutesToClock(extractUtcTime(reservation.end_at), 60));
    setExtensionEndDate(nextDay);
    setExtensionComments('');
    setReceiptFile(null);
    setReceiptPreviewUrl('');
    setPendingReceiptTarget(null);
    setReceiptRetryTarget(null);
    setModalMessage('');
    setModalError('');
  }

  function openReceiptRetry(kind: 'extension' | 'special', requestId: string) {
    setExtensionModalReservation(null);
    setPendingReceiptTarget({ kind, requestId });
    setReceiptRetryTarget({ kind, requestId });
    setReceiptFile(null);
    setReceiptPreviewUrl('');
    setExtensionComments('');
    setModalMessage('Direccion rechazo tu boleta anterior. Carga una nueva imagen del comprobante para continuar.');
    setModalError('');
  }

  async function handleReceiptUpload() {
    if (!session || !pendingReceiptTarget || !receiptFile) {
      setModalError('Debes seleccionar un comprobante antes de continuar');
      return;
    }

    setReceiptUploading(true);
    setModalError('');
    setModalMessage('');

    try {
      const formData = new FormData();
      formData.append('file', receiptFile);

      if (pendingReceiptTarget.kind === 'extension') {
        formData.append('extensionId', pendingReceiptTarget.requestId);
      } else {
        formData.append('specialRequestId', pendingReceiptTarget.requestId);
      }

      await apiRequest('/payment-receipts', {
        method: 'POST',
        token: session.accessToken,
        body: formData
      });

      setModalMessage('Solicitud y comprobante enviados correctamente. Direccion podra revisarlos.');
      setMessage('Solicitud y comprobante enviados correctamente. Direccion podra revisarlos.');
      setReceiptFile(null);
      setReceiptPreviewUrl('');
      setPendingReceiptTarget(null);
      setReceiptRetryTarget(null);
      await loadMyRequests();
      window.setTimeout(() => {
        setExtensionModalReservation(null);
        setModalMessage('');
        setModalError('');
      }, 900);
    } catch (uploadError) {
      setModalError(uploadError instanceof Error ? uploadError.message : 'No fue posible cargar el comprobante');
    } finally {
      setReceiptUploading(false);
    }
  }

  async function handleReceiptFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) {
      setReceiptFile(null);
      setReceiptPreviewUrl('');
      return;
    }

    try {
      setModalError('');
      const normalized = await normalizeReceiptFile(selected);
      setReceiptFile(normalized);
      setModalMessage(
        normalized.name !== selected.name
          ? `La imagen se preparo como ${normalized.name} para enviarla a Direccion.`
          : 'Boleta lista para enviarse a Direccion.'
      );
    } catch (conversionError) {
      setReceiptFile(null);
      setReceiptPreviewUrl('');
      setModalError(conversionError instanceof Error ? conversionError.message : 'No fue posible preparar la boleta');
    }
  }

  function clearReceiptSelection() {
    setReceiptFile(null);
    setReceiptPreviewUrl('');
    setModalMessage('');
    setModalError('');
    if (receiptInputRef.current) {
      receiptInputRef.current.value = '';
    }
  }

  async function handleExtensionRequest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !extensionModalReservation) {
      return;
    }

    setRequestModalLoading(true);
    setModalError('');
    setModalMessage('');

    try {
      if (extensionType === 'hours') {
        const response = await apiRequest<{ id: string }>(`/reservations/${extensionModalReservation.id}/request-extension`, {
          method: 'POST',
          token: session.accessToken,
          body: {
            requestedNewEndAt: toUtcWallClock(extractUtcDate(extensionModalReservation.start_at), extensionTime),
            comments: extensionComments || undefined
          }
        });
        setPendingReceiptTarget({ kind: 'extension', requestId: response.id });
      } else {
        const reservationDate = extractUtcDate(extensionModalReservation.start_at);
        const specialStartDate = nextBusinessDate(reservationDate);

        if (extensionEndDate < specialStartDate) {
          throw new Error('Para solicitar varios dias debes elegir una fecha igual o posterior al siguiente dia habil');
        }

        const businessDates = getBusinessDatesBetween(specialStartDate, extensionEndDate);
        if (businessDates.length === 0) {
          throw new Error('El rango seleccionado no contiene dias habiles');
        }
        if (businessDates.length > 6) {
          throw new Error('El maximo permitido es de 6 dias habiles');
        }

        const response = await apiRequest<{ id: string }>('/special-reservations', {
          method: 'POST',
          token: session.accessToken,
          body: {
            spaceId: extensionModalReservation.space_id,
            eventName: extensionModalReservation.event_name,
            eventDescription: extensionModalReservation.event_description ?? undefined,
            startDate: specialStartDate,
            endDate: extensionEndDate,
            startTime: extractUtcTime(extensionModalReservation.start_at),
            endTime: extractUtcTime(extensionModalReservation.end_at),
            comments: extensionComments || undefined
          }
        });
        setPendingReceiptTarget({ kind: 'special', requestId: response.id });
      }

      setModalMessage(
        extensionType === 'hours'
          ? 'Solicitud de extension creada. Ahora adjunta el comprobante por Q900.00.'
          : 'Solicitud especial creada. Ahora adjunta el comprobante por Q900.00.'
      );
    } catch (submitError) {
      setModalError(submitError instanceof Error ? submitError.message : 'No fue posible enviar la solicitud');
    } finally {
      setRequestModalLoading(false);
    }
  }

  return (
    <div className="workspace">
      <div className="toolbar">
        <div>
          <h2 style={{ margin: 0 }}>Reservas y disponibilidad</h2>
          <p className="section__text" style={{ marginTop: 8 }}>
            El sistema reserva 2 horas por defecto y agrega 15 minutos de limpieza antes de liberar el salon.
          </p>
        </div>

        <button className="button button--secondary" type="button" onClick={() => loadAvailability()}>
          Actualizar disponibilidad
        </button>
      </div>

      {notifications.length > 0 ? (
        <div className="card">
          <div className="toolbar">
            <h3 style={{ marginTop: 0 }}>Notificaciones</h3>
            <span className="pill">{notifications.length} visibles</span>
          </div>
          <div className="list">
            {notifications.map((notification) => (
              <div
                key={notification.id}
                className={
                  notification.type === 'success'
                    ? 'alert alert--success'
                    : notification.type === 'warning'
                      ? 'alert alert--warning'
                      : 'alert alert--info'
                }
                style={{ marginTop: 0 }}
              >
                {notification.text}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      <div className="split-grid">
        <form className="card form-grid" onSubmit={handleCreateReservation}>
          <div className="field">
            <label htmlFor="eventName">Nombre del evento</label>
            <input id="eventName" value={eventName} onChange={(event) => setEventName(event.target.value)} required />
          </div>

          <div className="field">
            <label htmlFor="eventDescription">Descripcion</label>
            <textarea id="eventDescription" value={eventDescription} onChange={(event) => setEventDescription(event.target.value)} />
          </div>

          <div className="split-grid split-grid--equal">
            <div className="field">
              <label htmlFor="date">Fecha</label>
              <input id="date" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
            </div>

            <div className="field">
              <label htmlFor="spaceId">Espacio disponible</label>
              <select id="spaceId" value={selectedSpaceId} onChange={(event) => setSelectedSpaceId(event.target.value)} required>
                <option value="">Selecciona un salon</option>
                {availableSpaces.map((space) => (
                  <option key={space.id} value={space.id}>
                    {space.code} - {space.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="field">
            <label htmlFor="startTime">Hora de inicio</label>
            <select id="startTime" value={startTime} onChange={(event) => setStartTime(event.target.value)} required>
              {timeOptions.map((time) => (
                <option key={time} value={time}>
                  {formatFriendlyTimeFromClock(time)}
                </option>
              ))}
            </select>
          </div>

          <div className="reservation-summary">
            <span className="pill">Reserva: {formatFriendlyTimeFromClock(startTime)} a {formatFriendlyTimeFromClock(reservationEndTime)}</span>
            <span className="pill">Libre de nuevo desde {formatFriendlyTimeFromClock(reservationFreeTime)}</span>
          </div>

          <button className="button button--primary" type="submit" disabled={loading || !selectedSpaceId}>
            {loading ? 'Creando reserva...' : 'Crear reserva'}
          </button>

          {message ? <div className="alert alert--success">{message}</div> : null}
          {error ? <div className="alert alert--error">{error}</div> : null}
        </form>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Espacios disponibles para tu bloque de 2 horas</h3>
          <div className="list">
            {availableSpaces.length === 0 ? (
              <div className="empty">No hay espacios disponibles para ese rango con limpieza incluida.</div>
            ) : (
              availableSpaces.map((space) => (
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

      <div className="card">
        <div className="toolbar">
          <h3 style={{ marginTop: 0 }}>Mis reservas normales</h3>
          <span className="pill">{normalReservations.length} registradas</span>
        </div>
        <div className="list">
          {normalReservations.length === 0 ? (
            <div className="empty">Todavia no hay reservas registradas para esta cuenta.</div>
          ) : (
            normalReservations.slice(0, 6).map((reservation) => (
              <div className="list-item" key={reservation.id}>
                <strong>{reservation.event_name}</strong>
                <span>Inicio: {formatFriendlyDateTime(reservation.start_at)}</span>
                <span>Fin de reserva: {formatFriendlyDateTime(reservation.end_at)}</span>
                <span>Salon libre otra vez: {formatFriendlyDateTime(reservation.effective_end_at)}</span>
                {reservation.status === 'CONFIRMED' ? (
                  <div className="receipt-review-buttons">
                    <button className="button button--ghost" type="button" onClick={() => openExtensionModal(reservation)}>
                      Desea extender horas o dias
                    </button>
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <h3 style={{ marginTop: 0 }}>Reservas aprobadas por Direccion</h3>
          <span className="pill pill--special">{approvedSpecialReservations.length} generadas</span>
        </div>
        <p className="hint">
          Aqui aparecen las reservas creadas automaticamente cuando Direccion aprueba una solicitud especial multi-dia.
        </p>
        <div className="list">
          {approvedSpecialReservations.length === 0 ? (
            <div className="empty">Todavia no hay reservas adicionales aprobadas por Direccion.</div>
          ) : (
            approvedSpecialReservations.slice(0, 12).map((reservation) => (
              <div className="list-item list-item--special" key={reservation.id}>
                <div className="toolbar" style={{ alignItems: 'flex-start' }}>
                  <div>
                    <strong>{reservation.event_name}</strong>
                    <span className="inline-display">Inicio: {formatFriendlyDateTime(reservation.start_at)}</span>
                    <span className="inline-display">Fin de reserva: {formatFriendlyDateTime(reservation.end_at)}</span>
                    <span className="inline-display">
                      Salon libre otra vez: {formatFriendlyDateTime(reservation.effective_end_at)}
                    </span>
                  </div>
                  <span className="pill pill--special">Aprobada por Direccion</span>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="split-grid split-grid--equal">
        <div className="card">
          <div className="toolbar">
            <h3 style={{ marginTop: 0 }}>Mis extensiones</h3>
            <span className="pill">{myExtensions.length} registradas</span>
          </div>
          <div className="list">
            {myExtensions.length === 0 ? (
              <div className="empty">Todavia no has creado solicitudes de extension.</div>
            ) : (
              myExtensions.slice(0, 6).map((extension) => (
                <div className="list-item" key={extension.id}>
                  <strong>{extension.event_name}</strong>
                  <span>Estado de solicitud: {extension.status}</span>
                  <span>Estado de boleta: {extension.receipt_status || 'NO_CARGADA'}</span>
                  <span>Nuevo fin solicitado: {formatFriendlyDateTime(extension.requested_new_end_at)}</span>
                  <span>Monto requerido: Q{extension.amount_to_pay}</span>
                  {extension.receipt_status === 'RECHAZADO' ? (
                    <>
                      <div className="alert alert--warning" style={{ marginTop: 0 }}>
                        Direccion rechazo tu comprobante. Debes volver a cargar una nueva boleta.
                      </div>
                      <button
                        className="button button--primary"
                        type="button"
                        onClick={() => openReceiptRetry('extension', extension.id)}
                      >
                        Volver a cargar boleta
                      </button>
                    </>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>

        <div className="card">
          <div className="toolbar">
            <h3 style={{ marginTop: 0 }}>Mis solicitudes especiales</h3>
            <span className="pill">{mySpecialRequests.length} registradas</span>
          </div>
          <div className="list">
            {mySpecialRequests.length === 0 ? (
              <div className="empty">Todavia no has creado solicitudes especiales multi-dia.</div>
            ) : (
              mySpecialRequests.slice(0, 6).map((request) => (
                <div className="list-item" key={request.id}>
                  <strong>{request.event_name}</strong>
                  <span>Estado de solicitud: {request.status}</span>
                  <span>Estado de boleta: {request.receipt_status || 'NO_CARGADA'}</span>
                  <span>
                    {request.space_code} · {request.space_name}
                  </span>
                  <span>
                    {request.start_date} a {request.end_date} · {request.start_time} - {request.end_time}
                  </span>
                  <span>Monto requerido: Q{request.amount_to_pay}</span>
                  {request.receipt_status === 'RECHAZADO' ? (
                    <>
                      <div className="alert alert--warning" style={{ marginTop: 0 }}>
                        Direccion rechazo tu comprobante. Debes volver a cargar una nueva boleta.
                      </div>
                      <button
                        className="button button--primary"
                        type="button"
                        onClick={() => openReceiptRetry('special', request.id)}
                      >
                        Volver a cargar boleta
                      </button>
                    </>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {extensionModalReservation || receiptRetryTarget ? (
        <div className="modal-backdrop">
          <div className="modal-card">
            <div className="toolbar">
              <h3 style={{ margin: 0 }}>Solicitud a Direccion</h3>
              <button
                className="button button--ghost"
                type="button"
                onClick={() => {
                  setExtensionModalReservation(null);
                  setReceiptRetryTarget(null);
                  setPendingReceiptTarget(null);
                }}
              >
                Cerrar
              </button>
            </div>

            <form className="form-grid" onSubmit={handleExtensionRequest}>
              {!pendingReceiptTarget ? (
                <>
                  <div className="field">
                    <label>Tipo de solicitud</label>
                    <select
                      value={extensionType}
                      onChange={(event) => {
                        const nextType = event.target.value as 'hours' | 'days';
                        setExtensionType(nextType);
                        setModalMessage('');
                        setModalError('');
                      }}
                    >
                      <option value="hours">Extender horas</option>
                      <option value="days">Solicitar varios dias</option>
                    </select>
                  </div>

                  {extensionType === 'hours' ? (
                    <div className="field">
                      <label>Hasta que hora deseas extender</label>
                      <select value={extensionTime} onChange={(event) => setExtensionTime(event.target.value)}>
                        {timeOptions
                          .filter((time) => time > extractUtcTime(extensionModalReservation!.end_at) && time <= '22:00')
                          .map((time) => (
                            <option key={time} value={time}>
                              {formatFriendlyTimeFromClock(time)}
                            </option>
                          ))}
                      </select>
                    </div>
                  ) : (
                    <div className="field">
                      <label>Hasta que fecha deseas solicitar</label>
                      <p className="hint" style={{ margin: 0 }}>
                        La solicitud inicia desde el siguiente dia habil y el maximo permitido es de 6 dias habiles.
                      </p>
                      <input
                        type="date"
                        min={nextBusinessDate(extractUtcDate(extensionModalReservation!.start_at))}
                        value={extensionEndDate}
                        onChange={(event) => setExtensionEndDate(event.target.value)}
                      />
                    </div>
                  )}

                  <div className="field">
                    <label>Comentario</label>
                    <textarea value={extensionComments} onChange={(event) => setExtensionComments(event.target.value)} />
                  </div>

                  <div className="alert alert--warning">
                    Esta solicitud requiere comprobante de pago por Q900.00 antes de que Direccion pueda aprobarla.
                  </div>

                  {modalMessage ? <div className="alert alert--success">{modalMessage}</div> : null}
                  {modalError ? <div className="alert alert--error">{modalError}</div> : null}

                  <button className="button button--primary" type="submit" disabled={requestModalLoading}>
                    {requestModalLoading ? 'Creando solicitud...' : 'Crear solicitud'}
                  </button>
                </>
              ) : (
                <>
                  {receiptRetryTarget ? (
                    <div className="alert alert--warning">
                      Direccion rechazo tu comprobante anterior. Carga una nueva boleta para reactivar la revision.
                    </div>
                  ) : null}
                  <div className="field">
                    <label>Comprobante de pago por Q900.00</label>
                    <input
                      ref={receiptInputRef}
                      type="file"
                      accept="image/*,.pdf"
                      onChange={handleReceiptFileChange}
                      required
                      style={{ display: 'none' }}
                    />
                    <div className="receipt-upload-row">
                      <button
                        className="button button--ghost"
                        type="button"
                        onClick={() => receiptInputRef.current?.click()}
                      >
                        Cargar imagen de boleta
                      </button>
                      <span className="hint">
                        {receiptFile ? `Archivo listo: ${receiptFile.name}` : 'Acepta imagen o PDF. Las imagenes se normalizan a JPG/PNG.'}
                      </span>
                    </div>
                    {receiptFile ? (
                      <div className="receipt-preview-wrapper">
                        {receiptFile.type === 'application/pdf' ? (
                          <div className="receipt-preview receipt-preview--pdf">
                            <strong>PDF seleccionado</strong>
                            <span>{receiptFile.name}</span>
                          </div>
                        ) : receiptPreviewUrl ? (
                          <div className="receipt-preview">
                            <img src={receiptPreviewUrl} alt="Vista previa de boleta" className="receipt-preview__image" />
                          </div>
                        ) : null}

                        <div className="receipt-review-buttons">
                          <button className="button button--ghost" type="button" onClick={() => receiptInputRef.current?.click()}>
                            Cambiar boleta
                          </button>
                          <button className="button button--secondary" type="button" onClick={clearReceiptSelection}>
                            Quitar boleta
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  {modalMessage ? <div className="alert alert--success">{modalMessage}</div> : null}
                  {modalError ? <div className="alert alert--error">{modalError}</div> : null}

                  <button className="button button--primary" type="button" disabled={receiptUploading} onClick={handleReceiptUpload}>
                    {receiptUploading ? 'Cargando comprobante...' : 'Enviar comprobante a Direccion'}
                  </button>
                </>
              )}
            </form>
          </div>
        </div>
      ) : null}
    </div>
  );
}
