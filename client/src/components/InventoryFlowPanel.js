import React, { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import CustomSelect from './shared/CustomSelect';
import { fmtDateTime } from '../utils/dateUtils';
import {
  ArrowDownRight,
  ArrowUpRight,
  Boxes,
  Search,
  ShoppingCart,
  Trash2,
  RotateCcw,
  PackagePlus,
  AlertTriangle,
  FileWarning,
  Scale,
  Activity
} from 'lucide-react';

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const fmtQuantity = (value) => num(value).toLocaleString('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2
});

const eventMeta = {
  purchase: {
    label: 'Purchase In',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    icon: PackagePlus
  },
  sale: {
    label: 'Sale Out',
    badgeClass: 'bg-rose-100 text-rose-700',
    icon: ShoppingCart
  },
  return: {
    label: 'Return In',
    badgeClass: 'bg-sky-100 text-sky-700',
    icon: RotateCcw
  },
  damage: {
    label: 'Damaged',
    badgeClass: 'bg-red-100 text-red-700',
    icon: AlertTriangle
  },
  theft: {
    label: 'Theft',
    badgeClass: 'bg-red-100 text-red-700',
    icon: AlertTriangle
  },
  spoilage: {
    label: 'Spoilage',
    badgeClass: 'bg-amber-100 text-amber-700',
    icon: FileWarning
  },
  counting_error: {
    label: 'Count Fix',
    badgeClass: 'bg-indigo-100 text-indigo-700',
    icon: Scale
  },
  other: {
    label: 'Manual Adj.',
    badgeClass: 'bg-gray-100 text-gray-700',
    icon: Activity
  },
  deletion: {
    label: 'Deleted',
    badgeClass: 'bg-slate-200 text-slate-700',
    icon: Trash2
  }
};

const eventOptions = [
  { value: 'all', label: 'All Movements' },
  { value: 'purchase', label: 'Purchase In' },
  { value: 'sale', label: 'Sale Out' },
  { value: 'return', label: 'Return In' },
  { value: 'damage', label: 'Damaged' },
  { value: 'theft', label: 'Theft' },
  { value: 'spoilage', label: 'Spoilage' },
  { value: 'counting_error', label: 'Count Fix' },
  { value: 'other', label: 'Manual Adj.' },
  { value: 'deletion', label: 'Deleted' }
];

