import { useEffect, useState } from 'react'
export function useOffline() {
  const [online, setOnline] = useState(navigator.onLine)
  const [ready, setReady] = useState(false)
  const [waiting, setWaiting] = useState(false)
  useEffect(() => {
    const update = () => setOnline(navigator.onLine)
    window.addEventListener('online', update)
    window.addEventListener('offline', update)
    let disposed = false
    async function check() {
      if (!('serviceWorker' in navigator)) return
      const reg = await navigator.serviceWorker.getRegistration()
      if (disposed) return
      setWaiting(Boolean(reg?.waiting))
      const worker = navigator.serviceWorker.controller
      if (!worker) return
      const channel = new MessageChannel()
      channel.port1.onmessage = (e) => {
        if (!disposed) setReady(e.data.ready === true)
        channel.port1.close()
      }
      worker.postMessage('CHECK_OFFLINE', [channel.port2])
    }
    check().catch(() => undefined)
    const interval = window.setInterval(() => {
      check().catch(() => undefined)
    }, 5000)
    return () => {
      disposed = true
      clearInterval(interval)
      window.removeEventListener('online', update)
      window.removeEventListener('offline', update)
    }
  }, [])
  return { online, ready, waiting }
}
