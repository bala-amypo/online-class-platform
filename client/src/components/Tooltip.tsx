import React from 'react';

export const Tooltip = ({ text, children, className = '' }: { text: string, children: React.ReactNode, className?: string }) => (
  <div className={`relative group flex items-center justify-center ${className}`}>
    {children}
    <span className="absolute bottom-full mb-3 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-max bg-[#0a0f0d] text-green-100 text-[10px] font-bold px-2.5 py-1.5 rounded-lg shadow-lg border border-green-900/50 z-50">
      {text}
    </span>
  </div>
);
