const isLocal =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

const API = isLocal
  ? 'http://localhost:3000/api'
  : 'https://meditrack-production-a3dd.up.railway.app/api';