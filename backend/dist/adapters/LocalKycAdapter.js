import { randomUUID } from "node:crypto";
function calculateAgeYears(birthDate, now) {
    let age = now.getUTCFullYear() - birthDate.getUTCFullYear();
    const monthDiff = now.getUTCMonth() - birthDate.getUTCMonth();
    const dayDiff = now.getUTCDate() - birthDate.getUTCDate();
    if (monthDiff < 0 || (monthDiff === 0 && dayDiff < 0)) {
        age -= 1;
    }
    return age;
}
export class LocalKycAdapter {
    minAgeYears;
    constructor(options = {}) {
        this.minAgeYears = Math.max(18, Math.floor(options.minAgeYears ?? 18));
    }
    async verify(input) {
        const now = new Date();
        const birthDate = new Date(input.birthDate);
        const ageYears = Number.isNaN(birthDate.getTime())
            ? Number.NaN
            : calculateAgeYears(birthDate, now);
        if (!Number.isFinite(ageYears)) {
            return {
                decision: "REJECTED",
                providerReference: `local-kyc-${randomUUID()}`,
                checkedAt: now.toISOString(),
                reason: "INVALID_BIRTH_DATE"
            };
        }
        if (ageYears < this.minAgeYears) {
            return {
                decision: "REJECTED",
                providerReference: `local-kyc-${randomUUID()}`,
                checkedAt: now.toISOString(),
                reason: "UNDERAGE"
            };
        }
        return {
            decision: "VERIFIED",
            providerReference: `local-kyc-${randomUUID()}`,
            checkedAt: now.toISOString()
        };
    }
}
