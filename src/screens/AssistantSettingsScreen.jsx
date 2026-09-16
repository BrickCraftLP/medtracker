import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { NavDirectionContext } from '../context/navDirection.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getLLMSettings, setLLMSettings, hasWebGPU, WEBLLM_MODELS, AUTO_MODEL, explainLoadError } from '../assistant/llm/index.js'
import { getUnknown, clearUnknown } from '../assistant/engine/unknownLog.js'
import { getFeedback, removeFeedback, clearFeedback, exportFeedback } from '../assistant/engine/feedbackLog.js'
import { storedFacts } from '../assistant/engine/profile.js'
import { removeAlias, removePlace, removeNote, setPreference, clearStoredProfile } from '../assistant/engine/userStore.js'
import { hhmm, timeOf, minutesOf } from '../utils/calendar/eventModel.js'
import { GlassCard } from '../components/Common/Glass.jsx'

function Section({ title, footer, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 16px 6px' }}>{title}</p>
      <GlassCard cornerRadius={16} style={{ overflow: 'hidden' }}>{children}</GlassCard>
      {footer && <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '6px 16px 0', lineHeight: 1.45 }}>{footer}</p>}
    </div>
  )
}

const Divider = () => <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px' }} />

function Row({ label, children, onClick }) {
  return (
    <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', minHeight: 24, cursor: onClick ? 'pointer' : 'default' }}>
      <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
      {children}
    </div>
  )
}

const modelName = id => WEBLLM_MODELS.find(m => m.id === id)?.name ?? id

// One line of what the device check measured.
function deviceSummary(d, lang, tooBig = []) {
  const L = (en, de) => (lang === 'en' ? en : de)
  return [
    d.gpuScore != null ? `GPU ${d.gpuScore} GFLOPS` : L('GPU not measured', 'GPU nicht gemessen'),
    d.vendor || null,
    d.memoryGB ? `${d.memoryGB} GB RAM` : null,
    d.maxStorageMB ? L(`GPU buffer ${d.maxStorageMB} MB`, `GPU-Puffer ${d.maxStorageMB} MB`) : null,
    d.freeGB != null ? L(`${d.freeGB} GB free`, `${d.freeGB} GB frei`) : null,
    d.ios ? 'iPhone/iPad' : null,
    d.fallback ? L('software GPU', 'Software-GPU') : null,
    tooBig.length ? L(`too big here: ${tooBig.map(modelName).join(', ')}`, `zu groß für dieses Gerät: ${tooBig.map(modelName).join(', ')}`) : null,
  ].filter(Boolean).join(' · ')
}

const inputStyle = { border: 'none', outline: 'none', borderRadius: 8, padding: '6px 8px', fontSize: 14, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontFamily: 'inherit' }

