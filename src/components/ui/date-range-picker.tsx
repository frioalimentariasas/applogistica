

"use client";

import * as React from "react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Calendar as CalendarIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

interface DateRangePickerProps {
  value: Date[];
  onChange: (dates: Date[]) => void;
  className?: string;
  disabled?: boolean;
}

export function DateRangePicker({
  value,
  onChange,
  className,
  disabled = false,
}: DateRangePickerProps) {
  return (
    <div className={cn("grid gap-2", className)}>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            id="date"
            variant={"outline"}
            className={cn(
              "w-full justify-start text-left font-normal h-auto min-h-10",
              !value?.length && "text-muted-foreground"
            )}
            disabled={disabled}
          >
            <CalendarIcon className="mr-2 h-4 w-4" />
            {value?.length > 0 ? (
              <div className="flex flex-wrap gap-1">
                {value.length > 2 ? (
                  `${value.length} días seleccionados`
                ) : (
                  value.map((date) => format(date, "LLL dd, y", { locale: es })).join(", ")
                )}
              </div>
            ) : (
              <span>Seleccione las fechas</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0" align="start">
          <Calendar
            initialFocus
            mode="multiple"
            selected={value || []}
            onSelect={(dates) => onChange(dates || [])}
            numberOfMonths={1}
            disabled={(date) => isSunday(date) || disabled}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

// Helper function to check if a date is a Sunday
function isSunday(date: Date): boolean {
  return date.getDay() === 0;
}
