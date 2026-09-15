import { useState } from 'react'
import { motion } from 'framer-motion'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import Switch from '../../Common/Switch.jsx'
import BouncyAccordion from '../../Common/BouncyAccordion.jsx'

// Flat form controls for the widget settings sheet. Only the sheet and its
// action buttons are liquid glass — controls stay tinted so they read clean.

export function SectionLabel({ children }) {
  return <div className="wc-label">{children}</div>
}

export function Field({ label, children }) {
  return (
    <div className="wc-field">
      {label && <SectionLabel>{label}</SectionLabel>}
      {children}
    </div>
  )
}

// Controlled when `open`/`onOpenChange` are passed, otherwise keeps its own state.
export function SettingsAccordion({ label, items, open, onOpenChange, defaultOpen = null }) {
  const [innerOpen, setInnerOpen] = useState(defaultOpen)
  return (
    <Field label={label}>
      <BouncyAccordion
        items={items}
        value={open === undefined ? innerOpen : open}
        onValueChange={onOpenChange ?? setInnerOpen}
      />
    </Field>
  )
}

export function ChipGrid({ value, options, onChange, columns }) {
  return (
    <div className="wc-chips" style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {options.map(o => (
        <motion.button key={o.value} type="button" whileTap={{ scale: 0.94 }}
          className={`wc-chip${value === o.value ? ' is-active' : ''}`}
          onClick={() => onChange(o.value)}>
          <div className="wc-chip__label">{o.label}</div>
          {o.hint && <div className="wc-chip__hint">{o.hint}</div>}
        </motion.button>
      ))}
    </div>
  )
}

export function OptionPicker({ label, value, options, onChange }) {
  return (
    <Field label={label}>
      <div className="wc-options">
        {options.map(o => {
          const active = value === o.value
          return (
            <motion.button key={o.value} type="button" whileTap={{ scale: 0.97 }}
              className={`wc-option${active ? ' is-active' : ''}`}
              onClick={() => onChange(o.value)}>
              {active && <span className="wc-option__dot" />}
              {o.label}
            </motion.button>
          )
        })}
      </div>
    </Field>
  )
}

export function ToggleRow({ label, hint, value, onChange }) {
  return (
    <div className="wc-toggle">
      <div className="wc-toggle__text">
        <div className="wc-toggle__label">{label}</div>
        {hint && <div className="wc-toggle__hint">{hint}</div>}
      </div>
      <Switch checked={value} onChange={onChange} />
    </div>
  )
}

export function Pill({ active, color, disabled, onClick, children }) {
  return (
    <motion.button type="button" whileTap={disabled ? undefined : { scale: 0.94 }}
      className={`wc-pill${active ? ' is-active' : ''}`}
      style={color ? { '--pill-accent': color } : undefined}
      disabled={disabled}
      onClick={onClick}>
      {children}
    </motion.button>
  )
}

function TopicLabel({ topic }) {
  return <><span className="wc-pill__emoji">{topic.emoji}</span>{topic.name}</>
}

// noneLabel adds a leading "none" pill; tapping the active topic again then clears it.
export function TopicPicker({ label, value, topics, onChange, noneLabel }) {
  return (
    <Field label={label}>
      <div className="wc-pills">
        {noneLabel && <Pill active={!value} onClick={() => onChange(null)}>{noneLabel}</Pill>}
        {topics.map(topic => (
          <Pill key={topic.id} color={topic.color_from} active={value === topic.id}
            onClick={() => onChange(noneLabel && value === topic.id ? null : topic.id)}>
            <TopicLabel topic={topic} />
          </Pill>
        ))}
      </div>
    </Field>
  )
}

export function MultiTopicPicker({ label, value, topics, max, onChange }) {
  const toggle = id => onChange(value.includes(id) ? value.filter(x => x !== id) : [...value, id])
  return (
    <Field label={`${label} · max. ${max}`}>
      <div className="wc-pills">
        {topics.map(topic => {
          const active = value.includes(topic.id)
          return (
            <Pill key={topic.id} color={topic.color_from} active={active}
              disabled={!active && value.length >= max}
              onClick={() => toggle(topic.id)}>
              <TopicLabel topic={topic} />
            </Pill>
          )
        })}
      </div>
    </Field>
  )
}

export function ColorField({ color, onChange, swatch = color, dimmed = false, height = 190 }) {
  return (
    <div className="wc-color">
      <HexColorPicker className="wc-color__picker" color={color} onChange={onChange}
        style={{ height, opacity: dimmed ? 0.55 : 1 }} />
      <div className="wc-color__row">
        <div className="wc-color__swatch" style={{ background: swatch }} />
        <label className="wc-color__input">
          <span>#</span>
          <HexColorInput color={color} onChange={onChange} />
        </label>
      </div>
    </div>
  )
}

export function ColorRamp({ colors }) {
  return (
    <div className="wc-ramp">
      {colors.map((c, i) => <span key={i} style={{ background: c }} />)}
    </div>
  )
}

export function Swatch({ color, label, active, onClick }) {
  return (
    <motion.button type="button" whileTap={{ scale: 0.92 }}
      className={`wc-swatch${active ? ' is-active' : ''}`} onClick={onClick}>
      <span className="wc-swatch__color" style={{ background: color }} />
      {label}
    </motion.button>
  )
}
