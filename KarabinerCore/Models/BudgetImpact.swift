import Foundation

public struct BudgetImpact: Codable, Sendable, Hashable {
    public enum Precision: String, Codable, Sendable, Hashable, CaseIterable {
        case exact
        case estimate
        case providerReported
        case unavailable
    }

    public var billingPath: BillingPath
    public var estimatedCostMinorUnits: Int?
    public var currencyCode: String?
    public var requestUnits: Int?
    public var precision: Precision
    public var budgetLimitMinorUnits: Int?

    public init(
        billingPath: BillingPath,
        estimatedCostMinorUnits: Int? = nil,
        currencyCode: String? = nil,
        requestUnits: Int? = nil,
        precision: Precision,
        budgetLimitMinorUnits: Int? = nil
    ) {
        self.billingPath = billingPath
        self.estimatedCostMinorUnits = estimatedCostMinorUnits
        self.currencyCode = currencyCode
        self.requestUnits = requestUnits
        self.precision = precision
        self.budgetLimitMinorUnits = budgetLimitMinorUnits
    }

    public var mustShowPrecisionWarning: Bool { precision == .estimate || precision == .unavailable }
}
