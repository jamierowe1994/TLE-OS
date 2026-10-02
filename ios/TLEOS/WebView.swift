import SafariServices
import SwiftUI
import WebKit

extension UIColor {
    /// The phone pages' warm grey (#F4F3F1, app/app/m.css), so the app never
    /// flashes white before a page paints.
    static let osPage = UIColor(red: 244 / 255, green: 243 / 255, blue: 241 / 255, alpha: 1)

    /// Dark enough to need light text on top (relative luminance under 0.5).
    var isDark: Bool {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard getRed(&r, green: &g, blue: &b, alpha: &a) else { return false }
        return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.5
    }

    var hex: String {
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        guard getRed(&r, green: &g, blue: &b, alpha: &a) else { return "?" }
        let byte = { (v: CGFloat) in Int((max(0, min(1, v)) * 255).rounded()) }
        return String(format: "#%02X%02X%02X", byte(r), byte(g), byte(b))
    }
}

/// The app's one web view and what SwiftUI needs to know about it.
@MainActor @Observable
final class WebState {
    var progress = 0.0
    var hasLoaded = false
    var offline = false
    var retrying = false
    /// The page's `<meta name="theme-color">`, or the warm grey when it has none.
    /// Light mode is about #F5F5F4, dark about #141414.
    private(set) var pageColor: UIColor = .osPage

    let rootURL: URL
    let webView: WKWebView
    private let controller = WebController()

    @ObservationIgnored private var lastRequested: URL?

    /// The main frame's URL changed, by a full load or by the page's own client-side move.
    @ObservationIgnored var onURLChange: ((WebState, URL) -> Void)?
    /// A page on the OS itself finished loading.
    @ObservationIgnored var onFinished: ((WebState, URL) -> Void)?
    /// A load failed.
    @ObservationIgnored var onFailed: ((WebState) -> Void)?
    /// The page's theme colour changed (the status bar follows it).
    @ObservationIgnored var onPageColorChange: ((WebState) -> Void)?

    init(rootURL: URL) {
        self.rootURL = rootURL

        let config = WKWebViewConfiguration()
        config.websiteDataStore = .default() // the sign-in cookie, kept between launches
        config.allowsInlineMediaPlayback = true
        config.applicationNameForUserAgent = Config.userAgentSuffix

        let webView = WKWebView(frame: .zero, configuration: config)
        webView.backgroundColor = .osPage
        webView.scrollView.backgroundColor = .osPage
        webView.underPageBackgroundColor = .osPage
        webView.scrollView.contentInsetAdjustmentBehavior = .never // the pages pad themselves with env(safe-area-inset-*)
        webView.allowsBackForwardNavigationGestures = true
        webView.allowsLinkPreview = false
        #if DEBUG
        webView.isInspectable = true
        #endif
        self.webView = webView

        controller.attach(self)
    }

    func load(_ url: URL) {
        lastRequested = url
        webView.load(URLRequest(url: url))
    }

    /// Paints everything around and behind the page in its theme colour, so overscroll,
    /// the gap above the page and the moment before it paints all match it.
    fileprivate func setThemeColor(_ color: UIColor?) {
        let next = color ?? .osPage
        log.notice("page colour \(color?.hex ?? "none", privacy: .public) -> \(next.isDark ? "dark" : "light", privacy: .public)")
        guard next.hex != pageColor.hex else { return }
        pageColor = next
        webView.backgroundColor = next
        webView.scrollView.backgroundColor = next
        webView.underPageBackgroundColor = next
        webView.superview?.backgroundColor = next
        onPageColorChange?(self)
    }

    func retry() {
        retrying = true
        reloadOrStart()
    }

    fileprivate func reloadOrStart() {
        if webView.url == nil {
            webView.load(URLRequest(url: lastRequested ?? rootURL))
        } else {
            webView.reload()
        }
    }
}

/// Puts a state's web view on screen. The web view belongs to the state, not to
/// this view, so it keeps its page while SwiftUI rebuilds around it.
struct WebHost: UIViewRepresentable {
    let state: WebState

    func makeUIView(context: Context) -> UIView {
        let container = UIView()
        container.backgroundColor = state.pageColor
        let webView = state.webView
        webView.removeFromSuperview()
        webView.frame = container.bounds
        webView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
        container.addSubview(webView)
        return container
    }

