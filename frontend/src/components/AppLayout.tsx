import { Link, useLocation } from 'react-router-dom';
import { LayoutDashboard, LogOut, PlusCircle, User, Menu } from 'lucide-react';
import { useState } from 'react';

import { useAuth } from '@/auth/AuthContext';

interface AppLayoutProps {
  children: React.ReactNode;
}

export function AppLayout({ children }: AppLayoutProps) {
  const { user, signOut } = useAuth();
  const location = useLocation();
  const isHomePage = location.pathname === '/';
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  return (
    <div className="flex min-h-screen flex-col" style={{ backgroundColor: '#F6F2E8' }}>
      <header 
        className="sticky top-0 z-50 border-b" 
        style={{ 
          backgroundColor: '#F6F2E8', 
          borderColor: '#DCD3BE' 
        }}
      >
        <div className="container mx-auto flex h-16 items-center justify-between px-4 max-w-7xl">
          {/* Logo */}
          <Link 
            to={user ? '/dashboard' : '/'} 
            className="flex items-center gap-2 font-serif text-xl font-semibold"
            style={{ color: '#10192B' }}
          >
            Order<span style={{ color: '#B8863B' }}>Settle</span>
          </Link>

          {/* Desktop Navigation - Fixed */}
          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] transition-colors hover:opacity-70 px-3 py-2 rounded-md"
                  style={{ color: '#5B5647' }}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
                <Link
                  to="/orders/new"
                  className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] transition-colors hover:opacity-70 px-3 py-2 rounded-md border"
                  style={{ 
                    color: '#10192B',
                    borderColor: '#DCD3BE'
                  }}
                >
                  <PlusCircle className="h-4 w-4" />
                  New Order
                </Link>
                <div className="flex items-center gap-3 ml-2 pl-4 border-l" style={{ borderColor: '#DCD3BE' }}>
                  <span 
                    className="font-mono text-xs"
                    style={{ color: '#5B5647' }}
                  >
                    <User className="mr-1 inline h-3 w-3" />
                    {user.email}
                  </span>
                  <button
                    onClick={signOut}
                    className="font-mono text-xs uppercase tracking-[0.15em] transition-colors hover:opacity-70 px-3 py-2 rounded-md"
                    style={{ color: '#5B5647' }}
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </div>
              </>
            ) : (
              // Show Sign In button on home page
              isHomePage && (
                <Link
                  to="/signin"
                  className="font-mono text-xs uppercase tracking-[0.15em] transition-colors hover:opacity-70 px-4 py-2 rounded-md border"
                  style={{ 
                    color: '#10192B',
                    borderColor: '#DCD3BE'
                  }}
                >
                  Sign In
                </Link>
              )
            )}
          </div>

          {/* Mobile Menu Button */}
          <button 
            className="md:hidden" 
            style={{ color: '#10192B' }}
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        {/* Mobile Menu */}
        {isMobileMenuOpen && (
          <div 
            className="md:hidden border-t px-4 py-4"
            style={{ 
              backgroundColor: '#F6F2E8',
              borderColor: '#DCD3BE'
            }}
          >
            {user ? (
              <div className="flex flex-col space-y-3">
                <Link
                  to="/dashboard"
                  className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] px-3 py-2 rounded-md hover:opacity-70"
                  style={{ color: '#5B5647' }}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <LayoutDashboard className="h-4 w-4" />
                  Dashboard
                </Link>
                <Link
                  to="/orders/new"
                  className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] px-3 py-2 rounded-md border"
                  style={{ 
                    color: '#10192B',
                    borderColor: '#DCD3BE'
                  }}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  <PlusCircle className="h-4 w-4" />
                  New Order
                </Link>
                <div className="pt-3 border-t" style={{ borderColor: '#DCD3BE' }}>
                  <span 
                    className="block text-sm px-3 py-2"
                    style={{ color: '#5B5647' }}
                  >
                    <User className="mr-1 inline h-4 w-4" />
                    {user.email}
                  </span>
                  <button
                    onClick={() => {
                      signOut();
                      setIsMobileMenuOpen(false);
                    }}
                    className="flex items-center gap-2 font-mono text-xs uppercase tracking-[0.15em] px-3 py-2 rounded-md hover:opacity-70 w-full"
                    style={{ color: '#5B5647' }}
                  >
                    <LogOut className="h-4 w-4" />
                    Sign Out
                  </button>
                </div>
              </div>
            ) : (
              isHomePage && (
                <Link
                  to="/signin"
                  className="flex items-center justify-center gap-2 font-mono text-xs uppercase tracking-[0.15em] px-3 py-2 rounded-md border"
                  style={{ 
                    color: '#10192B',
                    borderColor: '#DCD3BE'
                  }}
                  onClick={() => setIsMobileMenuOpen(false)}
                >
                  Sign In
                </Link>
              )
            )}
          </div>
        )}
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}