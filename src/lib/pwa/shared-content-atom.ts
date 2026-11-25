import * as Effect from "effect/Effect"
import { Atom } from "effect/reactivity"

import { readSharedContent } from "@/lib/pwa/local-store"

/**
 * Loads one pending share for one user. The read starts when a component mounts the atom and is
 * interrupted when the last reader unmounts. Server rendering keeps the initial value, because the
 * share lives in this device's IndexedDB.
 */
export const sharedContentAtom = Atom.family(
  ({ shareId, userId }: { readonly shareId: string; readonly userId: string }) =>
    Atom.make(
      // A store that cannot be read has no share to offer.
      Effect.promise(() => readSharedContent(shareId, userId).catch(() => null)),
    ).pipe(Atom.withServerValueInitial),
)
