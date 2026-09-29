import { ChevronLeft } from 'lucide-react'
import { useEffect, useState } from 'react'
import { exportBackup, importBackup, setSetting, useSetting } from '../actions'
import { fmtDate } from '../format'

const DAY = 86_400_000

export function SettingsView({ onBack }: { onBack: () => void }) {
  const enabled = useSetting('suggestionsEnabled', true)
  const pausedUntil = useSetting('suggestionsPausedUntil', 0)
  const paused = pausedUntil > Date.now()
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [msg, setMsg] = useState('')

  useEffect(() => {
    navigator.storage?.persisted?.().then(setPersisted)
  }, [])

  async function download() {
    const name = `grocery-backup-${new Date().toISOString().slice(0, 10)}.json`
    const file = new File([await exportBackup()], name, { type: 'application/json' })
    // Installed iPhone PWAs handle blob downloads poorly; the share sheet
    // ("Save to Files") works there and on Android.
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file] })
      } catch {
        // User closed the share sheet.
      }
      return
    }
    const a = document.createElement('a')
    a.href = URL.createObjectURL(file)
    a.download = name
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 10_000)
  }

  async function upload(file: File | undefined) {
    if (!file) return
    try {
      await importBackup(await file.text())
      setMsg('Backup restored. Newer changes on this device were kept.')
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not read that file')
    }
  }

  return (
    <>
      <header className="top">
        <button className="icon" aria-label="Back" onClick={onBack}>
          <ChevronLeft size={22} />
        </button>
        <h1>Settings</h1>
      </header>

      <h3 className="section">Suggestions</h3>
      <label className="setting">
        <span>Suggest items I'm probably out of</span>
        <input type="checkbox" className="switch" checked={enabled} onChange={(e) => setSetting('suggestionsEnabled', e.target.checked)} />
      </label>
      {enabled && (
        <div className="setting col">
          <span>{paused ? `Paused until ${fmtDate(pausedUntil)}` : 'Pause for a while'}</span>
          <div className="chips">
            {paused ? (
              <button className="chip" onClick={() => setSetting('suggestionsPausedUntil', 0)}>
                Resume now
              </button>
            ) : (
              [7, 14, 30].map((d) => (
                <button key={d} className="chip" onClick={() => setSetting('suggestionsPausedUntil', Date.now() + d * DAY)}>
                  {d === 30 ? '1 month' : `${d / 7} wk`}
                </button>
              ))
            )}
          </div>
        </div>
      )}

      <h3 className="section">Backup</h3>
      <p className="muted small pad">
        Your list lives only on this device.
        {persisted === false && ' Add the app to your home screen so the browser keeps your data.'}
      </p>
      <div className="setting">
        <button onClick={download}>Export backup</button>
        <label className="file-btn">
          Import backup
          <input type="file" accept="application/json,.json" onChange={(e) => (upload(e.target.files?.[0]), (e.target.value = ''))}
          />
        </label>
      </div>
      {msg && <p className="muted small pad">{msg}</p>}
    </>
  )
}
