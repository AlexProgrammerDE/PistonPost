import { Download } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { useAppInstallation } from "@/components/PwaProvider"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { SidebarMenuButton, SidebarMenuItem } from "@/components/ui/sidebar"

export function InstallAppDialog() {
  const { installed, prompt } = useAppInstallation()
  const [pending, setPending] = useState(false)
  const [usedPrompt, setUsedPrompt] = useState<Event | null>(null)
  const available = prompt !== null && prompt !== usedPrompt
  if (installed) return null

  async function install() {
    if (!prompt || pending) return
    setPending(true)
    try {
      await prompt.prompt()
    } catch {
      toast.error("Use your browser menu to install PistonPost.")
    } finally {
      setUsedPrompt(prompt)
      setPending(false)
    }
  }

  return (
    <SidebarMenuItem>
      <Dialog>
        <DialogTrigger render={<SidebarMenuButton tooltip="Install app" />}>
          <Download aria-hidden="true" />
          <span>Install app</span>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Install PistonPost</DialogTitle>
            <DialogDescription>
              Keep PistonPost on your Home Screen or desktop. Notifications are optional.
            </DialogDescription>
          </DialogHeader>
          <ul className="flex list-disc flex-col gap-3 pl-5 text-sm">
            <li>
              <strong>iPhone or iPad:</strong> open the browser’s Share menu, then choose Add to
              Home Screen.
            </li>
            <li>
              <strong>Android:</strong> open the browser menu and choose Install app or Add to Home
              Screen.
            </li>
            <li>
              <strong>Desktop:</strong> look for Install in the address bar or browser menu. In
              Safari on Mac, choose File, then Add to Dock.
            </li>
          </ul>
          <p className="text-sm text-muted-foreground">
            If no install option appears, you can keep using PistonPost in this browser.
          </p>
          <DialogFooter showCloseButton>
            {available && (
              <Button disabled={pending} onClick={() => void install()}>
                Install PistonPost
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SidebarMenuItem>
  )
}
