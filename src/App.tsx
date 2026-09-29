import { useEffect, useState } from 'react'
import { HistoryView } from './components/HistoryView'
import { ListView } from './components/ListView'
import { SettingsView } from './components/SettingsView'

type View = 'list' | 'history' | 'settings'

export default function App() {
  const [view, setView] = useState<View>('list')

  useEffect(() => {
    // Ask the browser not to evict our IndexedDB data under storage pressure.
    navigator.storage?.persist?.()
  }, [])

  useEffect(() => {
    window.scrollTo(0, 0)
  }, [view])

  return (
    <main className="app">
      {view === 'list' && <ListView onNav={setView} />}
      {view === 'history' && <HistoryView onBack={() => setView('list')} />}
      {view === 'settings' && <SettingsView onBack={() => setView('list')} />}
    </main>
  )
}
