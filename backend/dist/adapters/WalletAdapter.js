export class WalletError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
    }
}
