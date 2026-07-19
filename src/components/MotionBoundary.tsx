"use client"

import { LazyMotion, MotionConfig } from "motion/react"
import type { PropsWithChildren } from "react"

const loadMotionFeatures = () => import("@/lib/motion-features").then((module) => module.default)

export function MotionBoundary({ children }: PropsWithChildren) {
  return (
    <LazyMotion features={loadMotionFeatures} strict>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
    </LazyMotion>
  )
}
