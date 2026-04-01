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

// Timestamps are stored as IST (Asia/Kolkata) in 'YYYY-MM-DD HH:MM:SS' format.
// Append '+05:30' so the browser interprets them as IST, not local time.
const toDate = (str) => {
  if (!str) return null;
  const normalized = str.toString().replace(' ', 'T');
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const d = new Date(`${normalized}T00:00:00+05:30`);
    return isNaN(d.getTime()) ? null : d;
  }
  // If already has timezone info, use as-is; otherwise treat as IST
  const iso = normalized.endsWith('Z') || normalized.includes('+') ? normalized : normalized + '+05:30';
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
