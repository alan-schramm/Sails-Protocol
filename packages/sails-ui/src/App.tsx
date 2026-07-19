import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { Toaster } from 'sonner'
import { ThemeProvider, useTheme } from './context/ThemeContext'
import { AuthProvider } from './context/AuthContext'
import { Layout } from './components/layout/Layout'
import { Marketplace } from './pages/Marketplace'
import { OfferDetail } from './pages/OfferDetail'
import { Trade } from './pages/Trade'
import { Login } from './pages/Login'
import { Profile } from './pages/Profile'
import { PublishOffer } from './pages/PublishOffer'
import { TradeHistory } from './pages/TradeHistory'
import { Dashboard } from './pages/admin/Dashboard'
import { ManageOffers } from './pages/admin/ManageOffers'
import { Disputes } from './pages/admin/Disputes'

function ThemedToaster() {
  const { theme } = useTheme()
  return <Toaster position="bottom-right" theme={theme} />
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <BrowserRouter>
          <ThemedToaster />
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route element={<Layout />}>
              <Route path="/" element={<Marketplace />} />
              <Route path="/offer/:id" element={<OfferDetail />} />
              <Route path="/trade/:id" element={<Trade />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="/profile/history" element={<TradeHistory />} />
              <Route path="/profile/new-offer" element={<PublishOffer />} />
              <Route path="/admin" element={<Dashboard />} />
              <Route path="/admin/offers" element={<ManageOffers />} />
              <Route path="/admin/disputes" element={<Disputes />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  )
}
