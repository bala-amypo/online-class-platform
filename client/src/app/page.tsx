'use client';
import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { GraduationCap, BookOpen, ArrowRight, Video } from 'lucide-react';

export default function Home() {
  const [roomId, setRoomId] = useState('');
  const [role, setRole] = useState<'trainer' | 'student'>('student');
  const router = useRouter();

  useEffect(() => {
    document.title = "Dot Live - Real-time Interactive Classroom";
  }, []);

  const handleJoin = (e: React.FormEvent) => {
    e.preventDefault();
    if (roomId.trim()) {
      router.push(`/room/${roomId.trim().toLowerCase()}?role=${role}`);
    }
  };

  return (
    <main className="min-h-screen bg-[#080d0b] text-green-50 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      {/* Premium Cyberpunk Ambient Background Glows */}
      <div className="absolute top-0 left-0 w-full h-full overflow-hidden z-0 pointer-events-none">
        <div className="absolute top-[-20%] left-[-10%] w-[50%] h-[50%] rounded-full bg-green-500/10 blur-[130px] animate-pulse" style={{ animationDuration: '8s' }}></div>
        <div className="absolute bottom-[-20%] right-[-10%] w-[50%] h-[50%] rounded-full bg-emerald-600/10 blur-[130px] animate-pulse" style={{ animationDuration: '10s' }}></div>
        <div className="absolute top-[30%] right-[20%] w-[30%] h-[30%] rounded-full bg-teal-500/5 blur-[100px]"></div>
      </div>

      <div className="z-10 text-center mb-8 max-w-2xl">
        <div className="inline-flex items-center space-x-2 bg-green-950/40 border border-green-500/20 px-3 py-1.5 rounded-full mb-4 shadow-inner">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-ping" />
          <span className="text-[10px] font-bold tracking-widest text-green-400 uppercase font-mono">Next-Gen WebRTC Classroom</span>
        </div>
        <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight mb-4 uppercase">
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-green-400 via-emerald-400 to-teal-400">Dot Live</span> Platform
        </h1>
        <p className="text-green-700/80 text-xs md:text-sm max-w-md mx-auto uppercase tracking-wider font-mono">
          High-performance real-time interactive classrooms powered by Mediasoup SFU
        </p>
      </div>

      <div className="z-10 bg-[#0c1310]/80 backdrop-blur-xl p-8 rounded-3xl shadow-[0_0_50px_rgba(4,120,87,0.15)] w-full max-w-lg border border-green-900/30">
        <form onSubmit={handleJoin} className="space-y-6">
          {/* Room ID Input */}
          <div className="space-y-2">
            <label htmlFor="roomId" className="block text-[10px] font-bold tracking-widest text-green-600 uppercase font-mono">
              Classroom ID
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none text-green-600">
                <Video size={16} />
              </div>
              <input
                id="roomId"
                type="text"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="e.g. math-101"
                className="w-full bg-green-950/20 border border-green-900/50 hover:border-green-500/30 focus:border-green-500 rounded-2xl pl-11 pr-4 py-3.5 text-green-100 placeholder-green-800/60 focus:outline-none focus:ring-2 focus:ring-green-500/20 transition-all font-mono"
                required
              />
            </div>
          </div>

          {/* Role Selection */}
          <div className="space-y-3">
            <label className="block text-[10px] font-bold tracking-widest text-green-600 uppercase font-mono">
              Join Classroom As
            </label>
            <div className="grid grid-cols-2 gap-4">
              {/* Student Role Card */}
              <button
                type="button"
                onClick={() => setRole('student')}
                className={`flex flex-col items-center justify-center p-5 rounded-2xl border text-center transition-all duration-300 group cursor-pointer ${
                  role === 'student'
                    ? 'bg-green-500/10 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.15)] text-green-300'
                    : 'bg-green-950/10 border-green-900/30 text-green-700 hover:border-green-500/30 hover:text-green-500'
                }`}
              >
                <div className={`p-3 rounded-xl mb-3 border transition duration-300 ${
                  role === 'student'
                    ? 'bg-green-500/20 border-green-500 text-green-400'
                    : 'bg-green-950/20 border-green-900/20 text-green-800 group-hover:bg-green-500/10 group-hover:text-green-400'
                }`}>
                  <BookOpen size={20} className="group-hover:scale-110 transition duration-300" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider">Student</span>
                <span className="text-[9px] text-green-800/80 mt-1 leading-normal">Attend class & participate</span>
              </button>

              {/* Trainer Role Card */}
              <button
                type="button"
                onClick={() => setRole('trainer')}
                className={`flex flex-col items-center justify-center p-5 rounded-2xl border text-center transition-all duration-300 group cursor-pointer ${
                  role === 'trainer'
                    ? 'bg-green-500/10 border-green-500 shadow-[0_0_20px_rgba(34,197,94,0.15)] text-green-300'
                    : 'bg-green-950/10 border-green-900/30 text-green-700 hover:border-green-500/30 hover:text-green-500'
                }`}
              >
                <div className={`p-3 rounded-xl mb-3 border transition duration-300 ${
                  role === 'trainer'
                    ? 'bg-green-500/20 border-green-500 text-green-400'
                    : 'bg-green-950/20 border-green-900/20 text-green-800 group-hover:bg-green-500/10 group-hover:text-green-400'
                }`}>
                  <GraduationCap size={20} className="group-hover:scale-110 transition duration-300" />
                </div>
                <span className="text-xs font-bold uppercase tracking-wider">Trainer</span>
                <span className="text-[9px] text-green-800/80 mt-1 leading-normal">Host class & present screen</span>
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-green-500 hover:bg-green-400 text-[#070a09] font-bold rounded-2xl py-4 flex items-center justify-center space-x-2 shadow-lg shadow-green-500/20 hover:shadow-green-500/40 transform active:scale-[0.98] transition-all cursor-pointer text-xs md:text-sm tracking-widest uppercase font-mono"
          >
            <span>Enter Classroom</span>
            <ArrowRight size={16} />
          </button>
        </form>
      </div>
    </main>
  );
}
