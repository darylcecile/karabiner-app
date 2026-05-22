import Foundation

enum KarabinerNavigationDestination: String, CaseIterable, Identifiable, Hashable {
    case home
    case workspaces
    case agents
    case review
    case settings

    var id: String { rawValue }

    var title: String {
        switch self {
        case .home:
            "Home"
        case .workspaces:
            "Workspaces"
        case .agents:
            "Agents"
        case .review:
            "Review"
        case .settings:
            "Settings"
        }
    }

    var systemImage: String {
        switch self {
        case .home:
            "house"
        case .workspaces:
            "folder.badge.gearshape"
        case .agents:
            "person.3.sequence"
        case .review:
            "checklist.checked"
        case .settings:
            "gearshape"
        }
    }

    var accessibilityLabel: String {
        switch self {
        case .home:
            "Home dashboard"
        case .workspaces:
            "Workspaces and repositories"
        case .agents:
            "Agents and fleet board"
        case .review:
            "Review and approvals"
        case .settings:
            "Settings and provider disclosure"
        }
    }
}