    func updateUIView(_ container: UIView, context: Context) {}
}

/// A web page with its first-load spinner and its own No Connection screen.
struct PageView: View {
    let state: WebState

    var body: some View {
        ZStack {
            Color(uiColor: state.pageColor).ignoresSafeArea()
            WebHost(state: state).ignoresSafeArea()
            if !state.hasLoaded && !state.offline {
                ProgressView()
                    .controlSize(.large)
                    .tint(state.pageColor.isDark ? Color.white : Color.tleDark)
                    .transition(.opacity)
            }
            if state.offline {
                OfflineView(background: state.pageColor, retrying: state.retrying, retry: state.retry)
            }
        }
        .animation(.easeOut(duration: 0.2), value: state.hasLoaded)
    }
}

/// Navigation, link routing, panels and permissions for one web view.
@MainActor
final class WebController: NSObject, WKNavigationDelegate, WKUIDelegate {
    private weak var state: WebState?
    private weak var webView: WKWebView?
    private var observations: [NSKeyValueObservation] = []
    /// True between leaving for Microsoft and landing back on the OS, so the
    /// sign-in's own redirects (including any federated hop) are not sent to Safari.
    private var inSignIn = false

    func attach(_ state: WebState) {
        self.state = state
        let webView = state.webView
        self.webView = webView
        webView.navigationDelegate = self
        webView.uiDelegate = self

        let refresh = UIRefreshControl()
        refresh.addTarget(self, action: #selector(pullToRefresh(_:)), for: .valueChanged)
        webView.scrollView.refreshControl = refresh

        observations = [
            webView.observe(\.estimatedProgress, options: [.new]) { [weak self] view, _ in
                MainActor.assumeIsolated { self?.state?.progress = view.estimatedProgress }
            },
            // The page's <meta name="theme-color">: light or dark, as the agent chose.
            webView.observe(\.themeColor, options: [.initial, .new]) { [weak self] view, _ in
                MainActor.assumeIsolated { self?.state?.setThemeColor(view.themeColor) }
            },
            // Catches the page's own client-side moves as well as full loads.
            webView.observe(\.url, options: [.new]) { [weak self] view, _ in
                MainActor.assumeIsolated {
                    guard let url = view.url else { return }
                    DispatchQueue.main.async {
                        guard let state = self?.state else { return }
                        state.onURLChange?(state, url)
                    }
                }
            },
        ]
    }

    @objc func pullToRefresh(_ control: UIRefreshControl) {
        guard let state else { return control.endRefreshing() }
        state.reloadOrStart()
    }

    // MARK: Navigation

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction) async -> WKNavigationActionPolicy {
        guard let url = action.request.url else { return .cancel }
        let destination = Config.destination(for: url)
        #if DEBUG
        if action.targetFrame?.isMainFrame ?? true {
            log.notice("navigating \(url.absoluteString, privacy: .public)")
        }
        #endif

        // Embedded frames (maps, signing, video) load as they are; only top-level pages are routed.
        if let frame = action.targetFrame, !frame.isMainFrame {
            if destination == .system { openExternally(url); return .cancel }
            return .allow
        }

        switch destination {
        case .app:
            let host = url.host?.lowercased() ?? ""
            if Config.isMicrosoftSignIn(host) { inSignIn = true }
            if host == Config.baseHost { inSignIn = false }
            return .allow
        case .system:
            openExternally(url)
            return .cancel
        case .safari:
            if inSignIn && action.navigationType != .linkActivated { return .allow }
            presentSafari(url)
            return .cancel
        }
    }

