import UIKit
import UserNotifications
import WebKit

/// Push notifications: asks once the agent is signed in, hands the device token
/// to the OS, and opens the page a tapped notification points at.
@main @MainActor
final class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {
    let model = AppModel()

    private var deviceToken: String?
    /// The token already sent this launch; cleared on sign-out so the next person registers too.
    private var sentToken: String?
    private var askedThisLaunch = false
    /// The web view that last finished a signed-in page: the token is posted from inside it.
    private weak var pushWebView: WKWebView?
    private var appWindow: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil) -> Bool {
        // Set before launch finishes, so a tap that cold-started the app is still delivered.
        UNUserNotificationCenter.current().delegate = self
        model.onSignedInPage = { [weak self] webView in self?.signedInPage(webView) }
        model.onSignedOut = { [weak self] in self?.sentToken = nil }
        model.start()
        // Build the window whichever scene delegate UIKit uses. A phone that ran the earlier
        // SwiftUI build keeps that build's scene session, and UIKit restores it with SwiftUI's
        // own delegate (which then shows nothing), so the window cannot rely on SceneDelegate.
        NotificationCenter.default.addObserver(forName: UIScene.willConnectNotification, object: nil,
                                               queue: .main) { [weak self] note in
            MainActor.assumeIsolated {
                if let scene = note.object as? UIWindowScene { self?.showWindow(in: scene) }
            }
        }
        NotificationCenter.default.addObserver(forName: UIApplication.didBecomeActiveNotification, object: nil,
                                               queue: .main) { _ in
            UNUserNotificationCenter.current().setBadgeCount(0)
        }
        return true
    }

    func application(_ application: UIApplication, configurationForConnecting session: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration", sessionRole: session.role)
        config.delegateClass = SceneDelegate.self
        return config
    }

    /// The app's one window, on the given scene. Safe to call more than once.
    func showWindow(in scene: UIWindowScene) {
        if let appWindow, appWindow.windowScene === scene { return }
        let window = UIWindow(windowScene: scene)
        window.rootViewController = RootController(model: model)
        window.makeKeyAndVisible()
        appWindow = window
        log.notice("window shown")
    }

    /// The first phone-view page to finish asks for permission, once per launch.
    private func signedInPage(_ webView: WKWebView) {
        pushWebView = webView
        if !askedThisLaunch {
            askedThisLaunch = true
            Task {
                do {
                    let granted = try await UNUserNotificationCenter.current()
                        .requestAuthorization(options: [.alert, .badge, .sound])
                    if granted { UIApplication.shared.registerForRemoteNotifications() }
                } catch {
                    log.notice("notification permission failed: \(error.localizedDescription, privacy: .public)")
                }
            }
        }
        sendToken()
    }

    // MARK: Device token

    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken token: Data) {
        deviceToken = token.map { String(format: "%02x", $0) }.joined()
        log.notice("device token received (\(token.count) bytes)")
        sendToken()
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        // Expected on some simulators; the app carries on without push.
        log.notice("remote notification registration failed: \(error.localizedDescription, privacy: .public)")
    }

    /// Posts the token from inside the page, so the os_session cookie goes with it.
    private func sendToken() {
        guard let token = deviceToken, token != sentToken, let webView = pushWebView,
              let path = webView.url?.path, Config.isPhonePath(path) else { return }
        sentToken = token
        let body: [String: Any] = [
            "token": token, "platform": "ios", "env": Config.pushEnvironment, "appVersion": Config.appVersion,
        ]
        let js = """
        const r = await fetch('/api/push/register', {method: 'POST', headers: {'content-type': 'application/json'},
          credentials: 'include', body: JSON.stringify(body)});
        return r.status;
        """
        webView.callAsyncJavaScript(js, arguments: ["body": body], in: nil, in: .page) { [weak self] result in
            switch result {
            case .success(let status):
                log.notice("push register -> \(String(describing: status), privacy: .public)")
            case .failure(let error):
                log.notice("push register failed: \(error.localizedDescription, privacy: .public)")
                self?.sentToken = nil
            }
        }
    }

    // MARK: Notifications

    // Completion-handler forms, not async: the async versions hand their result back to
    // UIKit off the main thread, which aborts the app when a tap cold-starts it.

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            willPresent notification: UNNotification,
                                            withCompletionHandler completionHandler:
                                            @escaping (UNNotificationPresentationOptions) -> Void) {
        completionHandler([.banner, .list, .sound])
    }

    nonisolated func userNotificationCenter(_ center: UNUserNotificationCenter,
                                            didReceive response: UNNotificationResponse,
                                            withCompletionHandler completionHandler: @escaping () -> Void) {
        let href = response.notification.request.content.userInfo["href"] as? String
        DispatchQueue.main.async {
            MainActor.assumeIsolated { self.open(href) }
            completionHandler()
        }
    }

    /// Only paths on the OS itself, such as `/app/event/abc` or `/leads?open=123`.
    private func open(_ href: String?) {
        guard let href, href.hasPrefix("/"), !href.hasPrefix("//"),
              let url = URL(string: href, relativeTo: Config.baseURL)?.absoluteURL,
              url.host?.lowercased() == Config.baseHost else { return }
        log.notice("notification opened \(url.absoluteString, privacy: .public)")
        model.openFromNotification(url)
    }
}
