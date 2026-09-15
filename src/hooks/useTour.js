import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

// Bump this when the walkthrough content changes enough that everyone should
// be prompted to read it again — the stored value is compared against it.
export const TOUR_VERSION = '1'

const SEEN_EVENT = 'mt-tour-seen'

function seenKey(userId) {
  return userId ? `mt_tour_seen_${userId}` : 'mt_tour_seen'
}

function readSeen(userId) {
  try {
    return localStorage.getItem(seenKey(userId))
  } catch {
    return null
  }
}

// Reactive view of "has this user been through the walkthrough yet".
// Same shape as useChangelog: a localStorage flag plus a custom event, so the
// Home banner and the Settings badge stay in sync — including across tabs.
export function useTour() {
  const { user } = useAuth()
  const userId = user?.id
  const [seen, setSeen] = useState(() => readSeen(userId))

  useEffect(() => {
    setSeen(readSeen(userId))

    const onSeen = () => setSeen(readSeen(userId))

    window.addEventListener(SEEN_EVENT, onSeen)
    window.addEventListener('storage', onSeen)

    return () => {
      window.removeEventListener(SEEN_EVENT, onSeen)
      window.removeEventListener('storage', onSeen)
    }
  }, [userId])

  const markTourSeen = useCallback(() => {
    try {
      localStorage.setItem(seenKey(userId), TOUR_VERSION)
    } catch {
      // ignore — the banner will just show again next launch
    }
    setSeen(TOUR_VERSION)
    window.dispatchEvent(new Event(SEEN_EVENT))
  }, [userId])

  return {
    hasSeenTour: seen === TOUR_VERSION,
    markTourSeen,
  }
}