    func webView(_ webView: WKWebView, didCommit navigation: WKNavigation!) {
        guard let state, let url = webView.url else { return }
        state.onURLChange?(state, url)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let state else { return }
        state.hasLoaded = true
        state.offline = false
        state.retrying = false
        webView.scrollView.refreshControl?.endRefreshing()
        if let url = webView.url, url.host?.lowercased() == Config.baseHost {
            #if DEBUG
            log.notice("page loaded \(url.absoluteString, privacy: .public)")
            #endif
            state.onFinished?(state, url)
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        failed(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        failed(error)
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) {
        // iOS kills the page under memory pressure; without this the screen goes blank.
        webView.reload()
    }

    private func failed(_ error: Error) {
        webView?.scrollView.refreshControl?.endRefreshing()
        guard let state else { return }
        state.retrying = false
        let e = error as NSError
        // A newer navigation replaced this one, or we sent the link elsewhere: not a failure.
        if e.domain == NSURLErrorDomain && e.code == NSURLErrorCancelled { return }
        if e.domain == "WebKitErrorDomain" && e.code == 102 { return }
        log.notice("load failed: \(e.domain, privacy: .public) \(e.code) \(e.localizedDescription, privacy: .public)")
        let network: Set<Int> = [
            NSURLErrorNotConnectedToInternet, NSURLErrorNetworkConnectionLost, NSURLErrorCannotFindHost,
            NSURLErrorCannotConnectToHost, NSURLErrorTimedOut, NSURLErrorDNSLookupFailed,
            NSURLErrorInternationalRoamingOff, NSURLErrorDataNotAllowed, NSURLErrorSecureConnectionFailed,
        ]
        let isNetwork = e.domain == NSURLErrorDomain && network.contains(e.code)
        // Before anything has shown, any failure gets the retry screen rather than a stuck spinner.
        if isNetwork || !state.hasLoaded { state.offline = true }
        state.onFailed?(state)
    }

    // MARK: Windows, panels, permissions

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration,
                 for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // target=_blank and window.open: same rules as a normal link, never a second web view.
        guard let url = action.request.url, url.absoluteString != "about:blank" else { return nil }
        switch Config.destination(for: url) {
        case .app: webView.load(URLRequest(url: url))
        case .system: openExternally(url)
        case .safari: presentSafari(url)
        }
        return nil
    }

    func webView(_ webView: WKWebView, decideMediaCapturePermissionsFor origin: WKSecurityOrigin,
                 initiatedBy frame: WKFrameInfo, type: WKMediaCaptureType) async -> WKPermissionDecision {
        origin.host.lowercased() == Config.baseHost ? .grant : .prompt
    }

    /// iOS 27+: skips WebKit's own per-site location prompt for the OS (the system one still shows once).
    @available(iOS 27.0, *)
    func webView(_ webView: WKWebView, requestGeolocationPermissionFor origin: WKSecurityOrigin,
                 initiatedBy frame: WKFrameInfo) async -> WKPermissionDecision {
        origin.host.lowercased() == Config.baseHost ? .grant : .prompt
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo) async {
        await withCheckedContinuation { (done: CheckedContinuation<Void, Never>) in
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in done.resume() })
            if !present(alert) { done.resume() }
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String,
                 initiatedByFrame frame: WKFrameInfo) async -> Bool {
        await withCheckedContinuation { (done: CheckedContinuation<Bool, Never>) in
            let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in done.resume(returning: false) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in done.resume(returning: true) })
            if !present(alert) { done.resume(returning: false) }
        }
    }

    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String,
                 defaultText: String?, initiatedByFrame frame: WKFrameInfo) async -> String? {
        await withCheckedContinuation { (done: CheckedContinuation<String?, Never>) in
            let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
            alert.addTextField { $0.text = defaultText }
            alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in done.resume(returning: nil) })
            alert.addAction(UIAlertAction(title: "OK", style: .default) { [weak alert] _ in
                done.resume(returning: alert?.textFields?.first?.text ?? "")
            })
            if !present(alert) { done.resume(returning: nil) }
        }
    }

    // MARK: Helpers

    private func openExternally(_ url: URL) {
        UIApplication.shared.open(url)
    }

    private func presentSafari(_ url: URL) {
        let safari = SFSafariViewController(url: url)
        safari.preferredControlTintColor = UIColor(red: 0x2B / 255, green: 0x25 / 255, blue: 0x22 / 255, alpha: 1)
        safari.dismissButtonStyle = .close
        if !present(safari) { UIApplication.shared.open(url) }
    }

    @discardableResult
    private func present(_ controller: UIViewController) -> Bool {
        guard var top = webView?.window?.rootViewController else { return false }
        while let next = top.presentedViewController { top = next }
        top.present(controller, animated: true)
        return true
    }
}
