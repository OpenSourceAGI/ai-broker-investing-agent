// Alpaca MCP client
// TODO: Implement Alpaca MCP integration

export interface TradingStrategy {
  id: string;
  name: string;
  description?: string;
  riskManagement?: RiskManagement;
  rules: StrategyRule[];
  active?: boolean;
  symbol: string;
}

export interface StrategyRule {
  id: string;
  condition: string;
  action: string;
}

export interface RiskManagement {
  maxPositionSize?: number;
  stopLoss?: number;
  takeProfit?: number;
}

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export const alpacaMCPClient = {
  // Placeholder implementation
  async getStrategies() {
    return [];
  },
  async createStrategy(strategy: TradingStrategy) {
    return strategy;
  },
};
