"use client";

import * as React from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronDown,
  ChevronUp,
  Search,
  Warehouse,
} from "lucide-react";
import { format } from "date-fns";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { LogEntry } from "@/lib/types";

type SortableColumn = "type" | "date" | "productCode";
type SortDirection = "asc" | "desc";

export function LogTable({ data }: { data: LogEntry[] }) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [sortBy, setSortBy] = React.useState<SortableColumn>("date");
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc");

  const handleSort = (column: SortableColumn) => {
    if (sortBy === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortBy(column);
      setSortDirection("asc");
    }
  };

  const sortedAndFilteredData = React.useMemo(() => {
    let filtered = data;
    if (searchTerm) {
      filtered = data.filter((entry) =>
        Object.values(entry).some((value) =>
          String(value).toLowerCase().includes(searchTerm.toLowerCase())
        )
      );
    }

    return filtered.sort((a, b) => {
      const aValue = a[sortBy];
      const bValue = b[sortBy];

      if (aValue < bValue) return sortDirection === "asc" ? -1 : 1;
      if (aValue > bValue) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });
  }, [data, searchTerm, sortBy, sortDirection]);

  const SortIndicator = ({ column }: { column: SortableColumn }) => {
    if (sortBy !== column) return null;
    return sortDirection === "asc" ? (
      <ChevronUp className="h-4 w-4" />
    ) : (
      <ChevronDown className="h-4 w-4" />
    );
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <CardTitle>Registro de Movimientos</CardTitle>
          <div className="relative w-full sm:w-64">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Buscar en registros..."
              className="pl-8"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("type")}
                    className="px-2"
                  >
                    Tipo
                    <SortIndicator column="type" />
                  </Button>
                </TableHead>
                <TableHead className="w-[150px]">
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("date")}
                    className="px-2"
                  >
                    Fecha
                    <SortIndicator column="date" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    onClick={() => handleSort("productCode")}
                    className="px-2"
                  >
                    Producto
                    <SortIndicator column="productCode" />
                  </Button>
                </TableHead>
                <TableHead>Detalles</TableHead>
                <TableHead className="text-right">Cantidad</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedAndFilteredData.length > 0 ? (
                sortedAndFilteredData.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger>
                            <Badge
                              variant={
                                entry.type === "receipt"
                                  ? "secondary"
                                  : "outline"
                              }
                              className="capitalize"
                            >
                              {entry.type === "receipt" ? (
                                <ArrowDownLeft className="h-3.5 w-3.5 mr-1 text-green-600" />
                              ) : (
                                <ArrowUpRight className="h-3.5 w-3.5 mr-1 text-blue-600" />
                              )}
                              {entry.type === "receipt"
                                ? "Recibo"
                                : "Despacho"}
                            </Badge>
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>
                              {entry.type === "receipt"
                                ? "Entrada de producto"
                                : "Salida de producto"}
                            </p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </TableCell>
                    <TableCell>
                      {format(new Date(entry.date), "dd MMM yyyy")}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{entry.productCode}</div>
                      {entry.type === "receipt" && (
                        <div className="text-sm text-muted-foreground truncate max-w-xs">
                          {entry.description}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {entry.type === "receipt"
                        ? `Proveedor: ${entry.supplier}`
                        : `Destino: ${entry.destination} / Carrier: ${entry.carrier}`}
                    </TableCell>
                    <TableCell className="text-right font-medium">
                      {entry.quantity}
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="h-24 text-center text-muted-foreground"
                  >
                    <div className="flex flex-col items-center gap-2">
                      <Warehouse className="h-8 w-8" />
                      <span>No hay registros para mostrar.</span>
                      <span className="text-xs">
                        Comience agregando un nuevo recibo o despacho.
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
