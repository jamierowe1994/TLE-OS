# TLE OS for iPhone

A native shell around the phone view of the OS: one full-screen web view that opens on `/m`.
There is no native tab bar. The navigation (the floating dark bar with four icons and the "+"
sheet) is drawn by the web page itself, in `components/app/AppFrame.tsx`, so it looks the same
in Safari and in the app. The page pads itself for the notch and the home indicator with
`env(safe-area-inset-*)`. When nobody is signed in, the sign-in page simply shows in the same
web view.

The app follows the page's `<meta name="theme-color">`: the colour fills behind and around the page
(overscroll, the No Connection screen), and the status bar text turns white when the colour is
dark, dark when it is light. With no theme colour it uses the warm grey #F4F3F1.

## Open the project

1. Open `ios/TLEOS.xcodeproj` in Xcode.
2. If you change `project.yml`, or add or remove a Swift file, run `xcodegen generate` in `ios/`
   first (install it with `brew install xcodegen`).

## Set the Team (once per Mac)

1. Click **TLEOS** at the top of the file list, then the **TLEOS** target.
2. Open **Signing & Capabilities**.
3. Leave **Automatically manage signing** ticked and pick your team under **Team**.

## Run on your iPhone

1. Plug the iPhone in and unlock it. Trust the Mac if it asks.
2. Pick the iPhone in the device menu at the top of Xcode.
3. Press **Run** (the play button). The first time, the iPhone may ask you to turn on
   Developer Mode in Settings > Privacy & Security.

## Send a build to TestFlight

1. Set the device menu to **Any iOS Device (arm64)**.
2. Raise the build number (`CURRENT_PROJECT_VERSION` in `project.yml`, then `xcodegen generate`).
3. **Product > Archive**.
4. When the Organizer opens: **Distribute App > TestFlight Internal Only > Distribute**.
5. The build shows in App Store Connect > TestFlight after Apple has processed it.

## Point the simulator at a local server

Debug builds only. Release builds always use `https://tle-os.co.uk`.

- In Xcode: **Product > Scheme > Edit Scheme > Run > Arguments**, tick `OS_BASE_URL` and set it
  to your server, for example `http://localhost:3397`.
- From Terminal:

  ```
  SIMCTL_CHILD_OS_BASE_URL=http://localhost:3397 xcrun simctl launch booted uk.co.thelettingexperts.os
  ```

- For a notification that opens the app from cold (no environment variable then):

  ```
  xcrun simctl spawn booted defaults write uk.co.thelettingexperts.os OS_BASE_URL http://localhost:3397
  ```

  Remove it afterwards with `defaults delete` in place of `defaults write` (and no address).

Test a notification tap with a JSON file such as
`{"aps":{"alert":{"title":"Test","body":"Open People"}},"href":"/app/people?who=landlord"}`:

```
xcrun simctl push booted uk.co.thelettingexperts.os push.json
```

The app loads the `href` (any path on the OS) in its web view. If the tap arrives before the first
page has loaded, or while nobody is signed in, it opens as soon as a signed-in page has loaded.

## Phone alerts (push notifications)

The server needs these four variables on Railway:

| Variable | Value |
|---|---|
| `APNS_KEY_ID` | The key ID of the APNs key (Apple Developer > Keys) |
| `APNS_TEAM_ID` | The Apple team ID |
| `APNS_KEY_P8` | The contents of the `.p8` key file |
| `APNS_BUNDLE_ID` | `uk.co.thelettingexperts.os` |

Then turn on the **phone_alerts** switch in Admin. Until it is on, nothing is sent.
