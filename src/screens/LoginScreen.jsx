import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import { useNavigate, Link } from 'react-router-dom'
import { useLanguage } from '../context/LanguageContext.jsx'
import Turnstile from '../components/Common/Turnstile.jsx'
import { hideBootLoader } from '../utils/bootLoader.js'

const COOKIE_KEY = 'medtracker_cookies_ok'

function ImpressumSheet({ onClose }) {
  const { t } = useLanguage()
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 100, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end' }}
      onClick={onClose}
    >
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        style={{
          width: '100%',
          maxHeight: '80vh',
          overflowY: 'auto',
          background: 'rgba(18,18,32,0.96)',
          backdropFilter: 'blur(40px)',
          WebkitBackdropFilter: 'blur(40px)',
          borderTop: '1px solid rgba(255,255,255,0.12)',
          borderRadius: '24px 24px 0 0',
          padding: '16px 24px 48px',
        }}
      >
        {/* Handle */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.2)', margin: '0 auto 20px' }} />

        <h2 style={{ margin: '0 0 20px', fontSize: 20, fontWeight: 800, color: 'white' }}>{t('imprint.title')}</h2>

        <Section title="Medieninhaber gemäß § 25 Abs. 5 MedienG">
          <Row label="Name" value="Roland Lösel" />
          <Row label="Adresse" value="Parkgasse 21/11, 1030 Wien, Österreich" />
          <Row label="E-Mail" value="roland.loesel@proton.me" />
        </Section>

        <Section title="Hinweis zur Offenlegungspflicht">
          <p style={bodyText}>
            Diese Website ist eine rein private, nicht-kommerzielle Anwendung für den
            persönlichen Gebrauch. Sie enthält keinen über die Darstellung des persönlichen
            Lebensbereiches hinausgehenden Informationsgehalt, der geeignet wäre, die
            öffentliche Meinungsbildung zu beeinflussen.
          </p>
          <p style={bodyText}>
            Gemäß <strong style={{ color: 'rgba(255,255,255,0.75)' }}>§ 25 Abs. 5 Mediengesetz (MedienG)</strong> unterliegt
            diese Website daher der vereinfachten Offenlegungspflicht und muss lediglich
            Name und Anschrift des Medieninhabers ausweisen. Die weitergehenden
            Offenlegungspflichten nach § 25 Abs. 2–4 MedienG sowie die
            Informationspflichten nach <strong style={{ color: 'rgba(255,255,255,0.75)' }}>§ 5 ECG</strong> finden
            auf rein private Websites ohne kommerziellen Zweck keine Anwendung.
          </p>
        </Section>

        <Section title="Haftungsausschluss">
          <p style={bodyText}>
            Trotz sorgfältiger Kontrolle übernehme ich keine Haftung für Inhalte externer
            Links. Für den Inhalt verlinkter Seiten sind ausschließlich deren Betreiber
            verantwortlich.
          </p>
        </Section>

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onClose}
          style={{ width: '100%', marginTop: 8, padding: '14px', borderRadius: 14, border: 'none', background: 'rgba(255,255,255,0.1)', color: 'white', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
        >
          {t('imprint.close')}
        </motion.button>
      </motion.div>
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.7, textTransform: 'uppercase' }}>{title}</p>
      <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 12, padding: '4px 12px', border: '1px solid rgba(255,255,255,0.08)' }}>
        {children}
      </div>
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.06)', gap: 12 }}>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', fontWeight: 500, textAlign: 'right' }}>{value}</span>
    </div>
  )
}

const bodyText = { margin: '8px 0', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }

