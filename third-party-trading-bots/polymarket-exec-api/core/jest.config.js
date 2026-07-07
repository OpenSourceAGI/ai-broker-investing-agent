
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    '^.+\\.jsx?$': 'ts-jest',
  },
  transformIgnorePatterns: [
    "node_modules/(?!(@polymarket|ethers|@ethersproject|axios|@prob|ky|viem|ox)/)"
  ],
  testPathIgnorePatterns: ["/node_modules/", "/dist/"],
};