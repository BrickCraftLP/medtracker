// Kept under its old name for the screens that already use it. The sync itself
// runs once, app-wide, in GoogleSyncProvider (context/GoogleSyncContext.jsx) —
// a hook mounted per screen only ever synced while that screen was open.

export { useGoogleSync as useCalendarSync } from '../context/GoogleSyncContext.jsx'
