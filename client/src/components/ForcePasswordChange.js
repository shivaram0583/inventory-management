import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, KeyRound, Lock } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

const passwordRules = [
  'At least 8 characters',
  'One uppercase letter',
  'One lowercase letter',
  'One number',
  'One special character'
];

const ForcePasswordChange = () => {
  const navigate = useNavigate();
  const { user, changePassword, logout } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match');
      return;
    }

    setSubmitting(true);
    const result = await changePassword(currentPassword, newPassword);
    setSubmitting(false);

    if (!result.success) {
      setError(result.message);
      return;
    }

    setSuccess('Password updated successfully. Redirecting to dashboard...');
    window.setTimeout(() => {
      navigate('/');
    }, 1000);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6 py-12"
      style={{ background: 'linear-gradient(135deg,#fefce8 0%,#eff6ff 52%,#f8fafc 100%)' }}
    >
      <div className="w-full max-w-xl rounded-[2rem] border border-amber-100 bg-white/95 shadow-2xl overflow-hidden">
        <div className="px-8 py-7 border-b border-amber-100" style={{ background: 'linear-gradient(135deg,#fff7ed,#eff6ff)' }}>
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-100 text-amber-700 mb-4">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Password change required</h1>
          <p className="mt-2 text-sm text-slate-600">
            {user?.username ? `${user.username}, ` : ''}you need to replace the default or reset password before using the system.
          </p>
        </div>

        <div className="px-8 py-7 space-y-6">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
              {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <Lock className="h-3.5 w-3.5" /> Current password
              </span>
              <input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                placeholder="Enter current password"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <KeyRound className="h-3.5 w-3.5" /> New password
              </span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                placeholder="Enter a strong password"
                required
              />
            </label>

            <label className="block">
              <span className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
                <KeyRound className="h-3.5 w-3.5" /> Confirm new password
              </span>
              <input
                type="password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                className="w-full rounded-xl border border-slate-200 px-4 py-3 text-sm text-slate-900 shadow-sm focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"
                placeholder="Confirm the new password"
                required
              />
            </label>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Password rules</p>
              <ul className="mt-3 space-y-2 text-sm text-slate-700 list-disc list-inside">
                {passwordRules.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-xl bg-amber-500 px-4 py-3 text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-60"
              >
                {submitting ? 'Updating...' : 'Update Password'}
              </button>
              <button
                type="button"
                onClick={() => logout(false)}
                className="rounded-xl border border-slate-200 px-4 py-3 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50"
              >
                Sign out
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ForcePasswordChange;