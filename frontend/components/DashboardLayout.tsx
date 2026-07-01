'use client';

import { LogOut, Menu, X } from "lucide-react";
import { useEffect, useState } from "react";

const SIDEBAR_COLLAPSED_KEY = "sidebar-collapsed";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isCollapsed, setIsCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false;
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY);
    return saved ? JSON.parse(saved) : false;
  });

  useEffect(() => {
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, JSON.stringify(isCollapsed));
  }, [isCollapsed]);

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <div
        className={`flex flex-col bg-slate-900 border-r border-border transition-all duration-300 ease-in-out ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        {/* Header */}
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-700">
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="h-8 w-8 flex items-center justify-center hover:bg-slate-800 rounded-lg transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-ring text-white"
            aria-label="Toggle navigation"
          >
            {isCollapsed ? (
              <Menu className="h-5 w-5" />
            ) : (
              <X className="h-5 w-5" />
            )}
          </button>
          {!isCollapsed && (
            <span className="font-semibold tracking-tight text-sm ml-2 text-white">
              Menu
            </span>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto py-2 px-2">
          {/* Menu items will go here */}
        </div>

        {/* Footer */}
        <div className="border-t border-slate-700 p-3">
          <button className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-800 transition-colors w-full text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-ring text-white">
            <div className="h-8 w-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0 text-sm font-medium">
              U
            </div>
            {!isCollapsed && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate leading-none">
                  User
                </p>
                <p className="text-xs text-slate-400 truncate mt-1">
                  user@example.com
                </p>
              </div>
            )}
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <main className="flex-1 overflow-y-auto p-4">
          {children}
        </main>
      </div>
    </div>
  );
}
