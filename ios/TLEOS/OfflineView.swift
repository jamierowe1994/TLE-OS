import SwiftUI

extension Color {
    static let tleDark = Color(red: 0x2B / 255, green: 0x25 / 255, blue: 0x22 / 255)
    static let tlePink = Color(red: 0xDE / 255, green: 0x96 / 255, blue: 0x8F / 255)
}

/// Shown when the OS cannot be reached. Takes the page's colour, light or dark.
struct OfflineView: View {
    var background: UIColor = .white
    let retrying: Bool
    let retry: () -> Void

    var body: some View {
        let dark = background.isDark
        let ink = dark ? Color.white : Color.tleDark
        let paper = dark ? Color.tleDark : Color.white
        ZStack {
            Color(uiColor: background).ignoresSafeArea()
            VStack(spacing: 0) {
                Image(systemName: "wifi.slash")
                    .font(.system(size: 40, weight: .regular))
                    .foregroundStyle(ink)
                    .padding(.bottom, 20)
                Text("No Connection")
                    .font(.system(size: 22, weight: .medium))
                    .foregroundStyle(ink)
                    .padding(.bottom, 8)
                Text("Check your signal and try again.")
                    .font(.system(size: 16))
                    .foregroundStyle(ink.opacity(0.65))
                    .multilineTextAlignment(.center)
                    .padding(.bottom, 28)
                Button(action: retry) {
                    ZStack {
                        Text("Try Again").opacity(retrying ? 0 : 1)
                        if retrying { ProgressView().tint(paper) }
                    }
                    .font(.system(size: 16, weight: .medium))
                    .foregroundStyle(paper)
                    .frame(minWidth: 160, minHeight: 50)
                    .padding(.horizontal, 8)
                    .background(ink, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
                .disabled(retrying)
            }
            .padding(.horizontal, 32)
        }
    }
}

/// Carries the launch screen on until the first page has loaded, with a thin progress bar.
struct LoadingView: View {
    let progress: Double

    var body: some View {
        ZStack {
            Color.white.ignoresSafeArea()
            Image("LaunchLogo")
                .overlay(alignment: .bottom) {
                    ZStack(alignment: .leading) {
                        Capsule().fill(Color.tlePink.opacity(0.2))
                        Capsule().fill(Color.tlePink)
                            .frame(width: 140 * max(0.08, min(progress, 1)))
                            .animation(.easeOut(duration: 0.25), value: progress)
                    }
                    .frame(width: 140, height: 3)
                    .offset(y: 36)
                }
        }
        .ignoresSafeArea()
    }
}

#Preview("Offline") { OfflineView(retrying: false) {} }
#Preview("Offline, dark") { OfflineView(background: UIColor(white: 0.08, alpha: 1), retrying: false) {} }
#Preview("Loading") { LoadingView(progress: 0.4) }
