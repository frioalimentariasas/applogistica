"use client"

import * as React from "react"
import { format } from "date-fns"
import { es } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Calendar, type CalendarProps } from "@/components/ui/calendar"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

interface DatePickerDialogProps {
  value: Date | undefined
  onChange: (date: Date | undefined) => void
  disabled?: boolean
  triggerClassName?: string
  calendarProps?: Omit<CalendarProps, "mode" | "selected" | "onSelect">
}

export function DatePickerDialog({
  value,
  onChange,
  disabled,
  triggerClassName,
  calendarProps,
}: DatePickerDialogProps) {
  const [isPickerOpen, setIsPickerOpen] = React.useState(false)

  const handleSelect = (date: Date | undefined) => {
    onChange(date)
    setIsPickerOpen(false) // Close the dialog on selection
  }

  return (
    <>
      <Button
        type="button"
        variant={"outline"}
        className={cn(
          "w-full justify-start text-left font-normal",
          !value && "text-muted-foreground",
          triggerClassName
        )}
        onClick={() => setIsPickerOpen(true)}
        disabled={disabled}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {value ? format(value, "PPP", { locale: es }) : <span>Seleccione una fecha</span>}
      </Button>
      <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
        <DialogContent className="sm:max-w-min">
           <DialogHeader>
             <DialogTitle>Seleccione una fecha</DialogTitle>
           </DialogHeader>
          <Calendar
            mode="single"
            selected={value}
            onSelect={handleSelect}
            disabled={disabled}
            initialFocus
            {...calendarProps}
          />
        </DialogContent>
      </Dialog>
    </>
  )
}
