"use client"

import * as React from "react"

import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Drawer,
  DrawerClose,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer"
import { useIsMobile } from "@/hooks/use-mobile"
import { cn } from "@/lib/utils"

interface CredenzaProps {
  children: React.ReactNode
  defaultOpen?: boolean
  onOpenChange?: (open: boolean) => void
  open?: boolean
}

type CredenzaTriggerProps = React.ComponentProps<typeof DialogTrigger>
type CredenzaCloseProps = React.ComponentProps<typeof DialogClose>
type CredenzaContentProps = React.PropsWithChildren<{ className?: string }>
type CredenzaHeaderProps = React.ComponentProps<"div">
type CredenzaTitleProps = React.ComponentProps<"h2">
type CredenzaDescriptionProps = React.ComponentProps<"p">
type CredenzaBodyProps = React.ComponentProps<"div">
type CredenzaFooterProps = React.ComponentProps<"div">

const CredenzaContext = React.createContext<{ isMobile: boolean } | null>(null)

function useCredenzaContext() {
  const context = React.useContext(CredenzaContext)

  if (!context) {
    throw new Error("Credenza components must be rendered inside Credenza")
  }

  return context
}

function Credenza({ children, ...props }: CredenzaProps) {
  const isMobile = useIsMobile()

  return (
    <CredenzaContext.Provider value={{ isMobile }}>
      {isMobile ? (
        <Drawer showSwipeHandle {...props}>
          {children}
        </Drawer>
      ) : (
        <Dialog {...props}>{children}</Dialog>
      )}
    </CredenzaContext.Provider>
  )
}

function CredenzaTrigger(props: CredenzaTriggerProps) {
  const { isMobile } = useCredenzaContext()

  return isMobile ? <DrawerTrigger {...props} /> : <DialogTrigger {...props} />
}

function CredenzaClose(props: CredenzaCloseProps) {
  const { isMobile } = useCredenzaContext()

  return isMobile ? <DrawerClose {...props} /> : <DialogClose {...props} />
}

function CredenzaContent({ className, children }: CredenzaContentProps) {
  const { isMobile } = useCredenzaContext()

  return isMobile ? (
    <DrawerContent className={cn("group/credenza-content", className)}>{children}</DrawerContent>
  ) : (
    <DialogContent className={cn("group/credenza-content", className)}>{children}</DialogContent>
  )
}

function CredenzaHeader({ className, ...props }: CredenzaHeaderProps) {
  const { isMobile } = useCredenzaContext()

  return isMobile ? (
    <DrawerHeader className={className} {...props} />
  ) : (
    <DialogHeader className={className} {...props} />
  )
}

function CredenzaTitle({ className, ...props }: CredenzaTitleProps) {
  const { isMobile } = useCredenzaContext()

  return isMobile ? (
    <DrawerTitle className={className} {...props} />
  ) : (
    <DialogTitle className={className} {...props} />
  )
}

function CredenzaDescription({ className, ...props }: CredenzaDescriptionProps) {
  const { isMobile } = useCredenzaContext()

  return isMobile ? (
    <DrawerDescription className={className} {...props} />
  ) : (
    <DialogDescription className={className} {...props} />
  )
}

function CredenzaBody({ className, ...props }: CredenzaBodyProps) {
  return (
    <div
      className={cn(
        "min-h-0 flex-1 overflow-y-auto px-4 md:flex-none md:overflow-visible md:px-0",
        className,
      )}
      {...props}
    />
  )
}

function CredenzaFooter({ className, ...props }: CredenzaFooterProps) {
  const { isMobile } = useCredenzaContext()

  return isMobile ? (
    <DrawerFooter className={cn("flex-col-reverse", className)} {...props} />
  ) : (
    <DialogFooter className={className} {...props} />
  )
}

export {
  Credenza,
  CredenzaBody,
  CredenzaClose,
  CredenzaContent,
  CredenzaDescription,
  CredenzaFooter,
  CredenzaHeader,
  CredenzaTitle,
  CredenzaTrigger,
}
