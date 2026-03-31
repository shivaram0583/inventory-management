import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, Lock } from 'lucide-react';
import ganeshaIcon from '../assets/ganesha.png';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await login(username, password);

    if (!result.success) {
      setError(result.message);
      setLoading(false);
    } else {
      setLoading(false);
      navigate('/');
    }
  };

  return (
    <div
      className="min-h-screen flex relative overflow-hidden"
      style={{ background: 'linear-gradient(145deg,#f8f2e7 0%,#f5ecdf 28%,#efe9fb 58%,#f6f7ff 78%,#ffffff 100%)' }}
    >
      <div
        className="absolute inset-[-12%] pointer-events-none login-gradient-wave"
        style={{
          background:
            'linear-gradient(120deg, rgba(245,158,11,0.18), rgba(255,255,255,0.04), rgba(99,102,241,0.18), rgba(139,92,246,0.16), rgba(255,255,255,0.04), rgba(245,158,11,0.14))',
          backgroundSize: '220% 220%',
          opacity: 0.9,
          filter: 'blur(54px)'
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none login-mesh-pan"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.28) 1px, transparent 1px), linear-gradient(90deg, rgba(129,140,248,0.10) 1px, transparent 1px)',
          backgroundSize: '120px 120px',
          maskImage: 'radial-gradient(circle at center, black 35%, transparent 82%)'
        }}
      />
      <div
        className="absolute inset-x-[-10%] top-[-8%] h-64 pointer-events-none login-aurora"
        style={{
          background: 'linear-gradient(90deg, rgba(245,158,11,0.18), rgba(99,102,241,0.22), rgba(139,92,246,0.16), rgba(255,255,255,0))',
          filter: 'blur(52px)'
        }}
      />
      <div
        className="absolute inset-x-[-12%] bottom-[4%] h-56 pointer-events-none login-aurora"
        style={{
          background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(129,140,248,0.18), rgba(245,158,11,0.16), rgba(255,255,255,0))',
          filter: 'blur(54px)',
          animationDelay: '1.8s'
        }}
      />
      <div
        className="absolute -top-24 -left-20 h-80 w-80 rounded-full pointer-events-none animate-blob-1"
        style={{
          background: 'radial-gradient(circle, rgba(245,158,11,0.20), rgba(245,158,11,0.08), transparent 72%)',
          filter: 'blur(38px)'
        }}
      />
      <div
        className="absolute -bottom-28 right-[-2%] h-96 w-96 rounded-full pointer-events-none animate-blob-2"
        style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.18), rgba(139,92,246,0.12), transparent 74%)',
          filter: 'blur(42px)'
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 18% 22%, rgba(245,158,11,0.18), transparent 26%), radial-gradient(circle at 82% 20%, rgba(99,102,241,0.18), transparent 28%), radial-gradient(circle at 50% 78%, rgba(129,140,248,0.16), transparent 30%)'
        }}
      />
      <div
        className="absolute inset-x-0 top-0 h-56 pointer-events-none"
        style={{
          background: 'linear-gradient(180deg, rgba(255,255,255,0.65), rgba(255,255,255,0))'
        }}
      />

      <div className="flex flex-col lg:flex-row w-full min-h-screen relative z-10">
        <div className="lg:w-1/2 flex flex-col items-center justify-center px-8 py-12 lg:py-0">
          <div className="max-w-md">
            <div
              className="h-24 w-24 rounded-3xl flex items-center justify-center shadow-2xl mb-8 login-float-soft"
              style={{
                background: 'linear-gradient(135deg,#d97706,#f59e0b,#8b5cf6)',
                boxShadow: '0 12px 40px rgba(217,119,6,0.28)'
              }}
            >
              <img src={ganeshaIcon} alt="Ganesha icon" className="h-16 w-16 object-contain" />
            </div>
            <p className="text-sm font-semibold text-amber-600 uppercase tracking-widest mb-3">
              Welcome to
            </p>
            <h1 className="text-4xl lg:text-5xl font-extrabold leading-tight" style={{ color: '#312e81' }}>
              Sri Venkata Lakshmi
            </h1>
            <h1 className="text-4xl lg:text-5xl font-extrabold leading-tight mt-1" style={{ color: '#312e81' }}>
              Vigneswara Traders
            </h1>
            <div className="mt-4 w-20 h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg,#d97706,#8b5cf6)' }} />
            <p className="mt-5 text-base text-slate-500 leading-relaxed max-w-sm">
              Secure sign-in experience for daily inventory, purchases, and sales operations.
            </p>
            <p className="mt-8 text-xs text-slate-400">
              Secured and copyrights reserved @ dvvshivaram
            </p>
          </div>
        </div>

        <div className="lg:w-1/2 flex items-center justify-center px-6 py-10 lg:py-0">
          <div className="w-full max-w-md relative">
            <div
              className="absolute -top-10 right-8 h-24 w-24 rounded-full pointer-events-none login-float-soft"
              style={{
                background: 'radial-gradient(circle, rgba(99,102,241,0.22), rgba(99,102,241,0.08), transparent 72%)',
                filter: 'blur(10px)'
              }}
            />
            <div
              className="absolute -bottom-8 -left-6 h-28 w-28 rounded-full pointer-events-none login-float-delayed"
              style={{
                background: 'radial-gradient(circle, rgba(245,158,11,0.20), rgba(245,158,11,0.06), transparent 74%)',
                filter: 'blur(12px)'
              }}
            />
            <div
              className="relative rounded-3xl p-8 lg:p-10 border overflow-hidden login-card-float"
              style={{
                background: 'rgba(255,255,255,0.90)',
                backdropFilter: 'blur(20px)',
                boxShadow: '0 14px 52px rgba(99,102,241,0.14),0 4px 16px rgba(0,0,0,0.06)',
                borderColor: 'rgba(196,181,253,0.34)'
              }}
            >
              <div
                className="absolute inset-x-0 top-0 h-20 pointer-events-none"
                style={{ background: 'linear-gradient(180deg, rgba(255,255,255,0.62), rgba(255,255,255,0))' }}
              />
              <h3 className="text-lg font-bold text-slate-800 mb-1 flex items-center gap-2.5">
                <span
                  className="h-8 w-8 rounded-xl flex items-center justify-center"
                  style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
                >
                  <Lock className="h-4 w-4 text-white" />
                </span>
                Sign In
              </h3>
              <p className="text-sm text-slate-400 mb-7">Enter your credentials to continue</p>

              {error && (
                <div
                  className="mb-5 p-3 rounded-xl border border-red-200 text-red-600 text-sm flex items-center gap-2"
                  style={{ background: 'linear-gradient(90deg,#fff5f5,#fef2f2)' }}
                >
                  <span>!</span> {error}
                </div>
              )}

              <form onSubmit={handleSubmit} className="space-y-5">
                <div>
                  <label htmlFor="username" className="block text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1.5">
                    Username
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <User className="h-4 w-4 text-indigo-400" />
                    </div>
                    <input
                      id="username"
                      name="username"
                      type="text"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-slate-800 placeholder-slate-400 border border-slate-200 bg-white/90 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent hover:border-indigo-200 transition-all duration-200 shadow-sm"
                      placeholder="Enter your username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="password" className="block text-xs font-bold text-indigo-600 uppercase tracking-widest mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none">
                      <Lock className="h-4 w-4 text-indigo-400" />
                    </div>
                    <input
                      id="password"
                      name="password"
                      type="password"
                      required
                      className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-slate-800 placeholder-slate-400 border border-slate-200 bg-white/90 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent hover:border-indigo-200 transition-all duration-200 shadow-sm"
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl font-bold text-white text-sm shadow-lg hover:shadow-xl active:scale-95 transition-all duration-200 disabled:opacity-60 disabled:cursor-not-allowed mt-2"
                  style={{
                    background: loading
                      ? 'linear-gradient(135deg,#a5b4fc,#c4b5fd)'
                      : 'linear-gradient(135deg,#6366f1,#8b5cf6,#a78bfa)',
                    boxShadow: '0 4px 20px rgba(99,102,241,0.40)'
                  }}
                >
                  {loading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                      </svg>
                      Signing in...
                    </span>
                  ) : (
                    'Sign In ->'
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
