const isLocal =
  window.location.hostname === 'localhost' ||
  window.location.hostname === '127.0.0.1';

const API = isLocal
  ? 'http://localhost:3000/api'
  : 'https://meditrack-production-08ff.up.railway.app/api';