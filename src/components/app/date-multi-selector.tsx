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
import { Badge } from "@/components/ui/badge"
import { ScrollArea } from "@/components/ui/scroll-area"

interface DateMultiSelectorProps {
  value: Date[]
  onChange: (dates: Date[]) => void
  disabled?: boolean
  triggerClassName?: string
  calendarProps?: Omit<CalendarProps, "mode" | "selected" | "onSelect">
}

export function DateMultiSelector({
  value,
  onChange,
  disabled,
  triggerClassName,
  calendarProps,
}: DateMultiSelectorProps) {
  const [isPickerOpen, setIsPickerOpen] = React.useState(false)

  const handleSelect = (dates: Date[] | undefined) => {
    // Always ensure we're passing an array to the parent
    onChange(dates || [])
  }

  const handleConfirm = () => {
    setIsPickerOpen(false)
  }
  
  // Ensure the value passed to the Calendar is always an array
  const selectedDates = Array.isArray(value) ? value : [];

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className={cn("w-full justify-start text-left font-normal", triggerClassName)}
        onClick={() => setIsPickerOpen(true)}
        disabled={disabled}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {selectedDates.length > 0
          ? `${selectedDates.length} fecha(s) seleccionada(s)`
          : "Seleccionar fechas..."}
      </Button>
      {selectedDates.length > 0 && (
        <ScrollArea className="h-16">
          <div className="flex flex-wrap gap-1">
            {selectedDates.map((date) => (
              <Badge key={date.toISOString()} variant="secondary">
                {format(date, "d MMM", { locale: es })}
              </Badge>
            ))}
          </div>
        </ScrollArea>
      )}
      <Dialog open={isPickerOpen} onOpenChange={setIsPickerOpen}>
        <DialogContent className="max-w-min">
          <DialogHeader>
            <DialogTitle>Seleccionar Fechas de Operación</DialogTitle>
          </DialogHeader>
          <Calendar
            mode="multiple"
            selected={selectedDates}
            onSelect={handleSelect}
            disabled={disabled}
            {...calendarProps}
          />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setIsPickerOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={handleConfirm}>Confirmar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
