import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { Store, User, Lock } from 'lucide-react';

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
      // Successful login - navigate to dashboard
      setLoading(false);
      navigate('/');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 relative overflow-hidden"
         style={{background:'linear-gradient(145deg,#f0f4ff 0%,#fdf4ff 40%,#f0fafb 70%,#fff8f0 100%)'}}>

      {/* Flowing orbs — GitHub-style slow drift */}
      {/* Lavender orb — top-left */}
      <div className="absolute -top-32 -left-32 w-[480px] h-[480px] rounded-full pointer-events-none animate-blob-1"
           style={{background:'radial-gradient(circle at 40% 40%,#c4b5fd,#a5b4fc,transparent 70%)',
                   filter:'blur(64px)',opacity:0.55,mixBlendMode:'multiply'}} />
      {/* Sky-blue orb — top-right */}
      <div className="absolute -top-16 -right-24 w-[420px] h-[420px] rounded-full pointer-events-none animate-blob-2"
           style={{background:'radial-gradient(circle at 60% 40%,#7dd3fc,#93c5fd,transparent 70%)',
                   filter:'blur(72px)',opacity:0.50,mixBlendMode:'multiply'}} />
      {/* Rose orb — bottom-left */}
      <div className="absolute -bottom-24 -left-20 w-[400px] h-[400px] rounded-full pointer-events-none animate-blob-3"
           style={{background:'radial-gradient(circle at 40% 60%,#fda4af,#fbcfe8,transparent 70%)',
                   filter:'blur(64px)',opacity:0.45,mixBlendMode:'multiply'}} />
      {/* Mint orb — bottom-right */}
      <div className="absolute -bottom-20 -right-16 w-[440px] h-[440px] rounded-full pointer-events-none animate-blob-4"
           style={{background:'radial-gradient(circle at 60% 60%,#6ee7b7,#a7f3d0,transparent 70%)',
                   filter:'blur(72px)',opacity:0.45,mixBlendMode:'multiply'}} />
      {/* Centre subtle amber warmth */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[360px] h-[360px] rounded-full pointer-events-none animate-blob-2"
           style={{background:'radial-gradient(circle,#fde68a,transparent 65%)',
                   filter:'blur(80px)',opacity:0.25,mixBlendMode:'multiply'}} />

      <div className="max-w-md w-full relative z-10 animate-fade-in-up">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto h-20 w-20 rounded-2xl flex items-center justify-center shadow-xl mb-5"
               style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6,#a78bfa)',
                       boxShadow:'0 8px 32px rgba(99,102,241,0.35)'}}>
            <Store className="h-11 w-11 text-white" />
          </div>
          <p className="mt-1.5 text-sm font-medium text-slate-500 tracking-wide">
            Welcome
          </p>
          <h2 className="mt-2 text-3xl font-extrabold tracking-tight"
              style={{color:'#1e1b4b'}}>
            Shri Lakshmi Vigneswara Traders
          </h2>
        </div>

        {/* Card — clean white */}
        <div className="rounded-3xl p-8 border"
             style={{background:'rgba(255,255,255,0.82)',backdropFilter:'blur(24px)',
                     boxShadow:'0 8px 40px rgba(99,102,241,0.12),0 2px 8px rgba(0,0,0,0.06)',
                     borderColor:'rgba(196,181,253,0.35)'}}>

          <h3 className="text-base font-bold text-slate-700 mb-6 flex items-center gap-2">
            <span className="h-7 w-7 rounded-lg flex items-center justify-center"
                  style={{background:'linear-gradient(135deg,#6366f1,#8b5cf6)'}}>
              <Lock className="h-3.5 w-3.5 text-white" />
            </span>
            Sign In to Continue
          </h3>

          {error && (
            <div className="mb-5 p-3 rounded-xl border border-red-200 text-red-600 text-sm flex items-center gap-2 animate-fade-in"
                 style={{background:'linear-gradient(90deg,#fff5f5,#fef2f2)'}}>
              <span>⚠</span> {error}
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
                  id="username" name="username" type="text" required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-slate-800 placeholder-slate-400
                             border border-slate-200 bg-white/90
                             focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent
                             hover:border-indigo-200 transition-all duration-200 shadow-sm"
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
                  id="password" name="password" type="password" required
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl text-sm text-slate-800 placeholder-slate-400
                             border border-slate-200 bg-white/90
                             focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent
                             hover:border-indigo-200 transition-all duration-200 shadow-sm"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-white text-sm shadow-lg
                         hover:shadow-xl active:scale-95 transition-all duration-200
                         disabled:opacity-60 disabled:cursor-not-allowed mt-1"
              style={{background: loading
                ? 'linear-gradient(135deg,#a5b4fc,#c4b5fd)'
                : 'linear-gradient(135deg,#6366f1,#8b5cf6,#a78bfa)',
                boxShadow:'0 4px 20px rgba(99,102,241,0.40)'}}
            >
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z"/>
                  </svg>
                  Signing in...
                </span>
              ) : 'Sign In →'}
            </button>
          </form>
        </div>

        <p className="text-center text-xs text-slate-400 mt-5">
          Secured &amp; powered by SLV Inventory System
        </p>
      </div>
    </div>
  );
};

export default Login;
