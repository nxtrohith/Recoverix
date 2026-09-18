import { ScrollArea as ScrollAreaPrimitive } from "@base-ui/react/scroll-area"

import * as React from "react"

import { cn } from "@/lib/utils"

function ScrollArea({
  className,
  children,
  ...props
}) {
  return (
    <ScrollAreaPrimitive.Root
      data-slot="scroll-area"
      className={cn("relative min-h-0 overflow-hidden", className)}
      {...props}
    >
      <ScrollAreaPrimitive.Viewport
        data-slot="scroll-area-viewport"
        className="size-full overscroll-contain font-base outline-none"
      >
        {children}
      </ScrollAreaPrimitive.Viewport>
      <ScrollBar />
      <ScrollAreaPrimitive.Corner />
    </ScrollAreaPrimitive.Root>
  )
}

function ScrollBar({
  className,
  orientation = "vertical",
  ...props
}) {
  return (
    <ScrollAreaPrimitive.Scrollbar
      data-slot="scroll-area-scrollbar"
      orientation={orientation}
      className={cn(
        "flex touch-none select-none transition-colors",
        orientation === "vertical" &&
          "h-full w-2.5 border-l border-l-transparent p-[1px]",
        orientation === "horizontal" &&
          "h-2.5 flex-col border-t border-t-transparent p-[1px]",
        className,
      )}
      {...props}
    >
      <ScrollAreaPrimitive.Thumb
        data-slot="scroll-area-thumb"
        className="relative flex-1 rounded-full bg-border"
      />
    </ScrollAreaPrimitive.Scrollbar>
  )
}

export { ScrollArea, ScrollBar }
