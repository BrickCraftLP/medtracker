import { useState, useRef, useEffect, useCallback } from 'react'

export function useSession() {
  const [isRunning, setIsRunning] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [exercises, setExercises] = useState([])
  const [topicId, setTopicId] = useState(null)
  const [startedAt, setStartedAt] = useState(null)
  const [pauseBetweenExercises, setPauseBetweenExercises] = useState(false)
  const [isPaused, setIsPaused] = useState(false)

  const startTimeRef = useRef(null)
  const lastTapRef = useRef(null)
  const intervalRef = useRef(null)
  const pauseStartRef = useRef(null)

  const startSession = useCallback((selectedTopicId, pauseEnabled = false) => {
    const now = new Date()
    setTopicId(selectedTopicId)
    setStartedAt(now.toISOString())
    setExercises([])
    setElapsed(0)
    setIsRunning(true)
    setPauseBetweenExercises(pauseEnabled)
    setIsPaused(false)
    startTimeRef.current = Date.now()
    lastTapRef.current = Date.now()
    pauseStartRef.current = null
  }, [])

  useEffect(() => {
    if (isRunning && !isPaused) {
      intervalRef.current = setInterval(() => {
        const pausedTime = pauseStartRef.current ? Date.now() - pauseStartRef.current : 0
        setElapsed(Date.now() - startTimeRef.current - pausedTime)
      }, 100)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [isRunning, isPaused])

  const recordExercise = useCallback((isCorrect) => {
    const now = Date.now()
    const durationMs = now - (lastTapRef.current ?? startTimeRef.current)
    lastTapRef.current = now
    const exercise = {
      is_correct: isCorrect,
      duration_ms: durationMs,
      created_at: new Date().toISOString(),
    }
    setExercises(prev => [...prev, exercise])
    return exercise
  }, [])

  const pauseSession = useCallback(() => {
    setIsRunning(false)
    setIsPaused(true)
    pauseStartRef.current = Date.now()
  }, [])

  const resumeSession = useCallback(() => {
    if (pauseStartRef.current) {
      const pausedDuration = Date.now() - pauseStartRef.current
      startTimeRef.current += pausedDuration
      pauseStartRef.current = null
    }
    setIsPaused(false)
    setIsRunning(true)
  }, [])

  const endSession = useCallback(() => {
    setIsRunning(false)
    const endedAt = new Date().toISOString()
    const durationSeconds = Math.floor(elapsed / 1000)
    return {
      exercises,
      topicId,
      startedAt,
      endedAt,
      durationSeconds,
    }
  }, [exercises, topicId, startedAt, elapsed])

  const resetSession = useCallback(() => {
    setIsRunning(false)
    setExercises([])
    setElapsed(0)
    setTopicId(null)
    setStartedAt(null)
    setPauseBetweenExercises(false)
    setIsPaused(false)
    startTimeRef.current = null
    lastTapRef.current = null
    pauseStartRef.current = null
  }, [])

  const formatTime = (ms) => {
    const totalSec = Math.floor(ms / 1000)
    const h = Math.floor(totalSec / 3600)
    const m = Math.floor((totalSec % 3600) / 60)
    const s = totalSec % 60
    if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  }

  return {
    isRunning,
    elapsed,
    exercises,
    topicId,
    startedAt,
    pauseBetweenExercises,
    isPaused,
    startSession,
    recordExercise,
    endSession,
    resetSession,
    pauseSession,
    resumeSession,
    formatTime,
  }
}
