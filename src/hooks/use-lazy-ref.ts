import * as React from "react"

function useLazyRef<T>(fn: () => T) {
  const ref = React.useRef<T | null>(null)

  if (ref.current === null) {
    ref.current = fn()
  }

  // eslint-disable-next-line typescript/no-unsafe-type-assertion -- The ref is initialized above.
  return ref as React.RefObject<T>
}

export { useLazyRef }
