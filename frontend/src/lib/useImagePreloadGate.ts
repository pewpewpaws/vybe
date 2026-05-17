import { useEffect, useMemo, useState } from 'react'

const loadedImageSources = new Set<string>()
const pendingImageLoads = new Map<string, Promise<void>>()

function preloadImage(src: string): Promise<void> {
  if (loadedImageSources.has(src)) {
    return Promise.resolve(undefined)
  }

  const existingPromise = pendingImageLoads.get(src)
  if (existingPromise) {
    return existingPromise
  }

  const loadPromise = new Promise<void>((resolve) => {
    const image = new Image()
    let settled = false

    const finalize = () => {
      if (settled) {
        return
      }

      settled = true
      loadedImageSources.add(src)
      pendingImageLoads.delete(src)
      resolve(undefined)
    }

    image.onload = finalize
    image.onerror = finalize
    image.src = src

    if (image.complete) {
      if (typeof image.decode === 'function') {
        void image.decode().catch(() => undefined).finally(finalize)
        return
      }
      finalize()
    }
  }).then(() => undefined)

  pendingImageLoads.set(src, loadPromise)

  return loadPromise
}

export function preloadImages(imageSources: Array<string | null | undefined>) {
  const uniqueSources = [...new Set(imageSources.filter((src): src is string => Boolean(src && src.trim())))]

  if (uniqueSources.length === 0) {
    return Promise.resolve(undefined)
  }

  return Promise.all(uniqueSources.map((src) => preloadImage(src))).then(() => undefined)
}

export function useImagePreloadGate(imageSources: Array<string | null | undefined>, enabled: boolean) {
  const normalizedSourcesKey = useMemo(
    () =>
      [...new Set(imageSources.filter((src): src is string => Boolean(src && src.trim())))]
        .join('\u0001'),
    [imageSources],
  )
  const normalizedSources = useMemo(
    () => (normalizedSourcesKey ? normalizedSourcesKey.split('\u0001') : []),
    [normalizedSourcesKey],
  )
  const gateKey = enabled && normalizedSources.length > 0 ? normalizedSourcesKey : null
  const allImagesCached = useMemo(
    () => normalizedSources.every((src) => loadedImageSources.has(src)),
    [normalizedSources],
  )
  const [resolvedKey, setResolvedKey] = useState<string | null>(() =>
    gateKey && allImagesCached ? gateKey : null,
  )
  const areImagesReady = gateKey === null || allImagesCached || resolvedKey === gateKey

  useEffect(() => {
    if (gateKey === null || allImagesCached) {
      return
    }

    let cancelled = false

    void preloadImages(normalizedSources).then(() => {
      if (!cancelled) {
        setResolvedKey(gateKey)
      }
    })

    return () => {
      cancelled = true
    }
  }, [allImagesCached, gateKey, normalizedSources])

  return areImagesReady
}
