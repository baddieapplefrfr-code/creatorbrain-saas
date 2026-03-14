import {
  createRouter,
  createRoute,
  createRootRoute,
  RouterProvider,
  Outlet,
  redirect,
  useLocation,
  useNavigate,
} from '@tanstack/react-router'
import { ChannelProvider, useChannel } from './context/ChannelContext'
import { Sidebar } from './components/Sidebar'
import { Skeleton } from './components/Skeleton'
import { lazy, Suspense, useEffect } from 'react'

// ── Lazy pages ──────────────────────────────────────────────────────────────
const Onboarding  = lazy(() => import('./pages/Onboarding'))
const Dashboard   = lazy(() => import('./pages/Dashboard'))
const Brief       = lazy(() => import('./pages/Brief'))
const Autopsy     = lazy(() => import('./pages/Autopsy'))
const Trends      = lazy(() => import('./pages/Trends'))
const Viral       = lazy(() => import('./pages/Viral'))
const Twin        = lazy(() => import('./pages/Twin'))
const Insights    = lazy(() => import('./pages/Insights'))
const Competitor  = lazy(() => import('./pages/Competitor'))
const Revenue     = lazy(() => import('./pages/Revenue'))
const Comments    = lazy(() => import('./pages/Comments'))
const Series      = lazy(() => import('./pages/Series'))
const Script      = lazy(() => import('./pages/Script'))
const Hooks       = lazy(() => import('./pages/Hooks'))
const Calendar    = lazy(() => import('./pages/Calendar'))
const Checker     = lazy(() => import('./pages/Checker'))
const Collab      = lazy(() => import('./pages/Collab'))
const Roast       = lazy(() => import('./pages/Roast'))
const Chat        = lazy(() => import('./pages/Chat'))

// ── Page fallback ────────────────────────────────────────────────────────────
function PageFallback() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <Skeleton height={32} width="40%" />
      <Skeleton height={16} width="60%" />
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginTop: 8 }}>
        <Skeleton height={120} />
        <Skeleton height={120} />
        <Skeleton height={120} />
      </div>
    </div>
  )
}

// ── App shell / layout component ─────────────────────────────────────────────
function AppLayout() {
  const { channel } = useChannel()
  const location = useLocation()
  const navigate = useNavigate()

  useEffect(() => {
    if (!channel && location.pathname !== '/onboarding') {
      navigate({ to: '/onboarding' })
    }
  }, [channel, location.pathname])

  if (location.pathname === '/onboarding') {
    return (
      <Suspense fallback={<div style={{ background: 'var(--bg)', minHeight: '100vh' }} />}>
        <Outlet />
      </Suspense>
    )
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      <Sidebar />
      <main
        style={{
          flex: 1,
          marginLeft: 230,
          minHeight: '100vh',
          background: 'var(--bg)',
          padding: '28px 32px',
          overflow: 'auto',
        }}
        className="app-main"
      >
        <Suspense fallback={<PageFallback />}>
          <Outlet />
        </Suspense>
      </main>

      {/* Responsive main offset on mobile */}
      <style>{`
        @media (max-width: 767px) {
          .app-main {
            margin-left: 60px !important;
            padding: 20px 16px !important;
          }
        }
      `}</style>
    </div>
  )
}

// ── Routes ────────────────────────────────────────────────────────────────────
const rootRoute = createRootRoute({
  component: () => (
    <ChannelProvider>
      <AppLayout />
    </ChannelProvider>
  ),
})

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: () => { throw redirect({ to: '/onboarding' }) },
})

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/onboarding',
  component: () => (
    <Suspense fallback={<div style={{ background: 'var(--bg)', minHeight: '100vh' }} />}>
      <Onboarding />
    </Suspense>
  ),
})

const dashboardRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/dashboard',
  component: () => <Suspense fallback={<PageFallback />}><Dashboard /></Suspense>,
})

const briefRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/brief',
  component: () => <Suspense fallback={<PageFallback />}><Brief /></Suspense>,
})

const autopsyRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/autopsy',
  component: () => <Suspense fallback={<PageFallback />}><Autopsy /></Suspense>,
})

const trendsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/trends',
  component: () => <Suspense fallback={<PageFallback />}><Trends /></Suspense>,
})

const viralRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/viral',
  component: () => <Suspense fallback={<PageFallback />}><Viral /></Suspense>,
})

const twinRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/twin',
  component: () => <Suspense fallback={<PageFallback />}><Twin /></Suspense>,
})

const insightsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/insights',
  component: () => <Suspense fallback={<PageFallback />}><Insights /></Suspense>,
})

const competitorRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/competitor',
  component: () => <Suspense fallback={<PageFallback />}><Competitor /></Suspense>,
})

const revenueRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/revenue',
  component: () => <Suspense fallback={<PageFallback />}><Revenue /></Suspense>,
})

const commentsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/comments',
  component: () => <Suspense fallback={<PageFallback />}><Comments /></Suspense>,
})

const seriesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/series',
  component: () => <Suspense fallback={<PageFallback />}><Series /></Suspense>,
})

const scriptRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/script',
  component: () => <Suspense fallback={<PageFallback />}><Script /></Suspense>,
})

const hooksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/hooks',
  component: () => <Suspense fallback={<PageFallback />}><Hooks /></Suspense>,
})

const calendarRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/calendar',
  component: () => <Suspense fallback={<PageFallback />}><Calendar /></Suspense>,
})

const checkerRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/checker',
  component: () => <Suspense fallback={<PageFallback />}><Checker /></Suspense>,
})

const collabRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/collab',
  component: () => <Suspense fallback={<PageFallback />}><Collab /></Suspense>,
})

const roastRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/roast',
  component: () => <Suspense fallback={<PageFallback />}><Roast /></Suspense>,
})

const chatRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/chat',
  component: () => <Suspense fallback={<PageFallback />}><Chat /></Suspense>,
})

// ── Router ────────────────────────────────────────────────────────────────────
const routeTree = rootRoute.addChildren([
  indexRoute,
  onboardingRoute,
  dashboardRoute,
  briefRoute,
  autopsyRoute,
  trendsRoute,
  viralRoute,
  twinRoute,
  insightsRoute,
  competitorRoute,
  revenueRoute,
  commentsRoute,
  seriesRoute,
  scriptRoute,
  hooksRoute,
  calendarRoute,
  checkerRoute,
  collabRoute,
  roastRoute,
  chatRoute,
])

const router = createRouter({ routeTree })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

// ── App ───────────────────────────────────────────────────────────────────────
export default function App() {
  return <RouterProvider router={router} />
}
