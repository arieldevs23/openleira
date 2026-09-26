// officeRoutes: used by the server entrypoint to mount the Kantor AI API at `/api/office`.
// initializeOffice: used by the server entrypoint after the database is ready to park interrupted cases.
export { initializeOffice, officeRoutes } from './office.module.js';
