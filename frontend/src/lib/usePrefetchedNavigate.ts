import { useNavigate, type NavigateOptions, type To } from 'react-router-dom'
import { preloadRoute } from '@/router/preloadRoute'

function toPathname(to: To) {
  if (typeof to === 'string') {
    return new URL(to, window.location.origin).pathname
  }

  return to.pathname ?? window.location.pathname
}

export function usePrefetchedNavigate() {
  const navigate = useNavigate()

  return async (to: To | number, options?: NavigateOptions) => {
    if (typeof to === 'number') {
      navigate(to)
      return
    }

    await preloadRoute(toPathname(to)).catch(() => undefined)
    navigate(to, options)
  }
}
