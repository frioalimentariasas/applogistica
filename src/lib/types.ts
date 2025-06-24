export interface Receipt {
  id: string;
  type: 'receipt';
  date: string;
  supplier: string;
  productCode: string;
  quantity: number;
  description: string;
}

export interface Dispatch {
  id: string;
  type: 'dispatch';
  date: string;
  destination: string;
  carrier: string;
  productCode: string;
  quantity: number;
}

export type LogEntry = Receipt | Dispatch;
