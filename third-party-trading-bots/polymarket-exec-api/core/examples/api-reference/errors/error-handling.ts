import pmxt, {
    BaseError,
    AuthenticationError,
    RateLimitExceeded,
    OrderNotFound,
    InsufficientFunds,
    InvalidOrder,
    NetworkError,
} from '../../../src';

const main = async () => {
    const api = new pmxt.Probable();

    // All pmxt errors extend BaseError, which includes:
    //   status   - HTTP status code
    //   code     - machine-readable error code
    //   retryable - whether the operation can be retried
    //   exchange - which exchange threw the error

    try {
        await api.fetchOrderBook('invalid-id');
    } catch (error) {
        if (error instanceof RateLimitExceeded) {
            console.log(`Rate limited. Retry after ${error.retryAfter}s`);
        } else if (error instanceof AuthenticationError) {
            console.log('Bad credentials:', error.message);
        } else if (error instanceof OrderNotFound) {
            console.log('Order does not exist');
        } else if (error instanceof InsufficientFunds) {
            console.log('Not enough balance:', error.message);
        } else if (error instanceof InvalidOrder) {
            console.log('Invalid order params:', error.message);
        } else if (error instanceof NetworkError) {
            console.log('Network issue (retryable):', error.message);
        } else if (error instanceof BaseError) {
            console.log(`${error.code} (${error.status}): ${error.message}`);
            console.log('Retryable:', error.retryable);
        } else {
            throw error;
        }
    }
};

main();
