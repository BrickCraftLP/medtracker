import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { useAuth } from './AuthContext.jsx'
import {
  getWorkspaces, saveWorkspace, deleteWorkspace,
  ensureDefaultWorkspace, initializeWorkspaceData,
  MAX_WORKSPACES,
} from '../services/dbInterface.js'
import { setActiveWorkspace, getActiveWorkspace } from '../services/workspaceScope.js'

const WorkspaceContext = createContext(null)

const listKey   = uid => `mt_workspaces_${uid}`
const activeKey = uid => `mt_active_workspace_${uid}`

function readCachedList(uid) {
  try {
    const raw = localStorage.getItem(listKey(uid))
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) && parsed.length ? parsed : null
  } catch { return null }
}

function pickActive(list, storedId) {
  return list.find(w => w.id === storedId) ?? list[0]
}

export function WorkspaceProvider({ children }) {
  const { user } = useAuth()
  const uid = user?.id

  // Resolve the scope synchronously, during the very first render, from the
  // list cached on this device. DataProvider's own synchronous seed runs when
  // it mounts as our child, so the scope must already be set by then — an
  // effect would be a frame too late and would paint the wrong workspace.
  const [workspaces, setWorkspaces] = useState(() => (uid && readCachedList(uid)) ?? [])
  const [activeId, setActiveId] = useState(() => {
    if (!uid) return null
    const cached = readCachedList(uid)
    if (!cached) return null
    const id = pickActive(cached, localStorage.getItem(activeKey(uid)))?.id ?? null
    setActiveWorkspace(id)
    return id
  })

  // Only the first launch after the update has no cached list; every later
  // launch resolves above and never blocks.
  const [ready, setReady] = useState(() => !!(uid && readCachedList(uid)))

  const persist = useCallback((list, nextActiveId) => {
    if (!uid) return
    try {
      localStorage.setItem(listKey(uid), JSON.stringify(list))
      if (nextActiveId) localStorage.setItem(activeKey(uid), nextActiveId)
    } catch {}
  }, [uid])

  // Load (or, on a cold first run, wait for) the real list.
  //
  // Deliberately guarded only by `cancelled`, never by a "already ran once"
  // ref: StrictMode mounts, cleans up, then mounts again, so such a ref makes
  // the second mount a no-op while the first mount's run has been cancelled —
  // leaving `ready` false forever behind the blank gate below.
  useEffect(() => {
    if (!uid) return
    let cancelled = false

    // Hard ceiling on the gate below. Whatever goes wrong — a blocked
    // IndexedDB upgrade, an unreachable Supabase, a migration not yet run —
    // the app must still render rather than sit on a blank screen.
    const failsafe = setTimeout(() => {
      if (!cancelled) setReady(true)
    }, 5000)

    ;(async () => {
      try {
        let list = await getWorkspaces(uid)
        if (!list.length) list = [await ensureDefaultWorkspace(uid)]
        if (cancelled) return
        const next = pickActive(list, localStorage.getItem(activeKey(uid)))
        setActiveWorkspace(next?.id ?? null)
        setWorkspaces(list)
        setActiveId(next?.id ?? null)
        persist(list, next?.id)
      } catch (e) {
        console.error('WorkspaceContext bootstrap failed:', e)
      } finally {
        clearTimeout(failsafe)
        if (!cancelled) setReady(true)
      }
    })()
    return () => { cancelled = true; clearTimeout(failsafe) }
  }, [uid, persist])

  const switchWorkspace = useCallback((id) => {
    if (!id || id === getActiveWorkspace()) return
    // Synchronous, so the very next read in DataContext's effect is scoped.
    setActiveWorkspace(id)
    try { localStorage.setItem(activeKey(uid), id) } catch {}
    setActiveId(id)
  }, [uid])

  const createWorkspace = useCallback(async ({ name, color, icon }) => {
    if (workspaces.length >= MAX_WORKSPACES) throw new Error('workspace limit reached')
    const created = await saveWorkspace(uid, {
      name: name.trim(),
      color,
      icon,
      display_order: workspaces.length,
    })
    const list = [...workspaces, created]
    setWorkspaces(list)
    persist(list, created.id)
    await initializeWorkspaceData(uid, created.id, created.name)
    switchWorkspace(created.id)
    return created
  }, [uid, workspaces, persist, switchWorkspace])

  const updateWorkspace = useCallback(async (id, patch) => {
    const current = workspaces.find(w => w.id === id)
    if (!current) return null
    const saved = await saveWorkspace(uid, { ...current, ...patch })
    // Functional, so several updates awaited back to back (merging task lists
    // touches every workspace in the group) don't each overwrite the last.
    setWorkspaces(prev => {
      const list = prev.map(w => (w.id === id ? saved : w))
      persist(list, activeId)
      return list
    })
    return saved
  }, [uid, workspaces, activeId, persist])

  const removeWorkspace = useCallback(async (id) => {
    if (workspaces.length <= 1) throw new Error('cannot delete the last workspace')
    const list = workspaces.filter(w => w.id !== id)
    // Switch away first, so no frame ever renders against a dangling scope.
    if (id === activeId) switchWorkspace(list[0].id)
    setWorkspaces(list)
    persist(list, id === activeId ? list[0].id : activeId)
    await deleteWorkspace(uid, id)
  }, [uid, workspaces, activeId, persist, switchWorkspace])

  const activeWorkspace = workspaces.find(w => w.id === activeId) ?? workspaces[0] ?? null

  // Render nothing while the list resolves (first launch after the update, or
  // after a cache clear) — the inline #boot-loader from index.html is still up
  // and covers this wait; an opaque plate here would only hide its spinner.
  if (uid && !ready) return null

  return (
    <WorkspaceContext.Provider value={{
      workspaces,
      activeWorkspace,
      activeWorkspaceId: activeWorkspace?.id ?? null,
      canAddWorkspace: workspaces.length < MAX_WORKSPACES,
      maxWorkspaces: MAX_WORKSPACES,
      switchWorkspace,
      createWorkspace,
      updateWorkspace,
      removeWorkspace,
    }}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext)
  if (!ctx) throw new Error('useWorkspace must be used within WorkspaceProvider')
  return ctx
}
