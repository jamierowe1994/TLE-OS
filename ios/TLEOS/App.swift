import SwiftUI
import UIKit

/// The scene delegate for fresh installs. The window itself is built by AppDelegate.showWindow,
/// which also covers a scene restored from the earlier SwiftUI build with SwiftUI's delegate.
final class SceneDelegate: NSObject, UIWindowSceneDelegate {
    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard let scene = scene as? UIWindowScene,
              let delegate = UIApplication.shared.delegate as? AppDelegate else { return }
        delegate.showWindow(in: scene)
    }
}

/// Hosts the SwiftUI root and picks the status bar style from the page's theme colour.
final class RootController: UIHostingController<RootView> {
    private let model: AppModel

    init(model: AppModel) {
        self.model = model
        super.init(rootView: RootView(model: model))
        view.backgroundColor = .osPage
        model.web.onPageColorChange = { [weak self] _ in
            self?.setNeedsStatusBarAppearanceUpdate()
        }
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    override var preferredStatusBarStyle: UIStatusBarStyle {
        // The launch screen is white, so dark text until the first page has painted.
        guard model.launched else { return .darkContent }
        return model.web.pageColor.isDark ? .lightContent : .darkContent
    }
}

/// One web page, edge to edge. The page pads itself for the notch and the home indicator,
/// and draws its own navigation bar.
struct RootView: View {
    let model: AppModel

    var body: some View {
        ZStack {
            Color(uiColor: model.web.pageColor).ignoresSafeArea()
            PageView(state: model.web)
            if !model.launched {
                LoadingView(progress: model.launchProgress).transition(.opacity)
            }
        }
        .animation(.easeOut(duration: 0.2), value: model.launched)
        .onChange(of: model.launched) { _, _ in
            // The status bar may switch from the launch screen's dark text to the page's style.
            model.web.onPageColorChange?(model.web)
        }
    }
}