const SummaryCard = ({ title, value, tone = 'slate', helper, icon: Icon }) => {
  const toneStyles = {
    emerald: 'from-emerald-500/10 to-emerald-100 text-emerald-700 border-emerald-200',
    rose: 'from-rose-500/10 to-rose-100 text-rose-700 border-rose-200',
    sky: 'from-sky-500/10 to-sky-100 text-sky-700 border-sky-200',
    slate: 'from-slate-500/10 to-slate-100 text-slate-700 border-slate-200'
  };

  return (
    <div className={`rounded-2xl border px-5 py-4 bg-gradient-to-br ${toneStyles[tone] || toneStyles.slate}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] opacity-80">{title}</p>
          <p className="mt-3 text-2xl font-extrabold tracking-tight">{value}</p>
          <p className="mt-1 text-xs opacity-80">{helper}</p>
        </div>
        {Icon && <Icon className="h-5 w-5 opacity-80" />}
      </div>
    </div>
  );
};

const InventoryFlowPanel = ({ categories = [] }) => {
  const [filters, setFilters] = useState({
    search: '',
    eventType: 'all',
    category: 'all',
    startDate: '',
    endDate: ''
  });
  const [flowRows, setFlowRows] = useState([]);
  const [summary, setSummary] = useState({ total_events: 0, inbound_quantity: 0, outbound_quantity: 0, net_quantity: 0 });
  const [pagination, setPagination] = useState({ page: 1, limit: 25, total: 0, totalPages: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchFlow = useCallback(async (page = 1) => {
    setLoading(true);
    setError('');

    try {
      const response = await axios.get('/api/inventory/flow', {
        params: {
          page,
          limit: pagination.limit,
          search: filters.search || undefined,
          event_type: filters.eventType !== 'all' ? filters.eventType : undefined,
          category: filters.category !== 'all' ? filters.category : undefined,
          start_date: filters.startDate || undefined,
          end_date: filters.endDate || undefined
        }
      });

      setFlowRows(response.data?.data || []);
      setSummary(response.data?.summary || { total_events: 0, inbound_quantity: 0, outbound_quantity: 0, net_quantity: 0 });
      setPagination((current) => ({
        ...current,
        ...(response.data?.pagination || { page, limit: current.limit, total: 0, totalPages: 0 })
      }));
    } catch (fetchError) {
      setError(fetchError.response?.data?.message || 'Failed to load inventory flow.');
    } finally {
      setLoading(false);
    }
  }, [filters.category, filters.endDate, filters.eventType, filters.search, filters.startDate, pagination.limit]);

  useEffect(() => {
    fetchFlow(1);
  }, [fetchFlow]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <SummaryCard
          title="Inbound"
          value={fmtQuantity(summary.inbound_quantity)}
          helper="Stock added back or received"
          tone="emerald"
          icon={ArrowUpRight}
        />
        <SummaryCard
          title="Outbound"
          value={fmtQuantity(summary.outbound_quantity)}
          helper="Stock sold, deleted, or reduced"
          tone="rose"
          icon={ArrowDownRight}
        />
        <SummaryCard
          title="Net Change"
          value={`${num(summary.net_quantity) > 0 ? '+' : ''}${fmtQuantity(summary.net_quantity)}`}
          helper="Signed movement across filters"
          tone="sky"
          icon={Boxes}
        />
        <SummaryCard
          title="Events"
          value={fmtQuantity(summary.total_events)}
          helper="Timeline entries in current filter"
          tone="slate"
          icon={Activity}
        />
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 px-4 py-3 text-red-700 text-sm"
             style={{background:'linear-gradient(90deg,#fff5f5,#fef2f2)'}}>
          ⚠ {error}
        </div>
      )}

      <div className="card !py-4 relative z-20 space-y-4">
        <div className="flex flex-col xl:flex-row gap-4 items-stretch xl:items-center">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search product, event, user, or reference..."
                className="input-field pl-10"
                value={filters.search}
                onChange={(e) => setFilters((current) => ({ ...current, search: e.target.value }))}
              />
            </div>
          </div>
          <div className="w-full xl:w-56 flex-shrink-0">
            <CustomSelect
              options={eventOptions}
              value={filters.eventType}
              onChange={(value) => setFilters((current) => ({ ...current, eventType: value }))}
            />
          </div>
          <div className="w-full xl:w-56 flex-shrink-0">
            <CustomSelect
              options={[
                { value: 'all', label: 'All Categories' },
                ...categories.map((category) => ({
                  value: category.name,
                  label: category.name.charAt(0).toUpperCase() + category.name.slice(1)
                }))
              ]}
              value={filters.category}
              onChange={(value) => setFilters((current) => ({ ...current, category: value }))}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">From Date</label>
            <input
              type="date"
              className="input-field"
              value={filters.startDate}
              onChange={(e) => setFilters((current) => ({ ...current, startDate: e.target.value }))}
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">To Date</label>
            <input
              type="date"
              className="input-field"
              value={filters.endDate}
              onChange={(e) => setFilters((current) => ({ ...current, endDate: e.target.value }))}
            />
          </div>
        </div>
      </div>

      <div className="card !p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sky-600"></div>
          </div>
        ) : flowRows.length === 0 ? (
          <div className="px-6 py-16 text-center text-gray-500">
            No inventory movement found for the current filters.
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-100">
                <thead className="bg-gray-50/90">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Date</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Product</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Event</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-gray-600">Impact</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Reference</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">Details</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-600">User</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50 bg-white">
                  {flowRows.map((row, index) => {
                    const meta = eventMeta[row.event_type] || eventMeta.other;
                    const signedQuantity = num(row.quantity_change);
                    const EventIcon = meta.icon;

                    return (
                      <tr key={`${row.reference_id}-${row.event_date}-${index}`} className="hover:bg-sky-50/40 transition-colors align-top">
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{fmtDateTime(row.event_date)}</td>
                        <td className="px-4 py-3 text-sm">
                          <div className="font-semibold text-gray-900">{row.product_name || '[Deleted Product]'}</div>
                          <div className="text-xs text-gray-500">{row.product_code || '-'}{row.variety ? ` • ${row.variety}` : ''}</div>
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${meta.badgeClass}`}>
                            <EventIcon className="h-3.5 w-3.5" />
                            {meta.label}
                          </span>
                          <div className="mt-1 text-[11px] uppercase tracking-wide text-gray-400">{String(row.source_type || '').replace(/_/g, ' ')}</div>
                        </td>
                        <td className={`px-4 py-3 text-sm text-right font-bold whitespace-nowrap ${signedQuantity >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                          {signedQuantity > 0 ? '+' : ''}{fmtQuantity(signedQuantity)} {row.unit || ''}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-700 whitespace-nowrap">{row.reference_id || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 max-w-sm">{row.description || '-'}</td>
                        <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{row.actor_name || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {pagination.totalPages > 1 && (
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 px-5 py-4 border-t border-gray-100 bg-gray-50/70">
                <p className="text-sm text-gray-500">
                  Showing {flowRows.length} of {pagination.total} movement events
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fetchFlow(pagination.page - 1)}
                    disabled={pagination.page <= 1}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Previous
                  </button>
                  <span className="text-sm text-gray-600">Page {pagination.page} of {pagination.totalPages}</span>
                  <button
                    type="button"
                    onClick={() => fetchFlow(pagination.page + 1)}
                    disabled={pagination.page >= pagination.totalPages}
                    className="px-3 py-1.5 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-600 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default InventoryFlowPanel;