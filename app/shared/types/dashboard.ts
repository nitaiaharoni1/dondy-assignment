export type DashboardCurrencyTotal = {
  currency: string;
  amount: string;
};

export type DashboardOrder = {
  id: string;
  name: string;
  createdAt: string;
  total: string;
  currency: string;
  gateways: string[];
  isCod: boolean;
};

export type DashboardData = {
  ordersReceived: number;
  codOrders: number;
  codSharePercent: number;
  totalsByCurrency: DashboardCurrencyTotal[];
  latestOrders: DashboardOrder[];
  refreshedAt: string;
};

type DashboardSuccess = {
  ok: true;
  data: DashboardData;
};

type DashboardFailure = {
  ok: false;
  error: string;
};

export type DashboardPayload = DashboardSuccess | DashboardFailure;
