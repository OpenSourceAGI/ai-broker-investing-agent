/**
 * Re-export types from the shared x402 client for use by the x402 seller agent.
 */
export type {
  X402PaymentRequirements,
  X402BazaarSeller,
  X402BazaarListResponse,
  X402CallSellerRequest,
  X402CallSellerResponse,
  X402SellerInfo,
  ListSellersRequest,
  ListSellersResponse,
} from "../clients/x402/types";

/**
 * Supported actions for the x402 seller agent.
 */
export type X402SellerAction = "list" | "call" | "health" | "networks";

/**
 * Input for the x402 seller agent. The relevant fields depend on `action`.
 */
export interface X402SellerRequest {
  /** Which operation to perform */
  action: X402SellerAction | string;
  // list
  /** Filter by network (list) */
  network?: string;
  /** Protocol type filter (list) */
  type?: string;
  /** Pagination limit (list) */
  limit?: number;
  /** Pagination offset (list) */
  offset?: number;
  // call
  /** The seller's resource URL (call) */
  resourceUrl?: string;
  /** Query/input to send to the seller (call) */
  query?: string;
  /** Optional specific method (call) */
  method?: string;
}

/**
 * Generic response envelope for the health/networks/error actions.
 */
export interface X402SellerGenericResponse {
  success: boolean;
  [key: string]: unknown;
}
