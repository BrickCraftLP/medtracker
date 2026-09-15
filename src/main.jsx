import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import { warmOfflineDB } from './services/offlineDB.js'
import { hideBootLoader } from './utils/bootLoader.js'
import './index.css'

// Open IndexedDB now so the connection (and any version upgrade) overlaps
// React's mount instead of being serialised after it.
warmOfflineDB()

// Failsafe: never leave the user staring at the boot overlay if a gate hangs.
setTimeout(hideBootLoader, 8000)

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
