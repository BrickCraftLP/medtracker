import { createContext, useContext, useState, useCallback } from 'react'

const STORAGE_KEY = 'mt_topic_targets'
export const DEFAULT_TARGET = 80

const TopicTargetsContext = createContext(null)

export function TopicTargetsProvider({ children }) {
  const [targets, setTargets] = useState(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') }
    catch { return {} }
  })

  const getTarget = useCallback((topicId) => {
    return targets[topicId] ?? DEFAULT_TARGET
  }, [targets])

  const setTarget = useCallback((topicId, value) => {
    setTargets(prev => {
      const next = { ...prev, [topicId]: value }
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
      return next
    })
  }, [])

  return (
    <TopicTargetsContext.Provider value={{ getTarget, setTarget }}>
      {children}
    </TopicTargetsContext.Provider>
  )
}

export function useTopicTargets() {
  return useContext(TopicTargetsContext)
}
