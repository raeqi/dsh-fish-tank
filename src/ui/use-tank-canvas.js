// Owns only canvas lifetime; the caller supplies simulation and persistence operations.
export function useTankCanvas(React, { store, canvasRef, tankRef, syncedRef, publish, persist, pushTank, drawScene, disposeRenderer }) {
  React.useEffect(function () {
          var canvas = canvasRef.current
          var host = tankRef.current
          if (canvas === null || host === null) return undefined
          var context = canvas.getContext('2d')
          if (context === null) return undefined

          var view = { width: 1, height: 1, dpr: 1 }
          var frame = null
          var alive = true
          var lastPublish = 0
          var lastSave = 0
          var lastDraw = 0
          var observer = null
          var motionQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-reduced-motion: reduce)') : null
          var raf = typeof window.requestAnimationFrame === 'function'
            ? function (callback) { return window.requestAnimationFrame(callback) }
            : function (callback) { return window.setTimeout(function () { callback(Date.now()) }, 16) }
          var stop = typeof window.cancelAnimationFrame === 'function'
            ? function (id) { window.cancelAnimationFrame(id) }
            : function (id) { window.clearTimeout(id) }

          function measure() {
            var rect = host.getBoundingClientRect()
            var width = rect.width || host.clientWidth || 1
            var height = rect.height || host.clientHeight || 1
            var dpr = Math.min(2, window.devicePixelRatio || 1)
            var reducedMotion = motionQuery !== null && motionQuery.matches
            view = { width: Math.max(1, width), height: Math.max(1, height), dpr: dpr, reducedMotion: reducedMotion }
            canvas.width = Math.max(1, Math.round(view.width * dpr))
            canvas.height = Math.max(1, Math.round(view.height * dpr))
          }

          function tick() {
            if (!alive) return
            var nowMs = Date.now()
            if (store.isReady() && syncedRef.current) {
              store.step(nowMs)
              if (nowMs - lastPublish >= 400) {
                lastPublish = nowMs
                publish(false)
              }
              if (nowMs - lastSave >= 5000) {
                lastSave = nowMs
                persist()
              }
            }
            if (!view.reducedMotion || nowMs - lastDraw >= 1000) {
              lastDraw = nowMs
              context.setTransform(view.dpr, 0, 0, view.dpr, 0, 0)
              drawScene(context, view, store.getScene(), nowMs)
            }
            frame = raf(tick)
          }

          measure()
          if (motionQuery && typeof motionQuery.addEventListener === 'function') motionQuery.addEventListener('change', measure)
          frame = raf(tick)
          if (typeof window.ResizeObserver === 'function') {
            observer = new window.ResizeObserver(measure)
            observer.observe(host)
          } else if (typeof window.addEventListener === 'function') {
            window.addEventListener('resize', measure)
          }
          function onVisibility() {
            if (document.visibilityState === 'hidden' && store.isReady()) { persist(); pushTank(true) }
          }
          document.addEventListener('visibilitychange', onVisibility)

          return function () {
            alive = false
            if (frame !== null) stop(frame)
            if (observer !== null) observer.disconnect()
            else if (typeof window.removeEventListener === 'function') window.removeEventListener('resize', measure)
            document.removeEventListener('visibilitychange', onVisibility)
            if (motionQuery && typeof motionQuery.removeEventListener === 'function') motionQuery.removeEventListener('change', measure)
            if (store.isReady()) persist()
            pushTank(true)
            disposeRenderer()
          }
        }, [])

}