function CookieBanner({ onAccept, onDecline }) {
  const { t } = useLanguage()
  return (
    <motion.div
      initial={{ y: 80, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 80, opacity: 0 }}
      transition={{ type: 'spring', damping: 26, stiffness: 280 }}
      style={{
        position: 'fixed',
        bottom: 16,
        left: 12,
        right: 12,
        zIndex: 90,
        background: 'rgba(20,20,40,0.88)',
        backdropFilter: 'blur(40px)',
        WebkitBackdropFilter: 'blur(40px)',
        border: '1px solid rgba(255,255,255,0.14)',
        borderRadius: 20,
        padding: '16px 18px',
        boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
      }}
    >
      <p style={{ margin: '0 0 12px', fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.55 }}>
        {t('cookie.text')}
      </p>
      <div style={{ display: 'flex', gap: 8 }}>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onDecline}
          style={{ flex: 1, padding: '10px', borderRadius: 12, border: '1px solid rgba(255,255,255,0.15)', background: 'transparent', color: 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          {t('cookie.decline')}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onAccept}
          style={{ flex: 2, padding: '10px', borderRadius: 12, border: 'none', background: '#007AFF', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          {t('cookie.accept')}
        </motion.button>
      </div>
    </motion.div>
  )
}

export default function LoginScreen() {
  useEffect(() => { hideBootLoader() }, [])
  const { login } = useAuth()
  const navigate = useNavigate()
  const { t } = useLanguage()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [showImpressum, setShowImpressum] = useState(false)
  const [showCookies, setShowCookies] = useState(false)
  const [captchaToken, setCaptchaToken] = useState('')
  const turnstileRef = useRef(null)

  useEffect(() => {
    if (!localStorage.getItem(COOKIE_KEY)) setShowCookies(true)
  }, [])

  function acceptCookies() {
    localStorage.setItem(COOKIE_KEY, 'accepted')
    setShowCookies(false)
  }

  function declineCookies() {
    localStorage.setItem(COOKIE_KEY, 'declined')
    setShowCookies(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!captchaToken) {
      setError(t('login.captchaMissing'))
      return
    }
    setError('')
    setLoading(true)
    try {
      await login(email, password, captchaToken)
      navigate('/home')
    } catch (err) {
      setError(err.message ?? t('login.error'))
      // Tokens are single-use — clear it and make the visitor solve again
      // before the next attempt.
      setCaptchaToken('')
      turnstileRef.current?.reset()
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      position: 'relative',
      height: '100%',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
      background: '#050510',
    }}>
      {/* Animated blobs */}
      <div className="blob blob-1" style={{ width: 340, height: 340, background: '#007AFF', top: '-90px', left: '-90px' }} />
      <div className="blob blob-2" style={{ width: 280, height: 280, background: '#5856D6', bottom: '90px', right: '-70px' }} />
      <div className="blob blob-3" style={{ width: 220, height: 220, background: '#32ADE6', bottom: '-50px', left: '30%' }} />
      <div className="blob blob-4" style={{ width: 190, height: 190, background: '#30B0C7', top: '32%', right: '8%' }} />

      {/* Glass card */}
      <motion.div
        initial={{ opacity: 0, y: 30, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        style={{
          position: 'relative',
          zIndex: 10,
          width: 'calc(100vw - 40px)',
          maxWidth: 380,
          background: 'rgba(255,255,255,0.08)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 28,
          padding: '32px 28px',
          boxShadow: '0 24px 80px rgba(0,0,0,0.6)',
        }}
      >
        {/* Logo / Title */}
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <div style={{ fontSize: 44, marginBottom: 8 }}>🏥</div>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'white', letterSpacing: -0.5 }}>
            MedTracker
          </h1>
          <p style={{ margin: '6px 0 0', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
            {t('login.subtitle')}
          </p>
        </div>

        {/* Personal-use disclaimer */}
        <div style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.12)',
          borderRadius: 12,
          padding: '10px 14px',
          marginBottom: 24,
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
        }}>
          <span style={{ fontSize: 15, flexShrink: 0, marginTop: 1 }}>🔒</span>
          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
            {t('login.disclaimer')}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <input
            className="input"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: 'white' }}
            type="email"
            placeholder={t('login.email')}
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
          />
          <input
            className="input"
            style={{ background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.15)', color: 'white' }}
            type="password"
            placeholder={t('login.password')}
            value={password}
            onChange={e => setPassword(e.target.value)}
            required
          />

          <Turnstile
            ref={turnstileRef}
            action="login"
            onVerify={token => { setCaptchaToken(token); setError('') }}
            onExpire={() => setCaptchaToken('')}
            onError={() => setCaptchaToken('')}
          />

          {error && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ margin: 0, color: '#f87171', fontSize: 13, textAlign: 'center' }}
            >
              {error}
            </motion.p>
          )}

          <motion.button
            whileTap={{ scale: 0.97 }}
            type="submit"
            disabled={loading || !captchaToken}
            style={{
              padding: '14px',
              borderRadius: 14,
              border: 'none',
              background: '#007AFF',
              color: 'white',
              fontWeight: 600,
              fontSize: 17,
              cursor: loading || !captchaToken ? 'default' : 'pointer',
              opacity: loading || !captchaToken ? 0.6 : 1,
              marginTop: 4,
              boxShadow: '0 8px 24px rgba(0, 122, 255, 0.40)',
            }}
          >
            {loading ? '…' : t('login.submit')}
          </motion.button>
        </form>

        {/* Footer links */}
        <div style={{ marginTop: 20, display: 'flex', justifyContent: 'center', gap: 16 }}>
          <Link to="/datenschutz" style={linkStyle}>{t('login.privacy')}</Link>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>·</span>
          <button onClick={() => setShowImpressum(true)} style={{ ...linkStyle, background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
            {t('login.imprint')}
          </button>
          <span style={{ color: 'rgba(255,255,255,0.2)', fontSize: 12 }}>·</span>
          <Link to="/datenschutz" style={linkStyle}>{t('login.cookies')}</Link>
        </div>
      </motion.div>

      {/* Impressum sheet */}
      <AnimatePresence>
        {showImpressum && <ImpressumSheet onClose={() => setShowImpressum(false)} />}
      </AnimatePresence>

      {/* Cookie banner */}
      <AnimatePresence>
        {showCookies && <CookieBanner onAccept={acceptCookies} onDecline={declineCookies} />}
      </AnimatePresence>
    </div>
  )
}

const linkStyle = {
  fontSize: 12,
  color: 'rgba(255,255,255,0.35)',
  textDecoration: 'none',
  borderBottom: '1px solid rgba(255,255,255,0.2)',
  paddingBottom: 1,
}
