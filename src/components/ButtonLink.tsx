import { useRender } from "@base-ui/react/use-render"
import type { VariantProps } from "class-variance-authority"
import { cn } from "cn"

import { buttonVariants } from "@/components/ui/button"

/**
 * A link styled as a button.
 *
 * Base UI `Button` with `nativeButton={false}` adds `role="button"`, so screen readers announce
 * navigation as an action. This keeps the link role and only borrows the button styles.
 */
export function ButtonLink({
  render,
  variant = "default",
  size = "default",
  className,
  ...props
}: useRender.ComponentProps<"a"> & VariantProps<typeof buttonVariants>) {
  return useRender({
    defaultTagName: "a",
    render,
    props: {
      ...props,
      "data-slot": "button",
      className: cn(buttonVariants({ variant, size }), className),
    },
  })
}
