import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <h2 style={{
        margin: '0 0 10px',
        fontSize: 17,
        fontWeight: 700,
        color: 'white',
        letterSpacing: -0.2,
      }}>
        {title}
      </h2>
      <div style={{ color: 'rgba(255,255,255,0.72)', fontSize: 14, lineHeight: 1.65 }}>
        {children}
      </div>
    </div>
  )
}

function P({ children }) {
  return <p style={{ margin: '0 0 8px' }}>{children}</p>
}

function Ul({ items }) {
  return (
    <ul style={{ margin: '6px 0 8px', paddingLeft: 20 }}>
      {items.map((item, i) => (
        <li key={i} style={{ marginBottom: 4 }}>{item}</li>
      ))}
    </ul>
  )
}

export default function DatenschutzScreen() {
  const navigate = useNavigate()

  return (
    <div style={{
      position: 'relative',
      minHeight: '100%',
      overflowY: 'auto',
      overflowX: 'hidden',
      WebkitOverflowScrolling: 'touch',
      background: '#0f0a1e',
      paddingBottom: 48,
    }}>
      {/* Background blobs */}
      <div className="blob blob-1" style={{ width: 280, height: 280, background: '#6366f1', top: '-60px', left: '-80px', opacity: 0.3 }} />
      <div className="blob blob-2" style={{ width: 220, height: 220, background: '#8b5cf6', bottom: '200px', right: '-60px', opacity: 0.25 }} />

      {/* Header */}
      <div style={{
        position: 'sticky',
        top: 0,
        zIndex: 10,
        background: 'rgba(15,10,30,0.8)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        padding: 'env(safe-area-inset-top, 0px) 16px 0',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 0' }}>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => navigate(-1)}
            style={{
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 10,
              padding: '7px 12px',
              color: 'white',
              fontSize: 14,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="white">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
            Zurück
          </motion.button>
          <h1 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'white' }}>
            Datenschutzerklärung
          </h1>
        </div>
      </div>

      {/* Content */}
      <div style={{
        position: 'relative',
        zIndex: 1,
        padding: '24px 20px 0',
        maxWidth: 680,
        margin: '0 auto',
      }}>

        {/* Personal use banner */}
        <div style={{
          background: 'rgba(99,102,241,0.15)',
          border: '1px solid rgba(99,102,241,0.4)',
          borderRadius: 16,
          padding: '14px 16px',
          marginBottom: 28,
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: '#a5b4fc', marginBottom: 4 }}>
            ⚠ Hinweis zur Nutzung
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.55 }}>
            Diese Anwendung ist ausschließlich für den persönlichen Gebrauch des Betreibers bestimmt
            und nicht für die allgemeine Öffentlichkeit zugänglich.
            Eine eigenständige Registrierung durch Dritte ist nicht vorgesehen.
          </div>
        </div>

        <Section title="1. Verantwortlicher">
          <P>
            Verantwortlicher im Sinne der Datenschutz-Grundverordnung (DSGVO) und des
            österreichischen Datenschutzgesetzes (DSG 2018) ist der private Betreiber
            dieser Anwendung (nachfolgend „Betreiber").
          </P>
          <P>
            Da es sich um eine ausschließlich privat genutzte, nicht-öffentliche Anwendung
            handelt, sind keine weiteren Nutzerkonten für Dritte vorgesehen.
            Anfragen zum Datenschutz können per E-Mail an den Betreiber gerichtet werden.
          </P>
        </Section>

        <Section title="2. Art der verarbeiteten Daten">
          <P>Im Rahmen der Nutzung dieser Anwendung werden folgende Datenkategorien verarbeitet:</P>
          <Ul items={[
            'Authentifizierungsdaten: E-Mail-Adresse, verschlüsseltes Passwort (gespeichert bei Supabase Auth)',
            'Anzeigename (optional, vom Nutzer selbst gesetzt)',
            'Lerndaten: Themen, Sitzungen, Übungsergebnisse, Zeitstempel',
            'Aufgaben (To-Do-Liste)',
            'Widget-Konfigurationen',
            'Technische Verbindungsdaten (IP-Adresse, Browser-Typ) – verarbeitet durch Cloudflare',
          ]} />
        </Section>

        <Section title="3. Zweck und Rechtsgrundlage der Verarbeitung">
          <P>
            Die Verarbeitung der Daten erfolgt ausschließlich zum Zweck der Bereitstellung
            der persönlichen Lerntracking-Funktionalität der Anwendung.
          </P>
          <P>Rechtsgrundlagen gemäß Art. 6 DSGVO:</P>
          <Ul items={[
            'Art. 6 Abs. 1 lit. b DSGVO – Verarbeitung zur Erfüllung der Nutzungsfunktion (Vertragserfüllung / vertragsähnliches Verhältnis)',
            'Art. 6 Abs. 1 lit. f DSGVO – Berechtigtes Interesse des Betreibers an der privaten Nutzung der eigenen Lerndaten',
          ]} />
        </Section>

        <Section title="4. Auftragsverarbeiter und Drittanbieter">
          <P>
            Zur technischen Bereitstellung der Anwendung werden folgende Drittdienstleister
            als Auftragsverarbeiter gemäß Art. 28 DSGVO eingesetzt:
          </P>

          <div style={{ marginBottom: 12 }}>
            <strong style={{ color: 'white' }}>Cloudflare, Inc.</strong>
            <br />
            101 Townsend St, San Francisco, CA 94107, USA
            <br />
            <span style={{ fontSize: 13 }}>
              Cloudflare fungiert als Content Delivery Network (CDN) und DDoS-Schutz. Beim
              Aufruf der Anwendung werden technische Verbindungsdaten (insbesondere IP-Adresse,
              Geräteinformationen, Anfrage-Zeitstempel) durch Cloudflare verarbeitet.
              Der Datentransfer in die USA erfolgt auf Basis der EU-Standardvertragsklauseln
              (Art. 46 Abs. 2 lit. c DSGVO).
              Datenschutzrichtlinie: cloudflare.com/privacypolicy/
            </span>
          </div>

          <div style={{ marginBottom: 12 }}>
            <strong style={{ color: 'white' }}>Supabase, Inc.</strong>
            <br />
            970 Toa Payoh North, #07-04, Singapore 318992
            <br />
            <span style={{ fontSize: 13 }}>
              Supabase stellt die Datenbankinfrastruktur und den Authentifizierungsdienst
              bereit. Alle Anwendungsdaten (Lerndaten, Konfigurationen, Authentifizierungsdaten)
              werden auf Supabase-Servern gespeichert. Die Speicherung erfolgt in der
              EU (Frankfurt, AWS eu-central-1), sofern bei der Projekterstellung so konfiguriert.
              Datenschutzrichtlinie: supabase.com/privacy
            </span>
          </div>

          <P>
            Mit beiden Diensten bestehen Auftragsverarbeitungsverträge gemäß Art. 28 DSGVO.
          </P>
        </Section>

        <Section title="5. Drittlandtransfer">
          <P>
            Cloudflare hat seinen Sitz in den USA. Der Transfer personenbezogener Daten
            in die USA erfolgt auf Grundlage der EU-Standardvertragsklauseln (SCC) gemäß
            Art. 46 Abs. 2 lit. c DSGVO sowie des EU-US Data Privacy Framework.
          </P>
          <P>
            Supabase speichert Daten bei AWS in der EU (Region eu-central-1 / Frankfurt),
            sofern das Projekt entsprechend konfiguriert wurde. Die Supabase-Unternehmensstruktur
            unterliegt zusätzlichen Standardvertragsklauseln für Subprozessoren.
          </P>
        </Section>

        <Section title="6. Speicherdauer">
          <P>
            Personenbezogene Daten werden nur so lange gespeichert, wie es für den jeweiligen
            Zweck erforderlich ist:
          </P>
          <Ul items={[
            'Kontodaten (E-Mail, Passwort-Hash): bis zur Löschung des Benutzerkontos',
            'Lerndaten (Sitzungen, Übungen, Themen): bis zur manuellen Löschung durch den Nutzer oder Kontolöschung',
            'Technische Logs bei Cloudflare: gemäß Cloudflare-Datenschutzrichtlinie (in der Regel max. 30 Tage)',
          ]} />
        </Section>

        <Section title="7. Cookies und lokale Speicherung">
          <P>
            Diese Anwendung verwendet keine Tracking-Cookies und keine Werbe-Cookies.
            Die folgenden technisch notwendigen Speichermechanismen kommen zum Einsatz:
          </P>

          <div style={{ marginBottom: 10 }}>
            <strong style={{ color: 'white', fontSize: 14 }}>localStorage (Browser)</strong>
          </div>
          <Ul items={[
            'sb-access-token / sb-refresh-token – Supabase-Sitzungstoken; technisch notwendig für die Authentifizierung und automatische Token-Erneuerung',
            'Anwendungsdaten-Cache – lokale Zwischenspeicherung der eigenen Lerndaten zur Offline-Verfügbarkeit (kein Tracking, keine Weitergabe)',
          ]} />

          <div style={{ marginBottom: 10 }}>
            <strong style={{ color: 'white', fontSize: 14 }}>Cookies – Supabase</strong>
          </div>
          <P>
            Supabase Auth kann je nach Client-Implementierung folgende HTTP-Cookies setzen:
          </P>
          <Ul items={[
            'sb-<project-ref>-auth-token – Sitzungscookie für die Authentifizierung (HttpOnly, Secure); wird nur gesetzt, wenn Cookie-basiertes Auth aktiv ist',
            'sb-<project-ref>-auth-token-code-verifier – PKCE-Code-Verifier für OAuth-Flows (kurzlebig)',
          ]} />

          <div style={{ marginBottom: 10 }}>
            <strong style={{ color: 'white', fontSize: 14 }}>Cookies – Cloudflare & Cloudflare Workers</strong>
          </div>
          <P>
            Cloudflare setzt beim Aufruf der Anwendung sowie bei der Verarbeitung von
            API-Anfragen über Cloudflare Workers technisch notwendige Cookies:
          </P>
          <Ul items={[
            '__cf_bm – Bot-Management-Cookie; dient der Unterscheidung zwischen menschlichen Nutzern und automatisierten Zugriffen (Ablauf: 30 Minuten)',
            '__cflb – Load-Balancing-Cookie; stellt sicher, dass Anfragen innerhalb einer Sitzung an denselben Server weitergeleitet werden (Session-Cookie)',
            'cf_clearance – wird nach Lösung einer Sicherheitsabfrage (Challenge) gesetzt; erlaubt weiteren Zugriff ohne erneute Prüfung (Ablauf: 30 Minuten bis 24 Stunden)',
            'Cloudflare Workers können je nach Backend-Implementierung eigene Session- oder Statuscookies setzen – ausschließlich technisch notwendig, kein Tracking',
          ]} />

          <P>
            Alle genannten Cookies sind technisch notwendig (Art. 6 Abs. 1 lit. f DSGVO)
            und dienen ausschließlich der Funktionsfähigkeit, Sicherheit und Sitzungsverwaltung.
            Es werden keine Analyse-, Marketing- oder Tracking-Cookies eingesetzt.
          </P>
        </Section>

        <Section title="8. Betroffenenrechte (Art. 15–22 DSGVO)">
          <P>Als betroffene Person stehen Ihnen folgende Rechte zu:</P>
          <Ul items={[
            'Auskunftsrecht (Art. 15 DSGVO): Recht auf Auskunft über die gespeicherten personenbezogenen Daten',
            'Berichtigungsrecht (Art. 16 DSGVO): Recht auf Berichtigung unrichtiger Daten',
            'Löschungsrecht (Art. 17 DSGVO): Recht auf Löschung der Daten („Recht auf Vergessenwerden")',
            'Einschränkungsrecht (Art. 18 DSGVO): Recht auf Einschränkung der Verarbeitung',
            'Datenübertragbarkeit (Art. 20 DSGVO): Recht auf Erhalt der Daten in maschinenlesbarem Format',
            'Widerspruchsrecht (Art. 21 DSGVO): Recht auf Widerspruch gegen die Verarbeitung',
          ]} />
          <P>
            Da diese Anwendung ausschließlich vom Betreiber selbst genutzt wird, sind
            Betroffenenrechte durch direkte Kontrolle über das eigene Konto und die
            Datenbankdaten jederzeit ausübbar.
          </P>
        </Section>

        <Section title="9. Beschwerderecht bei der Datenschutzbehörde">
          <P>
            Gemäß Art. 77 DSGVO haben Sie das Recht, bei der zuständigen Aufsichtsbehörde
            Beschwerde einzulegen:
          </P>
          <div style={{
            background: 'rgba(255,255,255,0.06)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: 12,
            padding: '14px 16px',
            fontSize: 13,
            lineHeight: 1.6,
          }}>
            <strong style={{ color: 'white' }}>Österreichische Datenschutzbehörde (DSB)</strong>
            <br />
            Barichgasse 40–42, 1030 Wien
            <br />
            Tel: +43 1 52 152-0
            <br />
            E-Mail: dsb@dsb.gv.at
            <br />
            Web: dsb.gv.at
          </div>
        </Section>

        <Section title="10. Keine automatisierten Entscheidungen">
          <P>
            Es findet keine automatisierte Entscheidungsfindung einschließlich Profiling
            im Sinne von Art. 22 DSGVO statt.
          </P>
        </Section>

        <Section title="11. Aktualität dieser Datenschutzerklärung">
          <P>
            Diese Datenschutzerklärung hat den Stand Mai 2026. Mit Änderungen der
            eingesetzten Dienste oder der rechtlichen Lage wird sie entsprechend aktualisiert.
          </P>
        </Section>

        <div style={{
          marginTop: 8,
          paddingTop: 20,
          borderTop: '1px solid rgba(255,255,255,0.08)',
          fontSize: 12,
          color: 'rgba(255,255,255,0.35)',
          textAlign: 'center',
        }}>
          MedTracker · Ausschließlich private Nutzung · Kein öffentliches Angebot
        </div>
      </div>
    </div>
  )
}
