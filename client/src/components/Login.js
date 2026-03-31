import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { User, Lock, LogIn, ChevronRight } from 'lucide-react';
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
      style={{ background: 'linear-gradient(135deg,#fff7ed 0%,#f9f5ff 44%,#eef4ff 74%,#ffffff 100%)' }}
    >
      <div
        className="absolute inset-[-18%] pointer-events-none login-gradient-wave"
        style={{
          background:
            'radial-gradient(circle at 18% 22%, rgba(245,158,11,0.28), transparent 24%), radial-gradient(circle at 72% 26%, rgba(99,102,241,0.22), transparent 28%), radial-gradient(circle at 54% 76%, rgba(139,92,246,0.18), transparent 30%)',
          backgroundSize: '140% 140%',
          opacity: 1,
          filter: 'blur(34px)'
        }}
      />
      <div
        className="absolute inset-x-[-15%] top-[8%] h-72 pointer-events-none login-light-band"
        style={{
          background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(255,255,255,0.52), rgba(99,102,241,0.16), rgba(255,255,255,0))',
          filter: 'blur(40px)',
          transform: 'rotate(-10deg)'
        }}
      />
      <div
        className="absolute inset-x-[-10%] top-[-8%] h-64 pointer-events-none login-aurora"
        style={{
          background: 'linear-gradient(90deg, rgba(245,158,11,0.18), rgba(255,255,255,0.10), rgba(99,102,241,0.20), rgba(255,255,255,0))',
          filter: 'blur(56px)'
        }}
      />
      <div
        className="absolute inset-x-[-12%] bottom-[6%] h-56 pointer-events-none login-light-band"
        style={{
          background: 'linear-gradient(90deg, rgba(255,255,255,0), rgba(245,158,11,0.14), rgba(139,92,246,0.16), rgba(255,255,255,0))',
          filter: 'blur(48px)',
          transform: 'rotate(8deg)',
          animationDelay: '1.2s'
        }}
      />
      <div
        className="absolute -top-24 -left-20 h-80 w-80 rounded-full pointer-events-none animate-blob-1"
        style={{
          background: 'radial-gradient(circle, rgba(245,158,11,0.18), rgba(245,158,11,0.06), transparent 72%)',
          filter: 'blur(46px)'
        }}
      />
      <div
        className="absolute -bottom-28 right-[-2%] h-96 w-96 rounded-full pointer-events-none animate-blob-2"
        style={{
          background: 'radial-gradient(circle, rgba(99,102,241,0.18), rgba(139,92,246,0.10), transparent 74%)',
          filter: 'blur(54px)'
        }}
      />
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(115deg, rgba(255,255,255,0.44) 0%, rgba(255,255,255,0) 38%, rgba(255,255,255,0.30) 70%, rgba(255,255,255,0) 100%)'
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
          <div className="max-w-lg w-full">
            <div className="relative inline-flex mb-10">
              <div
                className="absolute inset-[-16px] rounded-[2rem] pointer-events-none login-halo-pulse"
                style={{
                  background: 'radial-gradient(circle, rgba(245,158,11,0.22), rgba(139,92,246,0.12), transparent 72%)',
                  filter: 'blur(14px)'
                }}
              />
              <div
                className="absolute inset-[-10px] rounded-[2rem] pointer-events-none"
                style={{
                  border: '1px solid rgba(217,119,6,0.22)',
                  background: 'linear-gradient(135deg, rgba(255,255,255,0.42), rgba(255,255,255,0.12))'
                }}
              />
              <div
                className="absolute -top-3 -right-3 h-6 w-6 rounded-full pointer-events-none login-orbit-dot"
                style={{ background: 'linear-gradient(135deg,#f59e0b,#fb7185)' }}
              />
              <div
                className="absolute -bottom-2 -left-2 h-4 w-4 rounded-full pointer-events-none login-orbit-dot-alt"
                style={{ background: 'linear-gradient(135deg,#6366f1,#8b5cf6)' }}
              />
              <div
                className="relative h-32 w-32 rounded-[2rem] flex items-center justify-center shadow-2xl mb-2 login-float-soft"
                style={{
                  background: 'linear-gradient(145deg, rgba(255,248,235,0.96), rgba(255,255,255,0.86) 40%, rgba(237,233,254,0.92) 100%)',
                  boxShadow: '0 18px 48px rgba(217,119,6,0.20), 0 10px 30px rgba(99,102,241,0.16)',
                  border: '1px solid rgba(255,255,255,0.75)'
                }}
              >
                <div
                  className="absolute inset-3 rounded-[1.5rem]"
                  style={{
                    background: 'linear-gradient(135deg, rgba(255,255,255,0.72), rgba(255,255,255,0.22))',
                    border: '1px solid rgba(217,119,6,0.12)'
                  }}
                />
                <img src={ganeshaIcon} alt="Ganesha icon" className="relative h-20 w-20 object-contain drop-shadow-[0_8px_18px_rgba(217,119,6,0.28)]" />
              </div>
            </div>
            <p className="text-sm font-semibold text-amber-600 uppercase tracking-[0.32em] mb-3">
              Welcome to
            </p>
            <div className="text-left max-w-xl">
              <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
                <span className="text-lg lg:text-xl font-semibold tracking-[0.12em] uppercase text-slate-500">
                  Sri Venkata
                </span>
                <h1 className="text-4xl lg:text-6xl font-black leading-none login-title-sheen" style={{ color: '#312e81' }}>
                  Lakshmi
                </h1>
              </div>
              <div className="mt-2 flex flex-wrap sm:flex-nowrap items-baseline gap-x-3 gap-y-1">
                <h2
                  className="inline-block text-3xl lg:text-[3.35rem] font-extrabold leading-[1.12]"
                  style={{
                    background: 'linear-gradient(135deg, #312e81 0%, #5b21b6 68%, #7c3aed 100%)',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent'
                  }}
                >
                  Vigneswara
                </h2>
                <span className="text-lg lg:text-xl font-semibold leading-none tracking-[0.12em] uppercase text-slate-500">
                  Traders
                </span>
              </div>
            </div>
            <div className="mt-5 w-28 h-1.5 rounded-full" style={{ background: 'linear-gradient(90deg,#d97706,#8b5cf6)' }} />
            <p className="mt-6 text-base lg:text-lg text-slate-500 leading-relaxed max-w-md">
              Secure sign-in experience for daily inventory, purchases, and sales operations.
            </p>
            <p className="mt-8 text-xs text-slate-400">
              Secured and copyrights reserved @ dvvshivaram
            </p>
          </div>
        </div>

        <div className="lg:w-1/2 flex items-center justify-center px-6 py-10 lg:py-0">
          <div className="w-full max-w-[30rem] relative">
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
              className="relative rounded-[2rem] p-8 lg:p-10 border overflow-hidden login-card-float"
              style={{
                background: 'linear-gradient(180deg, rgba(255,255,255,0.92), rgba(255,255,255,0.86))',
                backdropFilter: 'blur(22px)',
                boxShadow: '0 18px 60px rgba(99,102,241,0.16),0 8px 24px rgba(217,119,6,0.08)',
                borderColor: 'rgba(196,181,253,0.38)'
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
                  <LogIn className="h-4 w-4 text-white" />
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
                    <span className="flex items-center justify-center gap-2">
                      Sign In
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-white/25 bg-white/10">
                        <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </span>
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
