import * as React from "react"

import { cn } from "@/lib/utils"

function Table({
  className,
  ...props
}) {
  return (
    <div className="relative w-full overflow-auto">
      <table
        data-slot="table"
        className={cn(
          "w-full caption-bottom border-2 border-border text-sm",
          className,
        )}
        {...props}
      />
    </div>
  )
}

function TableHeader({
  className,
  ...props
}) {
  return (
    <thead
      data-slot="table-header"
      className={cn("[&_tr]:border-b-2 [&_tr]:border-border", className)}
      {...props}
    />
  )
}

function TableBody({
  className,
  ...props
}) {
  return (
    <tbody
      data-slot="table-body"
      className={cn("[&_tr:last-child]:border-0", className)}
      {...props}
    />
  )
}

function TableFooter({
  className,
  ...props
}) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn(
        "border-t-2 border-border bg-background font-base text-foreground last:[&>tr]:border-b-0",
        className,
      )}
      {...props}
    />
  )
}

function TableRow({
  className,
  ...props
}) {
  return (
    <tr
      data-slot="table-row"
      className={cn(
        "border-b-2 border-border transition-colors text-foreground bg-background font-base data-[state=selected]:bg-main data-[state=selected]:text-main-foreground",
        className,
      )}
      {...props}
    />
  )
}

function TableHead({
  className,
  ...props
}) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        "h-12 px-4 text-left align-middle font-heading text-foreground [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  )
}

function TableCell({
  className,
  ...props
}) {
  return (
    <td
      data-slot="table-cell"
      className={cn(
        "p-4 align-middle [&:has([role=checkbox])]:pr-0",
        className,
      )}
      {...props}
    />
  )
}

function TableCaption({
  className,
  ...props
}) {
  return (
    <caption
      data-slot="table-caption"
      className={cn("mt-4 text-sm text-foreground font-base", className)}
      {...props}
    />
  )
}

export {
  Table,
  TableHeader,
  TableBody,
  TableFooter,
  TableHead,
  TableRow,
  TableCell,
  TableCaption,
}
