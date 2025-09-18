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
  calendarProps?: Omit<CalendarProps, "mode" | "selected" | "onSelect">
}

export function DateMultiSelector({
  value,
  onChange,
  disabled,
  calendarProps,
}: DateMultiSelectorProps) {
  const [isPickerOpen, setIsPickerOpen] = React.useState(false)
  const [localDates, setLocalDates] = React.useState(value || [])

  React.useEffect(() => {
    setLocalDates(value || [])
  }, [value])

  const handleConfirm = () => {
    onChange(localDates)
    setIsPickerOpen(false)
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        className="w-full justify-start text-left font-normal"
        onClick={() => setIsPickerOpen(true)}
        disabled={disabled}
      >
        <CalendarIcon className="mr-2 h-4 w-4" />
        {localDates.length > 0
          ? `${localDates.length} fecha(s) seleccionada(s)`
          : "Seleccionar fechas..."}
      </Button>
      {localDates.length > 0 && (
        <ScrollArea className="h-16">
          <div className="flex flex-wrap gap-1">
            {localDates.map((date) => (
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
            selected={localDates}
            onSelect={(dates) => setLocalDates(dates || [])}
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
