'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Navigation() {
  const pathname = usePathname();
  const [mountedPath, setMountedPath] = useState('');

  useEffect(() => {
    setMountedPath(pathname);
  }, [pathname]);

  // /diary、/review、/chart、/ai 四頁改由底部功能列（AppTabBar）接手導覽，故不顯示頂部導覽。
  if (pathname === '/review' || pathname === '/diary' || pathname === '/chart' || pathname === '/ai') {
    return null;
  }

  const navItems = [
    { name: '戰情室', path: '/review' },
    { name: 'AI 分析', path: '/ai' },
  ];

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-slate-200 bg-white/95 text-slate-900 shadow-[0_2px_12px_rgba(15,23,42,0.06)] backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1480px] items-center justify-between px-6">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#1f66d1] text-sm font-black text-white">
            S
          </div>
          <div className="min-w-0">
            <div className="text-lg font-black tracking-[0.02em] text-slate-950">
              SkyNet 量價戰情中心
            </div>
            <div className="text-[11px] font-semibold tracking-[0.14em] text-slate-500">
              PUBLIC MARKET INTELLIGENCE DESK
            </div>
          </div>
        </div>

        <div className="hidden flex-1 justify-center px-8 lg:flex">
          <div className="flex h-10 min-w-[420px] max-w-[560px] flex-1 items-center rounded-full border border-slate-300 bg-slate-50 px-5 text-sm font-semibold text-slate-500">
            輸入公司代號 / 名稱 / 關鍵字
          </div>
        </div>

        <div className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = mountedPath === item.path;
            return (
              <Link
                key={item.path}
                href={item.path}
                className={`rounded-md px-3 py-2 text-sm font-bold transition-colors ${
                  isActive
                    ? 'bg-[#1f66d1] text-white shadow-[0_5px_14px_rgba(31,102,209,0.2)]'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                }`}
              >
                {item.name}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
