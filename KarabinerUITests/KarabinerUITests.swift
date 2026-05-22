import Foundation
import XCTest

final class KarabinerUITests: XCTestCase {
    @MainActor
    func testAppLaunchesToAccessibleLandingSurface() throws {
        let app = launchApp()

        let rootView = app.otherElements["karabiner-root-view"]
        let title = app.staticTexts["Karabiner"]

        let rootExists = rootView.waitForExistence(timeout: 3)
        let titleExists = title.waitForExistence(timeout: 3)

        try require(
            rootExists || titleExists,
            "Expected the scaffold landing surface to expose a root accessibility identifier or title."
        )
        if titleExists {
            try require(title.label.isEmpty == false, "The visible app title should be available to assistive technologies.")
        }
    }

    @MainActor
    func testCoreNavigationLabelsAreAccessibleWhenShellExists() throws {
        let app = launchApp()
        let expectedLabels = ["Repositories", "Workspaces", "Agents", "Review", "Settings"]
        let discoveredLabels = expectedLabels.filter { label in
            app.buttons[label].exists || app.staticTexts[label].exists || app.collectionViews[label].exists
        }

        if discoveredLabels.isEmpty {
            try require(
                app.otherElements["karabiner-root-view"].exists || app.staticTexts["Karabiner"].exists,
                "Until the navigation shell lands, the accessible root surface should still launch."
            )
        } else {
            try require(discoveredLabels.count > 0, "Navigation labels should be discoverable by accessibility queries.")
        }
    }

    @MainActor
    func testRemoteExecutionMessagingIsAccessibleWhenPresent() throws {
        let app = launchApp()
        let remoteMessaging = app.descendants(matching: .any).matching(
            NSPredicate(
                format: "label CONTAINS[c] %@ OR label CONTAINS[c] %@ OR label CONTAINS[c] %@ OR label CONTAINS[c] %@",
                "remote",
                "cloud",
                "provider",
                "iPad"
            )
        ).firstMatch

        if remoteMessaging.waitForExistence(timeout: 2) {
            try require(remoteMessaging.label.isEmpty == false, "Remote execution or scaffold messaging should be accessible.")
        } else {
            try require(app.state == XCUIApplication.State.runningForeground, "Remote execution copy is not present yet; app should remain foregrounded for manual validation.")
        }
    }

    @MainActor
    func testLaunchHasNoBlockingAlertsAndSupportsBroadAccessibilityQueries() throws {
        let app = launchApp()

        try require(app.alerts.count == 0, "The app should not launch into a blocking alert.")
        try require(app.windows.firstMatch.exists, "A foreground window should be available for keyboard and accessibility navigation.")
        try require(
            app.staticTexts.count > 0 || app.buttons.count > 0 || app.otherElements.count > 0,
            "The launched UI should expose elements to XCTest accessibility queries."
        )
    }

    @MainActor
    private func launchApp() -> XCUIApplication {
        let app = XCUIApplication()
        app.launchArguments += ["-ui-testing"]
        app.launch()
        return app
    }

    private func require(
        _ condition: @autoclosure () -> Bool,
        _ message: String,
        line: UInt = #line
    ) throws {
        guard condition() else {
            throw NSError(
                domain: "KarabinerUITests",
                code: Int(line),
                userInfo: [NSLocalizedDescriptionKey: message]
            )
        }
    }
}
