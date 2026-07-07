import { describe, it, expect } from "vitest";
import * as BrokerClient from "..";

describe("broker clients", () => {
  it("generates language model reply", async () => {
    const result = await BrokerClient..getStocksSearch("AAPL");
    console.log(result);
  });
});
