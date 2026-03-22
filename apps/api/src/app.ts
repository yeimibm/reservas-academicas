import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { auditRoutes } from './modules/audit/routes.js';
import { authRoutes } from './modules/auth/routes.js';
import { healthRoutes } from './modules/health/routes.js';
import { configRoutes } from './modules/config/routes.js';
import { extensionRoutes } from './modules/extensions/routes.js';
import { facultyRoutes } from './modules/faculties/routes.js';
import { paymentReceiptRoutes } from './modules/payment-receipts/routes.js';
import { reservationSeriesRoutes } from './modules/reservation-series/routes.js';
import { spaceRoutes } from './modules/spaces/routes.js';
import { reservationRoutes } from './modules/reservations/routes.js';
import { specialReservationRoutes } from './modules/special-reservations/routes.js';
import { userRoutes } from './modules/users/routes.js';
import { applyModulePolicies } from './lib/http.js';

export const app = new Hono();

app.use(
  '*',
  cors({
    origin: ['http://localhost:3000'],
    allowMethods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization']
  })
);

app.get('/', (c) =>
  c.json({
    name: 'academic-reservations-api',
    version: '0.1.0'
  })
);

applyModulePolicies(app, [
  {
    path: ['/users', '/users/*'],
    methods: ['GET', 'POST', 'PATCH']
  },
  {
    path: ['/users', '/users/*'],
    methods: ['POST', 'PATCH'],
    roles: ['DIRECTION']
  },
  {
    path: ['/faculties', '/faculties/*'],
    methods: ['GET', 'POST', 'PATCH']
  },
  {
    path: ['/faculties', '/faculties/*'],
    methods: ['POST', 'PATCH'],
    roles: ['DIRECTION']
  },
  {
    path: ['/config', '/config/*'],
    roles: ['DIRECTION']
  },
  {
    path: ['/reservations', '/reservations/*', '/extensions', '/extensions/*'],
    roles: ['STUDENT', 'TEACHER', 'DIRECTION']
  },
  {
    path: ['/extensions/*/approve', '/extensions/*/reject'],
    methods: ['PATCH'],
    roles: ['DIRECTION']
  },
  {
    path: ['/reservation-series', '/reservation-series/*'],
    roles: ['STUDENT', 'TEACHER', 'DIRECTION']
  },
  {
    path: ['/special-reservations', '/special-reservations/*'],
    roles: ['STUDENT', 'TEACHER', 'DIRECTION']
  },
  {
    path: ['/special-reservations/*/approve', '/special-reservations/*/reject'],
    methods: ['PATCH'],
    roles: ['DIRECTION']
  },
  {
    path: ['/payment-receipts', '/payment-receipts/*'],
    methods: ['POST'],
    roles: ['STUDENT', 'TEACHER', 'DIRECTION']
  },
  {
    path: ['/payment-receipts', '/payment-receipts/*'],
    methods: ['GET', 'PATCH'],
    roles: ['DIRECTION']
  },
  {
    path: ['/payment-receipts/*/approve', '/payment-receipts/*/reject'],
    methods: ['PATCH'],
    roles: ['DIRECTION']
  },
  {
    path: ['/audit-logs', '/technical-logs'],
    roles: ['DIRECTION']
  },
  {
    path: ['/spaces', '/spaces/*'],
    methods: ['POST', 'PATCH'],
    roles: ['DIRECTION']
  }
]);

app.route('/auth', authRoutes);
app.route('/users', userRoutes);
app.route('/faculties', facultyRoutes);
app.route('/health', healthRoutes);
app.route('/config', configRoutes);
app.route('/spaces', spaceRoutes);
app.route('/reservations', reservationRoutes);
app.route('/', extensionRoutes);
app.route('/reservation-series', reservationSeriesRoutes);
app.route('/payment-receipts', paymentReceiptRoutes);
app.route('/special-reservations', specialReservationRoutes);
app.route('/', auditRoutes);
