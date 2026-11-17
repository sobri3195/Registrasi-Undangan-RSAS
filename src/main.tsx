import React from 'react'
import ReactDOM from 'react-dom/client'
import {
  BrowserRouter,
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import {
  LayoutDashboard,
  ScanLine,
  Settings as SettingsIcon,
  ArrowUpRight,
  Wifi,
  WifiOff,
  ShieldCheck,
} from 'lucide-react'
import { StoreProvider } from './context'
import { CloudProvider } from './CloudProvider'
import { CloudStatus } from './CloudSettings'
import { useCloud } from './cloud-store'
import UpdateNotice from './UpdateNotice'
import { useStore } from './store'
import { useOffline } from './offline'
import Dashboard from './Dashboard'
import Roster from './Roster'
import Petugas from './Petugas'
import Exchange from './Exchange'
import Settings from './Settings'
import Rsvp from './Rsvp'
import './styles.css'

export function Shell() {
  const cloud = useCloud()
  const { state } = useStore(),
    offline = useOffline(),
    location = useLocation()
  const coordinator = location.pathname.startsWith('/koordinator')
  const ready =
    offline.ready && state.package_version > 0 && Boolean(state.config.operator)
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link to="/koordinator" className="brand">
          <img src="/icon.svg" alt="" />
          <div>
            RSAS<small>REGISTRASI UNDANGAN</small>
          </div>
        </Link>
        <div className="nav-label">RUANG KERJA</div>
        <nav aria-label="Navigasi utama">
          <NavLink to="/koordinator">
            <LayoutDashboard size={20} />
            Koordinator
          </NavLink>
          <NavLink to="/petugas">
            <ScanLine size={20} />
            Check-in tamu
          </NavLink>
          <NavLink to="/pengaturan">
            <SettingsIcon size={20} />
            Pengaturan
          </NavLink>
        </nav>
        <div className="sidebar-note">
          <ShieldCheck size={21} />
          <strong>Data di perangkat Anda.</strong>
          <p>
            {cloud.config?.enabled
              ? 'Sinkronisasi Supabase opsional. Ekspor berkala tetap diperlukan.'
              : 'Data lokal. Supabase dapat diaktifkan melalui Pengaturan.'}
          </p>
          <span className="local-mode">MODE LOKAL</span>
        </div>
        <div className="sidebar-bottom">
          RSAU Prof. dr. Abdulrachman Saleh
          <small>Forum Komunikasi Publik 2026</small>
        </div>
      </aside>
      <div className="main-column">
        <header className="topbar">
          <span>
            {coordinator
              ? 'Pusat koordinasi'
              : location.pathname === '/petugas'
                ? 'Penerimaan tamu'
                : 'Pengaturan lokal'}
          </span>
          <div>
            <span className={`connection ${ready ? 'ready' : ''}`}>
              {offline.online ? <Wifi size={15} /> : <WifiOff size={15} />}{' '}
              {ready
                ? 'Siap offline'
                : offline.online
                  ? 'Online · siapkan offline'
                  : 'Offline · periksa kesiapan'}
            </span>
            <span className="station-pill">{state.config.station}</span>
          </div>
        </header>
        <main className="content">
          <CloudStatus />
          {coordinator && (
            <>
              <div className="page-heading">
                <div>
                  <span className="eyebrow">
                    KAMIS, 19 NOVEMBER 2026 · JAKARTA
                  </span>
                  <h1>Satu acara. Satu sambutan hangat.</h1>
                  <p>
                    Forum Komunikasi Publik & Kerja Sama Pelayanan Kesehatan
                  </p>
                </div>
                <Link className="button secondary" to="/petugas">
                  Buka meja check-in <ArrowUpRight size={17} />
                </Link>
              </div>
              <div className="event-strip">
                <span className="event-dot" />
                <strong>Registrasi 08.40–09.00 WIB</strong>
                <span>Pembukaan 09.01 WIB</span>
                <span>Lobi & halaman depan RSAS</span>
              </div>
              <nav className="tabs" aria-label="Navigasi koordinator">
                <NavLink to="/koordinator" end>
                  Ringkasan
                </NavLink>
                <NavLink to="/koordinator/undangan">Daftar undangan</NavLink>
                <NavLink to="/koordinator/berkas">Paket & penggabungan</NavLink>
              </nav>
            </>
          )}
          <Outlet />
          <footer className="app-footer">
            <span>RSAS · Registrasi Undangan</span>
            <span>19 November 2026 · Semua waktu tampilan dalam WIB</span>
          </footer>
          <UpdateNotice />
        </main>
      </div>
    </div>
  )
}
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/rsvp" element={<Rsvp />} />
        <Route
          element={
            <StoreProvider>
              <CloudProvider>
                <Shell />
              </CloudProvider>
            </StoreProvider>
          }
        >
          <Route path="/koordinator" element={<Dashboard />} />
          <Route path="/koordinator/undangan" element={<Roster />} />
          <Route path="/koordinator/berkas" element={<Exchange />} />
          <Route path="/petugas" element={<Petugas />} />
          <Route path="/pengaturan" element={<Settings />} />
          <Route path="*" element={<Navigate to="/koordinator" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  </React.StrictMode>,
)
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* Settings explicitly reports cache not ready. */
    })
  })
}
