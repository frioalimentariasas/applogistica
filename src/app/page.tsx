"use client";

import { useState } from "react";
import type { LogEntry, Receipt, Dispatch } from "@/lib/types";
import { useLocalStorage } from "@/hooks/use-local-storage";
import { ReceiptForm } from "@/components/app/receipt-form";
import { DispatchForm } from "@/components/app/dispatch-form";
import { LogTable } from "@/components/app/log-table";

export default function Home() {
  const [logEntries, setLogEntries] = useLocalStorage<LogEntry[]>("logEntries", []);
  const [isClient, setIsClient] = useState(false);
  
  useState(() => {
    setIsClient(true);
  });

  const handleAddReceipt = (receipt: Omit<Receipt, 'id' | 'type'>) => {
    const newReceipt: Receipt = {
      ...receipt,
      id: new Date().toISOString(),
      type: 'receipt',
    };
    setLogEntries([...logEntries, newReceipt]);
  };

  const handleAddDispatch = (dispatch: Omit<Dispatch, 'id' | 'type'>) => {
    const newDispatch: Dispatch = {
      ...dispatch,
      id: new Date().toISOString(),
      type: 'dispatch',
    };
    setLogEntries([...logEntries, newDispatch]);
  };

  if (!isClient) {
    return null; // or a loading skeleton
  }

  return (
    <div className="flex flex-col min-h-screen">
      <header className="bg-card border-b sticky top-0 z-10">
        <div className="container mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <h1 className="text-xl sm:text-2xl font-bold text-primary">
              Recibos y Despachos
            </h1>
            <div className="flex items-center gap-2 sm:gap-4">
              <ReceiptForm onAddReceipt={handleAddReceipt} allEntries={logEntries} />
              <DispatchForm onAddDispatch={handleAddDispatch} allEntries={logEntries} />
            </div>
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto p-4 sm:p-6 lg:p-8">
        <LogTable data={logEntries} />
      </main>

      <footer className="text-center p-4 text-muted-foreground text-sm">
        © {new Date().getFullYear()} Recibos y Despachos. All rights reserved.
      </footer>
    </div>
  );
}
