"use client"

import { useAuthPlugin } from "@better-auth-ui/react"
import { FieldDescription, FieldLegend, FieldSet } from "@pistonpost/ui/components/field"
import { ToggleGroup, ToggleGroupItem } from "@pistonpost/ui/components/toggle-group"
import { cn } from "@pistonpost/ui/lib/utils"
import { useEffect, useState } from "react"

import { Monitor, Moon, Sun } from "@/components/icons"
import { themePlugin } from "@/lib/auth/theme-plugin"

export type AppearanceProps = {
  className?: string
}

export function Appearance({ className }: AppearanceProps) {
  const { useTheme, localization } = useAuthPlugin(themePlugin)
  const { theme, setTheme, themes = [] } = useTheme()

  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => setIsMounted(true), [])

  return (
    <FieldSet className={cn(className)}>
      <FieldLegend>{localization.theme}</FieldLegend>
      <FieldDescription>Choose how PistonPost looks on this device.</FieldDescription>
      <ToggleGroup
        value={isMounted && theme ? [theme] : []}
        onValueChange={(values) => {
          const value = values[0]
          if (value) setTheme(value)
        }}
        variant="outline"
        className="grid w-full grid-cols-1 sm:grid-cols-3"
        disabled={!isMounted || !theme}
        aria-label={localization.theme}
      >
        {themes.includes("system") ? (
          <ToggleGroupItem value="system" className="w-full">
            <Monitor />
            {localization.system}
          </ToggleGroupItem>
        ) : null}
        {themes.includes("light") ? (
          <ToggleGroupItem value="light" className="w-full">
            <Sun />
            {localization.light}
          </ToggleGroupItem>
        ) : null}
        {themes.includes("dark") ? (
          <ToggleGroupItem value="dark" className="w-full">
            <Moon />
            {localization.dark}
          </ToggleGroupItem>
        ) : null}
      </ToggleGroup>
    </FieldSet>
  )
}