export default function AssistantSettingsScreen() {
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { t, language } = useLanguage()
  const [s, setS] = useState(getLLMSettings)
  const models = WEBLLM_MODELS
  const [progress, setProgress] = useState(null)
  const [status, setStatus] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [diag, setDiag] = useState(null)   // null | 'running' | [{ name, ok, detail }]
  const [unknown, setUnknown] = useState(getUnknown)
  const [checking, setChecking] = useState(false)
  const [feedback, setFeedback] = useState(getFeedback)
  const [feedbackStatus, setFeedbackStatus] = useState(null)
  const gpu = hasWebGPU()

  const update = patch => setS(setLLMSettings(patch))

  useEffect(() => {
    const refresh = () => setFeedback(getFeedback())
    window.addEventListener('mt-assistant-feedback', refresh)
    return () => window.removeEventListener('mt-assistant-feedback', refresh)
  }, [])

  // What the user taught the assistant (engine/userStore.js).
  const L = (en, de) => (language === 'en' ? en : de)
  const [facts, setFacts] = useState(() => storedFacts({ L }))
  useEffect(() => {
    const refresh = () => setFacts(storedFacts({ L: (en, de) => (language === 'en' ? en : de) }))
    refresh()
    window.addEventListener('mt-assistant-profile', refresh)
    return () => window.removeEventListener('mt-assistant-profile', refresh)
  }, [language])
  function forgetFact(f) {
    if (f.kind === 'alias') removeAlias(f.key)
    else if (f.kind === 'place') removePlace(f.key)
    else if (f.kind === 'pref') setPreference(f.key, null)
    else removeNote(f.key)
  }

  // Ratings + not-understood questions as one JSON file to hand over for fixing.
  async function exportRatings(mode) {
    setFeedbackStatus(null)
    try {
      await import('../assistant/intents/index.js')
      const { allIntents } = await import('../assistant/engine/registry.js')
      const json = JSON.stringify(exportFeedback(allIntents().map(i => i.id)), null, 2)
      const name = `medtracker-assistant-feedback-${new Date().toISOString().slice(0, 10)}.json`
      if (mode === 'copy') {
        await navigator.clipboard.writeText(json)
        setFeedbackStatus({ ok: true, text: t('assistant.settings.copied') })
        return
      }
      // Installed iOS apps cannot download files: hand the file to the share sheet.
      const standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone
      const file = typeof File !== 'undefined' ? new File([json], name, { type: 'application/json' }) : null
      if (standalone && file && navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: name })
          setFeedbackStatus({ ok: true, text: t('assistant.settings.exported') })
          return
        } catch (e) {
          if (e?.name === 'AbortError') return
        }
      }
      const url = URL.createObjectURL(new Blob([json], { type: 'application/json' }))
      const link = document.createElement('a')
      link.href = url
      link.download = name
      link.click()
      URL.revokeObjectURL(url)
      setFeedbackStatus({ ok: true, text: t('assistant.settings.exported') })
    } catch (e) {
      console.error('[assistant] feedback export', e)
      setFeedbackStatus({ ok: false, text: String(e?.message ?? e) })
    }
  }

  useEffect(() => { setStatus(null) }, [s.backend])

  async function runCheck() {
    setChecking(true)
    try {
      const { ensureAutoModel } = await import('../assistant/llm/webllm.js')
      await ensureAutoModel({ force: true })
    } catch (e) {
      console.error('[assistant] device check', e)
    } finally {
      setS(getLLMSettings())
      setChecking(false)
    }
  }

  // Choosing the in-browser model checks the device before anything downloads.
  useEffect(() => {
    if (s.backend === 'webllm' && s.webllmModel === AUTO_MODEL && !s.deviceCheck && gpu) runCheck()
  }, [s.backend, s.webllmModel]) // eslint-disable-line react-hooks/exhaustive-deps

  async function loadModel() {
    setStatus(null)
    setProgress(0)
    try {
      const { loadWebLLM } = await import('../assistant/llm/webllm.js')
      await loadWebLLM(s.webllmModel, p => setProgress(p.progress))
      // 'auto' may have stepped down to a smaller model while loading.
      const now = getLLMSettings()
      setS(now)
      setStatus({ ok: true, text: `${t('assistant.settings.modelReady')} (${modelName(s.webllmModel === AUTO_MODEL ? now.autoModel : s.webllmModel)})` })
    } catch (e) {
      console.error('[assistant] model load', e)
      setStatus({ ok: false, text: explainLoadError(e, language) })
    } finally {
      setProgress(null)
    }
  }

  async function deleteModel() {
    if (!window.confirm(t('assistant.settings.deleteConfirm'))) return
    setStatus(null)
    setDeleting(true)
    try {
      const { deleteWebLLM } = await import('../assistant/llm/webllm.js')
      await deleteWebLLM(s.webllmModel)
      setStatus({ ok: true, text: t('assistant.settings.modelDeleted') })
    } catch (e) {
      console.error('[assistant] model delete', e)
      setStatus({ ok: false, text: String(e?.message ?? e) })
    } finally {
      setDeleting(false)
    }
  }

  async function runDiagnosis() {
    setDiag('running')
    try {
      const { diagnoseWebLLM } = await import('../assistant/llm/webllm.js')
      setDiag(await diagnoseWebLLM(s.webllmModel))
    } catch (e) {
      setDiag([{ name: 'App runtime file', ok: false, detail: String(e?.message ?? e) }])
    }
  }

  async function testOllama() {
    setStatus(null)
    try {
      const { pingOllama } = await import('../assistant/llm/ollama.js')
      const models = await pingOllama(s.ollamaUrl)
      setStatus({ ok: true, text: `${t('assistant.settings.connected')}: ${models.join(', ') || '—'}` })
    } catch (e) {
      setStatus({ ok: false, text: `${String(e?.message ?? e)} — ${t('assistant.settings.ollamaHint')}` })
    }
  }

  const backends = [
    { key: 'off', label: t('assistant.settings.off') },
    { key: 'webllm', label: t('assistant.settings.webllm'), disabled: !gpu },
    { key: 'ollama', label: t('assistant.settings.ollama') },
  ]

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '16px 16px 60px' }}>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => { setDirection(-1); navigate(-1) }}
          style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '0.5px solid rgba(255,255,255,0.22)', borderRadius: 10, padding: '7px 12px', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z" /></svg>
          {t('btn.back')}
        </motion.button>

        <h1 style={{ margin: '0 0 8px', fontSize: 34, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5 }}>{t('settings.assistant')}</h1>
        <p style={{ margin: '0 0 26px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{t('assistant.settings.intro')}</p>

        <Section title={t('assistant.settings.understanding')} footer={gpu ? t('assistant.settings.localNote') : t('assistant.settings.noWebGPU')}>
          {backends.map((b, i) => (
            <div key={b.key}>
              {i > 0 && <Divider />}
              <Row label={b.label} onClick={b.disabled ? undefined : () => update({ backend: b.key })}>
                <span style={{ opacity: b.disabled ? 0.4 : 1, color: 'var(--accent)', fontSize: 17, fontWeight: 700 }}>{s.backend === b.key ? '✓' : ''}</span>
              </Row>
            </div>
          ))}
        </Section>

        {s.backend === 'webllm' && (
          <Section
            title={t('assistant.settings.model')}
            footer={s.webllmModel === AUTO_MODEL ? `${t('assistant.settings.autoNote')} ${t('assistant.settings.downloadNote')}` : t('assistant.settings.downloadNote')}
          >
            <Row label={t('assistant.settings.model')}>
              <select value={s.webllmModel} onChange={e => update({ webllmModel: e.target.value })} style={{ ...inputStyle, maxWidth: 200 }}>
                <option value={AUTO_MODEL}>{t('assistant.settings.auto')}{s.autoModel ? ` → ${modelName(s.autoModel)}` : ''}</option>
                {models.map(m => <option key={m.id} value={m.id}>{m.name} ({m.size})</option>)}
              </select>
            </Row>
            {s.webllmModel === AUTO_MODEL && (
              <>
                <Divider />
                <Row
                  label={checking ? t('assistant.settings.checking') : t('assistant.settings.recheck')}
                  onClick={checking || progress != null ? undefined : runCheck}
                >
                  {!checking && s.autoModel && <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>{modelName(s.autoModel)}</span>}
                </Row>
                {!checking && s.deviceCheck && (
                  <div style={{ padding: '0 16px 10px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>
                    {deviceSummary(s.deviceCheck, language, s.tooBig ?? [])}
                  </div>
                )}
              </>
            )}
            <Divider />
            <Row label={t('assistant.settings.source')}>
              <select value={s.downloadSource} onChange={e => update({ downloadSource: e.target.value })} style={inputStyle}>
                <option value="auto">{t('assistant.settings.sourceAuto')}</option>
                <option value="direct">{t('assistant.settings.sourceDirect')}</option>
                <option value="proxy">{t('assistant.settings.sourceProxy')}</option>
              </select>
            </Row>
            <Divider />
            <Row label={progress != null ? `${t('assistant.loadingModel')} ${Math.round(progress * 100)}%` : t('assistant.settings.loadModel')} onClick={progress == null ? loadModel : undefined}>
              {progress != null && (
                <div style={{ width: 80, height: 6, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <div style={{ width: `${progress * 100}%`, height: '100%', background: 'var(--accent)' }} />
                </div>
              )}
            </Row>
            <Divider />
            <Row
              label={<span style={{ color: 'var(--wrong)' }}>{deleting ? t('assistant.settings.deleting') : t('assistant.settings.deleteModel')}</span>}
              onClick={deleting || progress != null ? undefined : deleteModel}
            />
            <Divider />
            <Row label={diag === 'running' ? t('assistant.settings.diagnosing') : t('assistant.settings.diagnose')} onClick={diag === 'running' ? undefined : runDiagnosis} />
            {Array.isArray(diag) && diag.map(d => (
              <div key={d.name} style={{ display: 'flex', gap: 8, padding: '6px 16px', borderTop: '0.5px solid var(--border)' }}>
                <span style={{ color: d.ok ? 'var(--correct)' : 'var(--wrong)', fontWeight: 700 }}>{d.ok ? '✓' : '✗'}</span>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{d.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', wordBreak: 'break-word', userSelect: 'text' }}>{d.detail}</div>
                </div>
              </div>
            ))}
          </Section>
        )}

        {s.backend === 'ollama' && (
          <Section title="Ollama" footer={t('assistant.settings.ollamaHint')}>
            <Row label="URL"><input value={s.ollamaUrl} onChange={e => update({ ollamaUrl: e.target.value })} style={{ ...inputStyle, width: 190 }} /></Row>
            <Divider />
            <Row label={t('assistant.settings.model')}><input value={s.ollamaModel} onChange={e => update({ ollamaModel: e.target.value })} style={{ ...inputStyle, width: 190 }} /></Row>
            <Divider />
            <Row label={t('assistant.settings.test')} onClick={testOllama} />
          </Section>
        )}

        {status && (
          <p style={{ margin: '-16px 16px 24px', fontSize: 13, color: status.ok ? 'var(--correct)' : 'var(--wrong)' }}>{status.text}</p>
        )}

        <Section title={t('assistant.settings.wakingHours')} footer={t('assistant.settings.wakingHoursNote')}>
          <Row label={t('assistant.settings.from')}>
            <input type="time" value={hhmm(timeOf(s.dayStart))} onChange={e => update({ dayStart: minutesOf(e.target.value) ?? s.dayStart })} style={inputStyle} />
          </Row>
          <Divider />
          <Row label={t('assistant.settings.to')}>
            <input type="time" value={hhmm(timeOf(s.dayEnd))} onChange={e => update({ dayEnd: minutesOf(e.target.value) ?? s.dayEnd })} style={inputStyle} />
          </Row>
        </Section>

        <Section title={t('assistant.settings.profile')} footer={t('assistant.settings.profileNote')}>
          {facts.length === 0 ? (
            <Row label={<span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{t('assistant.settings.profileEmpty')}</span>} />
          ) : facts.map((f, i) => (
            <div key={`${f.kind}-${f.key}`}>
              {i > 0 && <Divider />}
              <Row label={<span style={{ fontSize: 14 }}>{f.text}</span>}>
                <button
                  type="button"
                  onClick={() => forgetFact(f)}
                  aria-label={t('assistant.settings.clear')}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16, padding: 2 }}
                >
                  ✕
                </button>
              </Row>
            </div>
          ))}
          {facts.length > 0 && (
            <>
              <Divider />
              <Row
                label={<span style={{ color: 'var(--wrong)' }}>{t('assistant.settings.profileClear')}</span>}
                onClick={() => { if (window.confirm(t('assistant.settings.profileClearConfirm'))) clearStoredProfile() }}
              />
            </>
          )}
        </Section>

        <Section title={t('assistant.settings.commands')} footer={t('assistant.settings.commandsNote')}>
          <Row label={<code style={{ fontSize: 13 }}>/</code>} />
        </Section>

        <Section title={t('assistant.settings.feedback')} footer={t('assistant.settings.feedbackNote')}>
          {feedback.length === 0 ? (
            <Row label={<span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{t('assistant.settings.noFeedback')}</span>} />
          ) : (
            <Row label={`👍 ${feedback.filter(f => f.rating === 'good').length} · 👎 ${feedback.filter(f => f.rating === 'bad').length}`} />
          )}
          {feedback.filter(f => f.rating === 'bad').slice(0, 30).map(f => (
            <div key={f.id}>
              <Divider />
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', wordBreak: 'break-word' }}>{f.query}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, wordBreak: 'break-word' }}>
                    → {f.result?.title ?? '—'}{f.meta?.intent ? ` · ${f.meta.intent}` : ''}{f.reason ? ` · ${t(`assistant.rate.${f.reason}`)}` : ''}
                  </div>
                  {f.expected && <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, wordBreak: 'break-word' }}>✎ {f.expected}</div>}
                </div>
                <button
                  type="button"
                  onClick={() => removeFeedback(f.id)}
                  aria-label={t('assistant.settings.clear')}
                  style={{ border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-tertiary)', fontSize: 16, padding: 2 }}
                >
                  ✕
                </button>
              </div>
            </div>
          ))}
          <Divider />
          <Row label={<span style={{ color: 'var(--accent)' }}>{t('assistant.settings.export')}</span>} onClick={() => exportRatings('file')} />
          <Divider />
          <Row label={<span style={{ color: 'var(--accent)' }}>{t('assistant.settings.copy')}</span>} onClick={() => exportRatings('copy')} />
          {feedback.length > 0 && (
            <>
              <Divider />
              <Row
                label={<span style={{ color: 'var(--wrong)' }}>{t('assistant.settings.clearFeedback')}</span>}
                onClick={() => { if (window.confirm(t('assistant.settings.clearFeedbackConfirm'))) clearFeedback() }}
              />
            </>
          )}
        </Section>

        {feedbackStatus && (
          <p style={{ margin: '-16px 16px 24px', fontSize: 13, color: feedbackStatus.ok ? 'var(--correct)' : 'var(--wrong)' }}>{feedbackStatus.text}</p>
        )}

        <Section title={t('assistant.settings.unknown')} footer={t('assistant.settings.unknownNote')}>
          {unknown.length === 0 ? (
            <Row label={<span style={{ color: 'var(--text-secondary)' }}>—</span>} />
          ) : (
            <>
              {unknown.slice(0, 20).map((u, i) => (
                <div key={u.at}>
                  {i > 0 && <Divider />}
                  <Row label={<span style={{ fontSize: 14 }}>{u.text}</span>} />
                </div>
              ))}
              <Divider />
              <Row label={<span style={{ color: 'var(--wrong)' }}>{t('assistant.settings.clear')}</span>} onClick={() => { clearUnknown(); setUnknown([]) }} />
            </>
          )}
        </Section>
      </div>
    </div>
  )
}
