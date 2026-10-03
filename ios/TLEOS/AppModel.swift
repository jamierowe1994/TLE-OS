import SwiftUI
import WebKit

/// The one full-screen web view. The page draws its own navigation (components/app/AppFrame.tsx),
/// and the sign-in pages simply show in the same view when nobody is signed in.
@MainActor @Observable
final class AppModel {
    let web: WebState
    /// False until the first page has loaded or failed: the launch screen stays up till then.
    private(set) var launched = false

    /// A notification tapped before a signed-in page has loaded: opened once one has,
    /// so the first load of `/m` can never replace it.
    @ObservationIgnored private var pendingURL: URL?
    /// A phone-view page has finished loading since launch or the last sign-out.
    @ObservationIgnored private var signedIn = false
    @ObservationIgnored private var started = false

    /// A phone-view page finished loading while signed in (push registration hangs off this).
    @ObservationIgnored var onSignedInPage: ((WKWebView) -> Void)?
    /// The web view has gone to a sign-in page.
    @ObservationIgnored var onSignedOut: (() -> Void)?

    var launchProgress: Double { web.progress }

    init() {
        web = WebState(rootURL: Config.appURL(path: "/agent"))
        web.onURLChange = { [weak self] _, url in self?.urlChanged(url) }
        web.onFinished = { [weak self] _, url in self?.pageFinished(url) }
        web.onFailed = { [weak self] _ in self?.launched = true }
    }

    /// Loads `/m` at launch, once.
    func start() {
        guard !started else { return }
        started = true
        web.load(web.rootURL)
    }

    /// A tapped notification. Waits for a signed-in page if there is not one yet.
    func openFromNotification(_ url: URL) {
        if signedIn {
            web.load(url)
        } else {
            pendingURL = url
        }
    }

    // MARK: - Private

    private func urlChanged(_ url: URL) {
        guard url.host?.lowercased() == Config.baseHost, Config.isSignedOutPath(url.path), signedIn else { return }
        signedIn = false
        onSignedOut?()
    }

    private func pageFinished(_ url: URL) {
        launched = true
        urlChanged(url)
        guard Config.isPhonePath(url.path) else { return }
        signedIn = true
        onSignedInPage?(web.webView)
        if let url = pendingURL {
            pendingURL = nil
            web.load(url)
        }
    }
}
