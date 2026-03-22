import { describe, expect, it } from 'vitest';
import {
  buildDateTime,
  calculateExtensionAmount,
  calculateReservationWindow,
  ensureEditableAfter,
  getBusinessDates,
  normalizeTime,
  validateWithinSchedule
} from './reservation-rules.js';

const config = {
  scheduleStart: '08:00:00',
  scheduleEnd: '22:00:00',
  defaultReservationMinutes: 120,
  cleaningBufferMinutes: 15,
  extensionReferenceAmount: 35,
  specialReservationDailyAmount: 35
};

describe('reservation-rules', () => {
  it('normaliza horas cortas a formato HH:mm:ss', () => {
    expect(normalizeTime('08:00')).toBe('08:00:00');
    expect(normalizeTime('22:00:00')).toBe('22:00:00');
  });

  it('construye fecha y hora validas', () => {
    const result = buildDateTime('2026-04-01', '15:00');
    expect(Number.isNaN(result.getTime())).toBe(false);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3);
    expect(result.getDate()).toBe(1);
    expect(result.getHours()).toBe(15);
    expect(result.getMinutes()).toBe(0);
  });

  it('calcula ventana de reserva con limpieza', () => {
    const start = new Date('2026-04-01T15:00:00.000Z');
    const window = calculateReservationWindow(start, 120, 15);

    expect(window.start.toISOString()).toBe('2026-04-01T15:00:00.000Z');
    expect(window.end.toISOString()).toBe('2026-04-01T17:00:00.000Z');
    expect(window.effectiveEnd.toISOString()).toBe('2026-04-01T17:15:00.000Z');
  });

  it('calcula cobro de extension redondeando por hora', () => {
    const currentEnd = new Date('2026-04-01T17:00:00.000Z');
    const requestedEnd = new Date('2026-04-01T18:10:00.000Z');

    const result = calculateExtensionAmount(currentEnd, requestedEnd, 35);

    expect(result.extraMinutes).toBe(70);
    expect(result.amountToPay).toBe(70);
  });

  it('acepta reservas dentro del horario institucional', () => {
    expect(() =>
      validateWithinSchedule(
        new Date('2026-04-01T08:00:00.000Z'),
        new Date('2026-04-01T10:00:00.000Z'),
        config
      )
    ).not.toThrow();
  });

  it('rechaza reservas que inician antes del horario institucional', () => {
    expect(() =>
      validateWithinSchedule(
        new Date('2026-04-01T07:59:00.000Z'),
        new Date('2026-04-01T09:00:00.000Z'),
        config
      )
    ).toThrow('El horario permitido del sistema es de 08:00:00 a 22:00:00');
  });

  it('rechaza reservas que terminan despues del horario institucional', () => {
    expect(() =>
      validateWithinSchedule(
        new Date('2026-04-01T21:00:00.000Z'),
        new Date('2026-04-01T22:01:00.000Z'),
        config
      )
    ).toThrow('El horario permitido del sistema es de 08:00:00 a 22:00:00');
  });

  it('permite editar cuando el tiempo minimo ya paso', () => {
    expect(() =>
      ensureEditableAfter(new Date(Date.now() - 15_000).toISOString())
    ).not.toThrow();
  });

  it('rechaza editar antes de los 10 segundos', () => {
    expect(() =>
      ensureEditableAfter(new Date(Date.now() + 5_000).toISOString())
    ).toThrow('La reserva solo puede editarse despues de 10 segundos de creada');
  });

  it('genera solo dias habiles en solicitudes especiales', () => {
    const result = getBusinessDates('2026-04-01', '2026-04-06');

    expect(result).toEqual([
      '2026-04-01',
      '2026-04-02',
      '2026-04-03',
      '2026-04-06'
    ]);
  });
});
