import { RouterProvider } from 'react-router-dom'
import { router } from '@/router'

/**
 * App root — thin shell that mounts the router.
 * All layout, auth guards, and providers live inside the router tree
 * so they participate in data loading and error boundaries.
 */
export default function App() {
  return (
    <RouterProvider
      router={router}
      future={{ v7_startTransition: true } as never}
    />
  )
}
