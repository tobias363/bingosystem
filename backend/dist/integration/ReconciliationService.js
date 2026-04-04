// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------
export class ReconciliationService {
    walletAdapter;
    fetchProviderTransactions;
    alarmThreshold;
    onAlarm;
    /** History of generated reports (in-memory for now). */
    reports = [];
    constructor(options) {
        this.walletAdapter = options.walletAdapter;
        this.fetchProviderTransactions = options.fetchProviderTransactions;
        this.alarmThreshold = options.alarmThreshold ?? 1;
        this.onAlarm = options.onAlarm;
    }
    /**
     * Run reconciliation for a given time period.
     *
     * Compares local ledger entries within the period against provider records.
     * If no provider fetch function is configured, reports local-only summary.
     */
    async reconcile(periodStart, periodEnd) {
        const startMs = new Date(periodStart).getTime();
        const endMs = new Date(periodEnd).getTime();
        // Get local transactions in the period.
        const allLocal = this.walletAdapter.getFullLedger();
        const localInPeriod = allLocal.filter((tx) => {
            const txMs = new Date(tx.createdAt).getTime();
            return txMs >= startMs && txMs <= endMs;
        });
        const discrepancies = [];
        if (this.fetchProviderTransactions) {
            const providerTxs = await this.fetchProviderTransactions(periodStart, periodEnd);
            // Build a map of provider transactions by ID.
            const providerMap = new Map();
            for (const ptx of providerTxs) {
                providerMap.set(ptx.transactionId, ptx);
            }
            // Build a set of local transaction IDs.
            const localIds = new Set();
            // Check each local transaction against provider.
            for (const localTx of localInPeriod) {
                localIds.add(localTx.id);
                const providerTx = providerMap.get(localTx.id);
                if (!providerTx) {
                    discrepancies.push({
                        transactionId: localTx.id,
                        type: "missing_on_provider",
                        localTransaction: localTx,
                        description: `Transaksjon ${localTx.id} finnes lokalt men ikke hos leverandøren.`
                    });
                    continue;
                }
                // Compare amounts.
                if (Math.abs(localTx.amount - providerTx.amount) > 0.005) {
                    discrepancies.push({
                        transactionId: localTx.id,
                        type: "amount_mismatch",
                        localTransaction: localTx,
                        providerTransaction: providerTx,
                        description: `Beløpsavvik for ${localTx.id}: lokalt ${localTx.amount}, leverandør ${providerTx.amount}.`
                    });
                }
            }
            // Check for provider transactions missing locally.
            for (const ptx of providerTxs) {
                if (!localIds.has(ptx.transactionId)) {
                    discrepancies.push({
                        transactionId: ptx.transactionId,
                        type: "missing_locally",
                        providerTransaction: ptx,
                        description: `Transaksjon ${ptx.transactionId} finnes hos leverandøren men ikke lokalt.`
                    });
                }
            }
            const report = {
                generatedAt: new Date().toISOString(),
                periodStart,
                periodEnd,
                localTransactionCount: localInPeriod.length,
                providerTransactionCount: providerTxs.length,
                discrepancies,
                status: discrepancies.length > 0 ? "discrepancies_found" : "ok"
            };
            this.reports.push(report);
            if (discrepancies.length >= this.alarmThreshold && this.onAlarm) {
                this.onAlarm(report);
            }
            return report;
        }
        // No provider fetch — local-only report.
        const report = {
            generatedAt: new Date().toISOString(),
            periodStart,
            periodEnd,
            localTransactionCount: localInPeriod.length,
            providerTransactionCount: 0,
            discrepancies: [],
            status: "ok"
        };
        this.reports.push(report);
        return report;
    }
    /**
     * Run reconciliation for the last N hours. Convenience wrapper.
     */
    async reconcileLastHours(hours = 24) {
        const now = new Date();
        const start = new Date(now.getTime() - hours * 60 * 60 * 1000);
        return this.reconcile(start.toISOString(), now.toISOString());
    }
    /**
     * Get all stored reports.
     */
    getReports() {
        return this.reports.map((r) => ({ ...r }));
    }
    /**
     * Get the most recent report, or null if none exists.
     */
    getLatestReport() {
        return this.reports.length > 0 ? { ...this.reports[this.reports.length - 1] } : null;
    }
}
