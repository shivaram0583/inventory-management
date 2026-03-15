const IST_OPTIONS_DATETIME = {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
};

const IST_OPTIONS_DATE = {
  timeZone: 'Asia/Kolkata',
  day: '2-digit',
  month: 'long',
  year: 'numeric'
};

const IST_OPTIONS_TIME = {
  timeZone: 'Asia/Kolkata',
  hour: '2-digit',
  minute: '2-digit',
  hour12: true
};

// SQLite CURRENT_TIMESTAMP returns UTC as 'YYYY-MM-DD HH:MM:SS' (no Z).
// Appending 'Z' forces correct UTC parsing before displaying as IST.
const toDate = (str) => {
  if (!str) return null;
  const normalized = str.toString().replace(' ', 'T');
  const iso = normalized.endsWith('Z') || normalized.includes('+') ? normalized : normalized + 'Z';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

export const fmtDateTime = (str) => {
  const d = toDate(str);
  return d ? d.toLocaleString('en-IN', IST_OPTIONS_DATETIME) : '-';
};

export const fmtDate = (str) => {
  const d = toDate(str);
  return d ? d.toLocaleDateString('en-IN', IST_OPTIONS_DATE) : '-';
};

export const fmtTime = (str) => {
  const d = toDate(str);
  return d ? d.toLocaleTimeString('en-IN', IST_OPTIONS_TIME) : '-';
};

// Returns today's date in YYYY-MM-DD format in IST (for date picker defaults)
export const getISTDateString = () =>
  new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
