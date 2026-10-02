import Foundation
import os

/// Filter Console.app (or `log stream`) by subsystem uk.co.thelettingexperts.os.
let log = Logger(subsystem: "uk.co.thelettingexperts.os", category: "app")

/// Where the app points, how it identifies itself, and which links stay inside it.
enum Config {
    static let baseURL: URL = {
        #if DEBUG
        if let override = debugOverride, let url = URL(string: override), url.host != nil {
            return url
        }
        #endif
        let raw = Bundle.main.object(forInfoDictionaryKey: "OSBaseURL") as? String
        return URL(string: raw ?? "https://tle-os.co.uk")!
    }()

    #if DEBUG
    /// `OS_BASE_URL` as an environment variable, or as a launch argument
    /// (`-OS_BASE_URL http://localhost:3000`, which lands in UserDefaults).
    private static var debugOverride: String? {
        if let env = ProcessInfo.processInfo.environment["OS_BASE_URL"], !env.isEmpty { return env }
        return UserDefaults.standard.string(forKey: "OS_BASE_URL")
    }
    #endif

    static var baseHost: String { baseURL.host?.lowercased() ?? "" }

    /// A page of the phone view. `app=ios` lets the server know it is inside the app.
    static func appURL(path: String) -> URL {
        var parts = URLComponents(url: baseURL, resolvingAgainstBaseURL: false)!
        parts.path = path
        parts.queryItems = [URLQueryItem(name: "app", value: "ios")]
        return parts.url!
    }

    /// Pages that mean nobody is signed in (a notification tap waits until someone is).
    static func isSignedOutPath(_ path: String) -> Bool {
        path.hasPrefix("/sign-in") || path.hasPrefix("/join") || path.hasPrefix("/reset")
    }

    /// The phone view, which only a signed-in agent can reach.
    static func isPhonePath(_ path: String) -> Bool {
        path == "/app" || path.hasPrefix("/app/")
    }

    static let version = Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "1.0"
    static let build = Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "1"
    static var appVersion: String { "\(version) (\(build))" }

    /// Appended to WebKit's own iPhone user agent, so the server still sees
    /// Mobile Safari and can spot the app by `TLEOSApp/`.
    static var userAgentSuffix: String { "Mobile/15E148 Safari/604.1 TLEOSApp/\(version)" }

    #if DEBUG
    static let pushEnvironment = "sandbox"
    #else
    static let pushEnvironment = "production"
    #endif

    // MARK: - Link routing

    enum Destination { case app, system, safari }

    private static let microsoftHosts: Set<String> = [
        "login.microsoftonline.com", "login.microsoft.com", "login.live.com", "aadcdn.msftauth.net",
    ]
    private static let microsoftSuffixes = [".microsoftonline.com", ".msauth.net", ".msftauth.net"]

    static func isMicrosoftSignIn(_ host: String) -> Bool {
        microsoftHosts.contains(host) || microsoftSuffixes.contains { host.hasSuffix($0) }
    }

    static func isMaps(_ url: URL) -> Bool {
        let host = url.host?.lowercased() ?? ""
        if host == "maps.apple.com" || host == "maps.google.com" || host == "maps.google.co.uk" { return true }
        if host == "maps.app.goo.gl" { return true }
        if host == "goo.gl", url.path.hasPrefix("/maps") { return true }
        if host == "google.com" || host == "www.google.com" || host == "google.co.uk" || host == "www.google.co.uk" {
            return url.path.hasPrefix("/maps")
        }
        return false
    }

    static func destination(for url: URL) -> Destination {
        let scheme = url.scheme?.lowercased() ?? ""
        switch scheme {
        case "http", "https":
            break
        case "about", "blob", "data":
            return .app
        default:
            // tel:, mailto:, sms:, maps:, and any other app's own scheme.
            return .system
        }
        let host = url.host?.lowercased() ?? ""
        if host == baseHost || isMicrosoftSignIn(host) { return .app }
        if isMaps(url) { return .system }
        return .safari
    }
}
